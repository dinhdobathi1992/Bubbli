/**
 * The child surface's icon vocabulary.
 *
 * Inlined rather than pulled from a CDN. The original build loaded heroicons
 * over the network; a children's product should not make a third-party request
 * to render a button, and an icon that fails to load is a control with no
 * affordance at all.
 *
 * ONE FAMILY, ONE STROKE WIDTH. Mixed weights read as a mistake even when
 * nobody can name why.
 *
 * EVERY ICON IS DECORATIVE. `aria-hidden` throughout, and each one sits beside
 * a visible text label — never instead of it. A pre-literate child recognises
 * the pairing; the glyph alone is a guess, and a screen reader user gets
 * nothing from it. If a control here ever loses its text, this is the comment
 * that says why it must get it back.
 *
 * Keep this set to what is used. An unused glyph is bytes on a child's device
 * and code nobody reviews.
 */

interface IconProps {
  /** Matches the surrounding text size by default. */
  size?: number;
  className?: string;
}

function Svg({ size = 18, className, children }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={className}
    >
      {children}
    </svg>
  );
}

/** New chat. */
export function PlusIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M12 5v14M5 12h14" />
    </Svg>
  );
}

/** Send a message. */
export function SendIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M4 12l16-8-6 16-2.5-6.5L4 12z" />
    </Svg>
  );
}

/** Show or hide past conversations. */
export function HistoryIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M3 6h18M3 12h18M3 18h12" />
    </Svg>
  );
}

/** Dismiss the drawer. */
export function CloseIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M6 6l12 12M18 6L6 18" />
    </Svg>
  );
}

/** The empty state. A speech bubble: this is a place where talking happens. */
export function ChatIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M21 12a8 8 0 0 1-11.3 7.3L3 21l1.7-6.7A8 8 0 1 1 21 12z" />
    </Svg>
  );
}
