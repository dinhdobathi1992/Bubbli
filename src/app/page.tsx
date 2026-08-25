import Link from 'next/link';

export default function Home() {
  return (
    <main className="mx-auto flex h-dvh max-w-xl flex-col justify-center px-6 text-[#1a1815]">
      <p className="text-xs uppercase tracking-[0.2em] text-[#6b6258]">Bubbli</p>
      <h1 className="mt-3 font-serif text-4xl leading-tight">
        A child talks freely. A parent sees only what the gate stops.
      </h1>
      <p className="mt-4 max-w-md text-[15px] text-[#6b6258]">
        An AI learning companion whose safety layer is measurable and whose parental oversight is
        auditable.
      </p>
      <div className="mt-8 flex gap-3">
        <Link href="/login" className="min-h-11 bg-[#1a1815] px-5 py-3 text-[15px] text-[#fdfbf7]">
          I&apos;m a child
        </Link>
        <Link href="/parent" className="min-h-11 border border-[#d8cfbe] px-5 py-3 text-[15px]">
          I&apos;m a parent
        </Link>
      </div>
    </main>
  );
}
