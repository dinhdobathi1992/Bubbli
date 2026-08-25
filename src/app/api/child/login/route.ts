/**
 * Child login. Family-scoped by construction: the family is supplied as a join
 * code, so a display name is never a global namespace.
 */
import { NextResponse } from 'next/server';
import { pool } from '@/lib/db/client';
import { verifyChildPin } from '@/lib/auth/child-pin';
import { createChildSession, childCookieOptions, CHILD_SESSION_COOKIE, CHILD_SESSION_TTL_MS } from '@/lib/auth/child-session';
import { checkLoginRate, recordLoginAttempt } from '@/lib/auth/login-rate-limit';

export async function POST(req: Request) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? '127.0.0.1';
  const body = (await req.json().catch(() => ({}))) as { familyId?: string; name?: string; pin?: string };

  if (!body.familyId || !body.name || !body.pin) {
    return NextResponse.json({ error: 'Missing details' }, { status: 400 });
  }

  const rate = await checkLoginRate(pool, ip, body.familyId);
  if (!rate.allowed) {
    return NextResponse.json(
      { error: 'Too many attempts. Please wait a little while.' },
      { status: 429, headers: { 'retry-after': String(Math.ceil((rate.retryAfterMs ?? 0) / 1000)) } },
    );
  }

  const result = await verifyChildPin(pool, body.familyId, body.name, body.pin);
  await recordLoginAttempt(pool, ip, body.familyId, body.name, result.ok);

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
