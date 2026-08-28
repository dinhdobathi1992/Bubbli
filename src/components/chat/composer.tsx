'use client';

import { SendIcon } from '@/components/icons';

/**
 * The composer.
 *
 * A single-line input cannot hold a sentence a child is still thinking through,
 * so this grows to a cap and then scrolls. Enter sends and Shift+Enter breaks a
 * line, which is what every chat a child has already used does.
 *
 * The send control keeps its accent at rest. The previous version's default
 * state was `opacity-40`, so the first thing on screen was a primary action
 * that looked broken.
 */
import { useEffect, useRef } from 'react';

const MAX_ROWS = 4;

export function Composer({
  value,
  onChange,
  onSend,
  busy,
  onHeightChange,
}: {
  value: string;
  onChange: (v: string) => void;
  onSend: () => void;
  busy: boolean;
  onHeightChange?: () => void;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);

  // Grow to fit, then stop. Reset to `auto` first or scrollHeight only ever climbs.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    const line = parseFloat(getComputedStyle(el).lineHeight) || 24;
    const max = line * MAX_ROWS + 24;
    el.style.height = `${Math.min(el.scrollHeight, max)}px`;
    el.style.overflowY = el.scrollHeight > max ? 'auto' : 'hidden';
    onHeightChange?.();
  }, [value, onHeightChange]);

  const canSend = !busy && value.trim().length > 0;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSend();
      }}
      className="flex items-end gap-2"
    >
      <textarea
        ref={ref}
        rows={1}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            onSend();
          }
        }}
        placeholder="Ask me anything"
        aria-label="Your message"
        // 16px keeps mobile Safari from zooming the viewport on focus.
        className="min-h-12 flex-1 resize-none rounded-3xl border border-line bg-surface px-4 py-3 text-[16px] leading-6 text-ink placeholder:text-subtle transition-colors duration-150 hover:border-line-strong focus:border-accent focus:outline-none"
      />
      <button
        type="submit"
        disabled={!canSend}
        aria-label="Send message"
        className="flex min-h-12 shrink-0 items-center gap-2 rounded-3xl bg-accent px-6 text-[16px] font-semibold text-on-accent transition-all duration-150 ease-[var(--ease-spring)] hover:-translate-y-0.5 hover:bg-accent-hover active:translate-y-0 active:scale-[0.97] disabled:border disabled:border-line disabled:bg-transparent disabled:text-subtle disabled:hover:translate-y-0"
      >
        {/* The icon reinforces the word; it never replaces it. */}
        <SendIcon size={16} />
        Send
      </button>
    </form>
  );
}
