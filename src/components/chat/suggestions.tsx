/**
 * Ways back into the conversation.
 *
 * Bubbli's replies routinely end in a question ("Can you think of a time when
 * the sky didn't look blue?"). Previously the only answer surface was an empty
 * text field, and the starter chips disappeared permanently after the first
 * message — so an invitation to keep talking was a dead end.
 *
 * These are STATIC. Generating suggestions would mean a second model call over
 * unflagged content, which is precisely what validation decision V6 removed.
 * They make no claim to understand the answer; they just give a child a way in.
 */
export const TOPIC_STARTERS = [
  'Why is the sky blue?',
  'How do volcanoes work?',
  'Tell me about space',
];

export const CONTINUATIONS = ['Tell me more', 'Why?', 'Something else'];

export function Suggestions({
  items,
  onPick,
  label,
}: {
  items: string[];
  onPick: (text: string) => void;
  label: string;
}) {
  return (
    <div className="flex flex-wrap gap-2" role="group" aria-label={label}>
      {items.map((s) => (
        <button
          key={s}
          type="button"
          onClick={() => onPick(s)}
          className="min-h-11 rounded-full border border-line bg-surface px-4 text-[15px] text-ink transition-all duration-150 ease-[var(--ease-spring)] hover:-translate-y-0.5 hover:border-accent hover:text-accent active:translate-y-0 active:scale-[0.97]"
        >
          {s}
        </button>
      ))}
    </div>
  );
}
