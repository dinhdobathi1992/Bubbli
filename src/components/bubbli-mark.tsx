/**
 * Bubbli's mark — the gate.
 *
 * A world, and the line beneath it: the child's space sits above a dashed rule,
 * which is the same device used on the landing page and the parent dashboard.
 * The mark, the product and the mechanism are one shape.
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
      <circle cx="12" cy="12" r="8.4" stroke="currentColor" strokeWidth="1.75" />
      <path
        d="M4.4 14.4H19.6"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeDasharray="2.6 2.4"
      />
      <circle cx="12" cy="8.6" r="1.9" fill="currentColor" />
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
      <circle cx="12" cy="12" r="8.2" stroke="currentColor" strokeWidth="2.2" />
      <path d="M4.6 14.4H19.4" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
      <circle cx="12" cy="8.4" r="2.1" fill="currentColor" />
    </svg>
  );
}
