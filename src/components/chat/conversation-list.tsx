'use client';

/**
 * A child's own past conversations.
 *
 * Presentational. The URL owns which conversation is active (see the chat page)
 * — holding it here too would give two sources of truth that drift.
 *
 * THERE IS NO DELETE, HIDE, RENAME, PIN OR ARCHIVE CONTROL, and its absence is
 * a decision rather than an omission. A conversation is the evidence behind a
 * guardian's alert; a child-side delete would let the flagged exchange be
 * erased before the guardian opens it, which makes the whole dashboard promise
 * conditional on the child's cooperation. Do not add one.
 */
import Link from 'next/link';
import type { ChildConversationSummary } from '@/lib/chat/child-transcript';

export interface ConversationListProps {
  conversations: ChildConversationSummary[];
  activeId: string | null;
  hasMore: boolean;
  loading: boolean;
  onOlder: () => void;
}

/**
 * Grouped against the VIEWER's midnight, not the server's. Doing this in SQL
 * would bake the server's timezone into a label a child reads.
 */
export function groupByDay(
  conversations: ChildConversationSummary[],
  now: Date = new Date(),
): Array<{ label: string; items: ChildConversationSummary[] }> {
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startOfYesterday = startOfToday - 86_400_000;

  const buckets: Record<string, ChildConversationSummary[]> = { Today: [], Yesterday: [], Earlier: [] };
  for (const c of conversations) {
    const t = new Date(c.startedAt).getTime();
    const key = t >= startOfToday ? 'Today' : t >= startOfYesterday ? 'Yesterday' : 'Earlier';
    buckets[key].push(c);
  }
  return Object.entries(buckets)
    .filter(([, items]) => items.length > 0)
    .map(([label, items]) => ({ label, items }));
}

function timeOf(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

/**
 * What a row says when the conversation is flagged.
 *
 * The endpoint withholds the excerpt for anything at or above the visibility
 * gate, so a crisis disclosure never becomes the permanent label on a child's
 * own sidebar. This fills the gap with something ordinary.
 *
 * Deliberately NOT styled as a warning. Marking the row would tell a child the
 * system noticed and filed their worst moment, which is a worse experience than
 * showing the text would have been. Only the words differ.
 *
 * The CLOCK TIME, not the part of day. A first attempt used
 * morning/afternoon/evening, which gives three possible labels: two flagged
 * conversations the same evening rendered as the same sentence, and a list with
 * two identical rows reads as broken. The time is the only distinguisher
 * available that carries none of the content.
 */
function labelFor(c: ChildConversationSummary): string {
  return c.excerpt ?? `A chat from ${timeOf(c.startedAt)}`;
}

export function ConversationList({
  conversations,
  activeId,
  hasMore,
  loading,
  onOlder,
}: ConversationListProps) {
  if (conversations.length === 0) {
    return (
      <p className="px-4 py-6 text-sm text-subtle">
        {loading ? 'Looking…' : 'Your chats will show up here.'}
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-5 pb-6">
      {groupByDay(conversations).map((group) => (
        <section key={group.label}>
          <h2 className="px-4 pb-1.5 font-[family-name:var(--font-mono)] text-[10px] uppercase tracking-[0.14em] text-subtle">
            {group.label}
          </h2>
          <ul>
            {group.items.map((c) => {
              const active = c.id === activeId;
              return (
                <li key={c.id}>
                  <Link
                    href={`/chat?c=${c.id}`}
                    aria-current={active ? 'page' : undefined}
                    className={`flex min-h-11 flex-col justify-center gap-0.5 border-l-2 px-4 py-2.5 transition-colors duration-150 ${
                      active
                        ? 'border-accent bg-surface-raised text-ink'
                        : 'border-transparent text-muted hover:border-line hover:text-ink'
                    }`}
                  >
                    <span className="line-clamp-2 text-sm leading-snug">{labelFor(c)}</span>
                    <span className="font-[family-name:var(--font-mono)] text-[10px] text-subtle">
                      {c.messageCount} {c.messageCount === 1 ? 'message' : 'messages'}
                      {/* The time is already the label when there is no excerpt. */}
                      {c.excerpt ? ` · ${timeOf(c.startedAt)}` : ''}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      ))}

      {hasMore && (
        <button
          type="button"
          onClick={onOlder}
          disabled={loading}
          className="mx-4 min-h-11 rounded-full border border-line px-3 text-xs text-muted transition-colors duration-150 hover:border-accent hover:text-accent disabled:opacity-50"
        >
          {loading ? 'Loading…' : 'Show older'}
        </button>
      )}
    </div>
  );
}
