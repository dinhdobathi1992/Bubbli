/**
 * The parent sign-in ceiling.
 *
 * Asking for a sign-in code is an unauthenticated write that costs a delivery
 * to a real person's mailbox and a call to a paid sub-processor. Better Auth's
 * own limiter is off in development and memory-backed in production, which on a
 * serverless runtime is per-instance and therefore very nearly nothing — so
 * before this, the endpoint had no ceiling that survived a second container.
 *
 * Two ceilings are asserted because the two abuses are different: sweeping many
 * guardians from one address, and bombing one guardian's mailbox from many.
 */
import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { Pool } from 'pg';
import { readFileSync, existsSync } from 'fs';
import {
  checkParentOtpRate,
  recordParentOtpSend,
  parentOtpIdentifier,
  PARENT_OTP_IP_MAX,
  PARENT_OTP_EMAIL_MAX,
  checkLoginRate,
  recordLoginAttempt,
} from '@/lib/auth/login-rate-limit';

const url =
  process.env.DATABASE_URL ??
  (existsSync('.secrets-tmp/dburl') ? readFileSync('.secrets-tmp/dburl', 'utf8').trim() : undefined);
if (!url) throw new Error('No database URL');
const pool = new Pool({ connectionString: url, max: 4 });

/**
 * Every identifier this file touches is scoped to ONE run.
 *
 * The per-mailbox ceiling counts by identifier alone, with no IP in the
 * predicate, so a fixed address made this suite depend on nothing else in the
 * process writing that address. It failed the first time a mutation run
 * executed alongside it. A broad `delete ... like 'parent-otp:%'` had the same
 * defect in the other direction: it deleted rows belonging to whatever else was
 * running.
 */
const RUN = Math.random().toString(36).slice(2, 8);
const IP = `198.51.100.${Math.floor(Math.random() * 250) + 1}`;
const OTHER_IP = '203.0.113.77';
const mailbox = (name: string) => `${name}-${RUN}@example.test`;
const MAILBOX = mailbox('guardian');
const FORGED = `parent-otp:forged-${RUN}`;

/** Everything the file can write, so cleanup removes its rows and no others. */
const OWN_IDENTIFIERS = [
  ...[
    'guardian',
    'someone-else',
    'fresh',
    'one-more',
    ...Array.from({ length: PARENT_OTP_IP_MAX + 6 }, (_, i) => `guardian-${i}`),
  ].map((n) => parentOtpIdentifier(mailbox(n))),
  FORGED,
];

const clear = () =>
  pool.query(`delete from login_attempts where identifier = any($1::text[])`, [OWN_IDENTIFIERS]);

beforeEach(clear);
afterAll(async () => {
  await clear().catch(() => {});
  await pool.end();
});

describe('the stored identifier', () => {
  it('never contains the address', () => {
    expect(parentOtpIdentifier(MAILBOX)).not.toMatch(/guardian|example/i);
  });

  it('is stable, and case and whitespace do not open a second bucket', () => {
    expect(parentOtpIdentifier(`  ${MAILBOX.toUpperCase()} `)).toBe(parentOtpIdentifier(MAILBOX));
  });

  it('separates two different mailboxes', () => {
    expect(parentOtpIdentifier('a@example.test')).not.toBe(parentOtpIdentifier('b@example.test'));
  });
});

describe('the per-mailbox ceiling', () => {
  it('admits a first request', async () => {
    expect((await checkParentOtpRate(pool, IP, MAILBOX)).allowed).toBe(true);
  });

  it('counts SENDS, not failures — the defect the enquiry form had', async () => {
    for (let i = 0; i < PARENT_OTP_EMAIL_MAX; i += 1) {
      await recordParentOtpSend(pool, IP, MAILBOX);
    }
    expect((await checkParentOtpRate(pool, IP, MAILBOX)).allowed).toBe(false);
  });

  it('holds when the attacker rotates addresses, which an IP ceiling cannot see', async () => {
    for (let i = 0; i < PARENT_OTP_EMAIL_MAX; i += 1) {
      await recordParentOtpSend(pool, `203.0.113.${i + 1}`, MAILBOX);
    }
    expect((await checkParentOtpRate(pool, '203.0.113.200', MAILBOX)).allowed).toBe(false);
  });

  it('does not throttle a different mailbox', async () => {
    for (let i = 0; i < PARENT_OTP_EMAIL_MAX + 2; i += 1) {
      await recordParentOtpSend(pool, OTHER_IP, MAILBOX);
    }
    expect((await checkParentOtpRate(pool, OTHER_IP, mailbox('someone-else'))).allowed).toBe(true);
  });
});

describe('the per-IP ceiling', () => {
  it('refuses one address sweeping many guardians', async () => {
    // Each mailbox stays under its own ceiling; only the IP total crosses.
    for (let i = 0; i < PARENT_OTP_IP_MAX; i += 1) {
      await recordParentOtpSend(pool, IP, mailbox(`guardian-${i}`));
    }
    const v = await checkParentOtpRate(pool, IP, mailbox('fresh'));
    expect(v.allowed).toBe(false);
    expect(v.reason).toBe('ip');
  });

  it('admits exactly the ceiling and refuses the next', async () => {
    for (let i = 0; i < PARENT_OTP_IP_MAX - 1; i += 1) {
      await recordParentOtpSend(pool, IP, mailbox(`guardian-${i}`));
    }
    expect((await checkParentOtpRate(pool, IP, mailbox('fresh'))).allowed).toBe(true);
    await recordParentOtpSend(pool, IP, mailbox('one-more'));
    expect((await checkParentOtpRate(pool, IP, mailbox('fresh'))).allowed).toBe(false);
  });
});

describe('the ceiling cannot be spent by an anonymous stranger', () => {
  it('a failed login naming itself `parent-otp:` does not consume the ceiling', async () => {
    // `/api/child/login` writes the caller-supplied display name straight into
    // `identifier`. Without the `succeeded = true` filter, ten anonymous POSTs
    // naming themselves `parent-otp:x` denied sign-in codes to every guardian
    // behind that IP for fifteen minutes — an unauthenticated request switching
    // off the alert path for a whole household.
    for (let i = 0; i < PARENT_OTP_IP_MAX + 5; i += 1) {
      await recordLoginAttempt(pool, IP, null, FORGED, false);
    }
    expect((await checkParentOtpRate(pool, IP, MAILBOX)).allowed).toBe(true);
    await pool.query(`delete from login_attempts where identifier = $1`, [FORGED]);
  });
});

describe('the two limiters do not contaminate each other', () => {
  it('a guardian asking for codes cannot lock their household out of the child form', async () => {
    // Recorded as successes precisely so `checkLoginRate`, which counts
    // failures, never sees them. Written as failures this would be a
    // denial-of-service a parent could inflict on their own children.
    for (let i = 0; i < PARENT_OTP_IP_MAX; i += 1) {
      await recordParentOtpSend(pool, IP, mailbox(`guardian-${i}`));
    }
    expect((await checkLoginRate(pool, IP, null)).allowed).toBe(true);
  });

  it('child PIN failures do not consume the parent code ceiling', async () => {
    for (let i = 0; i < 15; i += 1) {
      await recordLoginAttempt(pool, IP, null, `Emma-${RUN}`, false);
    }
    expect((await checkParentOtpRate(pool, IP, MAILBOX)).allowed).toBe(true);
    await pool.query(`delete from login_attempts where identifier = $1`, [`Emma-${RUN}`]);
  });
});
