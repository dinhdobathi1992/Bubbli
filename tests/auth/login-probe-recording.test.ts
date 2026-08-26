/**
 * A probe against a family that does not exist must be RECORDED.
 *
 * `login_attempts` records what was ATTEMPTED, not a reference to a real
 * family. A foreign key here made exactly those attempts throw on INSERT, so
 * the row was never written — and because the rate limiter counts rows in this
 * table, the per-IP counter never incremented and enumeration of the family
 * namespace was completely unthrottled.
 *
 * The FK was removed from the Drizzle model but no migration was ever
 * generated, and it was dropped by hand on one database. The model, the
 * migrations and the databases all disagreed, and the security property was
 * live only on the developer's machine. `drizzle/0004` fixes that; this test
 * asserts the behaviour rather than the schema, so it fails on any database
 * where the constraint has crept back.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Pool } from 'pg';
import { readFileSync, existsSync } from 'fs';
import { checkLoginRate, recordLoginAttempt } from '@/lib/auth/login-rate-limit';

const url =
  process.env.DATABASE_URL ??
  (existsSync('.secrets-tmp/dburl') ? readFileSync('.secrets-tmp/dburl', 'utf8').trim() : undefined);
if (!url) throw new Error('No database URL');
const pool = new Pool({ connectionString: url, max: 4 });

/** Well-formed, and guaranteed to reference no family. */
const GHOST_FAMILY = '00000000-0000-0000-0000-000000000000';
const IP = `203.0.113.${Math.floor(Math.random() * 250) + 1}`;

beforeAll(async () => {
  await pool.query(`delete from login_attempts where identifier like 'probe-test-%'`);
});

afterAll(async () => {
  await pool.query(`delete from login_attempts where identifier like 'probe-test-%'`).catch(() => {});
  await pool.end();
});

describe('probing a nonexistent family', () => {
  it('records the attempt instead of throwing', async () => {
    await expect(
      recordLoginAttempt(pool, IP, GHOST_FAMILY, 'probe-test-1', false),
    ).resolves.not.toThrow();

    const r = await pool.query(
      `select count(*)::int as n from login_attempts where identifier = $1`,
      ['probe-test-1'],
    );
    expect(r.rows[0].n).toBe(1);
  });

  it('counts toward the per-IP window, so enumeration is throttled', async () => {
    // The failure this guards: with the FK present every insert threw, the
    // counter stayed at zero, and an attacker could sweep the namespace freely.
    const ip = `198.51.100.${Math.floor(Math.random() * 250) + 1}`;
    for (let i = 0; i < 25; i += 1) {
      await recordLoginAttempt(pool, ip, GHOST_FAMILY, `probe-test-burst-${i}`, false);
    }

    const verdict = await checkLoginRate(pool, ip, GHOST_FAMILY);
    expect(verdict.allowed).toBe(false);
    expect(verdict.reason).toBe('ip');
  });

  it('leaves no foreign key on login_attempts for the constraint to creep back through', async () => {
    const r = await pool.query(
      `select count(*)::int as n from pg_constraint
        where conrelid = 'login_attempts'::regclass and contype = 'f'`,
    );
    expect(r.rows[0].n).toBe(0);
  });
});
