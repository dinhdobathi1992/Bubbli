import Link from 'next/link';
import { BubbliMark } from '@/components/bubbli-mark';

/**
 * Landing.
 *
 * The visual motif is the product's actual idea, not decoration: a dashed rule
 * with the child's world above it and what a parent sees below. It is the same
 * device used on the parent dashboard, so the brand and the mechanism are the
 * same shape. Swap the product name and the motif stops making sense — which is
 * the test of whether a concept exists at all.
 *
 * The page is RAILED — a hairline top and bottom — because the composition
 * previously floated in the middle of the viewport with dead margin on all four
 * sides. Rails turn that emptiness into deliberate negative space by giving it
 * edges to be measured against.
 */
export default function Home() {
  return (
    <div className="relative flex min-h-dvh flex-col">
      <div aria-hidden="true" className="hero-light pointer-events-none absolute inset-0 z-0" />

      <header className="relative z-10 border-b border-line">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
          <span className="flex items-center gap-2.5">
            <BubbliMark size={22} className="text-accent" />
            <span className="font-mono text-[11px] uppercase tracking-[0.22em] text-muted">
              Bubbli
            </span>
          </span>
          <Link
            href="/safety"
            className="text-[13px] text-muted underline decoration-line underline-offset-4 transition-colors duration-150 hover:text-accent hover:decoration-accent"
          >
            How Bubbli keeps you safe
          </Link>
        </div>
      </header>

      <main className="relative z-10 mx-auto grid w-full max-w-6xl flex-1 items-center gap-14 px-6 py-16 lg:grid-cols-[1.05fr_0.95fr] lg:gap-24">
        <div className="rise">
          <h1 className="text-[clamp(2.5rem,6vw,4.25rem)] leading-[1.04] tracking-[-0.028em]">
            A place to be curious,
            <br />
            <span className="italic text-accent">safely.</span>
          </h1>

          <p className="mt-6 max-w-[46ch] text-[19px] leading-[1.6] text-muted">
            Ask anything. A safety helper checks every message, and a grown-up is told only if
            something could really hurt you.
          </p>

          <div className="mt-10 flex flex-wrap gap-3">
            <Link
              href="/login"
              className="inline-flex min-h-14 items-center rounded-2xl bg-accent px-7 text-[17px] font-medium text-on-accent transition-all duration-150 ease-[var(--ease-spring)] hover:-translate-y-0.5 hover:bg-accent-hover active:translate-y-0 active:scale-[0.98]"
            >
              I&apos;m a child
            </Link>
            <Link
              href="/parent"
              className="inline-flex min-h-14 items-center rounded-2xl border border-line-strong bg-surface px-7 text-[17px] text-ink transition-all duration-150 ease-[var(--ease-spring)] hover:-translate-y-0.5 hover:border-ink active:translate-y-0 active:scale-[0.98]"
            >
              I&apos;m a parent
            </Link>
          </div>
        </div>

        {/* The gate, drawn. Above it is the child's; below it is what a parent
            is shown. The dashed rule spans the full card edge to edge, so it
            reads as a DIVISION of the object rather than a labelled row inside it. */}
        <figure className="rise overflow-hidden rounded-3xl border border-line bg-surface [animation-delay:120ms]">
          <div className="px-7 pt-7">
            <figcaption className="font-mono text-[10px] uppercase tracking-[0.18em] text-subtle">
              What a parent sees
            </figcaption>

            <div className="mt-6 space-y-2" aria-hidden="true">
              <div className="ml-auto w-fit max-w-[85%] rounded-2xl rounded-br-md bg-accent-soft px-4 py-2.5 text-[14px] text-ink">
                Why is the sky blue?
              </div>
              <div className="w-fit max-w-[90%] rounded-2xl rounded-bl-md border border-line bg-raised px-4 py-2.5 text-[14px] text-ink">
                Blue light scatters most in the air.
              </div>
            </div>

            <p className="mt-4 pb-7 text-[13px] text-subtle">Ordinary chats stay private.</p>
          </div>

          <div className="flex items-center gap-3 border-y border-dashed border-accent/45 bg-accent-soft/25 px-7 py-2.5">
            <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-accent">
              The gate
            </span>
            <span className="h-px flex-1 bg-accent/30" />
            <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-subtle">
              medium and above
            </span>
          </div>

          <div className="px-7 py-7">
            <div className="border-l-2 border-l-critical bg-critical-bg px-4 py-3.5">
              <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-critical">
                Critical
              </p>
              <p className="mt-1.5 text-[14px] leading-relaxed text-ink">
                A grown-up is told, and your child is shown where to get help.
              </p>
            </div>
          </div>
        </figure>
      </main>

      <footer className="relative z-10 border-t border-line">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-6 py-5 text-[12px] text-subtle">
          <span>A safety helper reads messages. Ordinary conversations stay private.</span>
          <span className="font-mono uppercase tracking-[0.16em]">Built for ages 4&ndash;15</span>
        </div>
      </footer>
    </div>
  );
}
