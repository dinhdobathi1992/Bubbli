/**
 * Bubbli's presence.
 *
 * A child needs to know who is talking to them. Emoji are banned as icons
 * (font-dependent, uncontrollable by token), and a hand-drawn illustration
 * reads worse than none — so the mark is geometric: two bubbles rising.
 *
 * Drawn in `currentColor` so it inherits the theme with no asset pipeline and
 * no second copy for dark mode.
 */
export function BubbliMark({ size = 24, className }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      className={className}
    >
      <circle cx="10" cy="14" r="6.5" stroke="currentColor" strokeWidth="1.75" />
      <circle cx="18.5" cy="6" r="2.75" fill="currentColor" />
    </svg>
  );
}
