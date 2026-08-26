/**
 * Children in the signed-in guardian's family.
 *
 * GET lists them. POST adds one with a PIN the guardian chooses with their child.
 * Every path asserts a guardian principal first, so a child session can never
 * reach it however legitimate the family.
 */
import { NextResponse } from 'next/server';
import { pool } from '@/lib/db/client';
import { getSession } from '@/lib/auth/request-session';
import { assertIsGuardian, AuthzError } from '@/lib/authz';
import { hashPin } from '@/lib/auth/child-pin';
import { validatePin } from '@/lib/auth/pin-policy';
import { AGE_BANDS, type AgeBand } from '@/config/settings';

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  try {
    assertIsGuardian(session);
  } catch (e) {
    return NextResponse.json({ error: 'Not found' }, { status: e instanceof AuthzError ? e.status : 500 });
  }

  const r = await pool.query(
    `select c.id, c.display_name, c.age_band, c.activated_at is not null as activated,
            (select count(*)::int from child_devices d
              where d.child_id = c.id and d.paired_at is not null
                and d.revoked_at is null and d.expires_at > now()) as devices
       from children c where c.family_id = $1 order by c.created_at`,
    [session.familyId],
  );
  return NextResponse.json({ children: r.rows });
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  try {
    assertIsGuardian(session);
  } catch (e) {
    return NextResponse.json({ error: 'Not found' }, { status: e instanceof AuthzError ? e.status : 500 });
  }

  const body = (await req.json().catch(() => ({}))) as {
    displayName?: string;
    ageBand?: string;
    pin?: string;
  };

  const name = body.displayName?.trim();
  if (!name || name.length > 40) {
    return NextResponse.json({ error: 'Please give your child a name to use' }, { status: 400 });
  }
  if (!body.ageBand || !AGE_BANDS.includes(body.ageBand as AgeBand)) {
    return NextResponse.json({ error: 'Please choose an age range' }, { status: 400 });
  }
  // Surface the policy's own reason: "not a run of consecutive digits" tells a
  // parent what to change, where a generic rejection makes them guess.
  const pin = validatePin(body.pin ?? '');
  if (!pin.ok) return NextResponse.json({ error: pin.reason }, { status: 400 });

  // Display names are family-scoped, so two families may both have an "Emma" —
  // but one family may not have two, or the sign-in form is ambiguous.
  const clash = await pool.query(
    `select 1 from children where family_id = $1 and lower(display_name) = lower($2)`,
    [session.familyId, name],
  );
  if (clash.rowCount) {
    return NextResponse.json({ error: 'Someone in your family already uses that name' }, { status: 409 });
  }

  const r = await pool.query<{ id: string }>(
    `insert into children (family_id, display_name, pin_hash, age_band, activated_at)
     values ($1,$2,$3,$4, now()) returning id`,
    [session.familyId, name, await hashPin(body.pin!), body.ageBand],
  );

  return NextResponse.json({ ok: true, childId: r.rows[0].id });
}
