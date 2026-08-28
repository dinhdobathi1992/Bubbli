/**
 * Child login. Family-scoped by construction: the family is supplied as a join
 * code, so a display name is never a global namespace.
 *
 * Accepts a short join code (`7FW4QKSZ`, or `7FW4-QKSZ` as displayed) and, for
 * the transition, a raw family UUID. Whatever arrives is resolved to a familyId
 * BEFORE anything touches the database, so a non-UUID can never reach a uuid
 * comparison and raise 22P02 out of an unguarded handler.
 */
import { NextResponse } from 'next/server';
import { clientIp } from '@/lib/http/client-ip';
import { pool } from '@/lib/db/client';
import { verifyChildPin } from '@/lib/auth/child-pin';
import {
  createChildSession,
  childCookieOptions,
  CHILD_SESSION_COOKIE,
  CHILD_SESSION_TTL_MS,
} from '@/lib/auth/child-session';
import { checkLoginRate, recordLoginAttempt } from '@/lib/auth/login-rate-limit';
import { familyIdForJoinCode } from '@/lib/auth/join-code';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(req: Request) {
  const ip = clientIp(req);
  const body = (await req.json().catch(() => ({}))) as {
    family?: string;
    familyId?: string;
    name?: string;
    pin?: string;
  };

  const supplied = (body.family ?? body.familyId ?? '').trim();
  if (!supplied || !body.name || !body.pin) {
    return NextResponse.json({ error: 'Missing details' }, { status: 400 });
  }

  // Resolve first. `familyId` stays null for an unrecognised code, which the
  // limiter records as an attempt rather than throwing on a uuid cast.
  const familyId = UUID.test(supplied) ? supplied : await familyIdForJoinCode(pool, supplied);

  const rate = await checkLoginRate(pool, ip, familyId);
  if (!rate.allowed) {
    return NextResponse.json(
      { error: 'Too many attempts. Please wait a little while.' },
      {
        status: 429,
        headers: { 'retry-after': String(Math.ceil((rate.retryAfterMs ?? 0) / 1000)) },
      },
    );
  }

  // An unknown family still costs an attempt, so sweeping the code space is
  // throttled exactly as guessing a PIN is.
  if (!familyId) {
    await recordLoginAttempt(pool, ip, null, body.name, false);
    return NextResponse.json({ error: 'That did not work. Ask a grown-up for help.' }, { status: 401 });
  }

  const result = await verifyChildPin(pool, familyId, body.name, body.pin);
  await recordLoginAttempt(pool, ip, familyId, body.name, result.ok);

  if (!result.ok) {
    // One message for every failure reason: wrong name, wrong PIN and locked
    // must be indistinguishable to someone who does not already know the PIN.
    const status = result.reason === 'locked' ? 429 : 401;
    return NextResponse.json({ error: 'That did not work. Ask a grown-up for help.' }, { status });
  }

  const { token } = await createChildSession(pool, result.childId, result.familyId);
  const res = NextResponse.json({ ok: true });
  res.cookies.set(CHILD_SESSION_COOKIE, token, childCookieOptions(CHILD_SESSION_TTL_MS));
  return res;
}
