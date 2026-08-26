'use client';

/**
 * Children and their devices.
 *
 * The pairing code is shown ONCE, right after it is issued: it is stored as a
 * SHA-256 hash and cannot be recovered, so a leaked database yields no working
 * code. If the guardian loses it they issue another, which is cheap.
 */
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { AGE_BANDS } from '@/config/vocabulary';

export interface ChildRow {
  id: string;
  displayName: string;
  ageBand: string;
  devices: { id: string; label: string | null; pairedAt: string }[];
}

const field =
  'mt-1.5 min-h-11 w-full border border-line bg-surface px-3 text-[15px] text-ink placeholder:text-subtle focus:border-accent focus:outline-none';
const label = 'font-mono text-[10px] uppercase tracking-[0.16em] text-subtle';

export default function FamilyManager({ members }: { members: ChildRow[] }) {
  const [issued, setIssued] = useState<Record<string, { code: string; expiresAt: string }>>({});
  const [adding, setAdding] = useState(members.length === 0);
  const [name, setName] = useState('');
  const [band, setBand] = useState<string>('8-11');
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function issue(childId: string) {
    setError(null);
    const res = await fetch('/api/parent/devices', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ childId }),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok || !data) {
      setError('Could not create a setup code.');
      return;
    }
    setIssued((s) => ({ ...s, [childId]: { code: data.code, expiresAt: data.expiresAt } }));
  }

  async function revoke(childId: string, deviceId: string) {
    await fetch('/api/parent/devices', {
      method: 'DELETE',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ childId, deviceId }),
    });
    router.refresh();
  }

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
      setError(data?.error ?? 'Could not add that child.');
      return;
    }
    setName('');
    setPin('');
    setAdding(false);
    router.refresh();
  }

  return (
    <>
      <ul className="mt-10 space-y-4">
        {members.map((c) => (
          <li key={c.id} className="border border-line bg-surface px-5 py-4">
            <div className="flex flex-wrap items-baseline justify-between gap-3">
              <div>
                <p className="text-[17px] text-ink">{c.displayName}</p>
                <p className={label}>Ages {c.ageBand}</p>
              </div>
              <button
                type="button"
                onClick={() => void issue(c.id)}
                className="min-h-10 border border-line-strong px-3 text-[13px] text-ink transition-colors duration-150 hover:border-accent hover:text-accent"
              >
                Set up a device
              </button>
            </div>

            {issued[c.id] && (
              <div className="mt-4 border-l-2 border-l-accent bg-accent-soft px-4 py-3">
                <p className={label}>Setup code — type this on your child&apos;s device</p>
                <p className="mt-1 font-mono text-[26px] tracking-[0.26em] text-ink">
                  {issued[c.id].code}
                </p>
                <p className="mt-1.5 text-[12px] text-muted">
                  Valid until {new Date(issued[c.id].expiresAt).toLocaleTimeString()}. Shown once —
                  it is stored hashed and cannot be looked up again.
                </p>
              </div>
            )}

            {c.devices.length > 0 && (
              <ul className="mt-4 space-y-1.5 border-t border-line pt-3">
                {c.devices.map((d) => (
                  <li key={d.id} className="flex items-center justify-between gap-3 text-[13px]">
                    <span className="text-muted">
                      {d.label ?? 'A device'} · paired{' '}
                      {new Date(d.pairedAt).toLocaleDateString()}
                    </span>
                    <button
                      type="button"
                      onClick={() => void revoke(c.id, d.id)}
                      className="min-h-9 px-2 text-[12px] text-subtle underline underline-offset-4 hover:text-critical"
                    >
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>

      {error && (
        <p role="alert" className="mt-5 border-l-2 border-l-critical bg-critical-bg px-4 py-3 text-[15px] text-critical">
          {error}
        </p>
      )}

      {adding ? (
        <form onSubmit={addChild} className="mt-8 border border-line bg-surface px-5 py-5">
          <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-accent">Add a child</p>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className={label}>Name they sign in with</span>
              <input required maxLength={40} value={name} onChange={(e) => setName(e.target.value)}
                placeholder="Emma" className={field} />
            </label>
            <label className="block">
              <span className={label}>Age range</span>
              <select value={band} onChange={(e) => setBand(e.target.value)} className={field}>
                {AGE_BANDS.map((b) => (
                  <option key={b} value={b}>{b}</option>
                ))}
              </select>
            </label>
          </div>
          <label className="mt-4 block">
            <span className={label}>PIN you choose together</span>
            <input inputMode="numeric" required maxLength={12} value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
              placeholder="6 digits" className={`${field} font-mono tracking-[0.28em]`} />
          </label>
          <div className="mt-5 flex gap-2">
            <button type="submit" disabled={busy || !name.trim() || pin.length < 6}
              className="min-h-11 bg-accent px-5 text-[15px] font-medium text-on-accent transition-colors duration-150 hover:bg-accent-hover disabled:border disabled:border-line disabled:bg-transparent disabled:text-subtle">
              {busy ? 'Adding…' : 'Add child'}
            </button>
            {members.length > 0 && (
              <button type="button" onClick={() => setAdding(false)}
                className="min-h-11 border border-line px-5 text-[15px] text-muted hover:border-line-strong">
                Cancel
              </button>
            )}
          </div>
        </form>
      ) : (
        <button type="button" onClick={() => setAdding(true)}
          className="mt-8 min-h-11 border border-line-strong px-5 text-[15px] text-ink transition-colors duration-150 hover:border-accent hover:text-accent">
          Add another child
        </button>
      )}
    </>
  );
}
