/**
 * Redeem a parent-issued pairing code.
 *
 * The child types the code once. The device is remembered afterwards, so this
 * is the last time anything is typed on it until the pairing expires.
 */
import { NextResponse } from 'next/server';
import { clientIp } from '@/lib/http/client-ip';
import { pool } from '@/lib/db/client';
import { redeemPairingCode, DEVICE_COOKIE, deviceCookieOptions } from '@/lib/auth/device-pairing';
import {
  createChildSession,
  childCookieOptions,
  CHILD_SESSION_COOKIE,
  CHILD_SESSION_TTL_MS,
} from '@/lib/auth/child-session';
import { checkLoginRate, recordLoginAttempt } from '@/lib/auth/login-rate-limit';
import { settings } from '@/config/settings';

export async function POST(req: Request) {
  const ip = clientIp(req);
  const body = (await req.json().catch(() => ({}))) as { code?: string };
  if (!body.code) return NextResponse.json({ error: 'Missing code' }, { status: 400 });

  // A pairing code is short and single-use, so it must be throttled like a PIN.
  const rate = await checkLoginRate(pool, ip, null);
  if (!rate.allowed) {
    return NextResponse.json({ error: 'Too many attempts. Please wait a little while.' }, { status: 429 });
  }

  const redeemed = await redeemPairingCode(pool, body.code);
  await recordLoginAttempt(pool, ip, redeemed?.device.familyId ?? null, 'pairing', !!redeemed);

  if (!redeemed) {
    return NextResponse.json({ error: 'That code did not work. Ask a grown-up for a new one.' }, { status: 401 });
  }

  const { token } = await createChildSession(pool, redeemed.device.childId, redeemed.device.familyId);
  const res = NextResponse.json({ ok: true });
  res.cookies.set(CHILD_SESSION_COOKIE, token, childCookieOptions(CHILD_SESSION_TTL_MS));
  res.cookies.set(
    DEVICE_COOKIE,
    redeemed.token,
    deviceCookieOptions(settings.DEVICE_TRUST_DAYS * 86_400_000),
  );
  return res;
}
