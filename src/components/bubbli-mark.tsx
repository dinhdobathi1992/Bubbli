/**
 * Bubbli's mark — the gate.
 *
 * A world, and the line through it: the child's space sits above a dashed rule,
 * which is the same device used on the landing page and the parent dashboard.
 * The mark, the product and the mechanism are one shape.
 *
 * The rule OVERSHOOTS the circle on both sides, and that is load-bearing. When
 * it stopped at the circle's edge the whole thing read as a face — ring, nose,
 * mouth — which is not the idea and is faintly comic on a safety product. Only
 * rendering it at 16px next to alternatives made that visible.
 *
 * It replaced two plain circles that meant "bubbles" and nothing more — cover
 * the wordmark and that one could have belonged to a spa. This one still says
 * something without the name beside it, which is the test a mark has to pass.
 *
 * Drawn in `currentColor` so it inherits the theme with no second asset, and no
 * asset pipeline. Emoji and raster are banned by project rule; a hand-drawn
 * illustration reads worse than none.
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
      <circle cx="12" cy="12" r="7.6" stroke="currentColor" strokeWidth="1.75" />
      <path
        d="M1.4 14.6H22.6"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeDasharray="2.6 2.4"
      />
      <circle cx="12" cy="9" r="2" fill="currentColor" />
    </svg>
  );
}

/**
 * The same mark at one optical size, for a favicon or any 16px use.
 *
 * The dashes are the honest weakness of this shape: below about 20px on a
 * low-DPI screen they blur into a solid rule and the idea is quietly lost. A
 * solid line at a heavier stroke keeps the silhouette legible. One optical size
 * is ordinary practice, not a compromise.
 */
export function BubbliMarkSmall({ size = 16, className }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      className={className}
    >
      <circle cx="12" cy="12" r="7.6" stroke="currentColor" strokeWidth="2.2" />
      <path d="M1.4 14.6H22.6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
      <circle cx="12" cy="9" r="2" fill="currentColor" />
    </svg>
  );
}
