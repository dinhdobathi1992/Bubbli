'use client';

/**
 * The child conversation surface.
 *
 * The previous version stacked messages from the top of a full-height scroll
 * box, so a single exchange left roughly a thousand pixels of dead ground
 * between the answer and the composer. The conversation is bottom-anchored
 * here (`min-h-full` + `justify-end` on the inner column): short conversations
 * rest on the composer, long ones scroll normally.
 *
 * D4: responses are BUFFERED, so the waiting state is honest — a designed
 * pause, never a simulated token stream of text that is already complete.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { BubbliMark } from '@/components/bubbli-mark';
import { Message, Thinking, type Turn } from '@/components/chat/message';
import { Suggestions, TOPIC_STARTERS, CONTINUATIONS } from '@/components/chat/suggestions';
import { Composer } from '@/components/chat/composer';

export function ChatClient({ childName }: { childName: string | null }) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState('');
  const [thinking, setThinking] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  const scrollToEnd = useCallback(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, []);

  useEffect(scrollToEnd, [turns, thinking, scrollToEnd]);

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
      setConversationId(data.conversationId);
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
    <div className="relative z-10 flex h-dvh flex-col">
      <header className="shrink-0 border-b border-line">
        <div className="mx-auto flex max-w-2xl items-center justify-between gap-3 px-5 py-3.5">
          <span className="flex items-center gap-2.5">
            <BubbliMark size={24} className="text-accent" />
            <span className="font-[family-name:var(--font-display)] text-xl tracking-tight">
              Bubbli
            </span>
          </span>
          <span className="flex items-center gap-2">
            <a
              href="/safety"
              className="min-h-9 rounded-full border border-line px-3 py-1.5 text-xs text-muted transition-colors duration-150 hover:border-accent hover:text-accent"
            >
              How you&apos;re kept safe
            </a>
            <button
              type="button"
              onClick={() => void signOut()}
              className="min-h-9 rounded-full px-3 py-1.5 text-xs text-subtle transition-colors duration-150 hover:text-accent"
            >
              Sign out
            </button>
          </span>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto flex min-h-full max-w-2xl flex-col justify-end gap-4 px-5 py-6">
          {turns.length === 0 && (
            <div className="pb-2">
              <h1 className="text-[clamp(1.75rem,5vw,2.25rem)]">
                {childName ? `Hi ${childName}.` : 'Hello.'}
                <br />
                <span className="italic text-accent">What shall we learn about?</span>
              </h1>
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
  );
}
