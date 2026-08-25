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
    <main className="relative z-10 mx-auto max-w-2xl px-6 py-14">
      <a href="/parent" className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted hover:text-accent">
        ← Dashboard
      </a>
      <h1 className="mt-4 text-[clamp(1.5rem,3.5vw,2rem)]">Conversation</h1>
      <p className="mt-2 text-[13px] text-muted">
        Opening this was recorded. Other guardians can see that record.
      </p>

      <div className="mt-10 space-y-3">
        {messages.map((m) => (
          <div key={m.id} className={m.role === 'child' ? 'flex justify-end' : 'flex justify-start'}>
            <div
              className={[
                'max-w-[85%] whitespace-pre-wrap px-4 py-3 text-[15px] leading-relaxed',
                m.role === 'child' ? 'bg-raised text-ink' : 'border border-line bg-surface text-ink',
                m.flagged ? 'border-l-2 border-l-critical' : '',
              ].join(' ')}
            >
              {m.flagged && (
                <p className="mb-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-critical">
                  Flagged
                </p>
              )}
              {m.content}
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}
