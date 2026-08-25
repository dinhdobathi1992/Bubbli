/**
 * Child sessions. See docs/decisions/0004-child-principal.md for why children
 * do not go through Better Auth.
 *
 * The token is 256 bits of CSPRNG output. Only its SHA-256 hash is stored, so a
 * database read — a backup, a log, a compromised replica — cannot be replayed
 * as a child. Revocation is a row update, which is what consent withdrawal, PIN
 * lockout, guardian removal and child deletion all require.
 */
import { randomBytes, createHash, timingSafeEqual } from 'crypto';
import type { Pool, PoolClient } from 'pg';

/**
 * The `__Host-` prefix forces Secure, path=/ and no Domain, so no subdomain can
 * set the cookie. Browsers REJECT such a cookie without Secure, which plain
 * http on localhost cannot provide — so development uses an unprefixed name.
 * Production always gets the hardened one.
 */
export function childCookieName(env: string | undefined = process.env.NODE_ENV): string {
  return env === 'production' ? '__Host-bubbli_child' : 'bubbli_child_dev';
}

export const CHILD_SESSION_COOKIE = childCookieName();
export const CHILD_SESSION_TTL_MS = 8 * 60 * 60 * 1000; // one school day
/** Re-issue when this much life remains, so an active child is never logged out mid-conversation. */
export const CHILD_SESSION_ROTATE_AFTER_MS = 6 * 60 * 60 * 1000;

export type RevokeReason =
  | 'logout'
  | 'consent_withdrawn'
  | 'pin_lockout'
  | 'guardian_removed'
  | 'child_deleted'
  | 'expired';

export interface ChildSession {
  id: string;
  childId: string;
  familyId: string;
  expiresAt: Date;
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/**
 * Cookie attributes.
 *
 * `__Host-` prefix forces Secure, path=/ and no Domain, so the cookie cannot be
 * set by a subdomain or scoped loosely. SameSite=Lax blocks cross-site POSTs
 * while keeping ordinary navigation working — the CSRF posture for every child
 * route, none of which is a cross-site GET.
 */
export function childCookieOptions(maxAgeMs: number, env: string | undefined = process.env.NODE_ENV) {
  return {
    httpOnly: true,
    secure: env === 'production',
    sameSite: 'lax' as const,
    path: '/',
    maxAge: Math.floor(maxAgeMs / 1000),
  };
}

export async function createChildSession(
  db: Pool | PoolClient,
  childId: string,
  familyId: string,
): Promise<{ token: string; session: ChildSession }> {
  const token = randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + CHILD_SESSION_TTL_MS);

  const r = await db.query(
    `insert into child_sessions (child_id, family_id, token_hash, expires_at)
     values ($1, $2, $3, $4)
     returning id, child_id, family_id, expires_at`,
    [childId, familyId, hashToken(token), expiresAt],
  );

  const row = r.rows[0];
  return {
    token,
    session: { id: row.id, childId: row.child_id, familyId: row.family_id, expiresAt: row.expires_at },
  };
}

/**
 * Resolve a token to a live session, or null.
 *
 * Returns null for expired and revoked sessions alike: a caller must never be
 * able to distinguish "wrong token" from "revoked token" and learn something
 * about another account from the difference.
 */
export async function resolveChildSession(db: Pool | PoolClient, token: string | undefined): Promise<ChildSession | null> {
  if (!token) return null;

  const r = await db.query(
    `select s.id, s.child_id, s.family_id, s.expires_at, s.token_hash, s.revoked_at
       from child_sessions s
       join children c on c.id = s.child_id
      where s.token_hash = $1
        and s.revoked_at is null
        and s.expires_at > now()
        and c.activated_at is not null
      limit 1`,
    [hashToken(token)],
  );
  if (r.rowCount === 0) return null;

  const row = r.rows[0];

  // Constant-time confirmation. The lookup above already matched on the hash;
  // this closes the theoretical timing channel in the index probe itself.
  const a = Buffer.from(row.token_hash, 'hex');
  const b = Buffer.from(hashToken(token), 'hex');
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  await db.query(`update child_sessions set last_seen_at = now() where id = $1`, [row.id]);

  return { id: row.id, childId: row.child_id, familyId: row.family_id, expiresAt: row.expires_at };
}

export function needsRotation(session: ChildSession): boolean {
  return session.expiresAt.getTime() - Date.now() < CHILD_SESSION_TTL_MS - CHILD_SESSION_ROTATE_AFTER_MS;
}

export async function revokeChildSession(db: Pool | PoolClient, sessionId: string, reason: RevokeReason): Promise<void> {
  await db.query(
    `update child_sessions set revoked_at = now(), revoked_reason = $2 where id = $1 and revoked_at is null`,
    [sessionId, reason],
  );
}

/** Kill every session for a child. Used by lockout and child deletion. */
export async function revokeAllForChild(db: Pool | PoolClient, childId: string, reason: RevokeReason): Promise<number> {
  const r = await db.query(
    `update child_sessions set revoked_at = now(), revoked_reason = $2
      where child_id = $1 and revoked_at is null`,
    [childId, reason],
  );
  return r.rowCount ?? 0;
}

/**
 * Kill every session in a family. This is the consent-withdrawal path: a child
 * mid-conversation must stop immediately, not at their next login.
 */
export async function revokeAllForFamily(db: Pool | PoolClient, familyId: string, reason: RevokeReason): Promise<number> {
  const r = await db.query(
    `update child_sessions set revoked_at = now(), revoked_reason = $2
      where family_id = $1 and revoked_at is null`,
    [familyId, reason],
  );
  return r.rowCount ?? 0;
}
