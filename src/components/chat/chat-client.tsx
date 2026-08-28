'use client';

/**
 * The child conversation surface.
 *
 * The previous version stacked messages from the top of a full-height scroll
 * box, so a single exchange left roughly a thousand pixels of dead ground
 * between the answer and the composer. The conversation is bottom-anchored
 * (`min-h-full` + `justify-end` on the inner column): short conversations rest
 * on the composer, long ones scroll normally.
 *
 * That rule is now SCOPED TO NARROW VIEWPORTS rather than reversed. It is right
 * on a phone and it is why the composer and the newest turn read as one object.
 * On a 1440x900 screen the same rule pinned one exchange to the floor and left
 * the rest black, so at `md` and up the column centres inside a CAPPED height:
 * composed, but still close enough to the composer that the two belong together.
 * Removing the cap would restore the void; removing the centring would restore
 * the floor-pinning. Both halves are load-bearing.
 *
 * D4: responses are BUFFERED, so the waiting state is honest — a designed
 * pause, never a simulated token stream of text that is already complete.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { BubbliMark } from '@/components/bubbli-mark';
import { ChatIcon, HistoryIcon } from '@/components/icons';
import { Message, Thinking, type Turn } from '@/components/chat/message';
import { Suggestions, TOPIC_STARTERS, CONTINUATIONS } from '@/components/chat/suggestions';
import { Composer } from '@/components/chat/composer';
import { Sidebar } from '@/components/chat/sidebar';
import type { ChildMessage, ChildConversationSummary } from '@/lib/chat/child-transcript';

/** Stored messages carry a role the UI does not render; drop those. */
function toTurns(messages: ChildMessage[]): Turn[] {
  return messages
    .filter((m) => m.role === 'child' || m.role === 'assistant')
    .map((m) => ({ id: m.id, role: m.role as Turn['role'], content: m.content }));
}

export function ChatClient({
  childName,
  initialMessages = [],
  initialConversationId = null,
}: {
  childName: string | null;
  initialMessages?: ChildMessage[];
  initialConversationId?: string | null;
}) {
  // Seeded from the server render, so a resumed conversation is present on the
  // FIRST paint. Fetching client-side would flash the greeting first.
  const [turns, setTurns] = useState<Turn[]>(() => toTurns(initialMessages));
  const [input, setInput] = useState('');
  const [thinking, setThinking] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(initialConversationId);

  const [error, setError] = useState<string | null>(null);
  /**
   * `null` means "nobody has chosen yet" — let CSS decide.
   *
   * The first version read `window.matchMedia` in the state initialiser, which
   * is a server/client branch: the server rendered the rail closed, the client
   * rendered it open, and React threw the tree away with a hydration mismatch.
   * A breakpoint is a CSS question and this is why.
   *
   * So the DEFAULT is expressed as a media query in the className — hidden
   * below `md`, a visible rail at `md` and up — and this state only holds an
   * explicit choice once the child makes one, which then applies at every size.
   */
  const [historyOpen, setHistoryOpen] = useState<boolean | null>(null);
  const [conversations, setConversations] = useState<ChildConversationSummary[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(false);
  /**
   * Selecting a conversation is a SOFT navigation, so this component stays
   * mounted and the sidebar keeps its open state and its fetched list. The cost
   * is that `useState` initializers do not re-run: without this, clicking a row
   * would change the URL and leave the previous conversation on screen.
   *
   * Adjusting state during render is the documented way to reset on a prop
   * change — an effect would paint the stale transcript first, then correct it.
   */
  const [renderedFor, setRenderedFor] = useState(initialConversationId);
  if (initialConversationId !== renderedFor) {
    setRenderedFor(initialConversationId);
    setConversationId(initialConversationId);
    setTurns(toTurns(initialMessages));
    setError(null);
  }
  const endRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  const scrollToEnd = useCallback(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, []);

  useEffect(scrollToEnd, [turns, thinking, scrollToEnd]);

  /**
   * Fetched on first open, not on mount. A child who never opens the sidebar
   * never pays for the query, and the endpoint is throttled per child.
   */
  const loadHistory = useCallback(async (offset = 0) => {
    setLoadingHistory(true);
    try {
      const res = await fetch(`/api/chat?offset=${offset}`);
      if (!res.ok) return;
      const data = (await res.json()) as {
        conversations: ChildConversationSummary[];
        hasMore: boolean;
      };
      setConversations((prev) =>
        offset === 0 ? data.conversations : [...prev, ...data.conversations],
      );
      setHasMore(data.hasMore);
    } catch {
      // A sidebar that will not load must never take the chat down with it.
    } finally {
      setLoadingHistory(false);
    }
  }, []);

  /**
   * Opening is an event, not a synchronization — so the fetch hangs off the
   * toggle rather than an effect watching `historyOpen`. An effect here fires a
   * cascading render on every open and is what `react-hooks/set-state-in-effect`
   * exists to catch.
   */
  const toggleHistory = useCallback(() => {
    setHistoryOpen((current) => {
      // `null` is the CSS default: a rail at `md` and up, closed below. The
      // first press has to pick the opposite of what is actually on screen,
      // which is the one moment it is legitimate to ask the browser.
      const showing = current ?? window.matchMedia('(min-width: 768px)').matches;
      if (!showing && conversations.length === 0) void loadHistory(0);
      return !showing;
    });
  }, [conversations.length, loadHistory]);

  async function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || thinking) return;

    setInput('');
    setError(null);
    setTurns((t) => [...t, { id: crypto.randomUUID(), role: 'child', content: trimmed }]);
    setThinking(true);

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          conversationId,
          content: trimmed,
          // Stable for this send, so a retry deduplicates rather than
          // producing a second flag.
          idempotencyKey: crypto.randomUUID(),
        }),
      });

      const data = await res.json().catch(() => null);
      if (!res.ok || !data) {
        setError(data?.error ?? 'I could not reach the server. Try again in a moment.');
        return;
      }
      // The URL is the durable pointer; React state is only a mirror of it.
      // `replaceState`, not `push`: the back button must leave the chat, not
      // walk backwards through every message. The id can also CHANGE mid-thread
      // when a band shift forks a new conversation (see the chat route), so
      // this reads the id the server actually used rather than assuming.
      if (data.conversationId && data.conversationId !== conversationId) {
        setConversationId(data.conversationId);
        window.history.replaceState(null, '', `/chat?c=${data.conversationId}`);
      }
      setTurns((t) => [
        ...t,
        {
          id: crypto.randomUUID(),
          role: 'assistant',
          content: data.reply,
          crisis: data.crisis,
          blocked: data.blocked,
        },
      ]);
    } catch {
      setError('I could not reach the server. Try again in a moment.');
    } finally {
      setThinking(false);
    }
  }

  async function signOut() {
    await fetch('/api/child/logout', { method: 'POST' }).catch(() => undefined);
    router.push('/login');
  }

  const last = turns[turns.length - 1];
  const awaitingReply = thinking;
  // Starters when there is nothing yet; a way onward after Bubbli has spoken.
  const suggestions = awaitingReply
    ? []
    : turns.length === 0
      ? TOPIC_STARTERS
      : last?.role === 'assistant'
        ? CONTINUATIONS
        : [];

  return (
    <div className="relative z-10 flex h-dvh">
      <Sidebar
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
        conversations={conversations}
        activeId={conversationId}
        hasMore={hasMore}
        loading={loadingHistory}
        onOlder={() => void loadHistory(conversations.length)}
      />

      <div className="flex min-w-0 flex-1 flex-col">
      <header className="shrink-0 bg-header text-on-header">
        <div className="mx-auto flex max-w-2xl items-center justify-between gap-3 px-5 py-3">
          <span className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={toggleHistory}
              aria-expanded={historyOpen ?? undefined}
              aria-controls="conversation-history"
              className="-ml-2 flex size-11 items-center justify-center rounded-full text-on-header-muted transition-colors duration-150 hover:text-on-header"
            >
              <span className="sr-only">Your chats</span>
              <HistoryIcon size={20} />
            </button>
            <BubbliMark size={24} className="text-on-header" />
            <span className="font-[family-name:var(--font-display)] text-xl font-bold tracking-tight">
              Bubbli
            </span>
            {/* Whose chat this is. Nothing else identifying — an email on a
                child's screen is PII with no reason to be there. */}
            {childName && (
              <span className="hidden text-sm text-on-header-muted sm:inline">{childName}</span>
            )}
          </span>
          <span className="flex items-center gap-2">
            <a
              href="/safety"
              // Was a bordered pill, which made the least important action the
              // heaviest thing in the header. A link now — still findable,
              // because the child is promised a safety helper reads their
              // messages, but no longer competing with the conversation.
              className="flex min-h-11 items-center px-2 text-xs text-on-header-muted underline decoration-on-header-muted/40 underline-offset-4 transition-colors duration-150 hover:text-on-header hover:decoration-on-header"
            >
              How you&apos;re kept safe
            </a>
            <button
              type="button"
              onClick={() => void signOut()}
              // `text-subtle` measured 4.46:1 on dark and 3.45:1 on light
              // against --ground: below AA in both themes. `text-muted` is
              // 8.05:1 and 6.30:1.
              className="flex min-h-11 items-center rounded-full px-3 text-xs text-on-header-muted transition-colors duration-150 hover:text-on-header"
            >
              Sign out
            </button>
          </span>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto md:flex md:flex-col md:justify-end">
        <div className="mx-auto flex w-full min-h-full max-w-2xl flex-col justify-end gap-4 px-5 py-6 md:min-h-0 md:max-h-[46rem] md:justify-center">
          {turns.length === 0 && (
            <div className="flex flex-col items-center pb-4 text-center">
              {/* Something to recognise before you can read. The original build
                  had an icon tile here; a greeting alone announces, it does not
                  invite. */}
              <span className="mb-4 flex size-16 items-center justify-center rounded-2xl bg-accent-soft text-accent">
                <ChatIcon size={32} />
              </span>
              <h1 className="text-[clamp(1.5rem,4.5vw,2rem)] font-bold">
                {childName ? `Hi ${childName}!` : 'Hello!'}
              </h1>
              <p className="mt-1 text-[17px] text-muted">
                Ask me anything &mdash; I&apos;m here to help.
              </p>
            </div>
          )}

          {turns.map((t, i) => (
            <Message key={t.id} turn={t} showMark={turns[i - 1]?.role !== 'assistant'} />
          ))}

          {thinking && <Thinking />}

          {error && (
            <p
              role="alert"
              className="rounded-2xl bg-critical-bg px-4 py-3 text-center text-[15px] text-critical"
            >
              {error}
            </p>
          )}
          <div ref={endRef} />
        </div>
      </main>

      <footer className="shrink-0 border-t border-line">
        <div className="mx-auto max-w-2xl px-5 py-4">
          {suggestions.length > 0 && (
            <div className="mb-3">
              <Suggestions
                items={suggestions}
                onPick={(s) => void send(s)}
                label={turns.length === 0 ? 'Things to ask about' : 'Keep going'}
              />
            </div>
          )}
          <Composer
            value={input}
            onChange={setInput}
            onSend={() => void send(input)}
            busy={thinking}
            onHeightChange={scrollToEnd}
          />
          {/* PRD §3: the child is told a safety helper reads their messages.
              This used to live in the empty state, so it vanished for good
              after the first message — a disclosure they could never re-check. */}
          <p className="mt-2.5 text-center text-[13px] text-subtle">
            A safety helper reads messages to keep you safe.
          </p>
        </div>
      </footer>
      </div>
    </div>
  );
}
