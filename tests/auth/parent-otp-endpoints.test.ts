/**
 * EVERY endpoint on the auth mount that can post a code to a mailbox.
 *
 * The first ceiling named one path — the one the sign-in page calls. Better
 * Auth's emailOTP plugin mounts two more that take an address from an anonymous
 * body and mail a code to it, so the limit could be stepped around by changing
 * a path segment. Driven against a registered guardian, all three delivered
 * mail and only one recorded an attempt.
 *
 * This is the regression test for that, and it is written against the ROUTE
 * rather than the limiter: the limiter was correct, the wiring was not.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { Pool } from 'pg';
import { readFileSync, existsSync } from 'fs';
import { parentOtpIdentifier } from '@/lib/auth/login-rate-limit';

const sent: string[] = [];
vi.mock('@/lib/email/send', () => ({
  sendMail: vi.fn(async (m: { to: string }) => {
    sent.push(m.to);
    return { accepted: true, transport: 'log' as const };
  }),
  verifyMailTransport: vi.fn(async () => 'log' as const),
  chooseTransport: vi.fn(() => 'log' as const),
}));

const url =
  process.env.DATABASE_URL ??
  (existsSync('.secrets-tmp/dburl') ? readFileSync('.secrets-tmp/dburl', 'utf8').trim() : undefined);
if (!url) throw new Error('No database URL');
const pool = new Pool({ connectionString: url, max: 4 });

/** The one mailing path this product actually uses. */
const MAILING_PATHS = ['/api/auth/email-otp/send-verification-otp'];

/**
 * Mounted by the plugin, unused by the product, and closed at the mount.
 * `emailAndPassword` is disabled, so there is no password to reset.
 */
const DISABLED_PATHS = [
  '/api/auth/forget-password/email-otp',
  '/api/auth/email-otp/request-password-reset',
  '/api/auth/reset-password/email-otp',
];

const stamp = Date.now();
const EMAIL = `otp-endpoint-${stamp}@example.test`;
const USER_ID = `otp-endpoint-${stamp}`;

/**
 * Scoped to THIS run's mailbox, not to the whole namespace.
 *
 * Counting every `parent-otp:%` row made the assertion depend on nothing else
 * in the process writing one, and it failed the first time a mutation run
 * executed alongside it.
 */
const OWN = parentOtpIdentifier(EMAIL);

const rateRows = async () =>
  Number(
    (
      await pool.query<{ n: string }>(
        `select count(*) as n from login_attempts where identifier = $1`,
        [OWN],
      )
    ).rows[0].n,
  );

beforeAll(async () => {
  // The password-reset flows only mail a known user, so the probe needs one.
  await pool.query(
    `insert into auth_users (id, name, email, email_verified, created_at, updated_at)
     values ($1,'probe',$2,true,now(),now())`,
    [USER_ID, EMAIL],
  );
});

afterAll(async () => {
  await pool.query(`delete from login_attempts where identifier = $1`, [OWN]).catch(() => {});
  await pool.query(`delete from auth_verifications where identifier like $1`, [`%${EMAIL}%`]).catch(() => {});
  await pool.query(`delete from auth_users where id = $1`, [USER_ID]).catch(() => {});
  await pool.end();
});

async function post(path: string) {
  const { POST } = await import('@/app/api/auth/[...all]/route');
  const { settings } = await import('@/config/settings');
  return POST(
    new Request(`${settings.APP_ORIGIN}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-forwarded-for': `198.51.100.${stamp % 200}` },
      body: JSON.stringify({ email: EMAIL, type: 'sign-in' }),
    }),
  );
}

describe('every mailing endpoint on the mount is throttled', () => {
  for (const path of MAILING_PATHS) {
    it(`${path} records an attempt`, async () => {
      const before = await rateRows();
      sent.length = 0;
      await post(path);
      const after = await rateRows();
      expect(
        after,
        `${path} sent ${sent.length} mail(s) and recorded no attempt`,
      ).toBe(before + 1);
    });
  }

  it('refuses once the mailbox ceiling is crossed', async () => {
    const { PARENT_OTP_EMAIL_MAX } = await import('@/lib/auth/login-rate-limit');
    await pool.query(`delete from login_attempts where identifier = $1`, [OWN]);

    for (let i = 0; i < PARENT_OTP_EMAIL_MAX; i += 1) {
      await post(MAILING_PATHS[0]);
    }
    sent.length = 0;
    const res = await post(MAILING_PATHS[0]);
    expect(res.status).toBe(429);
    expect(sent).toEqual([]);
  });
});

describe('the password-reset endpoints are closed', () => {
  for (const path of DISABLED_PATHS) {
    it(`${path} answers 404 and mails nothing`, async () => {
      sent.length = 0;
      const res = await post(path);
      expect(res.status).toBe(404);
      expect(sent, `${path} still sent mail`).toEqual([]);
    });
  }
});
