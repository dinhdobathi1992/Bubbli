/**
 * End a child session.
 *
 * A child on a shared family device had no way to sign out, which made the
 * eight-hour session an unbounded one in practice. Revoking server-side is the
 * part that matters — clearing the cookie alone would leave a live session row
 * that a copied cookie could still resolve.
 */
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { pool } from '@/lib/db/client';
import {
  CHILD_SESSION_COOKIE,
  childCookieOptions,
  resolveChildSession,
  revokeChildSession,
} from '@/lib/auth/child-session';

export async function POST() {
  const jar = await cookies();
  const token = jar.get(CHILD_SESSION_COOKIE)?.value;

  const session = await resolveChildSession(pool, token);
  if (session) await revokeChildSession(pool, session.id, 'logout');

  const res = NextResponse.json({ ok: true });
  res.cookies.set(CHILD_SESSION_COOKIE, '', childCookieOptions(0));
  return res;
}
