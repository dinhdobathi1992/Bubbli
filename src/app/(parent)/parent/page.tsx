/**
 * Parent safety dashboard.
 *
 * The visible line between "we tell you this happened" and "you may read it" is
 * the product. Rows below the gate render a count and a type, never content.
 */
import { pool } from '@/lib/db/client';
import { getSession } from '@/lib/auth/request-session';
import { projectFlagRow } from '@/lib/parent/dto';

export const dynamic = 'force-dynamic';

export default async function ParentDashboard() {
  const session = await getSession();

  if (!session || session.principalType !== 'parent') {
    return (
      <main className="mx-auto max-w-2xl px-6 py-16 text-[#1a1815]">
        <h1 className="font-serif text-3xl">Safety dashboard</h1>
        <p className="mt-3 text-[15px] text-[#6b6258]">
          Parent sign-in is wired in Phase 3 and is not enabled in this build. Use the seeded
          family link from the development console to view a populated dashboard.
        </p>
      </main>
    );
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
    <main className="mx-auto max-w-3xl px-6 py-12 text-[#1a1815]">
      <h1 className="font-serif text-3xl">Safety dashboard</h1>

      {above.length === 0 && below.length === 0 && (
        <p className="mt-6 text-[15px] text-[#6b6258]">Everything looks good. No concerns to review.</p>
      )}

      {above.length > 0 && (
        <section className="mt-8 space-y-3">
          {above.map((f) => (
            <a
              key={f.conversationId}
              href={`/parent/conversations/${f.conversationId}`}
              className={`block border px-4 py-3 transition-colors hover:bg-[#f6f1e8] ${
                f.severity === 'critical' ? 'border-[#b8232c]' : 'border-[#1a1815]'
              }`}
            >
              <span
                className={`font-mono text-[10px] uppercase tracking-[0.12em] ${
                  f.severity === 'critical' ? 'text-[#b8232c]' : 'text-[#6b6258]'
                }`}
              >
                {f.severity}
              </span>
              <p className="mt-1 text-[15px]">
                {f.category} · {f.childName}
              </p>
              <p className="mt-0.5 text-xs text-[#6b6258]">
                {new Date(f.lastAt).toLocaleString()} · transcript open
              </p>
            </a>
          ))}
        </section>
      )}

      <div className="mt-10 border-t border-dashed border-[#b8232c] pt-3">
        <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-[#b8232c]">
          Below the gate — count and type only
        </p>
      </div>

      <section className="mt-3 space-y-2">
        {below.length === 0 && <p className="text-sm text-[#6b6258]">Nothing recorded.</p>}
        {below.map((f) => (
          <div key={f.conversationId} className="bg-[#efe9dd] px-4 py-3">
            <p className="text-[15px] text-[#4a443c]">
              {f.count} × {f.category} · {f.childName}
            </p>
            <p className="mt-0.5 text-xs text-[#6b6258]">
              Content is not shown. {new Date(f.lastAt).toLocaleDateString()}
            </p>
          </div>
        ))}
      </section>

      <p className="mt-10 text-xs text-[#6b6258]">
        Every time you open a transcript it is recorded, and other guardians on this family can see
        that record.
      </p>
    </main>
  );
}
