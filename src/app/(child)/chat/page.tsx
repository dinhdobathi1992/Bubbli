'use client';

/**
 * The child chat screen.
 *
 * D4: responses are BUFFERED. The loading state is honest — a designed waiting
 * state, never a simulated token stream of text that is already complete. The
 * reviewed prior art buffered the full response and then replayed it in
 * five-word chunks with no delay, which is theatre.
 */
import { useEffect, useRef, useState } from 'react';

interface Msg {
  id: string;
  role: 'child' | 'assistant';
  content: string;
  crisis?: boolean;
  blocked?: boolean;
}

export default function ChatPage() {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [thinking, setThinking] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, thinking]);

  async function send() {
    const text = input.trim();
    if (!text || thinking) return;

    setInput('');
    setError(null);
    setMessages((m) => [...m, { id: crypto.randomUUID(), role: 'child', content: text }]);
    setThinking(true);

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          conversationId,
          content: text,
          // Generated client-side and stable for this send, so a retry
          // deduplicates instead of producing a second flag.
          idempotencyKey: crypto.randomUUID(),
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? 'Something went wrong.');
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
    }
  }

  return (
    <div className="mx-auto flex h-dvh max-w-2xl flex-col bg-[#fdfbf7]">
      <header className="flex items-center justify-between border-b border-[#e6ded0] px-5 py-4">
        <span className="font-serif text-xl tracking-tight text-[#1a1815]">Bubbli</span>
        <a
          href="/safety"
          className="rounded-full border border-[#d8cfbe] px-3 py-1.5 text-xs text-[#6b6258] transition-colors hover:border-[#1a1815] hover:text-[#1a1815] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#b8232c]"
        >
          How you&apos;re kept safe
        </a>
      </header>

      <main className="flex-1 space-y-4 overflow-y-auto px-5 py-6">
        {messages.length === 0 && (
          <div className="pt-10 text-center">
            <p className="font-serif text-2xl text-[#1a1815]">Hello! What shall we learn about?</p>
            <p className="mt-2 text-sm text-[#6b6258]">
              Ask me anything. A safety helper reads messages to keep you safe.
            </p>
          </div>
        )}

        {messages.map((m) => (
          <div key={m.id} className={m.role === 'child' ? 'flex justify-end' : 'flex justify-start'}>
            <div
              className={[
                'max-w-[85%] whitespace-pre-wrap px-4 py-3 text-[15px] leading-relaxed',
                m.role === 'child'
                  ? 'bg-[#efe9dd] text-[#1a1815]'
                  : m.crisis
                    ? 'border-l-2 border-[#b8232c] bg-white text-[#1a1815]'
                    : 'border border-[#e6ded0] bg-white text-[#1a1815]',
              ].join(' ')}
            >
              {m.content}
            </div>
          </div>
        ))}

        {thinking && (
          <div className="flex justify-start">
            <div className="flex items-center gap-2 border border-[#e6ded0] bg-white px-4 py-3">
              <span className="text-[15px] text-[#6b6258]">Thinking</span>
              <span className="flex gap-1" aria-hidden>
                <i className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#6b6258]" />
                <i className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#c9c0b1] [animation-delay:150ms]" />
                <i className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#c9c0b1] [animation-delay:300ms]" />
              </span>
              <span className="sr-only">Bubbli is thinking about your message</span>
            </div>
          </div>
        )}

        {error && <p className="text-center text-sm text-[#b8232c]">{error}</p>}
        <div ref={endRef} />
      </main>

      <footer className="border-t border-[#e6ded0] px-5 py-4">
        <div className="flex gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                void send();
              }
            }}
            placeholder="Ask me anything"
            aria-label="Your message"
            // 16px avoids the mobile zoom-on-focus jump.
            className="min-h-11 flex-1 border border-[#d8cfbe] bg-white px-4 text-[16px] text-[#1a1815] outline-none placeholder:text-[#a99f90] focus-visible:border-[#1a1815]"
          />
          <button
            onClick={() => void send()}
            disabled={thinking || !input.trim()}
            className="min-h-11 bg-[#1a1815] px-5 text-[15px] text-[#fdfbf7] transition-opacity disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#b8232c]"
          >
            Send
          </button>
        </div>
      </footer>
    </div>
  );
}
