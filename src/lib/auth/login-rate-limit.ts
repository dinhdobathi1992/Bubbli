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

/**
 * Parent sign-in codes.
 *
 * The child login form and this one fail differently, so they count differently.
 * A wrong PIN is a FAILURE and `checkLoginRate` counts failures; an OTP send is
 * a SUCCESS that costs a delivery to somebody's mailbox and a call to a paid
 * sub-processor. Counting only failures here would have left the endpoint wide
 * open, which is the exact defect `checkEnquiryRate` was written to repair.
 *
 * Two ceilings, because the two abuses are different:
 *
 * - per IP, against an attacker sweeping many guardians from one place;
 * - per mailbox, against mailbox-bombing ONE guardian from rotating IPs, which
 *   an IP ceiling alone cannot see.
 *
 * `allowedAttempts` on the OTP itself bounds grinding a code that was sent.
 * This bounds how many codes can be asked for in the first place.
 *
 * The address is hashed before it is stored, for the same reason the IP is:
 * this table needs to compare identities, never to read them, and a guardian's
 * email address is exactly what the rest of the product works to keep out of
 * logs and side tables.
 */
export const PARENT_OTP_IP_MAX = 15;
export const PARENT_OTP_EMAIL_MAX = 8;
export const PARENT_OTP_WINDOW_MS = 15 * 60 * 1000;

/** Namespace prefix inside the shared `login_attempts` table. */
const PARENT_OTP_TAG = 'parent-otp';

/** The stored identifier: a namespace, and a mailbox nobody can read back. */
export function parentOtpIdentifier(email: string): string {
  const digest = createHash('sha256')
    .update(email.trim().toLowerCase())
    .digest('hex')
    .slice(0, 32);
  return `${PARENT_OTP_TAG}:${digest}`;
}

export async function checkParentOtpRate(
  db: Pool | PoolClient,
  ip: string,
  email: string,
): Promise<RateLimitVerdict> {
  // `succeeded = true` is not cosmetic. Without it, ANY row whose identifier
  // starts with the namespace counts — and `/api/child/login` writes the
  // caller-supplied display name straight into `identifier`. Ten anonymous
  // POSTs naming themselves `parent-otp:x` would then deny sign-in codes to
  // every guardian behind that IP for fifteen minutes, renewable forever: an
  // unauthenticated request switching off the alert path for a whole household.
  // These rows are only ever written as successes, so the filter costs nothing.
  const r = await db.query<{ ip_sends: string; email_sends: string }>(
    `select
       (select count(*) from login_attempts
         where ip_hash = $1 and identifier like $2 and succeeded = true
           and created_at > now() - ($4 || ' milliseconds')::interval) as ip_sends,
       (select count(*) from login_attempts
         where identifier = $3 and succeeded = true
           and created_at > now() - ($4 || ' milliseconds')::interval) as email_sends`,
    [hashIp(ip), `${PARENT_OTP_TAG}:%`, parentOtpIdentifier(email), PARENT_OTP_WINDOW_MS],
  );

  if (Number(r.rows[0].ip_sends) >= PARENT_OTP_IP_MAX) {
    return { allowed: false, reason: 'ip', retryAfterMs: PARENT_OTP_WINDOW_MS };
  }
  if (Number(r.rows[0].email_sends) >= PARENT_OTP_EMAIL_MAX) {
    return { allowed: false, reason: 'family', retryAfterMs: PARENT_OTP_WINDOW_MS };
  }
  return { allowed: true };
}

/**
 * Recorded as a SUCCESS, deliberately. `checkLoginRate` counts `succeeded =
 * false` rows across every identifier for an IP, so writing these as failures
 * would let a guardian asking for a sign-in code lock their own household out
 * of the child login form.
 */
export async function recordParentOtpSend(
  db: Pool | PoolClient,
  ip: string,
  email: string,
): Promise<void> {
  await recordLoginAttempt(db, ip, null, parentOtpIdentifier(email), true);
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
    [Math.max(IP_WINDOW_MS, FAMILY_WINDOW_MS, ENQUIRY_WINDOW_MS, PARENT_OTP_WINDOW_MS) * 4],
  );
  return r.rowCount ?? 0;
}
