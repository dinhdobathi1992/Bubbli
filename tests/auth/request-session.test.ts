/**
 * `getSession` — principal derivation.
 *
 * This file scored 0.00% on the G3 mutation gate: seven mutants, none killed,
 * because no test touched it. It is the function that decides whether a request
 * is a parent or a child, and it is the file Phase 1 modifies to introduce the
 * parent principal. Every isolation guarantee downstream assumes it is right.
 *
 * The property that matters most: `principalType` is derived from WHICH STORE
 * RESOLVED, server-side. It is never read from a cookie field, header or body
 * claim, so a client cannot assert what it is.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { Pool } from 'pg';
import { readFileSync, existsSync } from 'fs';

const jar = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock('next/headers', () => ({ cookies: async () => jar }));

import { getSession } from '@/lib/auth/request-session';
import {
  createChildSession,
  revokeChildSession,
  CHILD_SESSION_COOKIE,
} from '@/lib/auth/child-session';

const url =
  process.env.DATABASE_URL ??
  (existsSync('.secrets-tmp/dburl') ? readFileSync('.secrets-tmp/dburl', 'utf8').trim() : undefined);
if (!url) throw new Error('No database URL');
const pool = new Pool({ connectionString: url, max: 4 });

let familyId: string;
let childId: string;
let token: string;
let sessionId: string;

/** Present a cookie exactly as a browser would. */
function present(name: string, value: string | undefined) {
  jar.get.mockImplementation((n: string) => (n === name && value ? { value } : undefined));
}

beforeAll(async () => {
  const f = await pool.query(`insert into families (name) values ('req-session') returning id`);
  familyId = f.rows[0].id;
  const c = await pool.query(
    `insert into children (family_id, display_name, pin_hash, age_band, activated_at)
     values ($1,'S','x','8-11',now()) returning id`,
    [familyId],
  );
  childId = c.rows[0].id;
  const made = await createChildSession(pool, childId, familyId);
  token = made.token;
  sessionId = made.session.id;
});

afterAll(async () => {
  await pool.query(`delete from child_sessions where family_id = $1`, [familyId]).catch(() => {});
  await pool.query(`delete from children where family_id = $1`, [familyId]).catch(() => {});
  await pool.query(`delete from families where id = $1`, [familyId]).catch(() => {});
  await pool.end();
});

describe('a valid child session', () => {
  it('resolves to a child principal with the right family and child', async () => {
    present(CHILD_SESSION_COOKIE, token);
    const s = await getSession();
    expect(s).not.toBeNull();
    expect(s!.principalType).toBe('child');
    expect(s!.familyId).toBe(familyId);
    expect(s!.childId).toBe(childId);
  });

  it('never carries a parentId', async () => {
    present(CHILD_SESSION_COOKIE, token);
    const s = await getSession();
    expect(s!.parentId).toBeUndefined();
  });
});

describe('nothing else resolves to a principal', () => {
  it('returns null with no cookie at all', async () => {
    jar.get.mockReturnValue(undefined);
    expect(await getSession()).toBeNull();
  });

  it('returns null for a garbage token', async () => {
    present(CHILD_SESSION_COOKIE, 'not-a-real-token');
    expect(await getSession()).toBeNull();
  });

  it('returns null for an empty token', async () => {
    present(CHILD_SESSION_COOKIE, '');
    expect(await getSession()).toBeNull();
  });

  // The cookie NAME is part of the contract: the __Host- prefix is what stops a
  // subdomain from setting it. A valid token under any other name is not a session.
  it('ignores a valid token presented under a different cookie name', async () => {
    present('some_other_cookie', token);
    expect(await getSession()).toBeNull();
  });
});

describe('principalType is derived, not claimed', () => {
  it('cannot be escalated by a cookie that claims to be a parent', async () => {
    // A client presenting a parent-looking value gets nothing: there is no
    // parent store wired yet, and nothing reads a type from the client.
    present(CHILD_SESSION_COOKIE, JSON.stringify({ principalType: 'parent', familyId }));
    expect(await getSession()).toBeNull();
  });
});

describe('revocation is honoured immediately', () => {
  it('stops resolving once the session is revoked', async () => {
    present(CHILD_SESSION_COOKIE, token);
    expect(await getSession()).not.toBeNull();

    await revokeChildSession(pool, sessionId, 'logout');

    present(CHILD_SESSION_COOKIE, token);
    expect(await getSession()).toBeNull();
  });
});
