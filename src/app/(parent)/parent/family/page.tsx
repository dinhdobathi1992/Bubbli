import { redirect } from 'next/navigation';
import Link from 'next/link';
import { pool } from '@/lib/db/client';
import { getSession } from '@/lib/auth/request-session';
import { ensureJoinCode, formatJoinCode } from '@/lib/auth/join-code';
import FamilyManager, { type ChildRow } from '@/components/parent/family-manager';

export const dynamic = 'force-dynamic';

/**
 * Family management: who is in it, and which devices they may use.
 *
 * Device pairing lives here rather than on the safety dashboard, because it is
 * administration rather than review. A guardian coming here has a task; a
 * guardian on the dashboard has a worry.
 */
export default async function Family() {
  const session = await getSession();
  if (!session || session.principalType !== 'parent') redirect('/parent/sign-in');

  const code = await ensureJoinCode(pool, session.familyId);

  const children = await pool.query<ChildRow>(
    `select c.id, c.display_name as "displayName", c.age_band as "ageBand",
            coalesce(json_agg(
              json_build_object('id', d.id, 'label', d.label, 'pairedAt', d.paired_at)
              order by d.paired_at desc
            ) filter (where d.id is not null and d.paired_at is not null
                        and d.revoked_at is null and d.expires_at > now()), '[]') as devices
       from children c
       left join child_devices d on d.child_id = c.id
      where c.family_id = $1
      group by c.id
      order by c.created_at`,
    [session.familyId],
  );

  return (
    <main className="relative z-10 mx-auto max-w-3xl px-6 py-14">
      <div className="flex items-baseline justify-between gap-4">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-subtle">Bubbli</p>
          <h1 className="mt-3 text-[clamp(1.75rem,4vw,2.4rem)]">Your family</h1>
        </div>
        <Link
          href="/parent"
          className="text-[13px] text-muted underline underline-offset-4 hover:text-accent"
        >
          Safety dashboard
        </Link>
      </div>

      <div className="mt-8 border border-line bg-surface px-5 py-4">
        <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-subtle">
          Family code
        </p>
        <p className="mt-1.5 font-mono text-[22px] tracking-[0.18em] text-accent">
          {formatJoinCode(code)}
        </p>
        <p className="mt-2 text-[13px] text-muted">
          Your child types this with their name and PIN. Or send them{' '}
          <span className="font-mono text-ink">/login/{formatJoinCode(code)}</span> and they
          type only a name and PIN.
        </p>
      </div>

      <FamilyManager members={children.rows} />
    </main>
  );
}
