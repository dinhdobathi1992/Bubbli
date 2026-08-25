import Link from 'next/link';

/**
 * Landing.
 *
 * The visual motif is the product's actual idea, not decoration: a dashed rule
 * with the child's world above it and what a parent sees below. It is the same
 * device used on the parent dashboard, so the brand and the mechanism are the
 * same shape.
 */
export default function Home() {
  return (
    <main className="relative z-10 mx-auto grid min-h-dvh max-w-5xl items-center gap-14 px-6 py-16 lg:grid-cols-[1.1fr_0.9fr] lg:gap-20">
      <div>
        <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-subtle">Bubbli</p>

        <h1 className="mt-4 text-[clamp(2.25rem,5.5vw,3.5rem)] tracking-[-0.02em]">
          A place to be curious,
          <br />
          <span className="italic text-accent">safely.</span>
        </h1>

        <p className="mt-5 max-w-md text-[17px] leading-relaxed text-muted">
          Ask anything. A safety helper checks every message, and a grown-up is told only if
          something could really hurt you.
        </p>

        <div className="mt-9 flex flex-wrap gap-3">
          <Link
            href="/login"
            className="inline-flex min-h-12 items-center rounded-2xl bg-accent px-6 text-[16px] font-medium text-on-accent transition-transform duration-150 ease-[var(--ease-out-quart)] hover:-translate-y-0.5 active:translate-y-0"
          >
            I&apos;m a child
          </Link>
          <Link
            href="/parent"
            className="inline-flex min-h-12 items-center rounded-2xl border border-line-strong px-6 text-[16px] text-ink transition-colors duration-150 hover:border-ink"
          >
            I&apos;m a parent
          </Link>
        </div>

        <Link
          href="/safety"
          className="mt-10 inline-block text-sm text-muted underline underline-offset-4 hover:text-accent"
        >
          How Bubbli keeps you safe
        </Link>
      </div>

      {/* The gate, drawn. Above it is the child's; below it is what a parent
          is shown. Same dashed device as the dashboard. */}
      <figure className="rounded-3xl border border-line bg-surface p-7">
        <figcaption className="font-mono text-[10px] uppercase tracking-[0.16em] text-subtle">
          What a parent sees
        </figcaption>

        <div className="mt-5 space-y-2" aria-hidden="true">
          <div className="rounded-2xl rounded-br-md bg-raised px-4 py-3 text-[14px] text-muted">
            Why is the sky blue?
          </div>
          <div className="rounded-2xl rounded-bl-md border border-line px-4 py-3 text-[14px] text-muted">
            Blue light scatters most in the air.
          </div>
        </div>
        <p className="mt-3 text-[13px] text-subtle">Ordinary chats stay private.</p>

        <div className="mt-6 flex items-center gap-3">
          <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-accent">
            The gate
          </span>
          <span className="h-px flex-1 border-t border-dashed border-accent" />
        </div>

        <div className="mt-5 border-l-2 border-l-critical bg-critical-bg px-4 py-3">
          <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-critical">Critical</p>
          <p className="mt-1 text-[14px] text-ink">
            A grown-up is told, and your child is shown where to get help.
          </p>
        </div>
      </figure>
    </main>
  );
}
