'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

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
    });
    setBusy(false);
    if (res.ok) router.push('/chat');
    else setError((await res.json()).error ?? 'That did not work.');
  }

  return (
    <div className="mx-auto flex h-dvh max-w-sm flex-col justify-center bg-[#fdfbf7] px-6">
      <h1 className="font-serif text-3xl text-[#1a1815]">Hello!</h1>
      <p className="mt-2 text-sm text-[#6b6258]">Sign in to talk with Bubbli.</p>

      <form onSubmit={submit} className="mt-8 space-y-3">
        <label className="block">
          <span className="text-xs uppercase tracking-widest text-[#6b6258]">Family code</span>
          <input
            value={familyId}
            onChange={(e) => setFamilyId(e.target.value)}
            required
            className="mt-1 min-h-11 w-full border border-[#d8cfbe] bg-white px-3 text-[16px] outline-none focus-visible:border-[#1a1815]"
          />
        </label>
        <label className="block">
          <span className="text-xs uppercase tracking-widest text-[#6b6258]">Your name</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            className="mt-1 min-h-11 w-full border border-[#d8cfbe] bg-white px-3 text-[16px] outline-none focus-visible:border-[#1a1815]"
          />
        </label>
        <label className="block">
          <span className="text-xs uppercase tracking-widest text-[#6b6258]">PIN</span>
          <input
            type="password"
            inputMode="numeric"
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            required
            className="mt-1 min-h-11 w-full border border-[#d8cfbe] bg-white px-3 text-[16px] outline-none focus-visible:border-[#1a1815]"
          />
        </label>

        {error && <p className="text-sm text-[#b8232c]">{error}</p>}

        <button
          type="submit"
          disabled={busy}
          className="min-h-11 w-full bg-[#1a1815] text-[15px] text-[#fdfbf7] disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#b8232c]"
        >
          {busy ? 'Checking…' : 'Start'}
        </button>
      </form>
    </div>
  );
}
