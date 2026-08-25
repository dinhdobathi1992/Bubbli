'use client';

/**
 * Child chat.
 *
 * D4: responses are BUFFERED, so the waiting state is honest — a designed
 * pause, never a simulated token stream of text that is already complete.
 *
 * The crisis response is styled as a distinct, calm card rather than an alarm.
 * A child reading it is already frightened; the interface should not add to it.
 */
import { useEffect, useRef, useState } from 'react';

interface Msg {
  id: string;
  role: 'child' | 'assistant';
  content: string;
  crisis?: boolean;
  blocked?: boolean;
}

const PROMPTS = ['Why is the sky blue?', 'How do volcanoes work?', 'Tell me about space'];

export default function ChatPage() {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [thinking, setThinking] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, thinking]);

  async function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || thinking) return;

    setInput('');
    setError(null);
    setMessages((m) => [...m, { id: crypto.randomUUID(), role: 'child', content: trimmed }]);
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
      setMessages((m) => [
        ...m,
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
      inputRef.current?.focus();
    }
  }

  return (
    <div className="relative z-10 mx-auto flex h-dvh max-w-2xl flex-col">
      <header className="flex items-center justify-between border-b border-line px-5 py-4">
        <span className="font-[family-name:var(--font-display)] text-xl tracking-tight">Bubbli</span>
        <a
          href="/safety"
          className="rounded-full border border-line px-3 py-1.5 text-xs text-muted transition-colors duration-150 hover:border-accent hover:text-accent"
        >
          How you&apos;re kept safe
        </a>
      </header>

      <main className="flex-1 space-y-4 overflow-y-auto px-5 py-8">
        {messages.length === 0 && (
          <div className="pt-8">
            <h1 className="text-[clamp(1.75rem,5vw,2.25rem)]">
              What shall we
              <br />
              <span className="italic text-accent">learn about?</span>
            </h1>
            <p className="mt-3 max-w-sm text-[15px] text-muted">
              Ask me anything. A safety helper reads messages to keep you safe.
            </p>
            <div className="mt-7 flex flex-wrap gap-2">
              {PROMPTS.map((p) => (
                <button
                  key={p}
                  onClick={() => void send(p)}
                  className="min-h-11 rounded-full border border-line bg-surface px-4 text-[15px] text-ink transition-colors duration-150 hover:border-accent hover:text-accent"
                >
                  {p}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m) => (
          <div key={m.id} className={m.role === 'child' ? 'flex justify-end' : 'flex justify-start'}>
            <div
              className={[
                'max-w-[85%] whitespace-pre-wrap px-4 py-3 text-[16px] leading-relaxed',
                m.role === 'child'
                  ? 'rounded-2xl rounded-br-md bg-raised text-ink'
                  : m.crisis
                    ? 'rounded-2xl rounded-bl-md border border-critical bg-critical-bg text-ink'
                    : 'rounded-2xl rounded-bl-md border border-line bg-surface text-ink',
              ].join(' ')}
            >
              {m.crisis && (
                <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.14em] text-critical">
                  Please read this
                </p>
              )}
              {m.content}
            </div>
          </div>
        ))}

        {thinking && (
          <div className="flex justify-start">
            <div className="flex items-center gap-2.5 rounded-2xl rounded-bl-md border border-line bg-surface px-4 py-3">
              <span className="text-[15px] text-muted">Thinking</span>
              <span className="flex gap-1" aria-hidden="true">
                <i className="h-1.5 w-1.5 animate-bounce rounded-full bg-accent" />
                <i className="h-1.5 w-1.5 animate-bounce rounded-full bg-accent [animation-delay:150ms]" />
                <i className="h-1.5 w-1.5 animate-bounce rounded-full bg-accent [animation-delay:300ms]" />
              </span>
              <span className="sr-only">Bubbli is thinking about your message</span>
            </div>
          </div>
        )}

        {error && (
          <p role="alert" className="rounded-xl bg-critical-bg px-4 py-3 text-center text-[15px] text-critical">
            {error}
          </p>
        )}
        <div ref={endRef} />
      </main>

      <footer className="border-t border-line px-5 py-4">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void send(input);
          }}
          className="flex gap-2"
        >
          <input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask me anything"
            aria-label="Your message"
            // 16px avoids the mobile zoom-on-focus jump.
            className="min-h-12 flex-1 rounded-2xl border border-line bg-surface px-4 text-[16px] text-ink placeholder:text-subtle transition-colors duration-150 hover:border-line-strong focus:border-accent focus:outline-none"
          />
          <button
            type="submit"
            disabled={thinking || !input.trim()}
            className="min-h-12 rounded-2xl bg-accent px-6 text-[16px] font-medium text-on-accent transition-all duration-150 ease-[var(--ease-out-quart)] hover:-translate-y-0.5 hover:bg-accent-hover active:translate-y-0 disabled:opacity-40 disabled:hover:translate-y-0"
          >
            Send
          </button>
        </form>
      </footer>
    </div>
  );
}
