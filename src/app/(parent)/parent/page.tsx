import { redirect } from 'next/navigation';
import { pool } from '@/lib/db/client';
import { getSession } from '@/lib/auth/request-session';
import { projectFlagRow, type FlagRowAtGate } from '@/lib/parent/dto';
import { CrisisCard } from '@/components/parent/crisis-card';
import { FlagRowItem } from '@/components/parent/flag-row';

export const dynamic = 'force-dynamic';

/**
 * Parent safety dashboard.
 *
 * A DIFFERENT REGISTER from the child surface, on purpose. Sharper corners,
 * denser rows, monospace metadata: this is an instrument, and it should read as
 * one. The child surface is soft because it must never feel like surveillance;
 * this one is precise because it must never feel like a toy.
 *
 * WHAT IT SAYS IS THE PRODUCT. This page used to render `triggered_rules->>0`
 * with dots swapped for spaces, so a guardian whose child wrote "I don't want to
 * be here anymore" was shown `harm self not here · Thi`. Every sentence here now
 * comes from `src/content/flag-labels`, and no rule identifier survives the
 * projection — see `lib/parent/dto.ts`.
 *
 * THREE SECTIONS, in the order a guardian needs them. The dashed rule is the
 * product: above it a guardian may read, below it they get a count and a
 * sentence and nothing else.
 */
export default async function ParentDashboard() {
  const session = await getSession();

  // Unauthenticated or a child principal: send them to sign in. The page used
  // to render a placeholder claiming "the authentication layer exists and is
  // tested", which was untrue — better-auth had zero imports in src/.
  if (!session || session.principalType !== 'parent') {
    redirect('/parent/sign-in');
  }

  // Reviewed rows are INCLUDED now. Filtering them out deleted a guardian's
  // history, so three concerns in a week read exactly like one — and repetition
  // is usually the actual signal.
  const r = await pool.query(
    `select c.id as conversation_id, c.max_severity as severity,
            f.triggered_rules,
            count(f.id)::int as count, max(f.created_at) as last_at,
            ch.display_name as child_name, bool_and(f.reviewed) as reviewed,
            now() as server_now
       from conversations c
       join children ch on ch.id = c.child_id
       join flags f on f.conversation_id = c.id
      where ch.family_id = $1
      group by c.id, c.max_severity, ch.display_name, f.triggered_rules
      order by array_position(array['info','low','medium','high','critical'], c.max_severity) desc,
               max(f.created_at) desc
      limit 200`,
    [session.familyId],
  );

  const flags = r.rows.map(projectFlagRow);

  // A self-harm disclosure is lifted out entirely, and only the newest speaks —
  // a guardian in that moment needs one clear thing, not a list.
  const selfHarm = flags.filter(
    (f): f is FlagRowAtGate => f.opensTranscript && f.isSelfHarm && !f.reviewed,
  );
  const crisis = selfHarm[0] ?? null;

  const rest = flags.filter((f) => f !== crisis);
  const attention = rest.filter((f) => f.opensTranscript && !f.reviewed);
  const recorded = rest.filter((f) => !f.opensTranscript && !f.reviewed);
  const reviewed = rest.filter((f) => f.reviewed);

  const nothingAtAll = flags.length === 0;

  // The clock comes from POSTGRES, not from Node.
  //
  // `created_at` was stamped by the database, so comparing it to the app
  // server's clock compares two clocks that can disagree — and on a page whose
  // job is "how long ago", a few seconds of skew turns "just now" into "1
  // minute ago". Reading it once from the same query also means every row
  // resolves against the same instant.
  const now = r.rows[0]?.server_now ? new Date(r.rows[0].server_now).getTime() : 0;

  return (
    <main className="relative z-10 mx-auto flex min-h-dvh max-w-3xl flex-col px-6 py-14 md:justify-center md:py-10">
      <div className="w-full">
        <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-subtle">Bubbli</p>
        <h1 className="mt-3 text-[clamp(1.75rem,4vw,2.5rem)]">Safety dashboard</h1>

        {nothingAtAll && (
          <div className="mt-10 border border-line bg-surface px-6 py-10 text-center">
            <p className="font-[family-name:var(--font-display)] text-2xl">Everything looks good.</p>
            <p className="mt-2 text-[15px] text-muted">Nothing has needed your attention.</p>
          </div>
        )}

        {crisis && <CrisisCard flag={crisis} now={now} />}

        {attention.length > 0 && (
          <>
            <p className="mt-10 font-mono text-[11px] uppercase tracking-[0.14em] text-muted">
              Needs your attention
            </p>
            <ul className="mt-3">
              {attention.map((f) => (
                <FlagRowItem key={f.conversationId} flag={f} now={now} />
              ))}
            </ul>
          </>
        )}

        {/* The gate, drawn. Everything below is counted, never quoted. The
            heading used to read "Below the gate" — a good internal metaphor for
            `opensTranscript` and meaningless to a guardian who has not read the
            source. The distinction survives; the jargon does not. */}
        {recorded.length > 0 && (
          <>
            <div className="mt-12 flex items-center gap-3">
              <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-accent">
                Recorded, not shown
              </span>
              <span className="h-px flex-1 border-t border-dashed border-accent" />
            </div>
            <p className="mt-2 max-w-[62ch] text-[13px] text-muted">
              Counted so you know it happened. The words stay private to your child.
            </p>
            <ul className="mt-4">
              {recorded.map((f) => (
                <FlagRowItem key={f.conversationId} flag={f} now={now} />
              ))}
            </ul>
          </>
        )}

        {reviewed.length > 0 && (
          <>
            <p className="mt-12 font-mono text-[11px] uppercase tracking-[0.14em] text-subtle">
              Already reviewed
            </p>
            <p className="mt-2 max-w-[62ch] text-[13px] text-muted">
              Kept so you can see whether something keeps coming up.
            </p>
            <ul className="mt-3">
              {reviewed.map((f) => (
                <FlagRowItem key={f.conversationId} flag={f} now={now} />
              ))}
            </ul>
          </>
        )}
      </div>
    </main>
  );
}
