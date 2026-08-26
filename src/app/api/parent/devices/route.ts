/**
 * Issue a pairing code for one of the guardian's own children.
 *
 * `assertCanManageChild` checks the principal BEFORE looking the child up, so a
 * child session cannot use this endpoint to learn whether a given child exists.
 */
import { NextResponse } from 'next/server';
import { pool } from '@/lib/db/client';
import { getSession } from '@/lib/auth/request-session';
import { assertCanManageChild, AuthzError } from '@/lib/authz';
import { issuePairingCode, revokeDevice } from '@/lib/auth/device-pairing';

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const body = (await req.json().catch(() => ({}))) as { childId?: string; label?: string };
  if (!body.childId) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  try {
    await assertCanManageChild(pool, session, body.childId);
  } catch (e) {
    return NextResponse.json({ error: 'Not found' }, { status: e instanceof AuthzError ? e.status : 500 });
  }

  const { code, expiresAt } = await issuePairingCode(pool, {
    childId: body.childId,
    familyId: session.familyId,
    parentId: session.parentId!,
    label: body.label,
  });

  // The plaintext is returned ONCE. It is stored hashed and cannot be recovered.
  return NextResponse.json({ code, expiresAt: expiresAt.toISOString() });
}

export async function DELETE(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const body = (await req.json().catch(() => ({}))) as { deviceId?: string; childId?: string };
  if (!body.deviceId || !body.childId) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  try {
    await assertCanManageChild(pool, session, body.childId);
  } catch (e) {
    return NextResponse.json({ error: 'Not found' }, { status: e instanceof AuthzError ? e.status : 500 });
  }

  await revokeDevice(pool, body.deviceId, 'guardian_revoked');
  return NextResponse.json({ ok: true });
}
