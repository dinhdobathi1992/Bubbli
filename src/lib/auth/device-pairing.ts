/**
 * Parent-issued device pairing.
 *
 * How a child gets passwordless sign-in without owning an email address.
 *
 * A guardian, signed in, issues a short code for one device. The child enters it
 * once; the device receives a long opaque token and signs in without a PIN until
 * the pairing expires or the guardian revokes it.
 *
 * Why not email a code to the child: that means collecting an email address from
 * an under-13, which is COPPA-regulated personal information and contradicts the
 * data-minimisation commitment in PRD §13 — and a five-year-old has no mailbox,
 * so the `4-7` band could not sign in at all. Why not email the parent instead:
 * child sessions last one school day, so the parent would have to relay a code
 * every morning, and the child could not use Bubbli while the parent is at work.
 *
 * Both secrets are stored as SHA-256, so a database read impersonates neither.
 */
import { createHash, randomBytes, randomInt } from 'crypto';
import type { Pool, PoolClient } from 'pg';
import { settings } from '@/config/settings';

const PAIRING_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const PAIRING_LENGTH = 6;

export const DEVICE_COOKIE = 'bubbli_device';

function hash(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

export interface PairedDevice {
  id: string;
  childId: string;
  familyId: string;
}

/**
 * Issue a pairing code for one child. Returns the plaintext ONCE — it is stored
 * hashed and cannot be recovered, so a leaked database yields no working code.
 */
export async function issuePairingCode(
  db: Pool | PoolClient,
  args: { childId: string; familyId: string; parentId: string; label?: string },
): Promise<{ code: string; expiresAt: Date }> {
  let code = '';
  for (let i = 0; i < PAIRING_LENGTH; i += 1) {
    code += PAIRING_ALPHABET[randomInt(PAIRING_ALPHABET.length)];
  }
  const expiresAt = new Date(Date.now() + settings.DEVICE_PAIRING_TTL_MIN * 60_000);

  await db.query(
    `insert into child_devices
       (child_id, family_id, issued_by_parent_id, pairing_code_hash, pairing_expires_at, label)
     values ($1,$2,$3,$4,$5,$6)`,
    [args.childId, args.familyId, args.parentId, hash(code), expiresAt, args.label ?? null],
  );

  return { code, expiresAt };
}

/**
 * Redeem a pairing code. Single use: the code is cleared in the same statement
 * that issues the token, so two concurrent redemptions cannot both succeed.
 */
export async function redeemPairingCode(
  db: Pool | PoolClient,
  code: string,
): Promise<{ token: string; device: PairedDevice } | null> {
  const token = randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + settings.DEVICE_TRUST_DAYS * 86_400_000);

  const r = await db.query<{ id: string; child_id: string; family_id: string }>(
    `update child_devices
        set pairing_code_hash = null,
            pairing_expires_at = null,
            device_token_hash = $2,
            paired_at = now(),
            last_seen_at = now(),
            expires_at = $3
      where pairing_code_hash = $1
        and paired_at is null
        and revoked_at is null
        and pairing_expires_at > now()
      returning id, child_id, family_id`,
    [hash(code.toUpperCase().replace(/[\s-]/g, '')), hash(token), expiresAt],
  );

  const row = r.rows[0];
  if (!row) return null;
  return { token, device: { id: row.id, childId: row.child_id, familyId: row.family_id } };
}

/** Resolve a device token. Consent withdrawal revokes the whole family's devices. */
export async function resolveDevice(
  db: Pool | PoolClient,
  token: string | undefined,
): Promise<PairedDevice | null> {
  if (!token) return null;

  const r = await db.query<{ id: string; child_id: string; family_id: string }>(
    `update child_devices
        set last_seen_at = now()
      where device_token_hash = $1
        and revoked_at is null
        and expires_at > now()
      returning id, child_id, family_id`,
    [hash(token)],
  );

  const row = r.rows[0];
  if (!row) return null;
  return { id: row.id, childId: row.child_id, familyId: row.family_id };
}

export async function revokeDevice(
  db: Pool | PoolClient,
  deviceId: string,
  reason: string,
): Promise<void> {
  await db.query(
    `update child_devices set revoked_at = now(), revoked_reason = $2, device_token_hash = null
      where id = $1 and revoked_at is null`,
    [deviceId, reason],
  );
}

export async function revokeDevicesForChild(
  db: Pool | PoolClient,
  childId: string,
  reason: string,
): Promise<number> {
  const r = await db.query(
    `update child_devices set revoked_at = now(), revoked_reason = $2, device_token_hash = null
      where child_id = $1 and revoked_at is null`,
    [childId, reason],
  );
  return r.rowCount ?? 0;
}

export function deviceCookieOptions(maxAgeMs: number) {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: settings.APP_ENV === 'production',
    path: '/',
    maxAge: Math.floor(maxAgeMs / 1000),
  };
}
