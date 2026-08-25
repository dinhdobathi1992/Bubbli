'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Child sign-in.
 *
 * Three fields is already a lot for a seven-year-old, so each one gets a plain
 * label, a real hint, and a 48px target. Nothing here explains PINs or family
 * codes in security language.
 */
export default function ChildLogin() {
  const router = useRouter();
  const [familyId, setFamilyId] = useState('');
  const [name, setName] = useState('');
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);

    const res = await fetch('/api/child/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ familyId, name, pin }),
    }).catch(() => null);

    setBusy(false);
    if (res?.ok) {
      router.push('/chat');
      return;
    }
    // A non-OK response may carry no body at all. Assuming JSON here turned a
    // server fault into a client crash that hid the real error.
    const message = res
      ? await res.json().then((d: { error?: string }) => d.error).catch(() => null)
      : null;
    setError(message ?? 'That did not work. Ask a grown-up for help.');
  }

  const field =
    'mt-2 min-h-12 w-full rounded-xl border border-line bg-ground px-4 text-[16px] text-ink ' +
    'placeholder:text-subtle transition-colors duration-150 hover:border-line-strong ' +
    'focus:border-accent focus:outline-none';

  return (
    <main className="relative z-10 flex min-h-dvh items-center justify-center px-5 py-10">
      {/* A card, not a column of text on an empty field. A child arriving
          should see one clear object to fill in. */}
      <div className="w-full max-w-[26rem] rounded-3xl border border-line bg-surface px-7 py-9 sm:px-9 sm:py-11">
        <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-subtle">Bubbli</p>
        <h1 className="mt-3 text-[clamp(1.85rem,6vw,2.4rem)]">Hello!</h1>
        <p className="mt-2 text-[16px] text-muted">Sign in to talk with Bubbli.</p>

      <form onSubmit={submit} className="mt-8 space-y-5">
        <label className="block">
          <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted">
            Family code
          </span>
          <input
            value={familyId}
            onChange={(e) => setFamilyId(e.target.value)}
            required
            autoComplete="off"
            placeholder="From your grown-up"
            className={field}
          />
        </label>

        <label className="block">
          <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted">
            Your name
          </span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            autoComplete="off"
            placeholder="Emma"
            className={field}
          />
        </label>

        <label className="block">
          <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted">
            Your PIN
          </span>
          <input
            type="password"
            inputMode="numeric"
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            required
            autoComplete="off"
            placeholder="Six numbers"
            className={field}
          />
        </label>

        {error && (
          <p
            role="alert"
            className="rounded-xl bg-critical-bg px-4 py-3 text-[15px] text-critical"
          >
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={busy}
          className="min-h-12 w-full rounded-2xl bg-accent text-[16px] font-medium text-on-accent transition-all duration-150 ease-[var(--ease-out-quart)] hover:-translate-y-0.5 hover:bg-accent-hover active:translate-y-0 disabled:opacity-50 disabled:hover:translate-y-0"
        >
          {busy ? 'Checking…' : 'Start'}
        </button>
      </form>

        <a
          href="/safety"
          className="mt-8 block text-center text-sm text-muted underline underline-offset-4 hover:text-accent"
        >
          How Bubbli keeps you safe
        </a>
      </div>
    </main>
  );
}
