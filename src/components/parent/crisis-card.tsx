/**
 * A self-harm disclosure, at the top of the dashboard.
 *
 * Not a row. A self-harm flag is categorically different from a question about
 * violence, and giving it the same treatment as everything else asks a guardian
 * to spot it in a list at the moment they are least able to.
 *
 * GRAVE, NOT ALARMING. No red fill, no siren. Someone reading this is already
 * frightened; styling that amplifies it makes the page harder to act on. The
 * severity edge and the position carry the weight.
 *
 * The crisis number comes from `src/content/crisis` — the same constant the
 * child sees — so a region change moves both surfaces at once.
 *
 * ACCEPTED RISK: this copy has not been reviewed by a clinician. It carries the
 * same standing risk as the crisis copy it sits beside, and should go for review
 * with it before launch.
 */
import { LIFELINE } from '@/content/crisis';
import type { FlagRowAtGate } from '@/lib/parent/dto';
import { relativeTime } from '@/lib/parent/relative-time';

export function CrisisCard({ flag, now }: { flag: FlagRowAtGate; now: number }) {
  return (
    <section
      aria-labelledby="crisis-heading"
      className="mt-8 border border-line border-l-2 border-l-critical bg-surface px-6 py-5"
    >
      <h2 id="crisis-heading" className="font-[family-name:var(--font-display)] text-xl">
        {flag.headline}
      </h2>

      {flag.detail && <p className="mt-2 max-w-[60ch] text-[15px] text-muted">{flag.detail}</p>}

      <p className="mt-3 font-mono text-[11px] text-subtle tabular-nums">
        <time dateTime={flag.lastAt}>{relativeTime(flag.lastAt, now)}</time>
      </p>

      <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2">
        <a
          href={`/parent/conversations/${flag.conversationId}`}
          className="inline-flex min-h-11 items-center rounded-full bg-accent px-5 text-[15px] text-on-accent transition-opacity duration-150 hover:opacity-90"
        >
          Read what was said
        </a>
        {/* The consequence belongs on the control that causes it, not in a
            footnote at the bottom of the page where it was before. */}
        <span className="text-[13px] text-subtle">
          Opening this is recorded, and other guardians can see that record.
        </span>
      </div>

      <p className="mt-5 border-t border-line pt-4 text-[15px] text-muted">
        If you would like help starting the conversation, you can call or text{' '}
        <span className="text-ink tabular-nums">{LIFELINE}</span>.
      </p>
    </section>
  );
}
