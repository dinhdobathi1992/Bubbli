import { redirect } from 'next/navigation';
import { pool } from '@/lib/db/client';
import { getSession } from '@/lib/auth/request-session';
import { projectFlagRow } from '@/lib/parent/dto';

export const dynamic = 'force-dynamic';

/**
 * Parent safety dashboard.
 *
 * A DIFFERENT REGISTER from the child surface, on purpose. Sharper corners,
 * denser rows, monospace severity labels: this is an instrument, and it should
 * read as one. The child surface is soft because it must never feel like
 * surveillance; this one is precise because it must never feel like a toy.
 *
 * The dashed rule is the product. Above it, a parent may read. Below it, they
 * get a count and a category and nothing else.
 */
const SEV_STYLE: Record<string, string> = {
  critical: 'border-l-critical text-critical',
  high: 'border-l-high text-high',
  medium: 'border-l-medium text-medium',
  low: 'border-l-low text-low',
  info: 'border-l-info text-info',
};

export default async function ParentDashboard() {
  const session = await getSession();

  // Unauthenticated or a child principal: send them to sign in. The page used
  // to render a placeholder claiming "the authentication layer exists and is
  // tested", which was untrue — better-auth had zero imports in src/.
  if (!session || session.principalType !== 'parent') {
    redirect('/parent/sign-in');
  }

  const r = await pool.query(
    `select c.id as conversation_id, c.max_severity as severity,
            coalesce((f.triggered_rules->>0),'unknown') as category,
            count(f.id)::int as count, max(f.created_at) as last_at,
            ch.display_name as child_name, max(f.reason) as reason
       from conversations c
       join children ch on ch.id = c.child_id
       join flags f on f.conversation_id = c.id
      where ch.family_id = $1 and f.reviewed = false
      group by c.id, c.max_severity, ch.display_name, f.triggered_rules
      order by array_position(array['info','low','medium','high','critical'], c.max_severity) desc,
               max(f.created_at) desc`,
    [session.familyId],
  );

  const flags = r.rows.map(projectFlagRow);
  const above = flags.filter((f) => f.opensTranscript);
  const below = flags.filter((f) => !f.opensTranscript);

  return (
    <main className="relative z-10 mx-auto max-w-3xl px-6 py-14">
      <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-subtle">Bubbli</p>
      <h1 className="mt-3 text-[clamp(1.75rem,4vw,2.5rem)]">Safety dashboard</h1>

      {above.length === 0 && below.length === 0 && (
        <div className="mt-10 border border-line bg-surface px-6 py-10 text-center">
          <p className="font-[family-name:var(--font-display)] text-2xl">Everything looks good.</p>
          <p className="mt-2 text-[15px] text-muted">No concerns to review this week.</p>
        </div>
      )}

      {above.length > 0 && (
        <>
          <p className="mt-10 font-mono text-[11px] uppercase tracking-[0.14em] text-muted">
            Needs your attention
          </p>
          <ul className="mt-3">
            {above.map((f) => (
              <li key={f.conversationId}>
                <a
                  href={`/parent/conversations/${f.conversationId}`}
                  className={`flex items-baseline gap-4 border-b border-line border-l-2 bg-surface px-5 py-4 transition-colors duration-150 hover:bg-raised ${SEV_STYLE[f.severity] ?? ''}`}
                >
                  <span className="font-mono text-[10px] uppercase tracking-[0.14em]">
                    {f.severity}
                  </span>
                  <span className="flex-1 text-[15px] text-ink">
                    {f.category.replace(/[._]/g, ' ')} · {f.childName}
                  </span>
                  <span className="font-mono text-[11px] text-subtle tabular-nums">
                    {new Date(f.lastAt).toLocaleDateString()}
                  </span>
                </a>
              </li>
            ))}
          </ul>
        </>
      )}

      {/* The gate, drawn. Everything below is counted, never quoted. */}
      <div className="mt-12 flex items-center gap-3">
        <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-accent">
          Below the gate
        </span>
        <span className="h-px flex-1 border-t border-dashed border-accent" />
      </div>
      <p className="mt-2 text-[13px] text-muted">
        Recorded so you know it happened. The content stays private to your child.
      </p>

      <ul className="mt-4">
        {below.length === 0 && <li className="text-[15px] text-muted">Nothing recorded.</li>}
        {below.map((f) => (
          <li
            key={f.conversationId}
            className="flex items-baseline gap-4 border-b border-line px-5 py-3.5"
          >
            <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-subtle">
              {f.severity}
            </span>
            <span className="flex-1 text-[15px] text-muted">
              <span className="tabular-nums">{f.count}</span> ×{' '}
              {f.category.replace(/[._]/g, ' ')} · {f.childName}
            </span>
            <span className="font-mono text-[11px] text-subtle tabular-nums">
              {new Date(f.lastAt).toLocaleDateString()}
            </span>
          </li>
        ))}
      </ul>

      <p className="mt-12 border-t border-line pt-4 text-[13px] text-subtle">
        Opening a transcript is recorded. Other guardians on your family can see that record.
      </p>
    </main>
  );
}
