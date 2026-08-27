import Link from 'next/link';

/**
 * The two audience doors.
 *
 * Deliberately ONE segmented object rather than two loose buttons. Two separate
 * buttons read as two competing calls to action and would dilute the single
 * "Start free" in the hero; a segmented pair reads as "which door am I?" — which
 * is navigation, not conversion.
 *
 * The parents half is filled because the page's job is conversion and the parent
 * is the decider: they choose the product, they give consent, and under COPPA
 * they have to. A returning child usually arrives by family link or on a paired
 * device and never sees this page at all.
 */
export function Doors() {
  return (
    <nav
      aria-label="Choose who you are"
      className="flex overflow-hidden rounded-xl border border-line"
    >
      <Link
        href="/login"
        className="min-h-11 px-4 py-2.5 text-[13px] text-muted transition-colors duration-150 hover:bg-raised hover:text-ink"
      >
        For children
      </Link>
      <Link
        href="/parent/sign-in"
        className="min-h-11 border-l border-line bg-accent px-4 py-2.5 text-[13px] font-medium text-on-accent transition-colors duration-150 hover:bg-accent-hover"
      >
        For parents
      </Link>
    </nav>
  );
}
