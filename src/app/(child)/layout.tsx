/**
 * The child's room.
 *
 * Every surface a child meets — chat, sign-in, device pairing — renders in the
 * child register, and does so REGARDLESS OF THE OPERATING SYSTEM. Before this
 * layout existed the theme was chosen by `prefers-color-scheme` for the whole
 * app, so a four-year-old got a near-black room because a parent had set their
 * laptop to dark at night.
 *
 * The wrapper paints the ground itself rather than leaving it to `<body>`: a
 * surface floating on an unstyled backdrop is what made an earlier build
 * unreadable, and `<body>` cannot know which register it sits under.
 */
export default function ChildLayout({ children }: { children: React.ReactNode }) {
  return (
    <div data-register="child" className="min-h-dvh bg-ground text-ink">
      {children}
    </div>
  );
}
