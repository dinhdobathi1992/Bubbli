/**
 * Resolve the request's principal from whichever session store answers.
 *
 * `principalType` is derived HERE, server-side, from which store resolved. It
 * is never read from a client-supplied header, cookie field or body claim.
 */
import { cookies, headers } from 'next/headers';
import { pool } from '@/lib/db/client';
import { resolveChildSession, CHILD_SESSION_COOKIE } from './child-session';
import { auth } from './better-auth';
import type { Session } from '@/lib/authz';

export async function getSession(): Promise<Session | null> {
  const jar = await cookies();

  const childToken = jar.get(CHILD_SESSION_COOKIE)?.value;
  const child = await resolveChildSession(pool, childToken);
  if (child) {
    return { principalType: 'child', familyId: child.familyId, childId: child.childId };
  }

  // ── Parent ───────────────────────────────────────────────────────────────
  // Reached only when no child session resolved. The order is deliberate: a
  // request carrying both resolves as the CHILD, which is the safer failure —
  // a child principal can never read another conversation, whereas a parent
  // principal can read `medium`+ transcripts.
  const parent = await resolveParent();
  if (parent) return parent;

  return null;
}

async function resolveParent(): Promise<Session | null> {
  const authSession = await auth.api
    .getSession({ headers: await headers() })
    .catch(() => null);

  const userId = authSession?.user?.id;
  if (!userId) return null;

  // Belt and braces: emailOTP proves mailbox control by construction, but an
  // unverified user must never resolve to a guardian.
  if (authSession.user.emailVerified === false) return null;

  // Keyed on the explicit link, NEVER on a matching email string. Joining by
  // email would let anyone who knows a guardian's address register with it and
  // inherit the family — and the audit row would name the real parent as actor.
  const r = await pool.query<{ id: string; family_id: string }>(
    `select id, family_id from parents
      where auth_user_id = $1 and consent_withdrawn_at is null
      limit 1`,
    [userId],
  );

  const row = r.rows[0];
  if (!row) return null;

  return { principalType: 'parent', familyId: row.family_id, parentId: row.id };
}
