/**
 * The ONLY path that inserts into `flags`.
 *
 * Two red-team corrections are structural here:
 *
 *   ATOMICITY (#9). The flag insert and the `max_severity` update happen in the
 *   caller's transaction. Separately, a crash between them shows a guardian a
 *   critical flag on the dashboard that 404s when clicked — because the list
 *   reads `flags` while transcript access reads `conversations.max_severity`.
 *
 *   ATTRIBUTION. `messageId` is always the message that actually contained the
 *   offending content: an output flag attaches to the ASSISTANT message. The
 *   prior art attached both directions to the child's message, so moderators
 *   saw children flagged for what the model produced.
 */
import type { PoolClient } from 'pg';
import type { Severity } from '@/config/settings';

export interface RaiseFlagInput {
  conversationId: string;
  messageId: string;
  severity: Severity;
  triggeredRules: string[];
  policyVersion: string;
  reason: string;
}

const RANK: Record<Severity, number> = { info: 1, low: 2, medium: 3, high: 4, critical: 5 };

export async function raiseFlag(c: PoolClient, input: RaiseFlagInput): Promise<string> {
  const f = await c.query(
    `insert into flags (conversation_id, message_id, severity, triggered_rules, policy_version, reason)
     values ($1,$2,$3,$4,$5,$6)
     returning id`,
    [
      input.conversationId,
      input.messageId,
      input.severity,
      JSON.stringify(input.triggeredRules),
      input.policyVersion,
      input.reason,
    ],
  );

  // Monotonic by construction AND by database trigger. `max_severity` only ever
  // rises (V7): a dismissal marks a flag reviewed, it never closes a transcript.
  await c.query(
    `update conversations
        set max_severity = case
              when max_severity is null then $2::text
              when $3::int > array_position(array['info','low','medium','high','critical'], max_severity)
                then $2::text
              else max_severity
            end,
            flag_status = 'flagged'
      where id = $1`,
    [input.conversationId, input.severity, RANK[input.severity]],
  );

  return f.rows[0].id as string;
}

/**
 * Escalator for the `medium` tier.
 *
 * PRD defines `medium` as "repeated attempts to bypass guardrails" — a property
 * of a SEQUENCE. The Phase 2 engine is a pure function of a single message and
 * cannot compute it, so without this the tier that OPENS THE TRANSCRIPT was
 * structurally almost unreachable, and a child could probe the gate freely
 * without ever surfacing to a parent.
 */
export const ESCALATION_THRESHOLD = 3;
export const ESCALATION_WINDOW_MS = 60 * 60 * 1000;

export async function escalateIfRepeated(c: PoolClient, conversationId: string): Promise<boolean> {
  const r = await c.query(
    `select count(*)::int as n
       from guardrail_results gr
       join messages m on m.id = gr.message_id
      where m.conversation_id = $1
        and gr.direction = 'input'
        and gr.passed = false
        and gr.created_at > now() - ($2 || ' milliseconds')::interval`,
    [conversationId, ESCALATION_WINDOW_MS],
  );

  if (r.rows[0].n < ESCALATION_THRESHOLD) return false;

  const already = await c.query(
    `select 1 from flags
      where conversation_id = $1 and reason = 'Repeated blocked attempts'
        and created_at > now() - ($2 || ' milliseconds')::interval
      limit 1`,
    [conversationId, ESCALATION_WINDOW_MS],
  );
  if (already.rowCount) return false;

  const msg = await c.query(
    `select id from messages where conversation_id = $1 order by created_at desc limit 1`,
    [conversationId],
  );
  if (msg.rowCount === 0) return false;

  const pv = await c.query(`select version_hash from policy_versions order by activated_at desc limit 1`);

  await raiseFlag(c, {
    conversationId,
    messageId: msg.rows[0].id,
    severity: 'medium',
    triggeredRules: ['escalator.repeated_blocked'],
    policyVersion: pv.rows[0].version_hash,
    reason: 'Repeated blocked attempts',
  });
  return true;
}
