/**
 * The authorization guards, exhaustively.
 *
 * `assertSameFamily`, `assertCanManageChild`, `requireFamilyScope` and
 * `VISIBILITY_GATE` had no test at all — 32 of G3's no-coverage mutants live in
 * this module, the one enforcing the parent/child isolation boundary that G1
 * exists to protect. A guard nothing exercises is a guard that can be deleted
 * without any gate objecting.
 *
 * Each assertion targets a specific way a guard could be weakened: inverted
 * comparisons, dropped null checks, relaxed principal checks.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Pool } from 'pg';
import { readFileSync, existsSync } from 'fs';
import {
  AuthzError,
  VISIBILITY_GATE,
  opensTranscript,
  assertIsGuardian,
  assertIsChild,
  assertSameFamily,
  assertCanManageChild,
  requireFamilyScope,
  type Session,
} from '@/lib/authz';

const url =
  process.env.DATABASE_URL ??
  (existsSync('.secrets-tmp/dburl') ? readFileSync('.secrets-tmp/dburl', 'utf8').trim() : undefined);
if (!url) throw new Error('No database URL');
const pool = new Pool({ connectionString: url, max: 4 });

let familyA: string;
let familyB: string;
let childA: string;

const parentOf = (familyId: string): Session => ({
  principalType: 'parent',
  familyId,
  parentId: '11111111-1111-1111-1111-111111111111',
});
const childOf = (familyId: string, childId: string): Session => ({
  principalType: 'child',
  familyId,
  childId,
});

beforeAll(async () => {
  const a = await pool.query(`insert into families (name) values ('authz-a') returning id`);
  familyA = a.rows[0].id;
  const b = await pool.query(`insert into families (name) values ('authz-b') returning id`);
  familyB = b.rows[0].id;
  const ca = await pool.query(
    `insert into children (family_id, display_name, pin_hash, age_band, activated_at)
     values ($1,'A','x','8-11',now()) returning id`,
    [familyA],
  );
  childA = ca.rows[0].id;
});

afterAll(async () => {
  for (const f of [familyA, familyB]) {
    await pool.query(`delete from children where family_id = $1`, [f]).catch(() => {});
    await pool.query(`delete from families where id = $1`, [f]).catch(() => {});
  }
  await pool.end();
});

describe('every denial is a 404, so no guard is an existence oracle', () => {
  it.each(['not_found', 'wrong_family', 'below_gate', 'wrong_principal'] as const)(
    'AuthzError(%s).status is 404',
    (code) => {
      expect(new AuthzError(code, 'x').status).toBe(404);
    },
  );

  it('carries the code for logging without exposing it as a status', () => {
    const e = new AuthzError('below_gate', 'nope');
    expect(e.code).toBe('below_gate');
    expect(e.name).toBe('AuthzError');
    expect(e).toBeInstanceOf(Error);
  });
});

describe('the visibility gate', () => {
  it('sits at medium', () => {
    expect(VISIBILITY_GATE).toBe('medium');
  });

  // The whole ladder, both sides of the boundary. A mutant flipping >= to >
  // breaks exactly one of these, which is the point.
  it.each([
    [null, false],
    ['info', false],
    ['low', false],
    ['medium', true],
    ['high', true],
    ['critical', true],
  ] as const)('opensTranscript(%s) === %s', (severity, expected) => {
    expect(opensTranscript(severity)).toBe(expected);
  });
});

describe('assertIsGuardian', () => {
  it('accepts a parent session carrying a parentId', () => {
    expect(() => assertIsGuardian(parentOf(familyA))).not.toThrow();
  });

  it('rejects a parent session with no parentId', () => {
    expect(() => assertIsGuardian({ principalType: 'parent', familyId: familyA })).toThrow(AuthzError);
  });

  it('rejects a child session even when it carries a parentId', () => {
    expect(() =>
      assertIsGuardian({ principalType: 'child', familyId: familyA, parentId: 'x', childId: childA }),
    ).toThrow(/Not a guardian/);
  });
});

describe('assertIsChild', () => {
  it('accepts a child session carrying a childId', () => {
    expect(() => assertIsChild(childOf(familyA, childA))).not.toThrow();
  });

  it('rejects a child session with no childId', () => {
    expect(() => assertIsChild({ principalType: 'child', familyId: familyA })).toThrow(AuthzError);
  });

  // The forgery the G3 mutation test exists for.
  it('rejects a parent session carrying a forged childId', () => {
    expect(() =>
      assertIsChild({ principalType: 'parent', familyId: familyA, parentId: 'p', childId: childA }),
    ).toThrow(/Not a child/);
  });
});

describe('assertSameFamily', () => {
  it('accepts a matching family', () => {
    expect(() => assertSameFamily(parentOf(familyA), familyA)).not.toThrow();
  });

  it('rejects another family', () => {
    expect(() => assertSameFamily(parentOf(familyA), familyB)).toThrow(AuthzError);
  });

  it('reports wrong_family, not not_found', () => {
    try {
      assertSameFamily(parentOf(familyA), familyB);
      throw new Error('should have thrown');
    } catch (e) {
      expect((e as AuthzError).code).toBe('wrong_family');
    }
  });
});

describe('requireFamilyScope', () => {
  it('returns the family id so a query cannot be built without one', () => {
    expect(requireFamilyScope(parentOf(familyA))).toBe(familyA);
  });

  it('throws when the session carries no family scope', () => {
    expect(() => requireFamilyScope({ principalType: 'parent', familyId: '' } as Session)).toThrow(
      AuthzError,
    );
  });
});

describe('assertCanManageChild', () => {
  it('accepts a guardian of that child', async () => {
    await expect(assertCanManageChild(pool, parentOf(familyA), childA)).resolves.toBeUndefined();
  });

  it('rejects a guardian of a different family', async () => {
    await expect(assertCanManageChild(pool, parentOf(familyB), childA)).rejects.toThrow(AuthzError);
  });

  it('rejects a child principal outright, however legitimate the family', async () => {
    await expect(assertCanManageChild(pool, childOf(familyA, childA), childA)).rejects.toThrow(
      /Not a guardian/,
    );
  });

  it('reports not_found for a child that does not exist', async () => {
    await expect(
      assertCanManageChild(pool, parentOf(familyA), '00000000-0000-0000-0000-000000000000'),
    ).rejects.toMatchObject({ code: 'not_found', status: 404 });
  });

  it('checks the principal BEFORE the lookup, so it is not an existence oracle', async () => {
    const real = await assertCanManageChild(pool, childOf(familyA, childA), childA).catch((e) => e);
    const fake = await assertCanManageChild(
      pool,
      childOf(familyA, childA),
      '00000000-0000-0000-0000-000000000000',
    ).catch((e) => e);
    expect(real.code).toBe(fake.code);
  });
});
