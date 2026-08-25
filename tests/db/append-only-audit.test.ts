/**
 * Release-gate evidence for Phase 1.
 *
 * The prior-art review found controls that looked correct and did nothing. Each
 * test here asserts a property the DATABASE enforces, not one the application
 * promises, because an application-level guarantee is bypassed by any code path
 * that forgets to call it.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Pool } from 'pg';
import { readFileSync, existsSync } from 'fs';

/**
 * CI supplies DATABASE_URL for its Postgres service container. Locally the
 * connection string lives in a gitignored scratch file so it never reaches a
 * command line or a shell history.
 */
const url =
  process.env.DATABASE_URL ??
  (existsSync('.secrets-tmp/dburl') ? readFileSync('.secrets-tmp/dburl', 'utf8').trim() : undefined);

if (!url) throw new Error('No database URL: set DATABASE_URL or create .secrets-tmp/dburl');
const pool = new Pool({ connectionString: url, max: 4 });

const q = (sql: string, params: unknown[] = []) => pool.query(sql, params);

/** Assert a statement is rejected, and return the error for inspection. */
async function rejects(sql: string, params: unknown[] = []) {
  try {
    await q(sql, params);
  } catch (e) {
    return e as Error & { code?: string };
  }
  throw new Error(`Expected rejection, but the statement succeeded: ${sql}`);
}

let familyId: string;
let pseudonym: string;
let auditId: string;

beforeAll(async () => {
  const f = await q(`insert into families (name) values ('test-family') returning id`);
  familyId = f.rows[0].id;

  const p = await q(
    `insert into family_pseudonyms (family_id, subject_kind, subject_id)
     values ($1, 'family', gen_random_uuid()) returning pseudonym`,
    [familyId],
  );
  pseudonym = p.rows[0].pseudonym;

  const a = await q(
    `insert into audit_events (actor_pseudonym, event_type, entity_type, outcome)
     values ($1, 'conversation.view', 'conversation', 'granted') returning id`,
    [pseudonym],
  );
  auditId = a.rows[0].id;
});

afterAll(async () => {
  // Deliberate teardown order mirrors the erasure path: pseudonyms first, then
  // the family. Audit rows are never deleted, which is the whole point.
  await q(`delete from family_pseudonyms where family_id = $1`, [familyId]).catch(() => {});
  await q(`delete from families where id = $1`, [familyId]).catch(() => {});
  await pool.end();
});

describe('audit_events is append-only', () => {
  it('accepts INSERT', async () => {
    const r = await q(
      `insert into audit_events (actor_pseudonym, event_type, entity_type, outcome)
       values ($1, 'conversation.view', 'conversation', 'denied') returning id`,
      [pseudonym],
    );
    expect(r.rows[0].id).toBeTruthy();
  });

  it('rejects UPDATE', async () => {
    const e = await rejects(`update audit_events set outcome = 'granted' where id = $1`, [auditId]);
    expect(e.message).toMatch(/append-only/i);
  });

  it('rejects DELETE', async () => {
    const e = await rejects(`delete from audit_events where id = $1`, [auditId]);
    expect(e.message).toMatch(/append-only/i);
  });

  it('rejects TRUNCATE', async () => {
    const e = await rejects(`truncate audit_events`);
    expect(e.message).toMatch(/append-only/i);
  });

  it('carries no foreign keys, so no cascade path can reach it', async () => {
    const r = await q(
      `select count(*)::int as n from pg_constraint
       where conrelid = 'audit_events'::regclass and contype = 'f'`,
    );
    expect(r.rows[0].n).toBe(0);
  });
});

describe('erasure works without mutating audit rows', () => {
  it('refuses to delete a family while its pseudonyms exist', async () => {
    const e = await rejects(`delete from families where id = $1`, [familyId]);
    expect(e.code).toBe('23503'); // foreign_key_violation — ON DELETE RESTRICT
  });

  it('deleting the pseudonym renders audit rows unresolvable, leaving them intact', async () => {
    const before = await q(`select count(*)::int as n from audit_events where actor_pseudonym = $1`, [pseudonym]);
    expect(before.rows[0].n).toBeGreaterThan(0);

    await q(`delete from family_pseudonyms where pseudonym = $1`, [pseudonym]);

    // Rows survive...
    const after = await q(`select count(*)::int as n from audit_events where actor_pseudonym = $1`, [pseudonym]);
    expect(after.rows[0].n).toBe(before.rows[0].n);

    // ...but the actor can no longer be resolved to a person.
    const resolved = await q(`select count(*)::int as n from family_pseudonyms where pseudonym = $1`, [pseudonym]);
    expect(resolved.rows[0].n).toBe(0);
  });
});

describe('conversations.max_severity only rises (V7)', () => {
  let childId: string;
  let convId: string;

  beforeAll(async () => {
    const f = await q(`insert into families (name) values ('sev-family') returning id`);
    const c = await q(
      `insert into children (family_id, display_name, pin_hash, age_band)
       values ($1, 'Test', 'x', '8-11') returning id`,
      [f.rows[0].id],
    );
    childId = c.rows[0].id;
    const cv = await q(
      `insert into conversations (child_id, age_band, max_severity)
       values ($1, '8-11', 'medium') returning id`,
      [childId],
    );
    convId = cv.rows[0].id;
  });

  it('allows a rise', async () => {
    await q(`update conversations set max_severity = 'high' where id = $1`, [convId]);
    const r = await q(`select max_severity from conversations where id = $1`, [convId]);
    expect(r.rows[0].max_severity).toBe('high');
  });

  it('rejects a fall, so a dismissal cannot close a transcript', async () => {
    const e = await rejects(`update conversations set max_severity = 'low' where id = $1`, [convId]);
    expect(e.message).toMatch(/may only rise/i);
  });

  it('rejects clearing it', async () => {
    const e = await rejects(`update conversations set max_severity = null where id = $1`, [convId]);
    expect(e.message).toMatch(/cannot be cleared/i);
  });
});

describe('schema carries the corrections, not the originals', () => {
  it('has no is_visible_to_parent column anywhere', async () => {
    const r = await q(
      `select count(*)::int as n from information_schema.columns
       where table_schema='public' and column_name='is_visible_to_parent'`,
    );
    expect(r.rows[0].n).toBe(0);
  });

  it('has no safety_score column anywhere', async () => {
    const r = await q(
      `select count(*)::int as n from information_schema.columns
       where table_schema='public' and column_name='safety_score'`,
    );
    expect(r.rows[0].n).toBe(0);
  });

  it('has no title column on conversations (V6)', async () => {
    const r = await q(
      `select count(*)::int as n from information_schema.columns
       where table_schema='public' and table_name='conversations' and column_name='title'`,
    );
    expect(r.rows[0].n).toBe(0);
  });

  it('restricts age_band to the four bands split at 13 (V8)', async () => {
    const f = await q(`insert into families (name) values ('band-family') returning id`);
    const e = await rejects(
      `insert into children (family_id, display_name, pin_hash, age_band)
       values ($1, 'X', 'x', '12-15')`,
      [f.rows[0].id],
    );
    expect(e.code).toBe('23514'); // check_violation
    await q(`delete from families where id = $1`, [f.rows[0].id]);
  });

  it('records the full reproducibility tuple on guardrail results', async () => {
    const r = await q(
      `select column_name from information_schema.columns
       where table_schema='public' and table_name='guardrail_results'`,
    );
    const cols = r.rows.map((x: { column_name: string }) => x.column_name);
    expect(cols).toEqual(expect.arrayContaining(['policy_version', 'age_band', 'config_hash']));
  });

  it('stores rule-set bodies, not just hashes', async () => {
    const r = await q(
      `select column_name from information_schema.columns
       where table_schema='public' and table_name='policy_versions'`,
    );
    expect(r.rows.map((x: { column_name: string }) => x.column_name)).toContain('rules');
  });

  it('deduplicates retries per child via a unique idempotency key', async () => {
    const r = await q(
      `select indexdef from pg_indexes
       where tablename='messages' and indexname='messages_idempotency_uq'`,
    );
    expect(r.rows[0].indexdef).toMatch(/UNIQUE/i);
    expect(r.rows[0].indexdef).toMatch(/child_id/);
  });
});
