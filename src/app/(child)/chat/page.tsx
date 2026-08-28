/**
 * Child chat entry point.
 *
 * A server component so the child's name is resolved from the opaque session
 * rather than fetched by the client, and so an unauthenticated visitor is sent
 * to sign in immediately. Previously the page rendered for anyone and only
 * failed on the first send, which read as the app being broken.
 *
 * `?c=<id>` resumes a conversation. That pointer lives in the URL rather than
 * in React state because state does not survive a reload — a child sent a
 * message, refreshed, and landed on an empty greeting while their words sat
 * untouched in the database.
 *
 * The transcript is fetched HERE, on the server, for two reasons. A client
 * `useEffect` would paint the empty greeting once before the messages arrived,
 * and an id belonging to someone else would surface as a client-side error
 * instead of failing where `assertIsOwningChild` already guards it.
 */
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth/request-session';
import { pool } from '@/lib/db/client';
import { getOwnTranscript, type ChildMessage } from '@/lib/chat/child-transcript';
import { ChatClient } from '@/components/chat/chat-client';

export const dynamic = 'force-dynamic';

/** Cheap enough to run before touching the database on a junk value. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function ChatPage({
  searchParams,
}: {
  searchParams: Promise<{ c?: string }>;
}) {
  const session = await getSession();
  if (!session || session.principalType !== 'child' || !session.childId) redirect('/login');

  const r = await pool.query<{ display_name: string }>(
    `select display_name from children where id = $1`,
    [session.childId],
  );

  const { c } = await searchParams;

  // A stale bookmark, a copied link or a typo becomes a new chat, never an
  // error screen. A child should not meet a permission failure for a URL they
  // did not construct.
  let initialMessages: ChildMessage[] = [];
  let conversationId: string | null = null;
  if (c && UUID.test(c)) {
    try {
      initialMessages = await getOwnTranscript(pool, session, c);
      conversationId = c;
    } catch {
      initialMessages = [];
      conversationId = null;
    }
  }

  return (
    <ChatClient
      childName={r.rows[0]?.display_name ?? null}
      initialMessages={initialMessages}
      initialConversationId={conversationId}
    />
  );
}
