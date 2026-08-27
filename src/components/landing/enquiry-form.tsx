'use client';

/**
 * Self-hosting enquiry.
 *
 * Labels are visible, not placeholders — a placeholder disappears the moment
 * someone types, which is when they most need to know what the field was for.
 * Errors sit beside their field and name a recovery, and the first invalid
 * field takes focus so a keyboard user is not hunting.
 */
import { useRef, useState } from 'react';

const field =
  'mt-1.5 min-h-12 w-full rounded-xl border border-line bg-surface px-4 py-2.5 text-[16px] text-ink placeholder:text-subtle transition-colors duration-150 hover:border-line-strong focus:border-accent focus:outline-none';
const label = 'font-mono text-[10px] uppercase tracking-[0.16em] text-subtle';

export function EnquiryForm() {
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);

    const data = Object.fromEntries(new FormData(e.currentTarget));
    const res = await fetch('/api/enquiry', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(data),
    });
    const body = (await res.json().catch(() => null)) as
      | { error?: string; field?: string }
      | null;
    setBusy(false);

    if (!res.ok) {
      setError(body?.error ?? 'Something went wrong. Please try again.');
      // Put the cursor where the problem is.
      if (body?.field) {
        formRef.current?.querySelector<HTMLElement>(`[name="${body.field}"]`)?.focus();
      }
      return;
    }
    setSent(true);
  }

  if (sent) {
    return (
      <div
        role="status"
        className="rounded-2xl border border-accent bg-accent-soft px-6 py-8 text-center"
      >
        <p className="font-[family-name:var(--font-display)] text-[22px] text-ink">
          Thank you — that reached us.
        </p>
        <p className="mt-2 text-[14px] text-muted">
          We read every one of these ourselves. Expect a reply from a person, not a sequence.
        </p>
      </div>
    );
  }

  return (
    <form ref={formRef} onSubmit={submit} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className={label}>Your name</span>
          <input name="name" required maxLength={80} autoComplete="name" className={field} />
        </label>
        <label className="block">
          <span className={label}>Email</span>
          <input
            name="email"
            type="email"
            required
            maxLength={160}
            autoComplete="email"
            className={field}
          />
        </label>
      </div>

      <label className="block">
        <span className={label}>School, clinic or organisation</span>
        <input name="organisation" maxLength={120} autoComplete="organization" className={field} />
      </label>

      <label className="block">
        <span className={label}>What are you trying to do?</span>
        <textarea
          name="message"
          required
          rows={4}
          maxLength={4000}
          className={`${field} resize-y`}
        />
        <span className="mt-1.5 block text-[12px] text-subtle">
          Who you look after, and anything your setting requires of the guardrails.
        </span>
      </label>

      {error && (
        <p role="alert" className="rounded-xl bg-critical-bg px-4 py-3 text-[15px] text-critical">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={busy}
        className="min-h-12 w-full rounded-xl border border-line-strong px-5 text-[16px] text-ink transition-all duration-150 ease-[var(--ease-spring)] hover:-translate-y-0.5 hover:border-accent hover:text-accent active:translate-y-0 disabled:text-subtle disabled:hover:translate-y-0"
      >
        {busy ? 'Sending…' : 'Send'}
      </button>
    </form>
  );
}
