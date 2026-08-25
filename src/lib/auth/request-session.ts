/**
 * Resolve the request's principal from whichever session store answers.
 *
 * `principalType` is derived HERE, server-side, from which store resolved. It
 * is never read from a client-supplied header, cookie field or body claim.
 */
import { cookies } from 'next/headers';
import { pool } from '@/lib/db/client';
import { resolveChildSession, CHILD_SESSION_COOKIE } from './child-session';
import type { Session } from '@/lib/authz';

export async function getSession(): Promise<Session | null> {
  const jar = await cookies();

  const childToken = jar.get(CHILD_SESSION_COOKIE)?.value;
  const child = await resolveChildSession(pool, childToken);
  if (child) {
    return { principalType: 'child', familyId: child.familyId, childId: child.childId };
  }

  // Parent sessions land here once Better Auth is wired to a request handler.
  return null;
}
