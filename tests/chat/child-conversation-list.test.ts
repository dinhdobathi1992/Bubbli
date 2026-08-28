/**
 * `listOwnConversations` — the read path behind a child's sidebar.
 *
 * Three of these tests exist because of a specific failure that would otherwise
 * ship silently:
 *
 *   role='child'   — `'user'` is the spelling every other chat codebase uses and
 *                    it matches nothing here. No error, just a null excerpt on
 *                    every row, forever.
 *   flagged rows   — a blocked message is still stored `status='completed'`, so
 *                    without suppression a child's crisis disclosure becomes the
 *                    permanent label on their own sidebar.
 *   parent session — this path is deliberately unaudited. A parent reaching it
 *                    would be reading a child's content with no oversight record.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Pool } from 'pg';
import { readFileSync, existsSync } from 'fs';
import { listOwnConversations, CONVERSATION_PAGE_SIZE } from '@/lib/chat/child-transcript';
import { AuthzError, type Session } from '@/lib/authz';

const url =
  process.env.DATABASE_URL ??
  (existsSync('.secrets-tmp/dburl') ? readFileSync('.secrets-tmp/dburl', 'utf8').trim() : undefined);
if (!url) throw new Error('No database URL');
const pool = new Pool({ connectionString: url, max: 4 });

let familyId: string;
let childId: string;
let siblingId: string;
let childSession: Session;
let siblingSession: Session;
let parentSession: Session;

async function makeConversation(
  owner: string,
  opts: { severity?: string; messages?: Array<[string, string, string]> } = {},
): Promise<string> {
  const c = await pool.query(
    `insert into conversations (child_id, age_band, max_severity) values ($1,'8-11',$2) returning id`,
    [owner, opts.severity ?? null],
  );
  const id = c.rows[0].id as string;
  for (const [role, content, status] of opts.messages ?? []) {
    await pool.query(
      `insert into messages (conversation_id, child_id, role, content, status)
       values ($1,$2,$3,$4,$5)`,
      [id, owner, role, content, status],
    );
  }
  return id;
}

beforeAll(async () => {
  const f = await pool.query(`insert into families (name) values ('conv-list') returning id`);
  familyId = f.rows[0].id;

  const c = await pool.query(
    `insert into children (family_id, display_name, pin_hash, age_band, activated_at)
     values ($1,'Lister','x','8-11',now()) returning id`,
    [familyId],
  );
  childId = c.rows[0].id;

  // Same family on purpose: family membership must not be enough.
  const s = await pool.query(
    `insert into children (family_id, display_name, pin_hash, age_band, activated_at)
     values ($1,'Sibling','x','8-11',now()) returning id`,
    [familyId],
  );
  siblingId = s.rows[0].id;

  childSession = { principalType: 'child', familyId, childId };
  siblingSession = { principalType: 'child', familyId, childId: siblingId };
  parentSession = { principalType: 'parent', familyId, parentId: 'p-1' };
});

afterAll(async () => {
  // `children.family_id` is ON DELETE RESTRICT on purpose — a family must not
  // take its children's records with it. Conversations and messages DO cascade
  // from the child, so removing children is enough.
  await pool.query(`delete from children where family_id = $1`, [familyId]).catch(() => {});
  await pool.query(`delete from families where id = $1`, [familyId]).catch(() => {});
  await pool.end();
});

describe('what comes back', () => {
  it('returns the child’s own conversations, newest first', async () => {
    const older = await makeConversation(childId, {
      messages: [['child', 'why is the sky blue', 'completed']],
    });
    const newer = await makeConversation(childId, {
      messages: [['child', 'how do volcanoes work', 'completed']],
    });
    await pool.query(`update conversations set started_at = now() - interval '1 hour' where id = $1`, [older]);

    const page = await listOwnConversations(pool, childSession);
    const ids = page.conversations.map((c) => c.id);
    expect(ids.indexOf(newer)).toBeLessThan(ids.indexOf(older));
  });

  it('uses the child’s FIRST message as the excerpt, not the assistant’s', async () => {
    const id = await makeConversation(childId, {
      messages: [
        ['assistant', 'Hello there!', 'completed'],
        ['child', 'tell me about space', 'completed'],
        ['child', 'and about mars', 'completed'],
      ],
    });
    const row = (await listOwnConversations(pool, childSession)).conversations.find((c) => c.id === id);
    expect(row?.excerpt).toBe('tell me about space');
  });

  it('would have returned nothing had the role been spelled "user"', async () => {
    // Guards the exact regression: messages_role_ck permits only
    // ('child','assistant','system'), so `role = 'user'` matches no row.
    const bad = pool.query(
      `insert into messages (conversation_id, child_id, role, content, status)
       values ((select id from conversations where child_id = $1 limit 1), $1, 'user', 'x', 'completed')`,
      [childId],
    );
    await expect(bad).rejects.toThrow();
  });

  it('counts completed messages only', async () => {
    const id = await makeConversation(childId, {
      messages: [
        ['child', 'counted', 'completed'],
        ['assistant', 'counted too', 'completed'],
        ['assistant', 'not counted', 'aborted'],
      ],
    });
    const row = (await listOwnConversations(pool, childSession)).conversations.find((c) => c.id === id);
    expect(row?.messageCount).toBe(2);
  });

  it('omits a conversation with no completed message', async () => {
    const empty = await makeConversation(childId);
    const withFailed = await makeConversation(childId, {
      messages: [['child', 'never landed', 'failed']],
    });
    const ids = (await listOwnConversations(pool, childSession)).conversations.map((c) => c.id);
    expect(ids).not.toContain(empty);
    expect(ids).not.toContain(withFailed);
  });

  it('truncates at 80 CHARACTERS and never splits a multi-byte one', async () => {
    // 90 emoji, so truncation actually happens. Each is one Postgres character
    // but four UTF-8 bytes — a byte-wise cut would land mid-codepoint and yield
    // a replacement character.
    const id = await makeConversation(childId, {
      messages: [['child', '🌍'.repeat(90), 'completed']],
    });
    const row = (await listOwnConversations(pool, childSession)).conversations.find((c) => c.id === id);
    expect([...(row?.excerpt ?? '')]).toHaveLength(80);
    expect(row?.excerpt).not.toContain('�');
  });
});

describe('a flagged conversation reveals nothing', () => {
  it.each(['medium', 'high', 'critical'])('suppresses the excerpt at %s', async (severity) => {
    const id = await makeConversation(childId, {
      severity,
      messages: [['child', 'i want to hurt myself', 'completed']],
    });
    const row = (await listOwnConversations(pool, childSession)).conversations.find((c) => c.id === id);

    expect(row).toBeDefined();
    // Absent, not empty: the key must not exist on the object at all.
    expect(row).not.toHaveProperty('excerpt');
    expect(JSON.stringify(row)).not.toContain('hurt myself');
  });

  it.each(['info', 'low'])('still shows the excerpt at %s', async (severity) => {
    const id = await makeConversation(childId, {
      severity,
      messages: [['child', 'why do cats purr', 'completed']],
    });
    const row = (await listOwnConversations(pool, childSession)).conversations.find((c) => c.id === id);
    expect(row?.excerpt).toBe('why do cats purr');
  });

  it('still lists the conversation and still counts its messages', async () => {
    const id = await makeConversation(childId, {
      severity: 'critical',
      messages: [
        ['child', 'something heavy', 'completed'],
        ['assistant', 'a careful reply', 'completed'],
      ],
    });
    const row = (await listOwnConversations(pool, childSession)).conversations.find((c) => c.id === id);
    // Suppressing the label must not hide the conversation itself.
    expect(row?.messageCount).toBe(2);
  });
});

describe('who may call it', () => {
  it('refuses a PARENT session', async () => {
    await expect(listOwnConversations(pool, parentSession)).rejects.toBeInstanceOf(AuthzError);
  });

  it('never returns another child’s conversation, same family or not', async () => {
    const theirs = await makeConversation(siblingId, {
      messages: [['child', 'my sibling’s private question', 'completed']],
    });
    const ids = (await listOwnConversations(pool, childSession)).conversations.map((c) => c.id);
    expect(ids).not.toContain(theirs);

    const back = (await listOwnConversations(pool, siblingSession)).conversations.map((c) => c.id);
    expect(back).toContain(theirs);
  });
});

describe('paging', () => {
  it('caps at the page size and reports hasMore honestly', async () => {
    const page = await listOwnConversations(pool, childSession, { limit: 2 });
    expect(page.conversations.length).toBeLessThanOrEqual(2);
    expect(page.hasMore).toBe(true);

    const all = await listOwnConversations(pool, childSession, { limit: CONVERSATION_PAGE_SIZE });
    expect(all.hasMore).toBe(false);
  });

  it('offset walks without repeating a row', async () => {
    const first = await listOwnConversations(pool, childSession, { limit: 2, offset: 0 });
    const second = await listOwnConversations(pool, childSession, { limit: 2, offset: 2 });
    const overlap = first.conversations
      .map((c) => c.id)
      .filter((id) => second.conversations.some((c) => c.id === id));
    expect(overlap).toEqual([]);
  });

  it('clamps a hostile limit rather than trusting it', async () => {
    const page = await listOwnConversations(pool, childSession, { limit: 10_000 });
    expect(page.conversations.length).toBeLessThanOrEqual(CONVERSATION_PAGE_SIZE);
  });
});

describe('the oversight record', () => {
  it('writes no audit event — a child observing themselves is not oversight', async () => {
    const before = await pool.query(`select count(*)::int as n from audit_events`);
    await listOwnConversations(pool, childSession);
    const after = await pool.query(`select count(*)::int as n from audit_events`);
    expect(after.rows[0].n).toBe(before.rows[0].n);
  });
});
