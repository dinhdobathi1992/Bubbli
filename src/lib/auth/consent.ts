/**
 * Verifiable parental consent.
 *
 * BLOCKED ON Q-B. Whether email verification is sufficient verifiable parental
 * consent for an under-13 is a legal question, and V8's split at 13 sharpened
 * rather than removed it: the under-13 path needs a defined mechanism, and the
 * 13+ path needs confirmation that a lighter one is permissible.
 *
 * What is implemented here is the FLOOR, and it is marked as such. Do not ship
 * on the floor without the review PRD §12 already calls for.
 *
 * The correction the red team forced: COPPA governs COLLECTION, not login.
 * The plan gated child *activation* on consent while the child's display name,
 * age band and PIN were already persisted at creation — records sitting in the
 * database indefinitely if a parent abandons signup. Children are therefore
 * created in a PENDING state with a hard TTL and a purge job.
 */
import type { Pool, PoolClient } from 'pg';
import { revokeAllForFamily } from './child-session';

/**
 * How long an unconsented child record may exist before it is purged.
 *
 * This is the window between "parent typed a name into a form" and "verifiable
 * consent completed". Anything still pending after it is deleted, not archived.
 */
export const PENDING_CHILD_TTL_MS = 24 * 60 * 60 * 1000;

/** TODO(Q-B): the legal review may require a stronger mechanism than this. */
export const CONSENT_MECHANISM = 'email_verification' as const;

export interface ConsentState {
  consented: boolean;
  withdrawn: boolean;
  mechanism: typeof CONSENT_MECHANISM;
}

export async function getConsentState(db: Pool | PoolClient, familyId: string): Promise<ConsentState> {
  const r = await db.query(
    `select
        bool_or(consented_at is not null) as consented,
        bool_or(consent_withdrawn_at is not null) as withdrawn
       from parents where family_id = $1`,
    [familyId],
  );
  const row = r.rows[0] ?? {};
  return {
    consented: row.consented === true && row.withdrawn !== true,
    withdrawn: row.withdrawn === true,
    mechanism: CONSENT_MECHANISM,
  };
}

/**
 * Record consent and activate the family's pending children.
 *
 * Until this runs, no child in the family can authenticate, and their records
 * are eligible for the pending purge.
 */
export async function recordConsent(db: Pool | PoolClient, parentId: string): Promise<{ activated: number }> {
  const p = await db.query(
    `update parents
        set consented_at = coalesce(consented_at, now()), consent_withdrawn_at = null
      where id = $1
      returning family_id`,
    [parentId],
  );
  if (p.rowCount === 0) throw new Error('No such parent');

  const familyId = p.rows[0].family_id;
  const c = await db.query(
    `update children set activated_at = now()
      where family_id = $1 and activated_at is null`,
    [familyId],
  );
  return { activated: c.rowCount ?? 0 };
}

/**
 * Withdraw consent.
 *
 * Sessions are revoked IMMEDIATELY, not at next login. The plan's original
 * consent check ran at authentication time only, so a child whose parent
 * withdrew consent would have kept chatting on an existing session until it
 * expired.
 */
export async function withdrawConsent(
  db: Pool | PoolClient,
  parentId: string,
): Promise<{ sessionsRevoked: number; childrenDeactivated: number }> {
  const p = await db.query(
    `update parents set consent_withdrawn_at = now() where id = $1 returning family_id`,
    [parentId],
  );
  if (p.rowCount === 0) throw new Error('No such parent');

  const familyId = p.rows[0].family_id;

  const sessionsRevoked = await revokeAllForFamily(db, familyId, 'consent_withdrawn');
  const c = await db.query(
    `update children set activated_at = null where family_id = $1 and activated_at is not null`,
    [familyId],
  );

  return { sessionsRevoked, childrenDeactivated: c.rowCount ?? 0 };
}

/**
 * Purge child records whose family never completed consent.
 *
 * Run on a schedule. Deletes rather than archives: an unconsented record is
 * data we had no lawful basis to hold.
 */
export async function purgeUnconsentedChildren(db: Pool | PoolClient): Promise<number> {
  const r = await db.query(
    `delete from children c
      using families f
      where c.family_id = f.id
        and c.activated_at is null
        and c.created_at < now() - ($1 || ' milliseconds')::interval
        and not exists (
          select 1 from parents p
           where p.family_id = c.family_id and p.consented_at is not null
        )`,
    [PENDING_CHILD_TTL_MS],
  );
  return r.rowCount ?? 0;
}

/** Guard for every path that creates or reads child data. */
export async function assertConsented(db: Pool | PoolClient, familyId: string): Promise<void> {
  const state = await getConsentState(db, familyId);
  if (!state.consented) {
    throw new Error(state.withdrawn ? 'Parental consent has been withdrawn' : 'Parental consent is not yet on file');
  }
}
