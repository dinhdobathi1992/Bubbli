/**
 * A child reading their OWN conversations.
 *
 * Separate from the parent path on purpose. This one is not severity-gated —
 * a child may always read what they wrote and what they were told — and it is
 * not audited, because there is no oversight relationship to record: the child
 * is the subject, not an observer of someone else.
 *
 * It lives in its own module so the G1 lint rule can permit exactly this read
 * and no other. Inline queries in route handlers are what the rule exists to
 * prevent, because they multiply quietly.
 */
import type { Pool } from 'pg';
import {
  assertIsChild,
  assertIsOwningChild,
  opensTranscript,
  type Session,
} from '@/lib/authz';
import type { Severity } from '@/config/vocabulary';

export interface ChildMessage {
  id: string;
  role: string;
  content: string;
  createdAt: string;
}

export interface ChildConversationSummary {
  id: string;
  startedAt: string;
  messageCount: number;
  /**
   * The child's first message, truncated. ABSENT — not empty — when the
   * conversation is flagged. See `listOwnConversations`.
   */
  excerpt?: string;
}

export interface ChildConversationPage {
  conversations: ChildConversationSummary[];
  hasMore: boolean;
}

/** Reading is cheap; an unbounded list is not. */
export const CONVERSATION_PAGE_SIZE = 50;

export async function getOwnTranscript(
  db: Pool,
  session: Session,
  conversationId: string,
): Promise<ChildMessage[]> {
  // Throws unless this is the owning child. A parent session cannot satisfy it.
  await assertIsOwningChild(db, session, conversationId);

  const r = await db.query(
    `select id, role, content, created_at
       from messages
      where conversation_id = $1 and status = 'completed'
      order by created_at asc`,
    [conversationId],
  );

  return r.rows.map((x: Record<string, unknown>) => ({
    id: x.id as string,
    role: x.role as string,
    content: x.content as string,
    createdAt: String(x.created_at),
  }));
}

/**
 * The child's own conversations, newest first.
 *
 * Three things here are load-bearing rather than incidental.
 *
 * ROLE IS `'child'`, NOT `'user'`. `messages_role_ck` constrains the column to
 * ('child','assistant','system'). `'user'` is the spelling every other chat
 * codebase uses and it matches nothing here — silently, with no error and a
 * null excerpt on every row.
 *
 * A FLAGGED CONVERSATION RETURNS NO EXCERPT. A blocked message is still stored
 * `status = 'completed'` (see chat/pipeline.ts), so without this a child whose
 * first message was a crisis disclosure would read that sentence back in their
 * own sidebar on every visit, forever. The gate is `opensTranscript` — the same
 * threshold at which a guardian can see the conversation — so the two notions
 * of "this one is sensitive" cannot drift apart.
 *
 * The suppression happens HERE, not in the component. A component-side check
 * would leave the text in the JSON response, where it reaches the browser, the
 * network tab and every future consumer. The point is that it does not travel.
 *
 * NOTHING IS STORED. The excerpt is derived on read, so there is no column for
 * a parent-side query to select by accident — which is what validation decision
 * V6 exists to prevent (see the `conversations` table in db/schema.ts).
 */
export async function listOwnConversations(
  db: Pool,
  session: Session,
  opts: { limit?: number; offset?: number } = {},
): Promise<ChildConversationPage> {
  // A parent session has no business here; the route answers 403 before this,
  // and this is the backstop if a future caller forgets.
  assertIsChild(session);

  const limit = Math.min(Math.max(opts.limit ?? CONVERSATION_PAGE_SIZE, 1), CONVERSATION_PAGE_SIZE);
  const offset = Math.max(opts.offset ?? 0, 0);

  // limit + 1 answers "is there more" without a second count query.
  const r = await db.query(
    `select c.id,
            c.started_at,
            c.max_severity,
            (select count(*)::int
               from messages m
              where m.conversation_id = c.id
                and m.status = 'completed')            as message_count,
            (select left(m.content, 80)
               from messages m
              where m.conversation_id = c.id
                and m.role = 'child'
                and m.status = 'completed'
              order by m.created_at asc
              limit 1)                                as excerpt
       from conversations c
      where c.child_id = $1
        and exists (select 1
                      from messages m2
                     where m2.conversation_id = c.id
                       and m2.status = 'completed')
      order by c.started_at desc
      limit $2 offset $3`,
    [session.childId, limit + 1, offset],
  );

  const hasMore = r.rows.length > limit;
  const rows = hasMore ? r.rows.slice(0, limit) : r.rows;

  return {
    hasMore,
    conversations: rows.map((x: Record<string, unknown>) => {
      const flagged = opensTranscript((x.max_severity as Severity | null) ?? null);
      const excerpt = flagged ? undefined : ((x.excerpt as string | null) ?? undefined);
      return {
        id: x.id as string,
        startedAt: String(x.started_at),
        messageCount: Number(x.message_count ?? 0),
        ...(excerpt ? { excerpt: excerpt.trim() } : {}),
      };
    }),
  };
}
