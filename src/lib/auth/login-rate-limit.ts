/**
 * Rate limiting for the login endpoints.
 *
 * Red-team finding #15, failure scenario A: per-child lockout does nothing
 * against HORIZONTAL brute force. An attacker trying one common PIN across a
 * thousand child accounts sees exactly one failure per account and never
 * triggers a single lock, while sweeping the keyspace freely.
 *
 * The login route is not an AI-invoking path, so Phase 7's quota middleware
 * does not cover it. This does.
 *
 * Postgres-backed, per docs/decisions/0003: no second datastore, no additional
 * sub-processor, and the counter survives a restart.
 */
import { createHash } from 'crypto';
import type { Pool, PoolClient } from 'pg';

/** Failures from one IP before it is refused, regardless of which account. */
export const IP_MAX_FAILURES = 20;
export const IP_WINDOW_MS = 15 * 60 * 1000;

/** Failures against one family before that family's login is refused. */
export const FAMILY_MAX_FAILURES = 15;
export const FAMILY_WINDOW_MS = 15 * 60 * 1000;

export interface RateLimitVerdict {
  allowed: boolean;
  reason?: 'ip' | 'family';
  retryAfterMs?: number;
}

/**
 * IPs are hashed before storage. The rate limiter needs to compare addresses,
 * not read them, and this table concerns children's households.
 */
function hashIp(ip: string): string {
  return createHash('sha256').update(ip).digest('hex').slice(0, 32);
}

export async function checkLoginRate(
  db: Pool | PoolClient,
  ip: string,
  familyId: string | null,
): Promise<RateLimitVerdict> {
  const ipHash = hashIp(ip);

  const r = await db.query(
    `select
       (select count(*) from login_attempts
         where ip_hash = $1 and succeeded = false
           and created_at > now() - ($3 || ' milliseconds')::interval) as ip_failures,
       (select count(*) from login_attempts
         where family_id = $2 and succeeded = false
           and created_at > now() - ($4 || ' milliseconds')::interval) as family_failures`,
    [ipHash, familyId, IP_WINDOW_MS, FAMILY_WINDOW_MS],
  );

  const ipFailures = Number(r.rows[0].ip_failures);
  const familyFailures = Number(r.rows[0].family_failures);

  if (ipFailures >= IP_MAX_FAILURES) {
    return { allowed: false, reason: 'ip', retryAfterMs: IP_WINDOW_MS };
  }
  if (familyId && familyFailures >= FAMILY_MAX_FAILURES) {
    return { allowed: false, reason: 'family', retryAfterMs: FAMILY_WINDOW_MS };
  }
  return { allowed: true };
}

export async function recordLoginAttempt(
  db: Pool | PoolClient,
  ip: string,
  familyId: string | null,
  identifier: string | null,
  succeeded: boolean,
): Promise<void> {
  await db.query(
    `insert into login_attempts (ip_hash, family_id, identifier, succeeded)
     values ($1, $2, $3, $4)`,
    [hashIp(ip), familyId, identifier, succeeded],
  );
}

/** Housekeeping. Attempts outside every window carry no information. */
export async function pruneLoginAttempts(db: Pool | PoolClient): Promise<number> {
  const r = await db.query(
    `delete from login_attempts
      where created_at < now() - ($1 || ' milliseconds')::interval`,
    [Math.max(IP_WINDOW_MS, FAMILY_WINDOW_MS) * 4],
  );
  return r.rowCount ?? 0;
}
