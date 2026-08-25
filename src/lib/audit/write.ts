/**
 * Append-only audit writer.
 *
 * Actor and subject are recorded as PSEUDONYMS, never as direct foreign keys.
 * That indirection is what lets GDPR erasure work without ever mutating an
 * audit row: erasure deletes the pseudonym, the row survives and becomes
 * unresolvable. `audit_events` therefore carries no foreign keys at all, so no
 * cascade can reach it.
 */
import type { Pool, PoolClient } from 'pg';
import type { Severity } from '@/config/settings';

export type AuditOutcome = 'granted' | 'delivered' | 'denied';

export async function pseudonymFor(
  db: Pool | PoolClient,
  familyId: string,
  kind: 'parent' | 'child' | 'family',
  subjectId: string,
): Promise<string> {
  const r = await db.query(
    `insert into family_pseudonyms (family_id, subject_kind, subject_id)
     values ($1,$2,$3)
     on conflict (subject_kind, subject_id) do update set subject_id = excluded.subject_id
     returning pseudonym`,
    [familyId, kind, subjectId],
  );
  return r.rows[0].pseudonym as string;
}

export async function audit(
  db: Pool | PoolClient,
  e: {
    actorPseudonym: string;
    subjectPseudonym?: string | null;
    eventType: string;
    entityType: string;
    entityId?: string | null;
    authorisingSeverity?: Severity | null;
    outcome: AuditOutcome;
    metadata?: Record<string, unknown>;
  },
): Promise<void> {
  await db.query(
    `insert into audit_events
       (actor_pseudonym, subject_pseudonym, event_type, entity_type, entity_id, authorising_severity, outcome, metadata)
     values ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [
      e.actorPseudonym,
      e.subjectPseudonym ?? null,
      e.eventType,
      e.entityType,
      e.entityId ?? null,
      e.authorisingSeverity ?? null,
      e.outcome,
      JSON.stringify(e.metadata ?? {}),
    ],
  );
}
