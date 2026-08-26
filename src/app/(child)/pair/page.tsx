'use client';

/**
 * Set up this device.
 *
 * The child types a code their grown-up gives them, once. After that the device
 * is remembered and they tap to continue — no email address, no code relay, no
 * grown-up needed on a school morning.
 */
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { BubbliMark } from '@/components/bubbli-mark';

export default function Pair() {
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await fetch('/api/child/pair', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ code: code.trim() }),
    });
    const data = await res.json().catch(() => null);
    setBusy(false);
    if (!res.ok) {
      setError(data?.error ?? 'That code did not work. Ask a grown-up for a new one.');
      return;
    }
    router.push('/chat');
    router.refresh();
  }

  return (
    <main className="relative z-10 flex min-h-dvh items-center justify-center px-5 py-10">
      <div className="w-full max-w-[26rem] rounded-3xl border border-line bg-surface px-7 py-9 sm:px-9">
        <span className="flex items-center gap-2.5">
          <BubbliMark size={22} className="text-accent" />
          <span className="font-mono text-[11px] uppercase tracking-[0.22em] text-muted">Bubbli</span>
        </span>

        <h1 className="mt-5 text-[clamp(1.7rem,5vw,2.1rem)]">
          Set up
          <br />
          <span className="italic text-accent">this device.</span>
        </h1>
        <p className="mt-3 text-[15px] leading-relaxed text-muted">
          Ask a grown-up for your setup code. You only do this once on this device.
        </p>

        <form onSubmit={submit} className="mt-7">
          <label className="block">
            <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted">
              Setup code
            </span>
            <input
              required
              maxLength={8}
              autoComplete="off"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="ABC123"
              className="mt-1.5 min-h-14 w-full rounded-xl border border-line bg-raised px-4 text-center font-mono text-[24px] tracking-[0.28em] text-ink placeholder:text-subtle focus:border-accent focus:outline-none"
            />
          </label>

          {error && (
            <p role="alert" className="mt-5 rounded-xl bg-critical-bg px-4 py-3 text-[15px] text-critical">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={busy || code.trim().length < 6}
            className="mt-6 min-h-14 w-full rounded-2xl bg-accent text-[17px] font-medium text-on-accent transition-all duration-150 ease-[var(--ease-spring)] hover:-translate-y-0.5 hover:bg-accent-hover active:translate-y-0 active:scale-[0.98] disabled:border disabled:border-line disabled:bg-transparent disabled:text-subtle disabled:hover:translate-y-0"
          >
            {busy ? 'Setting up…' : 'Set up'}
          </button>
        </form>

        <Link
          href="/login"
          className="mt-7 block text-center text-sm text-muted underline underline-offset-4 hover:text-accent"
        >
          I have a name and PIN instead
        </Link>
      </div>
    </main>
  );
}
