import Link from 'next/link';
import { EnquiryForm } from './enquiry-form';

/**
 * Pricing.
 *
 * Two cards, not three. No middle tier invented to fill a grid — the asymmetry
 * is honest: one is a product, the other is a conversation.
 *
 * "Free while we're getting this right" makes beta a reason to trust rather than
 * a disclaimer. It says the safety work is unfinished, which for this product is
 * the reassuring thing to say.
 *
 * The self-host card claims only what is true TODAY. It says "designed to run
 * entirely inside your infrastructure", not "your data never leaves your
 * estate", because that second sentence describes a deployment that does not
 * exist yet.
 */
export function Pricing() {
  return (
    <section id="pricing" className="mt-20 border-t border-line pt-14">
      <div className="mx-auto max-w-[42ch] text-center">
        <h2 className="text-[clamp(1.75rem,4vw,2.5rem)] leading-[1.1]">
          Free while we&apos;re
          <br />
          <span className="italic text-accent">getting this right.</span>
        </h2>
        <p className="mt-4 text-[17px] leading-relaxed text-muted">
          Bubbli is in beta. Everything is free, and we would rather have your feedback than your
          card.
        </p>
      </div>

      <div className="mt-10 grid gap-5 md:grid-cols-2">
        <div className="rounded-3xl border border-accent bg-surface p-7">
          <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-accent">
            Beta — everyone
          </span>
          <p className="mt-3 font-[family-name:var(--font-display)] text-[2.5rem] leading-none">
            Free
          </p>
          <p className="mt-1.5 text-[13px] text-subtle">No card. No trial clock.</p>
          <ul className="mt-6 space-y-2.5 text-[15px] text-muted">
            <li>Every child in your family</li>
            <li>The full safety layer</li>
            <li>Alerts the moment they matter</li>
            <li>Delete everything, any time</li>
          </ul>
          <Link
            href="/parent/sign-in"
            className="mt-7 flex min-h-12 items-center justify-center rounded-xl bg-accent px-5 text-[16px] font-medium text-on-accent transition-all duration-150 ease-[var(--ease-spring)] hover:-translate-y-0.5 hover:bg-accent-hover active:translate-y-0"
          >
            Start free
          </Link>
        </div>

        <div className="rounded-3xl border border-line bg-surface p-7">
          <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-subtle">
            Self-hosted
          </span>
          <p className="mt-3 font-[family-name:var(--font-display)] text-[2.5rem] leading-none">
            Let&apos;s talk
          </p>
          <p className="mt-1.5 text-[13px] text-subtle">
            Schools, clinics, anyone who cannot send data out.
          </p>
          <ul className="mt-6 space-y-2.5 text-[15px] text-muted">
            <li>Designed to run entirely inside your infrastructure</li>
            <li className="text-ink">Guardrails written for your setting</li>
            <li>Your own model provider</li>
            <li>Help getting it standing up</li>
          </ul>
          <div className="mt-7">
            <EnquiryForm />
          </div>
        </div>
      </div>

      <p className="mt-6 text-center text-[13px] text-subtle">
        When beta ends we will tell you well before anything changes. Families already using Bubbli
        keep their price.
      </p>
    </section>
  );
}
