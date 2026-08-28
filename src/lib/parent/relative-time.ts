/**
 * How long ago, in words.
 *
 * Pure, and takes `now` rather than reading the clock: a component that calls
 * `Date.now()` during render is non-deterministic, and every row on a page
 * would otherwise resolve against a slightly different instant. The page reads
 * the clock once and passes it down.
 *
 * Relative under a week, absolute beyond. "2 hours ago" is something a guardian
 * can act on; "3 months ago" stops being actionable and becomes a lookup, and
 * an absolute date is what you want when you are reconstructing a pattern.
 */
export function relativeTime(iso: string, now: number): string {
  const then = new Date(iso);
  const mins = Math.round((now - then.getTime()) / 60_000);

  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} minute${mins === 1 ? '' : 's'} ago`;
  if (mins < 60 * 24) {
    const h = Math.round(mins / 60);
    return `${h} hour${h === 1 ? '' : 's'} ago`;
  }
  if (mins < 60 * 24 * 7) {
    const d = Math.round(mins / (60 * 24));
    return d === 1 ? 'yesterday' : `${d} days ago`;
  }
  return then.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}
