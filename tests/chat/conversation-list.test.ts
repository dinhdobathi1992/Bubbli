/**
 * The sidebar's own logic, and the one thing about it that must never change.
 *
 * Day grouping is computed against the VIEWER's midnight; doing it in SQL would
 * bake the server's timezone into a label a child reads.
 *
 * The label for a flagged conversation is the important part. The endpoint
 * withholds the excerpt at or above the visibility gate, so a crisis disclosure
 * never becomes the permanent label on a child's own sidebar — this fills the
 * gap with something ordinary, and deliberately not with a warning.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'fs';
import { groupByDay } from '@/components/chat/conversation-list';
import type { ChildConversationSummary } from '@/lib/chat/child-transcript';

const at = (iso: string, over: Partial<ChildConversationSummary> = {}): ChildConversationSummary => ({
  id: iso,
  startedAt: iso,
  messageCount: 2,
  excerpt: 'why is the sky blue',
  ...over,
});

describe('day grouping', () => {
  const now = new Date('2026-08-27T15:00:00');

  it('splits today, yesterday and earlier against local midnight', () => {
    const groups = groupByDay(
      [
        at('2026-08-27T09:30:00'),
        at('2026-08-26T22:00:00'),
        at('2026-08-20T10:00:00'),
      ],
      now,
    );
    expect(groups.map((g) => g.label)).toEqual(['Today', 'Yesterday', 'Earlier']);
  });

  it('puts 00:05 today in Today, not Yesterday', () => {
    // The boundary is local midnight. An off-by-one here mislabels every
    // late-night chat a child has.
    const groups = groupByDay([at('2026-08-27T00:05:00')], now);
    expect(groups[0].label).toBe('Today');
  });

  it('puts 23:55 yesterday in Yesterday, not Earlier', () => {
    const groups = groupByDay([at('2026-08-26T23:55:00')], now);
    expect(groups[0].label).toBe('Yesterday');
  });

  it('omits an empty group rather than showing an empty heading', () => {
    const groups = groupByDay([at('2026-08-20T10:00:00')], now);
    expect(groups.map((g) => g.label)).toEqual(['Earlier']);
  });
});

describe('the flagged-row label — D11', () => {
  const src = readFileSync('src/components/chat/conversation-list.tsx', 'utf8');

  it('falls back to a neutral, time-based label when there is no excerpt', () => {
    // The endpoint omits `excerpt` entirely for a flagged conversation, so the
    // row falls back to something that carries none of the content.
    expect(src).toContain('A chat from');
    const fn = src.slice(src.indexOf('function labelFor'), src.indexOf('export function ConversationList'));
    expect(fn).toContain('c.excerpt ??');
  });

  it('never styles the fallback as a warning', () => {
    // Marking the row would tell a child the system filed their worst moment,
    // which is worse than showing the text would have been.
    const label = src.slice(src.indexOf('function labelFor'), src.indexOf('export function ConversationList'));
    expect(label).not.toMatch(/critical|danger|warning|flagged|severity/i);
  });
});

describe('the sidebar survives selecting a conversation', () => {
  const list = readFileSync('src/components/chat/conversation-list.tsx', 'utf8');
  const shell = readFileSync('src/components/chat/sidebar.tsx', 'utf8');

  /**
   * A plain <a href> is a full page load: it remounts ChatClient, resets
   * `historyOpen` to false, and throws away the fetched list. The panel closed
   * on every click, and every reopen cost another query against a throttled
   * endpoint.
   */
  it('rows navigate softly, so the panel keeps its state', () => {
    expect(list).toContain("from 'next/link'");
    expect(list).toMatch(/<Link\s/);
    expect(list).not.toMatch(/<a\s+[^>]*href=/);
  });

  it('“New chat” navigates softly too', () => {
    expect(shell).toContain("from 'next/link'");
    expect(shell).not.toMatch(/<a\s+[^>]*href=/);
  });

  it('the transcript is reset when the selected conversation changes', () => {
    // Soft navigation keeps the component mounted, so `useState` initializers
    // do not re-run. Without this the URL would change and the PREVIOUS
    // conversation would stay on screen.
    const client = readFileSync('src/components/chat/chat-client.tsx', 'utf8');
    expect(client).toContain('renderedFor');
    expect(client).toMatch(/if \(initialConversationId !== renderedFor\)/);
  });
});

describe('the neutral label distinguishes one chat from another', () => {
  /**
   * The first version used morning/afternoon/evening — three possible strings.
   * Two flagged conversations the same evening rendered identically, and a list
   * with two identical rows reads as broken.
   */
  it('two flagged chats in the same evening do not render the same label', () => {
    const src = readFileSync('src/components/chat/conversation-list.tsx', 'utf8');
    const fn = src.slice(src.indexOf('function labelFor'), src.indexOf('export function ConversationList'));
    expect(fn).toContain('timeOf');
    expect(fn).not.toMatch(/morning|afternoon|evening/);
  });
});

describe('D3 — nothing in the child UI destroys evidence', () => {
  /**
   * A conversation is the evidence behind a guardian's alert. A child-side
   * delete would let the flagged exchange be erased before the guardian opens
   * it. Its absence looks like an oversight, which is exactly why this test
   * exists: a future contributor adding the "missing" button hits this first.
   */
  it('no delete, hide, rename, pin or archive control exists in the chat components', () => {
    const offenders: string[] = [];
    for (const f of readdirSync('src/components/chat')) {
      const body = readFileSync(`src/components/chat/${f}`, 'utf8');
      // Comments explain WHY there is none; strip them before searching.
      const code = body.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
      for (const verb of ['delete', 'archive', 'unpin', 'rename']) {
        if (new RegExp(`\\b${verb}\\b`, 'i').test(code)) offenders.push(`${f}: ${verb}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
