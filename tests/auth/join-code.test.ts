/**
 * Family join codes.
 *
 * A join code SELECTS A NAMESPACE; it is not a credential. The tests that matter
 * are the human ones: a code must survive being read aloud, mistyped in lower
 * case, or copied with the display dash still in it.
 */
import { describe, it, expect, afterAll } from 'vitest';
import { Pool } from 'pg';
import { readFileSync, existsSync } from 'fs';
import {
  generateJoinCode,
  normalizeJoinCode,
  formatJoinCode,
  isJoinCodeShaped,
  familyIdForJoinCode,
  ensureJoinCode,
} from '@/lib/auth/join-code';

const url =
  process.env.DATABASE_URL ??
  (existsSync('.secrets-tmp/dburl') ? readFileSync('.secrets-tmp/dburl', 'utf8').trim() : undefined);
if (!url) throw new Error('No database URL');
const pool = new Pool({ connectionString: url, max: 4 });
const made: string[] = [];

afterAll(async () => {
  for (const f of made) await pool.query(`delete from families where id = $1`, [f]).catch(() => {});
  await pool.end();
});

describe('code generation', () => {
  it('is 8 characters from a confusable-free alphabet', () => {
    for (let i = 0; i < 200; i += 1) {
      const c = generateJoinCode();
      expect(c).toHaveLength(8);
      // I, O, 0 and 1 are the pairs people confuse when reading aloud.
      expect(c).not.toMatch(/[IO01]/);
      expect(c).toMatch(/^[A-Z2-9]+$/);
    }
  });

  it('does not repeat in a small sample', () => {
    const seen = new Set(Array.from({ length: 500 }, () => generateJoinCode()));
    expect(seen.size).toBe(500);
  });
});

describe('accepting what a human actually types', () => {
  it.each([
    ['7FW4QKSZ', '7FW4QKSZ'],
    ['7fw4qksz', '7FW4QKSZ'],
    ['7FW4-QKSZ', '7FW4QKSZ'],
    [' 7fw4 qksz ', '7FW4QKSZ'],
  ])('normalizes %s', (input, expected) => {
    expect(normalizeJoinCode(input)).toBe(expected);
  });

  it('drops the characters a generated code can never contain', () => {
    // I, O, 0 and 1 are absent from the alphabet, so seeing one is always a
    // typo. Dropping them is what makes "read it aloud" work: a listener who
    // hears "oh" and writes O lands on the same string as one who writes 0.
    expect(normalizeJoinCode('7FW4QKSZ')).toBe('7FW4QKSZ');
    expect(normalizeJoinCode('7FWO4QIKSZ')).toBe('7FW4QKSZ');
    expect(normalizeJoinCode('7FW04Q1KSZ')).toBe('7FW4QKSZ');
  });

  it('is idempotent, so normalizing twice cannot corrupt a code', () => {
    for (let i = 0; i < 100; i += 1) {
      const c = generateJoinCode();
      expect(normalizeJoinCode(normalizeJoinCode(c))).toBe(c);
    }
  });

  it('formats for display in two groups', () => {
    expect(formatJoinCode('7FW4QKSZ')).toBe('7FW4-QKSZ');
  });

  it('recognises the shape regardless of separators or case', () => {
    expect(isJoinCodeShaped('7fw4-qksz')).toBe(true);
    expect(isJoinCodeShaped('short')).toBe(false);
  });
});

describe('resolution', () => {
  it('allocates a stable code and finds the family by it', async () => {
    const f = await pool.query(`insert into families (name) values ('jc-test') returning id`);
    const familyId = f.rows[0].id as string;
    made.push(familyId);

    const code = await ensureJoinCode(pool, familyId);
    expect(code).toHaveLength(8);

    // Idempotent: asking again returns the same code, not a new one.
    expect(await ensureJoinCode(pool, familyId)).toBe(code);

    expect(await familyIdForJoinCode(pool, code)).toBe(familyId);
    expect(await familyIdForJoinCode(pool, formatJoinCode(code))).toBe(familyId);
    expect(await familyIdForJoinCode(pool, code.toLowerCase())).toBe(familyId);
  });

  it('returns null for an unknown or malformed code without throwing', async () => {
    expect(await familyIdForJoinCode(pool, 'ZZZZZZZZ')).toBeNull();
    expect(await familyIdForJoinCode(pool, 'nope')).toBeNull();
    // The old failure: a non-UUID reaching a uuid comparison and raising 22P02.
    expect(await familyIdForJoinCode(pool, "'; drop table families; --")).toBeNull();
  });
});
