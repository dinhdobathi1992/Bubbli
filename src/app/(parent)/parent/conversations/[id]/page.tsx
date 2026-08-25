import { pool } from '@/lib/db/client';
import { getSession } from '@/lib/auth/request-session';
import { getTranscript, auditDenied } from '@/lib/parent/transcript';
import { notFound } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default async function TranscriptPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSession();
  if (!session) notFound();

  // Every denial reason is a 404. A distinct 403 would confirm the conversation
  // exists and sits below the gate, which is a behavioural oracle over a child
  // whose content the parent was promised no access to.
  let messages;
  try {
    messages = await getTranscript(pool, session, id);
  } catch {
    await auditDenied(pool, session, id).catch(() => undefined);
    notFound();
  }

  return (
    <main className="mx-auto max-w-2xl px-6 py-12 text-[#1a1815]">
      <a href="/parent" className="text-sm text-[#b8232c] underline">
        Back to dashboard
      </a>
      <h1 className="mt-4 font-serif text-2xl">Conversation</h1>
      <p className="mt-1 text-xs text-[#6b6258]">
        Opening this was recorded. Other guardians on your family can see that record.
      </p>

      <div className="mt-8 space-y-3">
        {messages.map((m) => (
          <div key={m.id} className={m.role === 'child' ? 'flex justify-end' : 'flex justify-start'}>
            <div
              className={[
                'max-w-[85%] whitespace-pre-wrap px-4 py-3 text-[15px] leading-relaxed',
                m.role === 'child' ? 'bg-[#efe9dd]' : 'border border-[#e6ded0] bg-white',
                m.flagged ? 'border-l-2 border-l-[#b8232c]' : '',
              ].join(' ')}
            >
              {m.content}
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}
