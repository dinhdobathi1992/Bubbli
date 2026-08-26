/**
 * The crisis path under failure — G6, and the defects the red team found in it.
 *
 * G6 as the MVP plan words it is "crisis copy in the child's response EVEN WHEN
 * THE DATABASE IS FORCED TO THROW". No test ever forced it to throw, and the
 * code could not have passed: an unguarded TX1 insert sat ahead of the
 * guardrail, so a pool blip returned a 500 to a child in acute distress.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Pool } from 'pg';
import { readFileSync, existsSync } from 'fs';
import { runTurn } from '@/lib/chat/pipeline';
import { hashPin } from '@/lib/auth/child-pin';
import { ensurePolicyVersion } from '@/lib/guardrails/policy-store';
import { eraseFamily } from '@/lib/retention/jobs';

const url =
  process.env.DATABASE_URL ??
  (existsSync('.secrets-tmp/dburl') ? readFileSync('.secrets-tmp/dburl', 'utf8').trim() : undefined);
if (!url) throw new Error('No database URL');
const pool = new Pool({ connectionString: url, max: 4 });

let familyId: string;
let childId: string;
let conversationId: string;

beforeAll(async () => {
  await ensurePolicyVersion(pool);
  const f = await pool.query(`insert into families (name) values ('crisis-path-test') returning id`);
  familyId = f.rows[0].id;
  await pool.query(
    `insert into parents (family_id, email, consented_at) values ($1,$2,now())`,
    [familyId, `cp${Date.now()}@example.test`],
  );
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
});

afterAll(async () => {
  await eraseFamily(pool, familyId).catch(() => {});
  await pool.end();
});

/** Every transaction fails; plain queries still work, as in pool exhaustion. */
function poolWithFailingTransactions(real: Pool): Pool {
  return new Proxy(real, {
    get(target, prop, receiver) {
      if (prop === 'connect') {
        return () => Promise.reject(new Error('sorry, too many clients already'));
      }
      const value = Reflect.get(target, prop, receiver);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  }) as Pool;
}

const turn = (db: Pool, content: string) =>
  runTurn(
    db,
    {
      conversationId,
      childId,
      familyId,
      ageBand: '8-11',
      content,
      idempotencyKey: `cp-${Math.random().toString(36).slice(2)}`,
      guardrailConfig: {},
    },
    new AbortController().signal,
  );

describe('G6: crisis copy survives a database that refuses to write', () => {
  it('still returns the 988 copy when every transaction throws', async () => {
    const r = await turn(poolWithFailingTransactions(pool), 'i dont want to be here anymore');

    expect(r.crisis).toBe(true);
    expect(r.blocked).toBe(true);
    expect(r.severity).toBe('critical');
    expect(r.reply).toMatch(/988/);
    expect(r.reply).toMatch(/trusted adult|grown-up/i);
  });

  it('reports the lost attribution honestly rather than inventing an id', async () => {
    const r = await turn(poolWithFailingTransactions(pool), 'i want to hurt myself');
    // The flag and the message are genuinely lost — that is the cost of the
    // database being down. What must NOT be lost is the child's response.
    expect(r.childMessageId).toBeNull();
    expect(r.assistantMessageId).toBeNull();
    expect(r.reply).toMatch(/988/);
  });

  it('writes nothing before the guardrail has run', async () => {
    // Ordering proof: with transactions failing, a healthy pool would still
    // have inserted the child's message first under the old order.
    const before = await pool.query(
      `select count(*)::int as n from messages where child_id = $1`,
      [childId],
    );
    await turn(poolWithFailingTransactions(pool), 'i dont want to be here anymore');
    const after = await pool.query(
      `select count(*)::int as n from messages where child_id = $1`,
      [childId],
    );
    expect(after.rows[0].n).toBe(before.rows[0].n);
  });
});

describe('the healthy path is unchanged', () => {
  it('persists the message and raises a linked flag', async () => {
    const r = await turn(pool, 'i want to hurt myself');
    expect(r.childMessageId).not.toBeNull();
    expect(r.crisis).toBe(true); // self-harm intent is critical, not high
    const f = await pool.query(
      `select f.id from flags f where f.message_id = $1`,
      [r.childMessageId],
    );
    expect(f.rowCount).toBe(1);
  });
});
