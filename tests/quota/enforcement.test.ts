/**
 * Quota enforcement. Release gate G3's rate-limit half.
 *
 * The prior art's limiter admitted 20 of 20 requests against a limit of 5 and
 * had zero tests. The off-by-one test below is the case it got wrong; the
 * CONCURRENCY test is the case a sequential test structurally cannot catch, and
 * is where a check-then-act ceiling actually fails.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { Pool } from 'pg';
import { readFileSync, existsSync } from 'fs';
import { checkChatQuota, recordChatUsage } from '@/lib/quota/limiter';
import { settings } from '@/config/settings';

const url =
  process.env.DATABASE_URL ??
  (existsSync('.secrets-tmp/dburl') ? readFileSync('.secrets-tmp/dburl', 'utf8').trim() : undefined);
if (!url) throw new Error('No database URL');
const pool = new Pool({ connectionString: url, max: 20 });

let familyId: string;
let childId: string;

beforeAll(async () => {
  const f = await pool.query(`insert into families (name) values ('quota-test') returning id`);
  familyId = f.rows[0].id;
  const c = await pool.query(
    `insert into children (family_id, display_name, pin_hash, age_band, activated_at)
     values ($1,'Q','x','8-11', now()) returning id`,
    [familyId],
  );
  childId = c.rows[0].id;
});

beforeEach(async () => {
  await pool.query(`delete from quota_events where family_id = $1`, [familyId]);
  await pool.query(`delete from family_daily_quota where family_id = $1`, [familyId]);
});

afterAll(async () => {
  await pool.query(`delete from quota_events where family_id = $1`, [familyId]).catch(() => {});
  await pool.query(`delete from family_daily_quota where family_id = $1`, [familyId]).catch(() => {});
  await pool.query(`delete from children where family_id = $1`, [familyId]).catch(() => {});
  await pool.query(`delete from families where id = $1`, [familyId]).catch(() => {});
  await pool.end();
});

describe('per-family daily ceiling', () => {
  const LIMIT = settings.QUOTA_PER_FAMILY_PER_DAY;

  it('admits request N and refuses N+1', async () => {
    // Fill to exactly the limit.
    for (let i = 0; i < LIMIT; i += 1) {
      const ok = await recordChatUsage(pool, childId, familyId);
      expect(ok, `request ${i + 1} of ${LIMIT}`).toBe(true);
    }
    // The prior art's exact failure: at count === limit it kept admitting.
    const overflow = await recordChatUsage(pool, childId, familyId);
    expect(overflow).toBe(false);

    // Isolate the FAMILY ceiling: filling it also blew the per-child
    // per-minute window, and the child rate is checked first (cheapest and
    // most specific). Clearing the window leaves only the family limit, which
    // is what this test is about.
    await pool.query(`delete from quota_events where family_id = $1`, [familyId]);

    const verdict = await checkChatQuota(pool, childId, familyId);
    expect(verdict.allowed).toBe(false);
    expect(verdict.reason).toBe('family_daily');
  });

  it('admits EXACTLY the limit under concurrency', async () => {
    // Fire limit + 10 in parallel. A check-then-act ceiling overshoots here by
    // N-1 per boundary crossing, and a sequential test cannot see it at all.
    const results = await Promise.all(
      Array.from({ length: LIMIT + 10 }, () => recordChatUsage(pool, childId, familyId)),
    );
    const admitted = results.filter(Boolean).length;
    expect(admitted).toBe(LIMIT);

    const row = await pool.query(
      `select count_used from family_daily_quota where family_id = $1 and day = current_date`,
      [familyId],
    );
    expect(Number(row.rows[0].count_used)).toBe(LIMIT);
  });
});

describe('per-child rate window', () => {
  it('refuses once the per-minute window is full', async () => {
    for (let i = 0; i < settings.QUOTA_PER_CHILD_PER_MIN; i += 1) {
      await pool.query(`insert into quota_events (child_id, family_id) values ($1,$2)`, [childId, familyId]);
    }
    const v = await checkChatQuota(pool, childId, familyId);
    expect(v.allowed).toBe(false);
    expect(v.reason).toBe('child_rate');
  });

  it('allows a child with a clean window', async () => {
    expect((await checkChatQuota(pool, childId, familyId)).allowed).toBe(true);
  });
});
