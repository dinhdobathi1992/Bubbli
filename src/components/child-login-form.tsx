'use client';

/**
 * Child sign-in.
 *
 * Three ways in, in order of how often they should be used:
 *   1. a remembered device — tap to continue, nothing typed;
 *   2. a family link — name and PIN only;
 *   3. a family code typed by hand — the fallback on a new device.
 *
 * The family field previously asked for a 36-character UUID. It now takes a
 * short code, and is hidden entirely when the family is already known.
 */
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { BubbliMark } from '@/components/bubbli-mark';

const field =
  'mt-1.5 min-h-12 w-full rounded-xl border border-line bg-surface px-4 text-[16px] text-ink placeholder:text-subtle transition-colors duration-150 hover:border-line-strong focus:border-accent focus:outline-none';
const label = 'font-mono text-[11px] uppercase tracking-[0.14em] text-muted';

export default function ChildLoginForm({
  presetFamily,
  hasPairedDevice = false,
}: {
  presetFamily?: string;
  hasPairedDevice?: boolean;
}) {
  const [family, setFamily] = useState(presetFamily ?? '');
  const [name, setName] = useState('');
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resuming, setResuming] = useState(false);
  const router = useRouter();

  // A paired device offers to continue. It never signs in silently: the child
  // should see that this device belongs to them before tapping.
  //
  // Detected on the SERVER and passed in. The device cookie is httpOnly, so
  // `document.cookie` cannot see it — reading it from the client was dead code
  // that would have hidden this option from every paired device.
  const [deviceReady, setDeviceReady] = useState(hasPairedDevice);

  async function resume() {
    setResuming(true);
    setError(null);
    const res = await fetch('/api/child/resume', { method: 'POST' });
    setResuming(false);
    if (!res.ok) {
      setDeviceReady(false);
      setError('This device needs setting up again. Ask a grown-up.');
      return;
    }
    router.push('/chat');
    router.refresh();
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await fetch('/api/child/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ family: family.trim(), name: name.trim(), pin }),
    });
    const data = await res.json().catch(() => null);
    setBusy(false);
    if (!res.ok) {
      setError(data?.error ?? 'That did not work. Ask a grown-up for help.');
      return;
    }
    router.push('/chat');
    router.refresh();
  }

  return (
    <main className="relative z-10 flex min-h-dvh items-center justify-center px-5 py-10">
      <div className="w-full max-w-[26rem]">
        <div className="rounded-3xl border border-line bg-surface px-7 py-9 sm:px-9">
          <span className="flex items-center gap-2.5">
            <BubbliMark size={22} className="text-accent" />
            <span className="font-mono text-[11px] uppercase tracking-[0.22em] text-muted">
              Bubbli
            </span>
          </span>

          <h1 className="mt-5 text-[clamp(1.75rem,5vw,2.2rem)]">
            Hello<span className="italic text-accent">!</span>
          </h1>
          <p className="mt-2 text-[16px] text-muted">Sign in to talk with Bubbli.</p>

          {deviceReady && (
            <button
              type="button"
              onClick={() => void resume()}
              disabled={resuming}
              className="mt-6 min-h-14 w-full rounded-2xl bg-accent text-[17px] font-medium text-on-accent transition-all duration-150 ease-[var(--ease-spring)] hover:-translate-y-0.5 hover:bg-accent-hover active:translate-y-0 active:scale-[0.98]"
            >
              {resuming ? 'One moment…' : 'Continue on this device'}
            </button>
          )}

          <form onSubmit={submit} className={deviceReady ? 'mt-7 border-t border-line pt-6' : 'mt-7'}>
            {deviceReady && (
              <p className="mb-5 text-center text-[13px] text-subtle">or sign in with your PIN</p>
            )}

            {!presetFamily && (
              <label className="mb-4 block">
                <span className={label}>Family code</span>
                <input
                  required
                  maxLength={12}
                  autoComplete="off"
                  value={family}
                  onChange={(e) => setFamily(e.target.value.toUpperCase())}
                  placeholder="ABCD-1234"
                  className={`${field} font-mono tracking-[0.18em]`}
                />
              </label>
            )}

            <label className="block">
              <span className={label}>Your name</span>
              <input
                required
                maxLength={40}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Emma"
                className={field}
              />
            </label>

            <label className="mt-4 block">
              <span className={label}>Your PIN</span>
              <input
                type="password"
                inputMode="numeric"
                required
                maxLength={12}
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
                placeholder="••••••"
                className={`${field} font-mono tracking-[0.3em]`}
              />
            </label>

            {error && (
              <p role="alert" className="mt-5 rounded-xl bg-critical-bg px-4 py-3 text-[15px] text-critical">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={busy || !family.trim() || !name.trim() || pin.length < 4}
              className="mt-6 min-h-12 w-full rounded-xl bg-accent text-[16px] font-medium text-on-accent transition-all duration-150 ease-[var(--ease-spring)] hover:-translate-y-0.5 hover:bg-accent-hover active:translate-y-0 disabled:border disabled:border-line disabled:bg-transparent disabled:text-subtle disabled:hover:translate-y-0"
            >
              {busy ? 'One moment…' : 'Start'}
            </button>
          </form>
        </div>

        <p className="mt-6 text-center text-[13px] text-subtle">
          <Link href="/pair" className="underline underline-offset-4 hover:text-accent">
            Set up a new device
          </Link>
          {' · '}
          <Link href="/parent/sign-in" className="underline underline-offset-4 hover:text-accent">
            I&apos;m a grown-up
          </Link>
        </p>
      </div>
    </main>
  );
}
