/**
 * `assertConsented` — the guard on every path that creates or reads child data.
 *
 * It had no test. Its distinction between "not yet on file" and "withdrawn"
 * matters: withdrawal is a deliberate act a parent can audit, and collapsing the
 * two would hide it. `CONSENT_MECHANISM` and `PENDING_CHILD_TTL_MS` were also
 * untested constants, and both are load-bearing — the mechanism is the claim
 * made to regulators, and the TTL decides when unconsented children are purged.
 */
import { describe, it, expect, afterAll } from 'vitest';
import { Pool } from 'pg';
import { readFileSync, existsSync } from 'fs';
import {
  assertConsented,
  recordConsent,
  withdrawConsent,
  getConsentState,
  CONSENT_MECHANISM,
  PENDING_CHILD_TTL_MS,
} from '@/lib/auth/consent';

const url =
  process.env.DATABASE_URL ??
  (existsSync('.secrets-tmp/dburl') ? readFileSync('.secrets-tmp/dburl', 'utf8').trim() : undefined);
if (!url) throw new Error('No database URL');
const pool = new Pool({ connectionString: url, max: 4 });

const families: string[] = [];

async function familyWithParent(consented: boolean): Promise<{ familyId: string; parentId: string }> {
  const f = await pool.query(`insert into families (name) values ('consent-guard') returning id`);
  const familyId = f.rows[0].id as string;
  families.push(familyId);
  const p = await pool.query(
    `insert into parents (family_id, email, consented_at)
     values ($1, $2, ${consented ? 'now()' : 'null'}) returning id`,
    [familyId, `cg${Math.random().toString(36).slice(2)}@example.test`],
  );
  return { familyId, parentId: p.rows[0].id as string };
}

afterAll(async () => {
  for (const f of families) {
    await pool.query(`delete from children where family_id = $1`, [f]).catch(() => {});
    await pool.query(`delete from parents where family_id = $1`, [f]).catch(() => {});
    await pool.query(`delete from families where id = $1`, [f]).catch(() => {});
  }
  await pool.end();
});

describe('the recorded mechanism', () => {
  it('is email verification, which is what Q-B is asking about', () => {
    expect(CONSENT_MECHANISM).toBe('email_verification');
  });

  it('purges unconsented children after 24 hours', () => {
    expect(PENDING_CHILD_TTL_MS).toBe(24 * 60 * 60 * 1000);
  });
});

describe('assertConsented', () => {
  it('passes for a family with consent on file', async () => {
    const { familyId } = await familyWithParent(true);
    await expect(assertConsented(pool, familyId)).resolves.toBeUndefined();
  });

  it('refuses when no consent has been given', async () => {
    const { familyId } = await familyWithParent(false);
    await expect(assertConsented(pool, familyId)).rejects.toThrow(/not yet on file/);
  });

  it('refuses when consent was withdrawn, and says so distinctly', async () => {
    const { familyId, parentId } = await familyWithParent(true);
    await withdrawConsent(pool, parentId);
    // Withdrawal is a deliberate, auditable act. Reporting it as "not yet on
    // file" would erase the distinction.
    await expect(assertConsented(pool, familyId)).rejects.toThrow(/withdrawn/);
  });

  it('refuses for a family that does not exist', async () => {
    await expect(
      assertConsented(pool, '00000000-0000-0000-0000-000000000000'),
    ).rejects.toThrow();
  });
});

describe('consent state transitions', () => {
  it('records consent and reports it', async () => {
    const { familyId, parentId } = await familyWithParent(false);
    expect((await getConsentState(pool, familyId)).consented).toBe(false);
    await recordConsent(pool, parentId);
    const after = await getConsentState(pool, familyId);
    expect(after.consented).toBe(true);
    expect(after.withdrawn).toBe(false);
  });

  it('marks withdrawal without pretending consent was never given', async () => {
    const { familyId, parentId } = await familyWithParent(true);
    await withdrawConsent(pool, parentId);
    const s = await getConsentState(pool, familyId);
    expect(s.consented).toBe(false);
    expect(s.withdrawn).toBe(true);
  });

  it('one consenting guardian is enough for the family', async () => {
    const { familyId } = await familyWithParent(true);
    await pool.query(
      `insert into parents (family_id, email, consented_at) values ($1,$2,null)`,
      [familyId, `second${Math.random().toString(36).slice(2)}@example.test`],
    );
    await expect(assertConsented(pool, familyId)).resolves.toBeUndefined();
  });
});
