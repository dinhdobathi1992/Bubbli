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

/** An enquiry is not a login, so it gets its own ceiling and its own window. */
export const ENQUIRY_MAX_PER_WINDOW = 5;
export const ENQUIRY_WINDOW_MS = 60 * 60 * 1000;

/**
 * Throttle the public enquiry form.
 *
 * `checkLoginRate` counts only `succeeded = false`, because a successful sign-in
 * is not evidence of abuse. An enquiry is the opposite: every SUCCESSFUL
 * submission sends a message from an SES-verified identity, so the successes are
 * exactly what has to be counted. Using the login limiter here silently applied
 * no limit whatsoever — the form was wide open.
 *
 * Shares `login_attempts` and its IP hashing rather than adding a second table:
 * same data, same retention sweep, same privacy posture.
 */
export async function checkEnquiryRate(
  db: Pool | PoolClient,
  ip: string,
): Promise<RateLimitVerdict> {
  const r = await db.query<{ n: string }>(
    `select count(*) as n from login_attempts
      where ip_hash = $1 and identifier = 'enquiry'
        and created_at > now() - ($2 || ' milliseconds')::interval`,
    [hashIp(ip), ENQUIRY_WINDOW_MS],
  );
  if (Number(r.rows[0].n) >= ENQUIRY_MAX_PER_WINDOW) {
    return { allowed: false, reason: 'ip', retryAfterMs: ENQUIRY_WINDOW_MS };
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
