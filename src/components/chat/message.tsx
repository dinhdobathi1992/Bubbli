/**
 * One conversational turn.
 *
 * Speaker identity is carried by THREE signals, not just alignment: side,
 * surface treatment, and the Bubbli mark. Alignment alone fails for a child
 * scanning quickly, and fails completely at narrow widths.
 *
 * Model replies arrive as buffered text with real paragraph breaks in them
 * (PRD D4 — the pause is honest, so the whole answer lands at once). Rendering
 * that as one slab is what made the previous version a wall of text, so blank
 * lines become actual paragraphs here.
 */
import { BubbliMark } from '@/components/bubbli-mark';

export interface Turn {
  id: string;
  role: 'child' | 'assistant';
  content: string;
  crisis?: boolean;
  blocked?: boolean;
}

/** Split on blank lines; a reply with none stays a single paragraph. */
function paragraphs(text: string): string[] {
  return text.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
}

export function Message({ turn, showMark }: { turn: Turn; showMark: boolean }) {
  if (turn.role === 'child') {
    return (
      <div className="flex justify-end">
        <div className="max-w-[80%] rounded-3xl rounded-br-lg bg-accent-soft px-4 py-3 text-[16px] leading-relaxed text-ink sm:max-w-[70%]">
          {turn.content}
        </div>
      </div>
    );
  }

  const tone = turn.crisis
    ? 'border-critical bg-critical-bg'
    : 'border-line bg-surface';

  return (
    <div className="flex items-start gap-3">
      {/* The gutter is reserved whether or not the mark is drawn, so a run of
          consecutive replies stays aligned instead of stepping left. */}
      <div className="w-7 shrink-0 pt-1.5">
        {showMark && <BubbliMark size={26} className="text-accent" />}
      </div>
      <div
        className={`max-w-[60ch] rounded-3xl rounded-bl-lg border px-4 py-3 text-[16px] leading-[1.65] text-ink ${tone}`}
      >
        {turn.crisis && (
          <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.14em] text-critical">
            Please read this
          </p>
        )}
        {paragraphs(turn.content).map((p, i) => (
          <p key={i} className={i > 0 ? 'mt-3 whitespace-pre-wrap' : 'whitespace-pre-wrap'}>
            {p}
          </p>
        ))}
      </div>
    </div>
  );
}

/** Same shape as an assistant turn, so the reply does not jump on arrival. */
export function Thinking() {
  return (
    <div className="flex items-start gap-3">
      <div className="w-7 shrink-0 pt-1.5">
        <BubbliMark size={26} className="text-accent" />
      </div>
      <div className="flex items-center gap-2.5 rounded-3xl rounded-bl-lg border border-line bg-surface px-4 py-3.5">
        <span className="flex gap-1" aria-hidden="true">
          <i className="h-1.5 w-1.5 animate-bounce rounded-full bg-accent" />
          <i className="h-1.5 w-1.5 animate-bounce rounded-full bg-accent [animation-delay:150ms]" />
          <i className="h-1.5 w-1.5 animate-bounce rounded-full bg-accent [animation-delay:300ms]" />
        </span>
        <span className="sr-only">Bubbli is thinking about your message</span>
      </div>
    </div>
  );
}
