'use client';

/**
 * The shell around the conversation list.
 *
 * Collapsed by default, on purpose. For a four-year-old a list of past chats is
 * noise competing with the one thing they came to do, so the chat stays the
 * subject until a child asks for the history. One tap away, not in the way.
 *
 * A rail at `md` and up, a drawer below — the same component either way, not
 * two implementations that drift.
 */
import { useCallback, useEffect, useRef } from 'react';
import Link from 'next/link';
import { PlusIcon } from '@/components/icons';
import { ConversationList, type ConversationListProps } from '@/components/chat/conversation-list';

export function Sidebar({
  open,
  onClose,
  ...list
}: ConversationListProps & { open: boolean | null; onClose: () => void }) {
  const panelRef = useRef<HTMLDivElement>(null);

  /**
   * Escape closes, and Tab is trapped while the drawer is over the chat.
   * Without the trap, focus walks into the composer behind an open drawer and a
   * keyboard user is typing somewhere they cannot see.
   */
  const onKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (open !== true) return;
      if (e.key === 'Escape') {
        onClose();
        return;
      }
      if (e.key !== 'Tab' || !panelRef.current) return;
      // Only trap where the panel is an overlay. On the desktop rail the page
      // behind is not obscured, so trapping would be a cage, not a courtesy.
      if (window.matchMedia('(min-width: 768px)').matches) return;

      const focusable = panelRef.current.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled])',
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    },
    [open, onClose],
  );

  useEffect(() => {
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onKeyDown]);

  return (
    <>
      {/* Scrim, below `md` only: the rail does not obscure anything. */}
      {open === true && (
        <button
          type="button"
          aria-hidden="true"
          tabIndex={-1}
          onClick={onClose}
          className="fixed inset-0 z-20 bg-ground/70 md:hidden"
        />
      )}

      <div
        ref={panelRef}
        id="conversation-history"
        // `inert` would be better but is not universally supported; width-0 with
        // overflow hidden keeps the closed panel out of the tab order too.
        className={`z-30 shrink-0 overflow-hidden border-line bg-surface transition-[width] duration-200 motion-reduce:transition-none ${
          open === null
            ? // Nobody has chosen: CSS decides. Closed on a phone, a rail on a
              // wide screen. Expressed here rather than in state, because a
              // breakpoint read during render is a hydration mismatch.
              'w-0 border-r-0 md:static md:w-64 md:border-r'
            : open
              ? 'fixed inset-y-0 left-0 w-72 border-r md:static md:w-64'
              : 'w-0 border-r-0'
        }`}
      >
        <div className="flex h-full w-72 flex-col md:w-64">
          <div className="shrink-0 p-3">
            {/* A FILLED control. It was `bg-accent-soft` with accent text,
                which reads as a tinted label rather than as a button — the
                original build's filled orange is most of why its primary action
                was obvious. The label is white on accent at 4.79:1. */}
            <Link
              href="/chat"
              className="flex min-h-11 items-center justify-center gap-2 rounded-full bg-accent px-4 text-sm font-semibold text-on-accent shadow-sm transition-colors duration-150 hover:bg-accent-hover"
            >
              <PlusIcon size={16} />
              New chat
            </Link>
          </div>
          <nav aria-label="Your chats" className="min-h-0 flex-1 overflow-y-auto">
            <ConversationList {...list} />
          </nav>
        </div>
      </div>
    </>
  );
}
