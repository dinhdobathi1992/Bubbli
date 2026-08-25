/**
 * The ONLY module permitted to read `messages.content` for a parent.
 *
 * Red-team finding #3: enumerating routes to prove isolation is brittle —
 * catch-alls collapse whole endpoint families to one entry, and RSC pages and
 * Server Actions serve content without appearing in any route manifest. So the
 * guarantee is enforced STRUCTURALLY instead: one audited function, and a lint
 * rule forbidding message-content queries anywhere else. Then new surfaces are
 * covered by construction rather than by remembering to add them to a list.
 *
 * Audit ordering (finding #10 tier): `granted` is written BEFORE content is
 * read, so a crash cannot produce an unlogged view. `delivered` is appended
 * after success, and the co-guardian access log renders `delivered` rows — so a
 * failed retrieval never appears as an accusation in a custody dispute.
 */
import type { Pool } from 'pg';
import { assertCanViewConversation, type Session } from '@/lib/authz';
import { audit, pseudonymFor } from '@/lib/audit/write';

export interface TranscriptMessage {
  id: string;
  role: string;
  content: string;
  createdAt: string;
  flagged: boolean;
}

export async function getTranscript(
  db: Pool,
  session: Session,
  conversationId: string,
): Promise<TranscriptMessage[]> {
  // Throws (404) below the gate, for another family, or when absent.
  const { maxSeverity, childId } = await assertCanViewConversation(db, session, conversationId);

  const actor = await pseudonymFor(db, session.familyId, 'parent', session.parentId!);
  const subject = await pseudonymFor(db, session.familyId, 'child', childId);

  await audit(db, {
    actorPseudonym: actor,
    subjectPseudonym: subject,
    eventType: 'conversation.view',
    entityType: 'conversation',
    entityId: conversationId,
    authorisingSeverity: maxSeverity,
    outcome: 'granted',
  });

  const r = await db.query(
    `select m.id, m.role, m.content, m.created_at,
            exists(select 1 from flags f where f.message_id = m.id) as flagged
       from messages m
      where m.conversation_id = $1 and m.status = 'completed'
      order by m.created_at asc`,
    [conversationId],
  );

  await audit(db, {
    actorPseudonym: actor,
    subjectPseudonym: subject,
    eventType: 'conversation.view',
    entityType: 'conversation',
    entityId: conversationId,
    authorisingSeverity: maxSeverity,
    outcome: 'delivered',
  });

  return r.rows.map((x: Record<string, unknown>) => ({
    id: x.id as string,
    role: x.role as string,
    content: x.content as string,
    createdAt: String(x.created_at),
    flagged: x.flagged as boolean,
  }));
}

/** Record a refusal. Denials are audited too, and are never rendered. */
export async function auditDenied(
  db: Pool,
  session: Session,
  conversationId: string,
): Promise<void> {
  if (!session.parentId) return;
  const actor = await pseudonymFor(db, session.familyId, 'parent', session.parentId);
  await audit(db, {
    actorPseudonym: actor,
    eventType: 'conversation.view',
    entityType: 'conversation',
    entityId: conversationId,
    outcome: 'denied',
  });
}
