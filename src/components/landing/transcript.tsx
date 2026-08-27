'use client';

/**
 * The Margin: a conversation, annotated by the safety layer.
 *
 * The page's argument is a demonstration rather than a claim. Every competitor
 * says "safe AI for children"; showing the machinery decide, turn by turn — and
 * showing it decide something uncomfortable — is the part that cannot be written
 * by someone who has not built it.
 *
 * TWO THINGS HERE ARE DELIBERATE AND SHOULD NOT BE "TIDIED":
 *
 * 1. The sample is labelled as an example INSIDE the block, and no child is
 *    named. The previous landing card said "What a parent sees" above a
 *    plausible chat, and a guardian who reached it signed out read it as their
 *    own child's conversation. Nothing leaked — this file makes no database
 *    calls and never will — but on a child-safety product, ambiguity about
 *    whose conversation you are reading is the worst available ambiguity.
 *
 * 2. The crisis turn is hidden until asked for. It is the most persuasive thing
 *    on the page and the heaviest, so a visitor chooses to see it. The control
 *    names what it will show, because "see more" would not be an informed choice.
 */
import { useState } from 'react';

interface Turn {
  from: 'child' | 'bubbli';
  text: string;
  crisis?: boolean;
}

interface Note {
  tier: string;
  tone: 'info' | 'low' | 'critical';
  body: string;
}

const OPENING: { turns: Turn[]; note: Note }[] = [
  {
    turns: [
      { from: 'child', text: 'Why is the sky blue?' },
      {
        from: 'bubbli',
        text: 'Sunlight is made of lots of colours, and blue bounces around in the air the most — a bit like a ping-pong ball in a crowd. Can you think of a time the sky was not blue?',
      },
    ],
    note: {
      tier: 'Passed',
      tone: 'info',
      body: 'Ordinary curiosity. Answered, and never shown to a parent.',
    },
  },
  {
    turns: [
      { from: 'child', text: 'what is sexx' },
      {
        from: 'bubbli',
        text: "That's a good question to ask a grown-up you trust — a parent, or a teacher. They'll give you the best answer. Is there something else you're curious about?",
      },
    ],
    note: {
      tier: 'Recorded',
      tone: 'low',
      body: 'A parent is told that this came up — not the words. Theirs to raise, gently.',
    },
  },
];

const CRISIS: { turns: Turn[]; note: Note } = {
  turns: [
    { from: 'child', text: "i don't want to be here anymore" },
    {
      from: 'bubbli',
      crisis: true,
      text: 'Thank you for telling me. That took courage, and what you are feeling really matters. Please talk to a grown-up you trust right now. You can call or text 988, any time.',
    },
  ],
  note: {
    tier: "You're told now",
    tone: 'critical',
    body: 'Emailed within seconds, and the transcript opens. Help was shown to them before anything was written down.',
  },
};

const TONE: Record<Note['tone'], string> = {
  info: 'text-info border-line',
  low: 'text-low border-low',
  critical: 'text-critical border-critical',
};

function Exchange({ turns, note }: { turns: Turn[]; note: Note }) {
  return (
    <div className="grid gap-4 border-t border-line py-6 first:border-t-0 md:grid-cols-[minmax(0,1fr)_15rem]">
      <div className="space-y-2">
        {turns.map((t, i) =>
          t.from === 'child' ? (
            <p
              key={i}
              className="ml-auto w-fit max-w-[85%] rounded-3xl rounded-br-md bg-accent-soft px-4 py-2.5 text-[15px] leading-relaxed text-ink"
            >
              {t.text}
            </p>
          ) : (
            <p
              key={i}
              className={`w-fit max-w-[92%] rounded-3xl rounded-bl-md border px-4 py-2.5 text-[15px] leading-relaxed text-ink ${
                t.crisis ? 'border-critical bg-critical-bg' : 'border-line bg-surface'
              }`}
            >
              {t.crisis && (
                <span className="mb-1.5 block font-mono text-[10px] uppercase tracking-[0.14em] text-critical">
                  Please read this
                </span>
              )}
              {t.text}
            </p>
          ),
        )}
      </div>

      {/* The margin. On mobile it follows the turn it describes rather than
          floating to the end, so the pairing survives one column. */}
      <aside className={`border-l-2 pl-4 ${TONE[note.tone]} md:mt-1`}>
        <span className="font-mono text-[9.5px] uppercase tracking-[0.16em]">{note.tier}</span>
        <p className="mt-2 text-[13px] leading-relaxed text-muted">{note.body}</p>
      </aside>
    </div>
  );
}

export function Transcript() {
  const [showCrisis, setShowCrisis] = useState(false);

  return (
    <section aria-label="An example conversation" className="mt-14">
      {/* Labelled inside the block, not in fine print. */}
      <p className="mb-5 flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-line pb-3">
        <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-accent">
          An example
        </span>
        <span className="text-[13px] text-subtle">
          Not a real family. Nobody&apos;s conversation is shown on this page.
        </span>
      </p>

      {OPENING.map((x, i) => (
        <Exchange key={i} {...x} />
      ))}

      {showCrisis ? (
        <Exchange {...CRISIS} />
      ) : (
        <div className="border-t border-line py-6">
          <button
            type="button"
            onClick={() => setShowCrisis(true)}
            className="min-h-12 w-full rounded-2xl border border-dashed border-line-strong px-5 py-3 text-left transition-colors duration-150 hover:border-accent"
          >
            <span className="block text-[15px] text-ink">
              Show me what happens in an emergency
            </span>
            <span className="mt-1 block text-[13px] text-subtle">
              A message about self-harm, and everything Bubbli does with it.
            </span>
          </button>
        </div>
      )}
    </section>
  );
}
