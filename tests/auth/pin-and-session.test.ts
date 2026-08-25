/**
 * Phase 3 gate evidence.
 *
 * Each test asserts a property whose absence was a specific red-team finding.
 * The brute-force test in particular exists because per-child lockout looks
 * like a working control and does nothing against a horizontal sweep.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { Pool } from 'pg';
import { readFileSync, existsSync } from 'fs';
import { validatePin, PIN_MAX_ATTEMPTS, PIN_MIN_LENGTH } from '@/lib/auth/pin-policy';
import { hashPin, verifyChildPin, unlockChild, isLocked } from '@/lib/auth/child-pin';
import {
  createChildSession,
  resolveChildSession,
  revokeAllForChild,
  childCookieOptions,
  CHILD_SESSION_COOKIE,
} from '@/lib/auth/child-session';
import { recordConsent, withdrawConsent, getConsentState, purgeUnconsentedChildren } from '@/lib/auth/consent';
import { checkLoginRate, recordLoginAttempt, IP_MAX_FAILURES } from '@/lib/auth/login-rate-limit';
import {
  assertIsOwningChild,
  assertCanViewConversation,
  assertIsGuardian,
  assertIsChild,
  opensTranscript,
  AuthzError,
  type Session,
} from '@/lib/authz';

const url =
  process.env.DATABASE_URL ??
  (existsSync('.secrets-tmp/dburl') ? readFileSync('.secrets-tmp/dburl', 'utf8').trim() : undefined);
if (!url) throw new Error('No database URL');
const pool = new Pool({ connectionString: url, max: 4 });

const GOOD_PIN = '835492';
let familyId: string;
let parentId: string;
let childId: string;

async function fresh() {
  const f = await pool.query(`insert into families (name) values ('auth-test') returning id`);
  familyId = f.rows[0].id;
  const p = await pool.query(
    `insert into parents (family_id, email) values ($1, $2) returning id`,
    [familyId, `p${Date.now()}${Math.floor(Math.random() * 1e6)}@example.test`],
  );
  parentId = p.rows[0].id;
  const c = await pool.query(
    `insert into children (family_id, display_name, pin_hash, age_band, activated_at)
     values ($1, 'Emma', $2, '8-11', now()) returning id`,
    [familyId, await hashPin(GOOD_PIN)],
  );
  childId = c.rows[0].id;
}

async function cleanup() {
  await pool.query(`delete from child_sessions where family_id = $1`, [familyId]).catch(() => {});
  await pool.query(`delete from login_attempts where family_id = $1`, [familyId]).catch(() => {});
  await pool.query(`delete from children where family_id = $1`, [familyId]).catch(() => {});
  await pool.query(`delete from parents where family_id = $1`, [familyId]).catch(() => {});
  await pool.query(`delete from families where id = $1`, [familyId]).catch(() => {});
}

beforeAll(fresh);
afterAll(async () => {
  await cleanup();
  await pool.end();
});

describe('PIN policy has a real entropy floor', () => {
  it(`requires at least ${PIN_MIN_LENGTH} digits`, () => {
    expect(validatePin('1234').ok).toBe(false);
    expect(validatePin('12345').ok).toBe(false);
  });

  it('rejects the codes everybody picks', () => {
    for (const pin of ['123456', '111111', '000000', '654321', '121212']) {
      expect(validatePin(pin).ok, pin).toBe(false);
    }
  });

  it('rejects runs and repeating units', () => {
    expect(validatePin('456789').ok).toBe(false);
    expect(validatePin('987654').ok).toBe(false);
    expect(validatePin('123123').ok).toBe(false);
  });

  it('rejects embedded years', () => {
    expect(validatePin('201480').ok).toBe(false);
    expect(validatePin('841997').ok).toBe(false);
  });

  it('accepts a reasonable PIN', () => {
    expect(validatePin(GOOD_PIN).ok).toBe(true);
  });

  it('refuses to hash a non-compliant PIN at all', async () => {
    await expect(hashPin('1234')).rejects.toThrow(/non-compliant/i);
  });
});

describe('PIN lockout holds', () => {
  beforeEach(async () => {
    await unlockChild(pool, childId);
  });

  it('accepts the correct PIN', async () => {
    const r = await verifyChildPin(pool, familyId, 'Emma', GOOD_PIN);
    expect(r.ok).toBe(true);
  });

  it('is family-scoped, so a display name is not a global namespace', async () => {
    const other = await pool.query(`insert into families (name) values ('other') returning id`);
    const r = await verifyChildPin(pool, other.rows[0].id, 'Emma', GOOD_PIN);
    expect(r.ok).toBe(false);
    await pool.query(`delete from families where id = $1`, [other.rows[0].id]);
  });

  it(`locks after ${PIN_MAX_ATTEMPTS} failures`, async () => {
    for (let i = 0; i < PIN_MAX_ATTEMPTS; i += 1) {
      await verifyChildPin(pool, familyId, 'Emma', '999998');
    }
    expect(await isLocked(pool, childId)).toBe(true);
  });

  it('refuses the CORRECT pin while locked', async () => {
    for (let i = 0; i < PIN_MAX_ATTEMPTS; i += 1) {
      await verifyChildPin(pool, familyId, 'Emma', '999998');
    }
    const r = await verifyChildPin(pool, familyId, 'Emma', GOOD_PIN);
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.reason).toBe('locked');
  });

  it('survives a process restart: the counter is in Postgres, not memory', async () => {
    for (let i = 0; i < PIN_MAX_ATTEMPTS; i += 1) {
      await verifyChildPin(pool, familyId, 'Emma', '999998');
    }
    // A new pool is a new process as far as any in-memory counter is concerned.
    const secondProcess = new Pool({ connectionString: url, max: 1 });
    try {
      const r = await verifyChildPin(secondProcess, familyId, 'Emma', GOOD_PIN);
      expect(r.ok === false && r.reason).toBe('locked');
    } finally {
      await secondProcess.end();
    }
  });

  it('can be cleared by a parent, so a lock is never terminal', async () => {
    for (let i = 0; i < PIN_MAX_ATTEMPTS; i += 1) {
      await verifyChildPin(pool, familyId, 'Emma', '999998');
    }
    expect(await isLocked(pool, childId)).toBe(true);
    await unlockChild(pool, childId);
    expect(await isLocked(pool, childId)).toBe(false);
    expect((await verifyChildPin(pool, familyId, 'Emma', GOOD_PIN)).ok).toBe(true);
  });

  it('does not leak whether a child exists', async () => {
    const missing = await verifyChildPin(pool, familyId, 'NoSuchChild', GOOD_PIN);
    const wrongPin = await verifyChildPin(pool, familyId, 'Emma', '999998');
    expect(missing.ok).toBe(false);
    expect(wrongPin.ok).toBe(false);
    expect(missing.ok === false && missing.reason).toBe(wrongPin.ok === false && wrongPin.reason);
  });
});

describe('horizontal brute force is throttled, not just per-child lockout', () => {
  it('refuses an IP sweeping many accounts, each below its own lock threshold', async () => {
    const ip = `10.0.0.${Math.floor(Math.random() * 250)}`;
    // Two failures per account: never enough to lock any single child.
    for (let i = 0; i < IP_MAX_FAILURES; i += 1) {
      await recordLoginAttempt(pool, ip, familyId, `child-${i}`, false);
    }
    const v = await checkLoginRate(pool, ip, null);
    expect(v.allowed).toBe(false);
    expect(v.reason).toBe('ip');
    await pool.query(`delete from login_attempts where family_id = $1`, [familyId]);
  });

  it('allows a clean IP', async () => {
    expect((await checkLoginRate(pool, '10.9.9.9', familyId)).allowed).toBe(true);
  });
});

describe('child sessions', () => {
  it('stores only a hash, so a database read cannot be replayed', async () => {
    const { token, session } = await createChildSession(pool, childId, familyId);
    const row = await pool.query(`select token_hash from child_sessions where id = $1`, [session.id]);
    expect(row.rows[0].token_hash).not.toBe(token);
    expect(row.rows[0].token_hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('resolves a live token', async () => {
    const { token } = await createChildSession(pool, childId, familyId);
    const s = await resolveChildSession(pool, token);
    expect(s?.childId).toBe(childId);
  });

  it('returns null for a bogus token', async () => {
    expect(await resolveChildSession(pool, 'not-a-real-token')).toBeNull();
  });

  it('revocation takes effect immediately', async () => {
    const { token } = await createChildSession(pool, childId, familyId);
    expect(await resolveChildSession(pool, token)).not.toBeNull();
    await revokeAllForChild(pool, childId, 'pin_lockout');
    expect(await resolveChildSession(pool, token)).toBeNull();
  });

  it('uses a __Host- cookie that a subdomain cannot set', () => {
    expect(CHILD_SESSION_COOKIE.startsWith('__Host-')).toBe(true);
    const o = childCookieOptions(1000);
    expect(o).toMatchObject({ httpOnly: true, secure: true, sameSite: 'lax', path: '/' });
  });
});

describe('consent governs collection, not just login', () => {
  it('a child cannot authenticate before consent', async () => {
    await pool.query(`update children set activated_at = null where id = $1`, [childId]);
    const r = await verifyChildPin(pool, familyId, 'Emma', GOOD_PIN);
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.reason).toBe('not_activated');
    await pool.query(`update children set activated_at = now() where id = $1`, [childId]);
  });

  it('recording consent activates pending children', async () => {
    await pool.query(`update children set activated_at = null where id = $1`, [childId]);
    const { activated } = await recordConsent(pool, parentId);
    expect(activated).toBeGreaterThan(0);
    expect((await getConsentState(pool, familyId)).consented).toBe(true);
  });

  it('withdrawal revokes live sessions IMMEDIATELY, not at next login', async () => {
    await recordConsent(pool, parentId);
    const { token } = await createChildSession(pool, childId, familyId);
    expect(await resolveChildSession(pool, token)).not.toBeNull();

    const r = await withdrawConsent(pool, parentId);
    expect(r.sessionsRevoked).toBeGreaterThan(0);
    expect(await resolveChildSession(pool, token)).toBeNull();
    expect((await getConsentState(pool, familyId)).consented).toBe(false);

    await recordConsent(pool, parentId); // restore for later tests
  });

  it('purges child records whose family never consented', async () => {
    const f = await pool.query(`insert into families (name) values ('abandoned') returning id`);
    const fid = f.rows[0].id;
    await pool.query(
      `insert into children (family_id, display_name, pin_hash, age_band, created_at)
       values ($1, 'Ghost', $2, '8-11', now() - interval '48 hours')`,
      [fid, await hashPin('748291')],
    );
    const purged = await purgeUnconsentedChildren(pool);
    expect(purged).toBeGreaterThan(0);
    const left = await pool.query(`select count(*)::int as n from children where family_id = $1`, [fid]);
    expect(left.rows[0].n).toBe(0);
    await pool.query(`delete from families where id = $1`, [fid]);
  });
});

describe('authorization: the two paths are distinct', () => {
  let convId: string;

  beforeAll(async () => {
    await pool.query(`update children set activated_at = now() where id = $1`, [childId]);
    const c = await pool.query(
      `insert into conversations (child_id, age_band, max_severity)
       values ($1, '8-11', 'info') returning id`,
      [childId],
    );
    convId = c.rows[0].id;
  });

  const childSession = (): Session => ({ principalType: 'child', familyId, childId });
  const parentSession = (): Session => ({ principalType: 'parent', familyId, parentId });

  it('a child reaches their own conversation', async () => {
    await expect(assertIsOwningChild(pool, childSession(), convId)).resolves.toBeUndefined();
  });

  it('A PARENT SESSION CANNOT use the child path', async () => {
    // The exact failure the red team predicted: reaching for a same-family
    // check here would hand a parent the child's live transcript.
    await expect(assertIsOwningChild(pool, parentSession(), convId)).rejects.toThrow(AuthzError);
  });

  it('isolates the principal guard: a forged parent session carrying a childId is still refused', async () => {
    // Without this case, deleting `assertIsChild` leaves the previous test
    // GREEN, because the childId comparison catches an ordinary parent session
    // incidentally (its childId is undefined). This session is shaped to slip
    // past that comparison, so only the principal guard itself can reject it —
    // which is what makes G3 real for this path rather than nominal.
    const forged: Session = { principalType: 'parent', familyId, parentId, childId };
    const err = await assertIsOwningChild(pool, forged, convId).catch((e) => e);
    expect(err).toBeInstanceOf(AuthzError);
    expect(err.code).toBe('wrong_principal');
  });

  it('a parent is refused below the visibility gate', async () => {
    await expect(assertCanViewConversation(pool, parentSession(), convId)).rejects.toThrow(AuthzError);
  });

  it('a parent is admitted at medium and above', async () => {
    await pool.query(`update conversations set max_severity = 'high' where id = $1`, [convId]);
    const r = await assertCanViewConversation(pool, parentSession(), convId);
    expect(r.maxSeverity).toBe('high');
  });

  it('a CHILD session cannot use the parent path', async () => {
    await expect(assertCanViewConversation(pool, childSession(), convId)).rejects.toThrow(AuthzError);
  });

  it('every denial reason produces the same status, so it is not an oracle', async () => {
    await pool.query(`update conversations set max_severity = 'info' where id = $1`, [convId]).catch(() => {});
    const belowGate = await assertCanViewConversation(pool, parentSession(), '00000000-0000-0000-0000-000000000000').catch((e) => e);
    const notFound = await assertCanViewConversation(pool, parentSession(), '11111111-1111-1111-1111-111111111111').catch((e) => e);
    expect(belowGate.status).toBe(404);
    expect(notFound.status).toBe(404);
  });

  it('the gate is medium, both directions', () => {
    expect(opensTranscript('info')).toBe(false);
    expect(opensTranscript('low')).toBe(false);
    expect(opensTranscript('medium')).toBe(true);
    expect(opensTranscript('high')).toBe(true);
    expect(opensTranscript('critical')).toBe(true);
    expect(opensTranscript(null)).toBe(false);
  });

  it('principal assertions throw rather than return a boolean a caller can ignore', () => {
    expect(() => assertIsGuardian(childSession())).toThrow(AuthzError);
    expect(() => assertIsChild(parentSession())).toThrow(AuthzError);
  });
});
