'use client';

/**
 * Parent sign-in.
 *
 * Email OTP, in two steps. No password exists to forget, reset, or leak — and
 * receiving the code re-proves control of the mailbox on every sign-in, which is
 * what makes `parents.auth_user_id` safe to trust as the guardian link.
 *
 * The parent register is denser and sharper than the child surface: this is a
 * safety instrument, and it must not read as a toy.
 */
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { authClient } from '@/lib/auth/auth-client';
import { BubbliMark } from '@/components/bubbli-mark';

const field =
  'mt-1.5 min-h-12 w-full rounded-xl border border-line bg-surface px-4 text-[16px] text-ink placeholder:text-subtle transition-colors duration-150 hover:border-line-strong focus:border-accent focus:outline-none';

export default function ParentSignIn() {
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const router = useRouter();

  async function requestCode(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error: err } = await authClient.emailOtp.sendVerificationOtp({
      email: email.trim(),
      type: 'sign-in',
    });
    setBusy(false);
    if (err) {
      setError('We could not send a code just now. Try again in a moment.');
      return;
    }
    setNotice(`We sent a 6-digit code to ${email.trim()}.`);
    setStep('code');
  }

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error: err } = await authClient.signIn.emailOtp({
      email: email.trim(),
      otp: code.trim(),
    });
    setBusy(false);
    if (err) {
      // Deliberately one message: a wrong code and an expired code must look
      // the same to someone who does not have the mailbox.
      setError('That code did not work. Check it, or ask for a new one.');
      return;
    }
    // A guardian with no family yet lands on setup; the route sorts it out.
    router.push('/parent/setup');
    router.refresh();
  }

  return (
    <main className="relative z-10 flex min-h-dvh items-center justify-center px-5 py-10">
      <div className="w-full max-w-[27rem]">
        <div className="rounded-3xl border border-line bg-surface px-7 py-9 sm:px-9">
          <span className="flex items-center gap-2.5">
            <BubbliMark size={22} className="text-accent" />
            <span className="font-mono text-[11px] uppercase tracking-[0.22em] text-muted">
              Bubbli
            </span>
          </span>

          <h1 className="mt-5 text-[clamp(1.7rem,5vw,2.1rem)]">
            {step === 'email' ? 'Parent sign-in' : 'Enter your code'}
          </h1>
          <p className="mt-2 text-[15px] leading-relaxed text-muted">
            {step === 'email'
              ? 'We email you a six-digit code. There is no password to remember.'
              : notice}
          </p>

          {step === 'email' ? (
            <form onSubmit={requestCode} className="mt-7">
              <label className="block">
                <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted">
                  Your email
                </span>
                <input
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className={field}
                />
              </label>
              <button
                type="submit"
                disabled={busy || !email.trim()}
                className="mt-6 min-h-12 w-full rounded-xl bg-accent text-[16px] font-medium text-on-accent transition-all duration-150 ease-[var(--ease-spring)] hover:-translate-y-0.5 hover:bg-accent-hover active:translate-y-0 active:scale-[0.99] disabled:border disabled:border-line disabled:bg-transparent disabled:text-subtle disabled:hover:translate-y-0"
              >
                {busy ? 'Sending…' : 'Email me a code'}
              </button>
            </form>
          ) : (
            <form onSubmit={verify} className="mt-7">
              <label className="block">
                <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted">
                  Six-digit code
                </span>
                <input
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  required
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                  placeholder="000000"
                  className={`${field} text-center font-mono text-[22px] tracking-[0.4em]`}
                />
              </label>
              <button
                type="submit"
                disabled={busy || code.length < 6}
                className="mt-6 min-h-12 w-full rounded-xl bg-accent text-[16px] font-medium text-on-accent transition-all duration-150 ease-[var(--ease-spring)] hover:-translate-y-0.5 hover:bg-accent-hover active:translate-y-0 active:scale-[0.99] disabled:border disabled:border-line disabled:bg-transparent disabled:text-subtle disabled:hover:translate-y-0"
              >
                {busy ? 'Checking…' : 'Sign in'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setStep('email');
                  setCode('');
                  setError(null);
                }}
                className="mt-3 min-h-11 w-full text-[14px] text-muted underline underline-offset-4 hover:text-accent"
              >
                Use a different email
              </button>
            </form>
          )}

          {error && (
            <p role="alert" className="mt-5 rounded-xl bg-critical-bg px-4 py-3 text-[15px] text-critical">
              {error}
            </p>
          )}
        </div>

        <p className="mt-6 text-center text-[13px] text-subtle">
          Looking for your child&apos;s sign-in?{' '}
          <Link href="/login" className="underline underline-offset-4 hover:text-accent">
            It&apos;s over here
          </Link>
          .
        </p>
      </div>
    </main>
  );
}
