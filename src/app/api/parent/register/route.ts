/**
 * Claim a family for a newly-authenticated guardian.
 *
 * Better Auth creates the user when the emailed code is verified. This turns
 * that user into a GUARDIAN: it creates the family, links `parents.auth_user_id`,
 * and records consent — the act that permits any child data to exist at all.
 *
 * Idempotent: a guardian who reloads mid-signup gets their existing family back
 * rather than a second one.
 */
import { NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { pool } from '@/lib/db/client';
import { log } from '@/lib/log/redact';
import { auth } from '@/lib/auth/better-auth';
import { ensureJoinCode, formatJoinCode } from '@/lib/auth/join-code';
import { CONSENT_MECHANISM } from '@/lib/auth/consent';

export async function POST(req: Request) {
  const session = await auth.api.getSession({ headers: await headers() }).catch(() => null);
  const user = session?.user;
  if (!user?.id || !user.email) {
    return NextResponse.json({ error: 'Sign in first' }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as { familyName?: string };

  // Already a guardian: hand back the same family rather than making a second.
  const existing = await pool.query<{ id: string; family_id: string }>(
    `select id, family_id from parents where auth_user_id = $1 limit 1`,
    [user.id],
  );
  if (existing.rows[0]) {
    const code = await ensureJoinCode(pool, existing.rows[0].family_id);
    return NextResponse.json({ ok: true, joinCode: formatJoinCode(code), existing: true });
  }

  // A guardian seat already exists for this address but nobody has claimed it —
  // an invited co-parent, or a family seeded before parent sign-in existed.
  // Claiming it is safe HERE and only here: emailOTP has just proven control of
  // the mailbox. Session resolution still keys on auth_user_id alone, so this is
  // a one-time link rather than the email-matching that would be a takeover.
  const unclaimed = await pool.query<{ id: string; family_id: string }>(
    `update parents
        set auth_user_id = $1, auth_provider = 'email_otp'
      where lower(email) = lower($2) and auth_user_id is null
      returning id, family_id`,
    [user.id, user.email],
  );
  if (unclaimed.rows[0]) {
    const code = await ensureJoinCode(pool, unclaimed.rows[0].family_id);
    return NextResponse.json({ ok: true, joinCode: formatJoinCode(code), claimed: true });
  }

  // The address belongs to a guardian who is somebody else's auth user.
  const taken = await pool.query(`select 1 from parents where lower(email) = lower($1)`, [
    user.email,
  ]);
  if (taken.rowCount) {
    return NextResponse.json(
      { error: 'That address is already linked to another Bubbli sign-in.' },
      { status: 409 },
    );
  }

  const client = await pool.connect();
  try {
    await client.query('begin');

    const f = await client.query<{ id: string }>(
      `insert into families (name) values ($1) returning id`,
      [body.familyName?.trim() || null],
    );
    const familyId = f.rows[0].id;

    // Consent is recorded HERE, at the moment a verified guardian claims the
    // family — before any child row can exist. The mechanism is recorded so the
    // claim made to a regulator matches what the code actually did.
    await client.query(
      `insert into parents (family_id, email, auth_user_id, auth_provider, consented_at)
       values ($1,$2,$3,$4, now())`,
      [familyId, user.email, user.id, CONSENT_MECHANISM],
    );

    await client.query('commit');

    const code = await ensureJoinCode(pool, familyId);
    return NextResponse.json({ ok: true, joinCode: formatJoinCode(code) });
  } catch (e) {
    await client.query('rollback').catch(() => undefined);
    // Log the cause, never the guardian's address.
    log.error('parent/register', 'family creation failed', e);
    return NextResponse.json({ error: 'Could not create your family' }, { status: 500 });
  } finally {
    client.release();
  }
}
