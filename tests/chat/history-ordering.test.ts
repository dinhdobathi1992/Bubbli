/**
 * The prompt gets the NEWEST turns, not the oldest.
 *
 * The reviewed prior art used `order by created_at asc limit 20`, which returns
 * the first twenty messages of a conversation forever. Past turn twenty the
 * model saw nothing recent, so the assistant appeared to develop amnesia
 * mid-conversation while recalling the opening perfectly. The bug is invisible
 * in a short conversation and total in a long one, which is why it needs a test
 * seeded past the window rather than a reading of the SQL.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Pool } from 'pg';
import { readFileSync, existsSync } from 'fs';
import { loadHistory, HISTORY_TURNS } from '@/lib/chat/history';
import { hashPin } from '@/lib/auth/child-pin';
import { eraseFamily } from '@/lib/retention/jobs';

const url =
  process.env.DATABASE_URL ??
  (existsSync('.secrets-tmp/dburl') ? readFileSync('.secrets-tmp/dburl', 'utf8').trim() : undefined);
if (!url) throw new Error('No database URL');
const pool = new Pool({ connectionString: url, max: 4 });

const SEEDED = 30;

let familyId: string;
let childId: string;
let conversationId: string;
let lastId: string;

beforeAll(async () => {
  const f = await pool.query(`insert into families (name) values ('history-test') returning id`);
  familyId = f.rows[0].id;
  const c = await pool.query(
    `insert into children (family_id, display_name, pin_hash, age_band, activated_at)
     values ($1,'Kid',$2,'8-11',now()) returning id`,
    [familyId, await hashPin('835492')],
  );
  childId = c.rows[0].id;
  const cv = await pool.query(
    `insert into conversations (child_id, age_band) values ($1,'8-11') returning id`,
    [childId],
  );
  conversationId = cv.rows[0].id;

  // Explicit, increasing timestamps: seeding inside one transaction gives every
  // row the same `now()`, and a tie makes the ordering assertion meaningless.
  for (let i = 1; i <= SEEDED; i += 1) {
    const r = await pool.query(
      `insert into messages (conversation_id, child_id, role, content, created_at)
       values ($1,$2,'child',$3, now() + ($4 || ' seconds')::interval) returning id`,
      [conversationId, childId, `message ${i}`, i],
    );
    lastId = r.rows[0].id;
  }
});

afterAll(async () => {
  await eraseFamily(pool, familyId).catch(() => {});
  await pool.end();
});

const numbers = (h: Array<{ content: string }>) =>
  h.map((m) => Number(/message (\d+)/.exec(m.content)![1]));

describe('the history window', () => {
  it('is seeded past the window, or it proves nothing', () => {
    // Without this, raising HISTORY_TURNS to 30 would make the test assert
    // 1..30 and pass while testing no recency property at all.
    expect(SEEDED).toBeGreaterThan(HISTORY_TURNS);
  });

  it('returns the most recent N, not the first N', async () => {
    const h = await loadHistory(pool, conversationId, null);
    expect(h).toHaveLength(HISTORY_TURNS);
    // 30 seeded, window of 20 → 11..30. The prior art returned 1..20.
    expect(numbers(h)).toEqual(
      Array.from({ length: HISTORY_TURNS }, (_, i) => SEEDED - HISTORY_TURNS + 1 + i),
    );
  });

  it('reads chronologically, so the prompt is not reversed', async () => {
    const n = numbers(await loadHistory(pool, conversationId, null));
    expect(n[0]).toBeLessThan(n[n.length - 1]);
    expect(n[n.length - 1]).toBe(SEEDED);
  });

  it('excludes the just-persisted message so it is not sent twice', async () => {
    // The child's newest message is passed separately as `userMessage`.
    const n = numbers(await loadHistory(pool, conversationId, lastId));
    expect(n).not.toContain(SEEDED);
    expect(n[n.length - 1]).toBe(SEEDED - 1);
  });

  it('returns everything when the conversation is shorter than the window', async () => {
    const n = numbers(await loadHistory(pool, conversationId, null, SEEDED + 10));
    expect(n).toHaveLength(SEEDED);
    expect(n[0]).toBe(1);
  });
});
