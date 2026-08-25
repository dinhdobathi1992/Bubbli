/**
 * The safety disclosure (D3).
 *
 * The child is TOLD the safety layer exists. Opacity fails permanently the
 * first time a child feels surveilled, and a parent raising a flagged
 * conversation with a child who never knew is exactly that moment.
 */
export const metadata = { title: 'How Bubbli keeps you safe' };

export default function SafetyPage() {
  return (
    <main className="mx-auto max-w-2xl px-6 py-14 text-[#1a1815]">
      <h1 className="font-serif text-3xl">How Bubbli keeps you safe</h1>

      <div className="mt-8 space-y-6 text-[15px] leading-relaxed">
        <section>
          <h2 className="font-serif text-xl">A safety helper reads messages</h2>
          <p className="mt-2 text-[#4a443c]">
            Every message you send, and every answer Bubbli gives, is checked by a safety helper
            first. It is looking for things that could hurt you.
          </p>
        </section>

        <section>
          <h2 className="font-serif text-xl">Some things I cannot talk about</h2>
          <p className="mt-2 text-[#4a443c]">
            If you ask about something unsafe, I will say I cannot help with it and suggest
            something else. You are not in trouble when that happens.
          </p>
        </section>

        <section>
          <h2 className="font-serif text-xl">Sometimes a grown-up is told</h2>
          <p className="mt-2 text-[#4a443c]">
            If something looks like it could really hurt you, a grown-up in your family is told so
            they can help. Ordinary chats — homework, stories, questions about the world — stay
            between you and me. They are not shown to anyone.
          </p>
        </section>

        <section className="border-l-2 border-[#b8232c] pl-4">
          <h2 className="font-serif text-xl">If something feels wrong</h2>
          <p className="mt-2 text-[#4a443c]">
            Tell a grown-up you trust. If you need to talk to someone right now, you can call or
            text <strong>988</strong> and a kind person will answer.
          </p>
        </section>
      </div>

      <a href="/chat" className="mt-10 inline-block text-sm text-[#b8232c] underline">
        Back to chat
      </a>
    </main>
  );
}
