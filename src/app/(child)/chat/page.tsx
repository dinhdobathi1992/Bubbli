/**
 * Child chat entry point.
 *
 * A server component so the child's name is resolved from the opaque session
 * rather than fetched by the client, and so an unauthenticated visitor is sent
 * to sign in immediately. Previously the page rendered for anyone and only
 * failed on the first send, which read as the app being broken.
 */
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth/request-session';
import { pool } from '@/lib/db/client';
import { ChatClient } from '@/components/chat/chat-client';

export const dynamic = 'force-dynamic';

export default async function ChatPage() {
  const session = await getSession();
  if (!session || session.principalType !== 'child' || !session.childId) redirect('/login');

  const r = await pool.query<{ display_name: string }>(
    `select display_name from children where id = $1`,
    [session.childId],
  );

  return <ChatClient childName={r.rows[0]?.display_name ?? null} />;
}
