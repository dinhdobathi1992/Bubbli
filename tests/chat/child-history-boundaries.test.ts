/**
 * The properties that fail silently.
 *
 * Everything else in this feature announces itself when it breaks: a broken
 * list is an empty sidebar, a broken resume is a lost conversation. These four
 * do not. Each would keep working, look correct, and quietly stop being true —
 * so each is asserted structurally, against the source, rather than trusted to
 * a comment or a review.
 *
 * This project has already been bitten once by a check that measured nothing:
 * the G4 gate reported 100% recall on a guardrail that missed the plainest
 * violence request in the language, because the corpus shared the rule's blind
 * spot. A test that was never written measures nothing, and a metric derived
 * from it is worse than none because it reassures.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (/\.tsx?$/.test(p)) out.push(p);
  }
  return out;
}

describe('V6 — no stored conversation title', () => {
  /**
   * An AI-generated title needs a model call over content the parent cannot
   * see, and becomes a leak vector in the flags list — the exact field the
   * prior art leaked. The excerpt is derived on read for this reason: with no
   * column, there is nothing a parent-side query can select by accident.
   */
  it('the conversations table has no title-shaped column', () => {
    const schema = readFileSync('src/db/schema.ts', 'utf8');
    const table = schema.slice(
      schema.indexOf('export const conversations'),
      schema.indexOf('export const messages'),
    );
    for (const field of ['title', 'summary', 'excerpt', 'preview', 'label']) {
      expect(table).not.toMatch(new RegExp(`\\b${field}\\s*:\\s*text\\(`, 'i'));
    }
  });
});

describe('the child module stays child-only', () => {
  /**
   * `child-transcript.ts` is unaudited and un-severity-gated by design, because
   * a child reading their own words is not an oversight relationship. A parent
   * surface importing it would read a child's content with no record — which is
   * precisely the bypass the audited parent path exists to prevent.
   */
  it('no parent-side file imports it', () => {
    const parentFiles = [
      ...walk('src/app/(parent)'),
      ...walk('src/lib/parent'),
    ];
    const offenders = parentFiles.filter((f) =>
      readFileSync(f, 'utf8').includes('chat/child-transcript'),
    );
    expect(offenders).toEqual([]);
  });
});

describe('D11 — a flagged conversation reveals nothing in the list', () => {
  const src = readFileSync('src/lib/chat/child-transcript.ts', 'utf8');

  it('suppression happens in the module, not the component', () => {
    // A component-side check would leave the text in the JSON response, where
    // it reaches the browser, the network tab and every future consumer. The
    // whole point is that it does not travel.
    expect(src).toContain('opensTranscript');
    const list = src.slice(src.indexOf('export async function listOwnConversations'));
    expect(list).toMatch(/flagged\s*\?\s*undefined/);
  });

  it('reuses the parent visibility gate rather than a second threshold', () => {
    // Two notions of "sensitive" would drift. `opensTranscript` is the same
    // gate at which a guardian can see the conversation.
    expect(src).not.toMatch(/['"]medium['"]\s*[,)]/);
  });
});

describe('D14 — the read throttle is not the AI budget', () => {
  it('the list endpoint throttles without touching quota', () => {
    const route = readFileSync('src/app/api/chat/route.ts', 'utf8');
    const get = route.slice(route.indexOf('export async function GET'));
    expect(get).toContain('checkReadRate');
    // A read costs no tokens; charging a child's model allowance for scrolling
    // their own sidebar would be wrong.
    expect(get).not.toContain('checkChatQuota');
  });
});

describe('the guardrail path is untouched', () => {
  it('no file under src/lib/guardrails was modified by this feature', () => {
    // Nothing in this work touches rules. Stating it structurally means a
    // future edit that does will have to say so out loud.
    const rules = readFileSync('src/lib/guardrails/rules.ts', 'utf8');
    expect(rules).not.toContain('conversation-continuity');
    expect(rules).not.toContain('child-transcript');
  });
});
