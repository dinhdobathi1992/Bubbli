/**
 * Conversation history for the prompt.
 *
 * The reviewed prior art used `ORDER BY created_at ASC LIMIT 20`, which returns
 * the OLDEST twenty messages. Past turn twenty the model never saw anything
 * recent, so the assistant appeared to develop amnesia mid-conversation while
 * confidently recalling the opening.
 *
 * Here: newest N, reversed into chronological order for the prompt, and the
 * just-persisted child message is EXCLUDED so it is not duplicated (it is
 * passed separately as `userMessage`).
 */
import type { Pool, PoolClient } from 'pg';

export const HISTORY_TURNS = 20;

export interface HistoryMessage {
  role: 'child' | 'assistant';
  content: string;
}

export async function loadHistory(
  db: Pool | PoolClient,
  conversationId: string,
  excludeMessageId: string | null,
  limit = HISTORY_TURNS,
): Promise<HistoryMessage[]> {
  const r = await db.query(
    `select role, content
       from messages
      where conversation_id = $1
        and status = 'completed'
        and role <> 'system'
        and ($2::uuid is null or id <> $2::uuid)
      order by created_at desc, id desc
      limit $3`,
    [conversationId, excludeMessageId, limit],
  );
  // Newest-first from SQL, reversed so the prompt reads chronologically.
  return r.rows.reverse().map((x: { role: string; content: string }) => ({
    role: x.role === 'child' ? 'child' : 'assistant',
    content: x.content,
  }));
}
