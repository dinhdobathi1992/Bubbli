export const metadata = { title: 'How Bubbli keeps you safe' };

/**
 * The safety disclosure (D3). The child is TOLD the safety layer exists.
 *
 * Written to be read BY a child, not about one: short sentences, second person,
 * and the reassurance ("you are not in trouble") placed where a worried reader
 * will actually reach it.
 */
export default function SafetyPage() {
  const sections = [
    {
      title: 'A safety helper reads messages',
      body: 'Every message you send, and every answer Bubbli gives, is checked first. It is looking for things that could hurt you.',
    },
    {
      title: 'Some things I cannot talk about',
      body: 'If you ask about something unsafe, I will say I cannot help and suggest something else. You are not in trouble when that happens.',
    },
    {
      title: 'Sometimes a grown-up is told',
      body: 'If something looks like it could really hurt you, a grown-up in your family is told so they can help. Ordinary chats — homework, stories, questions about the world — stay between you and me.',
    },
  ];

  return (
    <main className="relative z-10 mx-auto max-w-2xl px-6 py-16">
      <h1 className="text-[clamp(2rem,5vw,2.75rem)]">
        How Bubbli
        <br />
        <span className="italic text-accent">keeps you safe</span>
      </h1>

      <div className="mt-12 space-y-10">
        {sections.map((s, i) => (
          <section key={s.title} className="flex gap-5">
            <span className="font-mono text-[11px] tabular-nums text-subtle">
              {String(i + 1).padStart(2, '0')}
            </span>
            <div>
              <h2 className="text-xl">{s.title}</h2>
              <p className="mt-2 text-[16px] leading-relaxed text-muted">{s.body}</p>
            </div>
          </section>
        ))}
      </div>

      <section className="mt-12 border-l-2 border-l-critical bg-critical-bg px-5 py-5">
        <h2 className="text-xl">If something feels wrong</h2>
        <p className="mt-2 text-[16px] leading-relaxed text-ink">
          Tell a grown-up you trust. If you need to talk to someone right now, you can call or text{' '}
          <strong className="font-semibold">988</strong> and a kind person will answer.
        </p>
      </section>

      <a href="/chat" className="mt-12 inline-block text-sm text-muted underline underline-offset-4 hover:text-accent">
        Back to chat
      </a>
    </main>
  );
}
