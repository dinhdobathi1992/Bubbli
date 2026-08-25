/**
 * Transcript route.
 *
 * EVERY denial reason returns an identical 404: does not exist, another
 * family, and below the gate are indistinguishable. A distinct 403 would
 * confirm "this conversation exists, belongs to my child, and is below medium",
 * letting a parent assemble a behavioural profile of a child whose content they
 * were promised no access to — out of the very gate meant to deny them. The
 * distinction survives only in the audit row.
 */
import { NextResponse } from 'next/server';
import { pool } from '@/lib/db/client';
import { getSession } from '@/lib/auth/request-session';
import { getTranscript, auditDenied } from '@/lib/parent/transcript';

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });

  try {
    const messages = await getTranscript(pool, session, id);
    return NextResponse.json({ messages });
  } catch {
    await auditDenied(pool, session, id).catch(() => undefined);
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
}
