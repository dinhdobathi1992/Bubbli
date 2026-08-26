/**
 * Parent-issued device pairing.
 *
 * The properties that matter: a pairing code is single-use, expires, and yields
 * a device token that is stored hashed; a revoked or expired device stops
 * resolving immediately; and nothing here ever touches a child's email, because
 * a child does not have one.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Pool } from 'pg';
import { readFileSync, existsSync } from 'fs';
import { createHash } from 'crypto';
import {
  issuePairingCode,
  redeemPairingCode,
  resolveDevice,
  revokeDevice,
  revokeDevicesForChild,
} from '@/lib/auth/device-pairing';

const url =
  process.env.DATABASE_URL ??
  (existsSync('.secrets-tmp/dburl') ? readFileSync('.secrets-tmp/dburl', 'utf8').trim() : undefined);
if (!url) throw new Error('No database URL');
const pool = new Pool({ connectionString: url, max: 6 });

let familyId: string;
let childId: string;
let parentId: string;

beforeAll(async () => {
  const f = await pool.query(`insert into families (name) values ('pairing-test') returning id`);
  familyId = f.rows[0].id;
  const p = await pool.query(
    `insert into parents (family_id, email, consented_at) values ($1,$2,now()) returning id`,
    [familyId, `pair${Date.now()}@example.test`],
  );
  parentId = p.rows[0].id;
  const c = await pool.query(
    `insert into children (family_id, display_name, pin_hash, age_band, activated_at)
     values ($1,'Pip','x','8-11',now()) returning id`,
    [familyId],
  );
  childId = c.rows[0].id;
});

afterAll(async () => {
  await pool.query(`delete from child_devices where family_id = $1`, [familyId]).catch(() => {});
  await pool.query(`delete from children where family_id = $1`, [familyId]).catch(() => {});
  await pool.query(`delete from parents where family_id = $1`, [familyId]).catch(() => {});
  await pool.query(`delete from families where id = $1`, [familyId]).catch(() => {});
  await pool.end();
});

const issue = () => issuePairingCode(pool, { childId, familyId, parentId, label: 'Test tablet' });

describe('issuing a pairing code', () => {
  it('stores only a hash, so a database read yields no working code', async () => {
    const { code } = await issue();
    const r = await pool.query<{ pairing_code_hash: string }>(
      `select pairing_code_hash from child_devices
        where child_id = $1 and paired_at is null order by created_at desc limit 1`,
      [childId],
    );
    expect(r.rows[0].pairing_code_hash).not.toBe(code);
    expect(r.rows[0].pairing_code_hash).toBe(createHash('sha256').update(code).digest('hex'));
  });

  it('records which guardian issued it', async () => {
    await issue();
    const r = await pool.query(
      `select issued_by_parent_id from child_devices
        where child_id = $1 order by created_at desc limit 1`,
      [childId],
    );
    expect(r.rows[0].issued_by_parent_id).toBe(parentId);
  });
});

describe('redeeming', () => {
  it('pairs the device and returns a token stored only as a hash', async () => {
    const { code } = await issue();
    const redeemed = await redeemPairingCode(pool, code);
    expect(redeemed).not.toBeNull();
    expect(redeemed!.device.childId).toBe(childId);

    const r = await pool.query<{ device_token_hash: string; pairing_code_hash: string | null }>(
      `select device_token_hash, pairing_code_hash from child_devices where id = $1`,
      [redeemed!.device.id],
    );
    expect(r.rows[0].device_token_hash).toBe(
      createHash('sha256').update(redeemed!.token).digest('hex'),
    );
    // The pairing code is cleared in the same statement that issues the token.
    expect(r.rows[0].pairing_code_hash).toBeNull();
  });

  it('is single use', async () => {
    const { code } = await issue();
    expect(await redeemPairingCode(pool, code)).not.toBeNull();
    expect(await redeemPairingCode(pool, code)).toBeNull();
  });

  it('cannot be redeemed twice concurrently', async () => {
    const { code } = await issue();
    const results = await Promise.all([
      redeemPairingCode(pool, code),
      redeemPairingCode(pool, code),
      redeemPairingCode(pool, code),
    ]);
    expect(results.filter(Boolean)).toHaveLength(1);
  });

  it('rejects an expired code', async () => {
    const { code } = await issue();
    await pool.query(
      `update child_devices set pairing_expires_at = now() - interval '1 minute'
        where pairing_code_hash = $1`,
      [createHash('sha256').update(code).digest('hex')],
    );
    expect(await redeemPairingCode(pool, code)).toBeNull();
  });

  it('rejects an unknown code without throwing', async () => {
    expect(await redeemPairingCode(pool, 'ZZZZZZ')).toBeNull();
  });

  it('accepts the code as displayed, with spacing or lower case', async () => {
    const { code } = await issue();
    const spaced = `${code.slice(0, 3)} ${code.slice(3)}`.toLowerCase();
    expect(await redeemPairingCode(pool, spaced)).not.toBeNull();
  });
});

describe('resolving and revoking', () => {
  it('resolves a paired device to its child', async () => {
    const { code } = await issue();
    const redeemed = await redeemPairingCode(pool, code);
    const device = await resolveDevice(pool, redeemed!.token);
    expect(device?.childId).toBe(childId);
    expect(device?.familyId).toBe(familyId);
  });

  it('stops resolving the moment a guardian revokes it', async () => {
    const { code } = await issue();
    const redeemed = await redeemPairingCode(pool, code);
    expect(await resolveDevice(pool, redeemed!.token)).not.toBeNull();

    await revokeDevice(pool, redeemed!.device.id, 'guardian_revoked');
    expect(await resolveDevice(pool, redeemed!.token)).toBeNull();
  });

  it('stops resolving once the trust window closes', async () => {
    const { code } = await issue();
    const redeemed = await redeemPairingCode(pool, code);
    await pool.query(`update child_devices set expires_at = now() - interval '1 day' where id = $1`, [
      redeemed!.device.id,
    ]);
    expect(await resolveDevice(pool, redeemed!.token)).toBeNull();
  });

  it('revokes every device for a child at once', async () => {
    const a = await redeemPairingCode(pool, (await issue()).code);
    const b = await redeemPairingCode(pool, (await issue()).code);
    const n = await revokeDevicesForChild(pool, childId, 'consent_withdrawn');
    expect(n).toBeGreaterThanOrEqual(2);
    expect(await resolveDevice(pool, a!.token)).toBeNull();
    expect(await resolveDevice(pool, b!.token)).toBeNull();
  });

  it('resolves nothing for an absent or garbage token', async () => {
    expect(await resolveDevice(pool, undefined)).toBeNull();
    expect(await resolveDevice(pool, 'not-a-token')).toBeNull();
  });
});

describe('no child PII anywhere in the pairing path', () => {
  it('child_devices has no column that could hold an email', async () => {
    const r = await pool.query<{ column_name: string }>(
      `select column_name from information_schema.columns where table_name = 'child_devices'`,
    );
    const cols = r.rows.map((c) => c.column_name);
    expect(cols).not.toContain('email');
    expect(cols.some((c) => /email|phone|address/.test(c))).toBe(false);
  });

  it('children still has nowhere to put an email', async () => {
    const r = await pool.query<{ column_name: string }>(
      `select column_name from information_schema.columns where table_name = 'children'`,
    );
    expect(r.rows.map((c) => c.column_name).some((c) => /email|phone/.test(c))).toBe(false);
  });
});
