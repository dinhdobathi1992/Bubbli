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
import { getOwnTranscript } from '@/lib/chat/child-transcript';
import { checkChatQuota, recordChatUsage } from '@/lib/quota/limiter';
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
  const quota = await checkChatQuota(pool, session.childId!, session.familyId);
  if (!quota.allowed) {
    return NextResponse.json(
      { error: "You've reached your limit for now. Come back a bit later!", quota: quota.reason },
      { status: 429 },
    );
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
  } else {
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

export async function GET(req: Request) {
  const session = await getSession();
  if (!session?.childId) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });

  const url = new URL(req.url);
  const conversationId = url.searchParams.get('conversationId');
  if (!conversationId) {
    const list = await pool.query(
      `select id, started_at,
              (select count(*)::int from messages m where m.conversation_id = c.id) as message_count
         from conversations c
        where child_id = $1
        order by started_at desc limit 30`,
      [session.childId],
    );
    return NextResponse.json({ conversations: list.rows });
  }

  try {
    const messages = await getOwnTranscript(pool, session, conversationId);
    return NextResponse.json({ messages });
  } catch {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
}
