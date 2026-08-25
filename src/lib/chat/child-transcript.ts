/**
 * A child reading their OWN conversation.
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
import { assertIsOwningChild, type Session } from '@/lib/authz';

export interface ChildMessage {
  id: string;
  role: string;
  content: string;
  createdAt: string;
}

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
