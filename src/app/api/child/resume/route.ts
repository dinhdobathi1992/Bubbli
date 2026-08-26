/**
 * Sign in from a remembered device.
 *
 * A separate endpoint rather than magic inside `getSession`, because issuing a
 * session sets a cookie and a server component cannot. It also means the child
 * SEES whose device this is and taps to continue, instead of being silently
 * signed in as whoever last used the tablet.
 */
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { pool } from '@/lib/db/client';
import { resolveDevice, DEVICE_COOKIE } from '@/lib/auth/device-pairing';
import {
  createChildSession,
  childCookieOptions,
  CHILD_SESSION_COOKIE,
  CHILD_SESSION_TTL_MS,
} from '@/lib/auth/child-session';
import { getConsentState } from '@/lib/auth/consent';

export async function POST() {
  const jar = await cookies();
  const device = await resolveDevice(pool, jar.get(DEVICE_COOKIE)?.value);
  if (!device) return NextResponse.json({ error: 'This device is not set up' }, { status: 401 });

  // Consent can be withdrawn after a device was paired. A remembered device
  // must not outlive the permission that authorised it.
  const consent = await getConsentState(pool, device.familyId);
  if (!consent.consented) {
    return NextResponse.json({ error: 'This device is not set up' }, { status: 401 });
  }

  const { token } = await createChildSession(pool, device.childId, device.familyId);
  const res = NextResponse.json({ ok: true });
  res.cookies.set(CHILD_SESSION_COOKIE, token, childCookieOptions(CHILD_SESSION_TTL_MS));
  return res;
}
