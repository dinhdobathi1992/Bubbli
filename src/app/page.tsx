import Link from 'next/link';
import { BubbliMark } from '@/components/bubbli-mark';
import { Doors } from '@/components/landing/doors';
import { Transcript } from '@/components/landing/transcript';
import { Pricing } from '@/components/landing/pricing';

/**
 * Landing — "The Margin".
 *
 * The page this replaced was a ROUTER, not a pitch: it opened with "I'm a child
 * / I'm a parent" and assumed the visitor already knew what Bubbli was. The
 * sharpest sentence the product owns — visibility into unsafe interactions
 * WITHOUT exposing benign conversations (PRD §1) — appeared nowhere on it.
 *
 * A landing page converts, and the converting audience is the parent: they
 * decide, they consent, and under COPPA they must. So the page argues to them,
 * and a returning child gets a quiet door rather than half the hero.
 *
 * The argument is a demonstration. A transcript runs down the centre and the
 * safety layer narrates each turn in the margin. Nothing is claimed that is not
 * shown happening — and nothing shown is real: see the note in transcript.tsx.
 */
export default function Home() {
  return (
    <div className="relative flex min-h-dvh flex-col">
      <div aria-hidden="true" className="hero-light pointer-events-none absolute inset-0 z-0" />

      <header className="relative z-10 border-b border-line">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-4 px-6 py-4">
          <span className="flex items-center gap-2.5">
            <BubbliMark size={22} className="text-accent" />
            <span className="font-mono text-[11px] uppercase tracking-[0.22em] text-muted">
              Bubbli
            </span>
          </span>
          <Doors />
        </div>
      </header>

      <main className="relative z-10 mx-auto w-full max-w-5xl flex-1 px-6 py-16">
        {/* No measure on this wrapper. A `ch` limit is computed against the BODY
            font size, so putting one here squeezed a 60px display face into a
            501px column and broke the headline across four lines with the
            italic split. The measure belongs on the prose below, and the
            headline is broken where it should break by an explicit <br />. */}
        <div>
          <h1 className="text-[clamp(2.25rem,5.5vw,3.75rem)] leading-[1.05] tracking-[-0.025em]">
            Your child can ask anything.
            <br />
            You&apos;ll only see <span className="italic text-accent">what matters.</span>
          </h1>
          <p className="mt-6 max-w-[48ch] text-[19px] leading-[1.6] text-muted">
            Bubbli answers like a patient teacher. A safety layer reads every message — and tells
            you only when something could genuinely hurt them.
          </p>

          <div className="mt-9 flex flex-wrap items-center gap-4">
            <Link
              href="/parent/sign-in"
              className="inline-flex min-h-14 items-center rounded-2xl bg-accent px-7 text-[17px] font-medium text-on-accent transition-all duration-150 ease-[var(--ease-spring)] hover:-translate-y-0.5 hover:bg-accent-hover active:translate-y-0 active:scale-[0.98]"
            >
              Start free — it&apos;s in beta
            </Link>
            <span className="text-[14px] text-subtle">
              No card. Your child never needs an email address.
            </span>
          </div>
        </div>

        <Transcript />

        <div className="mt-12 flex flex-wrap items-center justify-between gap-6 border-t border-line pt-8">
          <p className="max-w-[42ch] font-[family-name:var(--font-display)] text-[19px] leading-snug">
            Three messages. One reached a parent.
            <br />
            That ratio <span className="italic text-accent">is</span> the product.
          </p>
          <Link
            href="/safety"
            className="text-[14px] text-muted underline decoration-line underline-offset-4 transition-colors duration-150 hover:text-accent hover:decoration-accent"
          >
            How Bubbli keeps a child safe
          </Link>
        </div>
        <Pricing />
      </main>

      <footer className="relative z-10 border-t border-line">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-6 py-5 text-[12px] text-subtle">
          <span>A safety helper reads messages. Ordinary conversations stay private.</span>
          <span className="font-mono uppercase tracking-[0.16em]">Built for ages 4&ndash;15</span>
        </div>
      </footer>
    </div>
  );
}
