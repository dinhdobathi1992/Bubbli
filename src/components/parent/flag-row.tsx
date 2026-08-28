/**
 * One flag, in every section of the dashboard.
 *
 * Shared deliberately. Three near-identical row components is how a below-gate
 * row starts quoting content — someone adds a useful detail to one and does not
 * notice the other two do not have the severity guard.
 *
 * The gate is expressed in the TYPE, not in a prop. A `FlagRowBelowGate` has no
 * `detail` field to render, so the component cannot show one by accident.
 */
import type { FlagRow } from '@/lib/parent/dto';
import { relativeTime } from '@/lib/parent/relative-time';

const SEV_EDGE: Record<string, string> = {
  critical: 'border-l-critical',
  high: 'border-l-high',
  medium: 'border-l-medium',
  low: 'border-l-low',
  info: 'border-l-info',
};

export function FlagRowItem({ flag, now }: { flag: FlagRow; now: number }) {
  const meta = (
    <span className="mt-1 flex flex-wrap items-center gap-x-3 font-mono text-[11px] text-subtle tabular-nums">
      <time dateTime={flag.lastAt}>{relativeTime(flag.lastAt, now)}</time>
      {flag.count > 1 && <span>{flag.count} times</span>}
    </span>
  );

  // Below the gate: counted, never opened. No link, because there is nothing a
  // guardian may read — offering one would promise something the gate refuses.
  if (!flag.opensTranscript) {
    return (
      <li
        className={`border-b border-line border-l-2 px-5 py-3.5 ${SEV_EDGE[flag.severity] ?? ''}`}
      >
        <span className="block text-[15px] text-muted">{flag.headline}</span>
        {meta}
      </li>
    );
  }

  return (
    <li>
      <a
        href={`/parent/conversations/${flag.conversationId}`}
        className={`block border-b border-line border-l-2 bg-surface px-5 py-4 transition-colors duration-150 hover:bg-raised ${SEV_EDGE[flag.severity] ?? ''}`}
      >
        <span className="block text-[15px] text-ink">{flag.headline}</span>
        {flag.detail && <span className="mt-1 block text-[13px] text-muted">{flag.detail}</span>}
        {meta}
        <span className="mt-2 block text-[13px] text-accent">
          Read what was said{' '}
          <span className="text-subtle">— opening this is recorded</span>
        </span>
      </a>
    </li>
  );
}
