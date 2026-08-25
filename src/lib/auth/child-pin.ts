/**
 * Child PIN authentication, with lockout that actually holds.
 *
 * Two properties the reviewed prior art got wrong:
 *
 *   DURABLE COUNTERS. Attempts and lock expiry live in Postgres. A cache-backed
 *   counter resets on eviction, and a reset counter is a bypass — the guard
 *   looks present in code review and is absent in production.
 *
 *   ATOMIC INCREMENT. The failure counter is bumped inside the same statement
 *   that reads it, so two concurrent guesses cannot both observe attempt N.
 *   Check-then-act here would let an attacker parallelise past the limit.
 */
import { hash as argonHash, verify as argonVerify } from '@node-rs/argon2';
import type { Pool, PoolClient } from 'pg';
import { PIN_MAX_ATTEMPTS, PIN_LOCKOUT_MS, validatePin } from './pin-policy';

/** OWASP-aligned argon2id parameters. Deliberately not the library defaults. */
const ARGON = { memoryCost: 19_456, timeCost: 2, parallelism: 1 } as const;

export type LoginOutcome =
  | { ok: true; childId: string; familyId: string }
  | { ok: false; reason: 'invalid' | 'locked' | 'not_activated'; retryAfterMs?: number };

export async function hashPin(pin: string): Promise<string> {
  const check = validatePin(pin);
  if (!check.ok) throw new Error(`Refusing to hash a non-compliant PIN: ${check.reason}`);
  return argonHash(pin, ARGON);
}

/**
 * Verify a PIN for a child, scoped to a family.
 *
 * `familyId` is required. Without it the child display name becomes a global
 * namespace, which is both a name-enumeration oracle and a collision between
 * unrelated families.
 */
export async function verifyChildPin(
  db: Pool | PoolClient,
  familyId: string,
  displayName: string,
  pin: string,
): Promise<LoginOutcome> {
  const found = await db.query(
    `select id, family_id, pin_hash, pin_failed_attempts, pin_locked_until, activated_at
       from children
      where family_id = $1 and lower(display_name) = lower($2)
      limit 1`,
    [familyId, displayName],
  );

  // Unknown child: still burn comparable time so presence is not observable
  // from response latency.
  if (found.rowCount === 0) {
    await argonVerify(
      '$argon2id$v=19$m=19456,t=2,p=1$c29tZXNhbHRzb21lc2FsdA$1S6+VqQhAKxLPZ0dGDVJt6cGVZQyWLTOOWzq5rGmZ0M',
      pin,
      ARGON,
    ).catch(() => false);
    return { ok: false, reason: 'invalid' };
  }

  const row = found.rows[0];

  if (row.pin_locked_until && new Date(row.pin_locked_until) > new Date()) {
    // A correct PIN during an active lock is STILL refused. Otherwise the lock
    // only slows an attacker down and never stops one.
    return {
      ok: false,
      reason: 'locked',
      retryAfterMs: new Date(row.pin_locked_until).getTime() - Date.now(),
    };
  }

  const correct = await argonVerify(row.pin_hash, pin, ARGON).catch(() => false);

  if (!correct) {
    // Atomic: read-modify-write in one statement, and set the lock in the same
    // breath when the threshold is crossed.
    await db.query(
      `update children
          set pin_failed_attempts = pin_failed_attempts + 1,
              pin_locked_until = case
                when pin_failed_attempts + 1 >= $2 then now() + ($3 || ' milliseconds')::interval
                else pin_locked_until
              end
        where id = $1`,
      [row.id, PIN_MAX_ATTEMPTS, PIN_LOCKOUT_MS],
    );
    return { ok: false, reason: 'invalid' };
  }

  // A child cannot authenticate before verifiable parental consent completes.
  // Checked AFTER the PIN so an unactivated account is not distinguishable to
  // someone who does not know the PIN.
  if (!row.activated_at) return { ok: false, reason: 'not_activated' };

  await db.query(
    `update children set pin_failed_attempts = 0, pin_locked_until = null where id = $1`,
    [row.id],
  );
  return { ok: true, childId: row.id, familyId: row.family_id };
}

/**
 * Clear a lock. Parent-initiated.
 *
 * Without this the lockout is unrecoverable, and an unrecoverable lockout on a
 * child-safety product is a safety failure, not an inconvenience.
 */
export async function unlockChild(db: Pool | PoolClient, childId: string): Promise<void> {
  await db.query(
    `update children set pin_failed_attempts = 0, pin_locked_until = null where id = $1`,
    [childId],
  );
}

export async function isLocked(db: Pool | PoolClient, childId: string): Promise<boolean> {
  const r = await db.query(
    `select pin_locked_until > now() as locked from children where id = $1`,
    [childId],
  );
  return r.rows[0]?.locked === true;
}
