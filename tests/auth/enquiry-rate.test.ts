/**
 * The public enquiry form's ceiling.
 *
 * This exists because the first implementation reused `checkLoginRate`, which
 * counts `succeeded = false` only. Enquiries are recorded as successes, so the
 * form was throttled by nothing at all — and every submission sends a message
 * from an SES-verified identity whose sending reputation is the thing at risk.
 * The bug was invisible: the code read as though it were limited.
 */
import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { Pool } from 'pg';
import { readFileSync, existsSync } from 'fs';
import {
  checkEnquiryRate,
  recordLoginAttempt,
  ENQUIRY_MAX_PER_WINDOW,
} from '@/lib/auth/login-rate-limit';

const url =
  process.env.DATABASE_URL ??
  (existsSync('.secrets-tmp/dburl') ? readFileSync('.secrets-tmp/dburl', 'utf8').trim() : undefined);
if (!url) throw new Error('No database URL');
const pool = new Pool({ connectionString: url, max: 4 });

const IP = `198.51.100.${Math.floor(Math.random() * 250) + 1}`;

beforeEach(async () => {
  await pool.query(`delete from login_attempts where identifier = 'enquiry'`);
});

afterAll(async () => {
  await pool.query(`delete from login_attempts where identifier = 'enquiry'`).catch(() => {});
  await pool.end();
});

describe('enquiry throttling', () => {
  it('allows a first enquiry from a fresh address', async () => {
    expect((await checkEnquiryRate(pool, IP)).allowed).toBe(true);
  });

  it('counts SUCCESSFUL submissions, which the login limiter does not', async () => {
    for (let i = 0; i < ENQUIRY_MAX_PER_WINDOW; i += 1) {
      // succeeded: true — exactly what the route records, and exactly what the
      // login limiter ignores.
      await recordLoginAttempt(pool, IP, null, 'enquiry', true);
    }
    const v = await checkEnquiryRate(pool, IP);
    expect(v.allowed).toBe(false);
    expect(v.reason).toBe('ip');
  });

  it('admits exactly the ceiling and refuses the next', async () => {
    for (let i = 0; i < ENQUIRY_MAX_PER_WINDOW - 1; i += 1) {
      await recordLoginAttempt(pool, IP, null, 'enquiry', true);
    }
    expect((await checkEnquiryRate(pool, IP)).allowed).toBe(true);
    await recordLoginAttempt(pool, IP, null, 'enquiry', true);
    expect((await checkEnquiryRate(pool, IP)).allowed).toBe(false);
  });

  it('does not throttle a different address', async () => {
    for (let i = 0; i < ENQUIRY_MAX_PER_WINDOW + 3; i += 1) {
      await recordLoginAttempt(pool, IP, null, 'enquiry', true);
    }
    expect((await checkEnquiryRate(pool, '203.0.113.99')).allowed).toBe(true);
  });

  it('ignores login attempts, so a family PIN failure cannot block an enquiry', async () => {
    for (let i = 0; i < 15; i += 1) {
      await recordLoginAttempt(pool, IP, null, 'someone', false);
    }
    expect((await checkEnquiryRate(pool, IP)).allowed).toBe(true);
  });
});
