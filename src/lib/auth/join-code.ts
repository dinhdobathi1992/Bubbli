/**
 * Family join codes.
 *
 * A join code SELECTS A NAMESPACE. It is not a credential: knowing one lets you
 * reach a family's sign-in form and nothing else, exactly as knowing a company's
 * domain lets you reach its login page. The PIN authenticates, and the per-IP
 * limiter is what makes guessing unprofitable.
 *
 * It exists because the child sign-in form previously asked for a 36-character
 * UUID. No eight-year-old can type that, and no fifteen-year-old will.
 */
import { createHash, randomInt } from 'crypto';
import type { Pool, PoolClient } from 'pg';

/** No I, O, 0 or 1: a code must survive being read aloud or copied off paper. */
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const LENGTH = 8;

export function generateJoinCode(): string {
  let out = '';
  for (let i = 0; i < LENGTH; i += 1) out += ALPHABET[randomInt(ALPHABET.length)];
  return out;
}

/**
 * Accept what a human actually types: lower case, spaces, the display dash.
 *
 * I, O, 0 and 1 are simply DROPPED. They cannot appear in a generated code, so
 * their presence is always a typo — and dropping them is what makes "read it
 * aloud" work: a listener who hears "oh" and writes O gets the same normalized
 * string as one who writes 0.
 *
 * An earlier version tried to map between them and was circular (O→0→O,
 * I→1→I), so it silently did nothing while looking as though it did.
 */
export function normalizeJoinCode(input: string): string {
  return input.toUpperCase().replace(/[^A-Z2-9]/g, '').replace(/[IO]/g, '');
}

/** Display form. Grouping halves the error rate when reading aloud. */
export function formatJoinCode(code: string): string {
  return code.length === LENGTH ? `${code.slice(0, 4)}-${code.slice(4)}` : code;
}

export function isJoinCodeShaped(input: string): boolean {
  return normalizeJoinCode(input).length === LENGTH;
}

/** Resolve a code to a family, or null. Never reveals whether one exists. */
export async function familyIdForJoinCode(
  db: Pool | PoolClient,
  input: string,
): Promise<string | null> {
  const code = normalizeJoinCode(input);
  if (code.length !== LENGTH) return null;
  const r = await db.query<{ id: string }>(`select id from families where join_code = $1`, [code]);
  return r.rows[0]?.id ?? null;
}

/** Allocate a code, retrying on the (astronomically unlikely) collision. */
export async function ensureJoinCode(db: Pool | PoolClient, familyId: string): Promise<string> {
  const existing = await db.query<{ join_code: string | null }>(
    `select join_code from families where id = $1`,
    [familyId],
  );
  if (existing.rows[0]?.join_code) return existing.rows[0].join_code;

  for (let attempt = 0; attempt < 10; attempt += 1) {
    const candidate = generateJoinCode();
    try {
      await db.query(`update families set join_code = $1 where id = $2`, [candidate, familyId]);
      return candidate;
    } catch {
      // Unique violation. Try again.
    }
  }
  throw new Error('Could not allocate a unique join code');
}

export function hashCode(code: string): string {
  return createHash('sha256').update(code).digest('hex');
}
