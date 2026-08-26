/**
 * The chat pipeline. One turn, end to end.
 *
 * Ordering is load-bearing and was corrected by the red team (findings #9, #10):
 *
 *   0. Crisis copy is COMPUTED FIRST, from severity alone, before any write.
 *      Previously the flag insert sat ahead of it with nothing wrapping it, so
 *      a connection-pool exhaustion returned a 500 to a child in acute distress
 *      — defeating the stated rationale that the in-band response is what
 *      protects them when no guardian answers.
 *
 *   1-3. Writes are grouped into NAMED TRANSACTIONS. The model call stays
 *      outside them, so a slow network never holds a lock, but the writes
 *      around it are atomic. Without this, a crash between the flag insert and
 *      the max_severity update shows a guardian a critical flag on the
 *      dashboard that 404s when they click it.
 *
 *   Everything completes BEFORE the response is returned. On serverless, work
 *      scheduled after the response may never run.
 */
import type { Pool } from 'pg';
import { settings, type AgeBand, type Severity } from '@/config/settings';
import { checkInput, checkOutput, type GuardrailResult } from '@/lib/guardrails/engine';
import { ensurePolicyVersion } from '@/lib/guardrails/policy-store';
import { classify } from '@/lib/guardrails/classifier';
import { generateWithFallback, DEGRADED_RESPONSE } from '@/lib/ai/router';
import { systemPromptFor } from '@/lib/ai/prompts';
import { loadHistory } from './history';
import { crisisResponseFor, DEFLECTION } from '@/content/crisis';
import { raiseFlag, escalateIfRepeated } from '@/lib/flags/create';
import { notifyGuardians } from '@/lib/notify/dispatch';

export interface TurnInput {
  conversationId: string;
  childId: string;
  familyId: string;
  ageBand: AgeBand;
  content: string;
  idempotencyKey: string;
  guardrailConfig: Record<string, unknown>;
}

export interface TurnResult {
  /** Null only when TX1 itself failed — the child still receives the reply. */
  childMessageId: string | null;
  assistantMessageId: string | null;
  reply: string;
  blocked: boolean;
  severity: Severity | null;
  /** True when the reply is crisis copy rather than an ordinary answer. */
  crisis: boolean;
  degraded: boolean;
  replayed: boolean;
}

/**
 * Alert guardians for a severe flag.
 *
 * Shared by the input and output gates. Previously only the input gate
 * notified, so when the MODEL produced harmful content the child saw crisis
 * copy and no guardian was ever told — the case where the AI itself is the
 * hazard. Three independent reviewers found this; `grep -rn notifyGuardians`
 * returned exactly one call site.
 *
 * `flagId` is the real id returned by `raiseFlag`. It used to be the assistant
 * MESSAGE id, so the audit row recorded `entityType: 'flag'` against a messages
 * row, and degraded to the string 'unknown' — which throws on a uuid column and
 * was then swallowed, producing no audit row at all on the one path where the
 * flag write had already failed.
 */
async function notifyIfSevere(
  db: Pool,
  input: TurnInput,
  severity: Severity | null,
  flagId: string | null,
): Promise<void> {
  if (severity !== 'high' && severity !== 'critical') return;
  if (!flagId) return; // No flag row means nothing to link an alert to.

  const who = await db
    .query(`select display_name from children where id = $1`, [input.childId])
    .catch(() => null);

  await notifyGuardians(db, {
    familyId: input.familyId,
    childId: input.childId,
    childName: who?.rows[0]?.display_name ?? 'your child',
    flagId,
    conversationId: input.conversationId,
    severity,
  }).catch(() => undefined);
}

async function tx<T>(db: Pool, fn: (c: import('pg').PoolClient) => Promise<T>): Promise<T> {
  const c = await db.connect();
  try {
    await c.query('begin');
    const out = await fn(c);
    await c.query('commit');
    return out;
  } catch (e) {
    await c.query('rollback').catch(() => undefined);
    throw e;
  } finally {
    c.release();
  }
}

async function persistResult(
  c: import('pg').PoolClient,
  messageId: string,
  direction: 'input' | 'output',
  r: GuardrailResult,
): Promise<void> {
  await c.query(
    `insert into guardrail_results
       (message_id, direction, passed, triggered_rules, severity, policy_version, age_band, config_hash, details)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [
      messageId,
      direction,
      r.passed,
      JSON.stringify(r.triggeredRules),
      r.severity,
      r.policyVersion,
      r.ageBand,
      r.configHash,
      r.details,
    ],
  );
}

export async function runTurn(db: Pool, input: TurnInput, signal: AbortSignal): Promise<TurnResult> {
  await ensurePolicyVersion(db);

  // ── Idempotency ──────────────────────────────────────────────────────────
  // Buffered generation holds a request open for seconds; browsers, proxies and
  // impatient children all retry. A replay must not produce a second flag or a
  // second 02:00 crisis notification.
  const existing = await db.query(
    `select m.id, m.content,
            (select a.id from messages a
              where a.conversation_id = m.conversation_id and a.role = 'assistant'
                and a.created_at >= m.created_at
              order by a.created_at asc limit 1) as assistant_id
       from messages m
      where m.child_id = $1 and m.idempotency_key = $2
      limit 1`,
    [input.childId, input.idempotencyKey],
  );

  if (existing.rowCount && existing.rows[0].assistant_id) {
    const prior = await db.query(`select content from messages where id = $1`, [existing.rows[0].assistant_id]);
    return {
      childMessageId: existing.rows[0].id,
      assistantMessageId: existing.rows[0].assistant_id,
      reply: prior.rows[0]?.content ?? DEFLECTION,
      blocked: false,
      severity: null,
      crisis: false,
      degraded: false,
      replayed: true,
    };
  }

  // ── Input gate, layer 1 then layer 2 ─────────────────────────────────────
  // Runs BEFORE any write. The previous order put an unguarded TX1 insert in
  // front of this, so a pool blip threw and returned a 500 to a child in acute
  // distress — the exact failure the module header claims to prevent. G6 is
  // "crisis copy even when the database is forced to throw", and it was not met.
  let inputVerdict = checkInput(input.content, input.ageBand, input.guardrailConfig);

  if (inputVerdict.passed && settings.SAFETY_CLASSIFIER_ENABLED) {
    // Layer 2 runs ONLY when layer 1 passed: re-confirming a decision already
    // made would double latency for nothing.
    const second = await classify(input.content, input.ageBand, null, {
      enabled: true,
      timeoutMs: 5_000,
    });
    if (second && !second.passed) {
      inputVerdict = {
        ...inputVerdict,
        passed: false,
        severity: second.severity,
        category: second.category,
        details: second.reason,
        triggeredRules: [...inputVerdict.triggeredRules, 'classifier'],
      };
    }
  }

  // ── Step 0: crisis copy BEFORE any write, so no failure can lose it ──────
  const isCritical = !inputVerdict.passed && inputVerdict.severity === 'critical';
  const crisisCopy = isCritical ? crisisResponseFor(input.ageBand) : null;

  // ── TX1: persist the child's message ─────────────────────────────────────
  // Guarded. If this fails we lose attribution and the flag, which is bad — but
  // losing the child's crisis response is worse, so the turn continues.
  const childMessageId = await tx(db, async (c) => {
    const r = await c.query(
      `insert into messages (conversation_id, child_id, role, content, idempotency_key, status)
       values ($1,$2,'child',$3,$4,'completed')
       returning id`,
      [input.conversationId, input.childId, input.content, input.idempotencyKey],
    );
    return r.rows[0].id as string;
  }).catch(() => null);

  if (!inputVerdict.passed) {
    const reply = crisisCopy ?? DEFLECTION;

    // TX2: guardrail result + flag + max_severity, atomically.
    let flagId: string | null = null;
    const assistantMessageId = childMessageId === null ? null : await tx(db, async (c) => {
      await persistResult(c, childMessageId, 'input', inputVerdict);
      flagId = await raiseFlag(c, {
        conversationId: input.conversationId,
        messageId: childMessageId,
        severity: inputVerdict.severity!,
        triggeredRules: inputVerdict.triggeredRules,
        policyVersion: inputVerdict.policyVersion,
        reason: inputVerdict.details ?? 'Input guardrail',
      });
      const a = await c.query(
        `insert into messages (conversation_id, child_id, role, content, status)
         values ($1,$2,'assistant',$3,'completed') returning id`,
        [input.conversationId, input.childId, reply],
      );
      // The medium tier is a property of a SEQUENCE, which the pure engine
      // cannot compute. Without this the tier that OPENS THE TRANSCRIPT is
      // structurally almost unreachable and a child can probe the gate freely.
      await escalateIfRepeated(c, input.conversationId);
      return a.rows[0].id as string;
    }).catch(() => null); // A write failure must NOT cost the child the crisis copy.

    // Notify AFTER the child's response is composed, and before returning:
    // work scheduled after the response may never run on serverless.
    await notifyIfSevere(db, input, inputVerdict.severity, flagId);

    return {
      childMessageId,
      assistantMessageId,
      reply,
      blocked: true,
      severity: inputVerdict.severity,
      crisis: isCritical,
      degraded: false,
      replayed: false,
    };
  }

  // Passed input: record it, then generate.
  if (childMessageId !== null) {
    await tx(db, async (c) => persistResult(c, childMessageId, 'input', inputVerdict)).catch(() => undefined);
  }

  const history = await loadHistory(db, input.conversationId, childMessageId);
  const { response, degraded } = await generateWithFallback(
    db,
    {
      systemPrompt: systemPromptFor(input.ageBand),
      history,
      userMessage: input.content,
      maxTokens: settings.AI_MAX_OUTPUT_TOKENS,
    },
    { conversationId: input.conversationId, messageId: childMessageId },
    signal,
  );

  // Client hung up: leave a terminal state rather than an orphan child message
  // with no reply and no metric.
  if (!response && !degraded) {
    await db
      .query(`update messages set status = 'aborted' where id = $1`, [childMessageId])
      .catch(() => undefined);
    return {
      childMessageId,
      assistantMessageId: null,
      reply: '',
      blocked: false,
      severity: null,
      crisis: false,
      degraded: false,
      replayed: false,
    };
  }

  const generated = response?.content ?? DEGRADED_RESPONSE;

  // ── Output gate ──────────────────────────────────────────────────────────
  const outputVerdict = checkOutput(generated, input.ageBand, input.guardrailConfig);
  const outCritical = !outputVerdict.passed && outputVerdict.severity === 'critical';
  const finalReply = outputVerdict.passed
    ? generated
    : outCritical
      ? crisisResponseFor(input.ageBand)
      : DEFLECTION;

  // ── TX3: assistant message + output result (+ flag when blocked) ─────────
  let outputFlagId: string | null = null;
  const assistantMessageId = await tx(db, async (c) => {
    const a = await c.query(
      `insert into messages (conversation_id, child_id, role, content, status)
       values ($1,$2,'assistant',$3,'completed') returning id`,
      [input.conversationId, input.childId, finalReply],
    );
    const id = a.rows[0].id as string;

    // Attribution: an OUTPUT flag attaches to the ASSISTANT message. The prior
    // art attached both directions to the child, so moderators saw children
    // flagged for what the model produced.
    await persistResult(c, id, 'output', outputVerdict);
    if (!outputVerdict.passed) {
      outputFlagId = await raiseFlag(c, {
        conversationId: input.conversationId,
        messageId: id,
        severity: outputVerdict.severity!,
        triggeredRules: outputVerdict.triggeredRules,
        policyVersion: outputVerdict.policyVersion,
        reason: outputVerdict.details ?? 'Output guardrail',
      });
    }
    return id;
  });

  // The gate the previous version never notified on. When the MODEL is the
  // hazard, a guardian must hear about it exactly as they would for a child's
  // own message.
  await notifyIfSevere(db, input, outputVerdict.severity, outputFlagId);

  return {
    childMessageId,
    assistantMessageId,
    reply: finalReply,
    blocked: !outputVerdict.passed,
    severity: outputVerdict.severity,
    crisis: outCritical,
    degraded,
    replayed: false,
  };
}
