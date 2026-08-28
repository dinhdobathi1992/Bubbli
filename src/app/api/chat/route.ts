/**
 * The child chat endpoint.
 *
 * Authorization uses `assertIsOwningChild`, NOT a same-family check. A parent
 * session must not satisfy this route however legitimately that parent is
 * linked to the child: reading a child's live conversation is not a parental
 * capability. The severity-gated parent path is separate.
 */
import { NextResponse } from 'next/server';
import { pool } from '@/lib/db/client';
import { getSession } from '@/lib/auth/request-session';
import { assertIsOwningChild, assertIsChild, AuthzError } from '@/lib/authz';
import { runTurn } from '@/lib/chat/pipeline';
import { getOwnTranscript, listOwnConversations } from '@/lib/chat/child-transcript';
import { checkReadRate } from '@/lib/chat/read-rate-limit';
import { continuesConversation } from '@/lib/chat/conversation-continuity';
import { checkChatQuota, recordChatUsage } from '@/lib/quota/limiter';
import { checkInput } from '@/lib/guardrails/engine';
import type { AgeBand } from '@/config/settings';

export const maxDuration = 60;

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });

  try {
    assertIsChild(session);
  } catch {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const body = (await req.json().catch(() => ({}))) as {
    conversationId?: string;
    content?: string;
    idempotencyKey?: string;
  };

  if (!body.content?.trim() || !body.idempotencyKey) {
    return NextResponse.json({ error: 'Missing content or idempotency key' }, { status: 400 });
  }
  if (body.content.length > 4000) {
    return NextResponse.json({ error: 'Message is too long' }, { status: 413 });
  }

  const child = await pool.query(
    `select age_band, guardrail_config from children where id = $1`,
    [session.childId],
  );
  if (child.rowCount === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const ageBand = child.rows[0].age_band as AgeBand;

  // Quota BEFORE any model call. Gate-blocked messages never reach a provider
  // and so never consume the family's AI budget (see quota/limiter.ts).
  //
  // The quota verdict must NEVER short-circuit the safety path. This check sat
  // in front of `runTurn`, so a child over the limit never reached the
  // guardrail: no crisis copy, no flag, no guardian alert — they were told
  // "come back a bit later" instead. One sibling exhausting the family's daily
  // budget on homework locked the other out of the crisis path for the day.
  //
  // Layer 1 is pure, linear-time and touches neither the database nor a
  // provider, so classifying here is cheap. A severe message proceeds; it will
  // be blocked at the gate anyway, which means no provider call and no budget
  // consumed — safety costs nothing here.
  const quota = await checkChatQuota(pool, session.childId!, session.familyId);
  if (!quota.allowed) {
    const triage = checkInput(body.content.trim(), ageBand, child.rows[0].guardrail_config ?? {});
    const severe =
      !triage.passed && (triage.severity === 'high' || triage.severity === 'critical');
    if (!severe) {
      return NextResponse.json(
        { error: "You've reached your limit for now. Come back a bit later!", quota: quota.reason },
        { status: 429 },
      );
    }
  }

  // Reuse or open a conversation.
  let conversationId = body.conversationId;
  if (conversationId) {
    try {
      await assertIsOwningChild(pool, session, conversationId);
    } catch (e) {
      const status = e instanceof AuthzError ? e.status : 500;
      return NextResponse.json({ error: 'Not found' }, { status });
    }

    // A band change forks a new conversation rather than appending.
    //
    // `conversations.age_band` is pinned at creation and the schema says why:
    // "Pinned at creation so a mid-conversation band change starts a new one."
    // Nothing implemented that, because a conversation could not previously
    // outlive the page session that made it. Now that conversations are
    // resumable from the sidebar, a child whose band moved would be guarded at
    // their NEW band inside a row still claiming the old one — and the bands
    // genuinely differ (inap.sexual.topic.young is medium under 12, low above).
    //
    // The fork is here, on the WRITE path, deliberately. Reads are never gated
    // by band: a birthday must not make a child's own history unreachable.
    const pinned = await pool.query<{ age_band: string }>(
      `select age_band from conversations where id = $1`,
      [conversationId],
    );
    if (!continuesConversation(pinned.rows[0]?.age_band, ageBand)) conversationId = undefined;
  }

  if (!conversationId) {
    const c = await pool.query(
      `insert into conversations (child_id, age_band) values ($1,$2) returning id`,
      [session.childId, ageBand],
    );
    conversationId = c.rows[0].id as string;
  }

  const controller = new AbortController();
  req.signal.addEventListener('abort', () => controller.abort(), { once: true });

  const result = await runTurn(
    pool,
    {
      conversationId,
      childId: session.childId!,
      familyId: session.familyId,
      ageBand,
      content: body.content.trim(),
      idempotencyKey: body.idempotencyKey,
      guardrailConfig: child.rows[0].guardrail_config ?? {},
    },
    controller.signal,
  );

  if (!result.replayed && !result.blocked) {
    await recordChatUsage(pool, session.childId!, session.familyId);
  }

  return NextResponse.json({
    conversationId,
    reply: result.reply,
    blocked: result.blocked,
    crisis: result.crisis,
    degraded: result.degraded,
  });
}

/**
 * Reading: the conversation list, or one conversation's messages.
 *
 * The two answer differently on denial, on purpose.
 *
 *   collection  → 403. There is no id in the request, so there is nothing to
 *                 confirm or deny. Telling an authenticated parent "not signed
 *                 in" would be a lie and would hide an authorization failure
 *                 behind an authentication one.
 *   one convo   → 404. `AuthzError` carries 404 for exactly this reason: a 403
 *                 would confirm the id exists, which is enumeration.
 */
export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });

  // Authenticated, but not as a child. Distinct from having no session at all.
  if (session.principalType !== 'child' || !session.childId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // Reads are free of the AI budget but not free of database work; the list
  // runs two correlated subqueries per row.
  const rate = checkReadRate(session.childId);
  if (!rate.allowed) {
    return NextResponse.json(
      { error: 'Too many requests' },
      { status: 429, headers: { 'retry-after': String(Math.ceil((rate.retryAfterMs ?? 0) / 1000)) } },
    );
  }

  const url = new URL(req.url);
  const conversationId = url.searchParams.get('conversationId');

  if (!conversationId) {
    const offset = Number(url.searchParams.get('offset') ?? 0);
    const page = await listOwnConversations(pool, session, {
      offset: Number.isFinite(offset) ? offset : 0,
    });
    return NextResponse.json(page);
  }

  try {
    const messages = await getOwnTranscript(pool, session, conversationId);
    return NextResponse.json({ messages });
  } catch {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
}
