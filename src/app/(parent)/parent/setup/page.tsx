'use client';

/**
 * First run for a newly-verified guardian.
 *
 * Claims the family and records consent, then adds the first child. A guardian
 * who already has a family is sent straight to the dashboard, so a reload here
 * never creates a second one.
 */
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AGE_BANDS } from '@/config/vocabulary';

const field =
  'mt-1.5 min-h-12 w-full rounded-xl border border-line bg-surface px-4 text-[16px] text-ink placeholder:text-subtle transition-colors duration-150 hover:border-line-strong focus:border-accent focus:outline-none';
const label = 'font-mono text-[11px] uppercase tracking-[0.14em] text-muted';

const BAND_HELP: Record<string, string> = {
  '4-7': 'Simplest answers, warmest tone',
  '8-11': 'Curious explanations, still gentle',
  '12': 'More detail; still under COPPA protections',
  '13-15': 'Fuller answers for a teenager',
};

export default function Setup() {
  const [joinCode, setJoinCode] = useState<string | null>(null);
  const [claiming, setClaiming] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [band, setBand] = useState<string>('8-11');
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  // Claim on arrival. The endpoint is idempotent, so this is safe to repeat.
  useEffect(() => {
    void (async () => {
      const res = await fetch('/api/parent/register', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({}),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data) {
        setError('We could not set up your family. Try signing in again.');
        setClaiming(false);
        return;
      }
      setJoinCode(data.joinCode);
      setClaiming(false);
      if (data.existing) router.replace('/parent');
    })();
  }, [router]);

  async function addChild(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await fetch('/api/parent/children', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ displayName: name.trim(), ageBand: band, pin }),
    });
    const data = await res.json().catch(() => null);
    setBusy(false);
    if (!res.ok) {
      setError(data?.error ?? 'We could not add that child.');
      return;
    }
    router.push('/parent');
    router.refresh();
  }

  if (claiming) {
    return (
      <main className="relative z-10 flex min-h-dvh items-center justify-center px-5">
        <p className="text-[15px] text-muted">Setting up your family…</p>
      </main>
    );
  }

  return (
    <main className="relative z-10 mx-auto w-full max-w-[34rem] px-5 py-14">
      <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-accent">Step 1 of 1</p>
      <h1 className="mt-3 text-[clamp(1.9rem,5vw,2.4rem)]">Add your first child</h1>
      <p className="mt-3 text-[16px] leading-relaxed text-muted">
        You choose the name they sign in with and a PIN you set together. Bubbli never asks a
        child for an email address.
      </p>

      {joinCode && (
        <div className="mt-7 rounded-2xl border border-line bg-surface px-5 py-4">
          <p className={label}>Your family code</p>
          <p className="mt-1.5 font-mono text-[24px] tracking-[0.18em] text-accent">{joinCode}</p>
          <p className="mt-2 text-[13px] text-subtle">
            Your child types this once, or you send them a link and they never type it at all.
          </p>
        </div>
      )}

      <form onSubmit={addChild} className="mt-8 space-y-5">
        <label className="block">
          <span className={label}>What should Bubbli call them?</span>
          <input
            required
            maxLength={40}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Emma"
            className={field}
          />
        </label>

        <fieldset>
          <legend className={label}>How old are they?</legend>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            {AGE_BANDS.map((b) => (
              <button
                type="button"
                key={b}
                onClick={() => setBand(b)}
                aria-pressed={band === b}
                className={`min-h-14 rounded-xl border px-4 text-left transition-colors duration-150 ${
                  band === b
                    ? 'border-accent bg-accent-soft text-ink'
                    : 'border-line bg-surface text-muted hover:border-line-strong'
                }`}
              >
                <span className="block text-[15px] font-medium text-ink">{b}</span>
                <span className="block text-[12px] text-muted">{BAND_HELP[b]}</span>
              </button>
            ))}
          </div>
        </fieldset>

        <label className="block">
          <span className={label}>A PIN you choose together</span>
          <input
            inputMode="numeric"
            required
            maxLength={12}
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
            placeholder="6 digits"
            className={`${field} font-mono tracking-[0.3em]`}
          />
          <span className="mt-1.5 block text-[12px] text-subtle">
            Not a birthday, not a run like 123456, not all the same digit.
          </span>
        </label>

        {error && (
          <p role="alert" className="rounded-xl bg-critical-bg px-4 py-3 text-[15px] text-critical">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={busy || !name.trim() || pin.length < 6}
          className="min-h-12 w-full rounded-xl bg-accent text-[16px] font-medium text-on-accent transition-all duration-150 ease-[var(--ease-spring)] hover:-translate-y-0.5 hover:bg-accent-hover active:translate-y-0 disabled:border disabled:border-line disabled:bg-transparent disabled:text-subtle disabled:hover:translate-y-0"
        >
          {busy ? 'Adding…' : 'Add child'}
        </button>
      </form>
    </main>
  );
}
