/**
 * Retention. Validation decision V5: 90 days content, 1 year flags, 2 years
 * audit. One clock per data class, longest-lived last — flags outlive the
 * conversations they describe so a purged conversation stays reviewable in
 * summary, and audit rows outlive both so the "parents saw only flagged
 * content" proof survives the content it proves.
 *
 * The 30-day post-dismissal clock the PRD originally carried is DROPPED as
 * redundant: dismissal stops notifications and nothing else (V7).
 */
import type { Pool } from 'pg';
import { settings } from '@/config/settings';

export interface RetentionReport {
  conversationsPurged: number;
  flagsPurged: number;
  auditPurged: number;
  quotaEventsPurged: number;
  loginAttemptsPurged: number;
}

export async function runRetention(db: Pool): Promise<RetentionReport> {
  const days = (n: number) => `${n} days`;

  const conv = await db.query(
    `delete from conversations where started_at < now() - $1::interval`,
    [days(settings.RETENTION_CONTENT_DAYS)],
  );

  const flags = await db.query(
    `delete from flags where created_at < now() - $1::interval`,
    [days(settings.RETENTION_FLAGS_DAYS)],
  );

  // Audit rows are append-only and cannot be UPDATEd, but they DO age out on
  // their own clock. Erasure-by-pseudonym is a different mechanism entirely.
  const auditRows = await db.query(
    `delete from audit_events where created_at < now() - $1::interval`,
    [days(settings.RETENTION_AUDIT_DAYS)],
  );

  const quota = await db.query(`delete from quota_events where created_at < now() - interval '2 days'`);
  const logins = await db.query(`delete from login_attempts where created_at < now() - interval '7 days'`);

  return {
    conversationsPurged: conv.rowCount ?? 0,
    flagsPurged: flags.rowCount ?? 0,
    auditPurged: auditRows.rowCount ?? 0,
    quotaEventsPurged: quota.rowCount ?? 0,
    loginAttemptsPurged: logins.rowCount ?? 0,
  };
}

/**
 * Right to erasure.
 *
 * Deletes child content, then PSEUDONYMISES the audit trail by removing the
 * pseudonym rows — the audit rows themselves are never mutated or deleted, so
 * the append-only guarantee holds under GDPR erasure. That conflict was
 * resolved structurally in the schema rather than argued about here.
 */
export async function eraseFamily(db: Pool, familyId: string): Promise<{ auditRowsOrphaned: number }> {
  const c = await db.connect();
  try {
    await c.query('begin');

    const orphaned = await c.query(
      `select count(*)::int as n from audit_events
        where actor_pseudonym in (select pseudonym from family_pseudonyms where family_id = $1)
           or subject_pseudonym in (select pseudonym from family_pseudonyms where family_id = $1)`,
      [familyId],
    );

    await c.query(
      `delete from conversations c using children ch
        where c.child_id = ch.id and ch.family_id = $1`,
      [familyId],
    );
    await c.query(`delete from child_sessions where family_id = $1`, [familyId]);
    await c.query(`delete from quota_events where family_id = $1`, [familyId]);
    await c.query(`delete from login_attempts where family_id = $1`, [familyId]);
    await c.query(`delete from children where family_id = $1`, [familyId]);
    await c.query(`delete from parents where family_id = $1`, [familyId]);

    // The erasure step: pseudonyms go, audit rows stay and become unresolvable.
    await c.query(`delete from family_pseudonyms where family_id = $1`, [familyId]);
    await c.query(`delete from families where id = $1`, [familyId]);

    await c.query('commit');
    return { auditRowsOrphaned: orphaned.rows[0].n };
  } catch (e) {
    await c.query('rollback').catch(() => undefined);
    throw e;
  } finally {
    c.release();
  }
}
