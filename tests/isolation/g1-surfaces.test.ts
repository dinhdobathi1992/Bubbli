/**
 * G1 at runtime: no surface returns a child's words from below the gate.
 *
 * The ESLint rule (`bubbli/no-direct-message-query`) and this suite prove
 * DIFFERENT things, which is why decision L1 keeps both. The rule constrains
 * who may read `messages.content` and therefore sees RSC pages and Server
 * Actions no route manifest can enumerate; it cannot see a leak that travels
 * through a module it has already allow-listed. This suite drives real requests
 * and asserts what actually comes back; it cannot see a surface the glob misses.
 *
 * ── Why the seed is FLAGGED at info/low ─────────────────────────────────────
 *
 * An unflagged conversation does not exercise the gate at all. The leak surface
 * is a conversation that HAS been flagged, sits below `medium`, and is
 * therefore visible to the guardian as an alert while its content must stay
 * closed. That is the case a parent has a reason to go looking for.
 *
 * ── The seam, stated plainly ────────────────────────────────────────────────
 *
 * `getSession` is mocked to return the principal under test. This suite is
 * about ISOLATION — given a principal, what does the surface return — not about
 * authentication, which `tests/auth/request-session.test.ts` owns end to end
 * against real cookies. Driving 20-odd surfaces through a real Better Auth
 * session is not achievable in-process, and faking the cookie instead of the
 * principal would test Better Auth rather than our gate.
 *
 * ── No silent skips ─────────────────────────────────────────────────────────
 *
 * Every file under `src/app` matching a surface shape is discovered by glob and
 * driven. A surface that cannot be driven FAILS; it is never skipped. A skipped
 * surface reads as a pass, and the thing on the other side of this gate is a
 * child's conversation.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { Pool } from 'pg';
import { readFileSync, existsSync } from 'fs';
import { readdirSync, statSync } from 'fs';
import { join, relative, sep } from 'path';
import { renderToStaticMarkup } from 'react-dom/server';
import type { Session } from '@/lib/authz';

// ── The principal under test ─────────────────────────────────────────────────

let current: Session | null = null;

vi.mock('@/lib/auth/request-session', () => ({
  getSession: async () => current,
}));

// `cookies()`/`headers()` throw outside a Next request scope.
vi.mock('next/headers', () => ({
  cookies: async () => ({ get: () => undefined, set: () => undefined, delete: () => undefined }),
  headers: async () => new Headers(),
}));

const url =
  process.env.DATABASE_URL ??
  (existsSync('.secrets-tmp/dburl') ? readFileSync('.secrets-tmp/dburl', 'utf8').trim() : undefined);
if (!url) throw new Error('No database URL');
const pool = new Pool({ connectionString: url, max: 6 });

// ── Canaries ─────────────────────────────────────────────────────────────────
// Distinctive enough that a substring match cannot be a coincidence, and
// nothing like a rule id, so a leak is unambiguous.

const CANARY_INFO = 'ZZQCANARYINFOxq7 my secret worry about the spelling test';
const CANARY_LOW = 'ZZQCANARYLOWxq7 the thing I did not tell anyone';
const CANARY_REPLY = 'ZZQCANARYREPLYxq7 assistant words below the gate';
const CANARIES = [CANARY_INFO, CANARY_LOW, CANARY_REPLY];

let familyId: string;
let otherFamilyId: string;
let parentId: string;
let otherParentId: string;
let childId: string;
let otherChildId: string;
let infoConversationId: string;
let lowConversationId: string;
let joinCode: string;

// ── Surface discovery ────────────────────────────────────────────────────────

const APP = join(process.cwd(), 'src', 'app');

/** Every file under src/app that a request can actually reach. */
function discoverSurfaces(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      discoverSurfaces(full, out);
    } else if (entry === 'route.ts' || entry === 'page.tsx' || entry === 'actions.ts') {
      out.push(full);
    }
  }
  return out;
}

/**
 * A `'use client'` surface reaches the database through nothing.
 *
 * It is not skipped — it is a DIFFERENT claim, asserted below. A client page
 * holds no pool, runs no query, and receives no server props (a page is a
 * root), so the only way it shows a child's words is by calling an API route —
 * and every one of those IS driven here. Rendering it would prove nothing:
 * outside a React renderer its hooks throw, and a thrown hook error is not
 * evidence of isolation.
 */
function isClientSurface(file: string): boolean {
  return /^\s*['"]use client['"]/.test(readFileSync(file, 'utf8'));
}

/**
 * Fill a dynamic segment with a value that MAXIMISES the leak surface.
 *
 * A conversation id below the gate is exactly what a curious guardian would
 * paste into the URL, so that is what every `[id]` receives.
 */
function paramsFor(file: string): Record<string, string | string[]> {
  const params: Record<string, string | string[]> = {};
  for (const segment of relative(APP, file).split(sep)) {
    const m = /^\[(\.\.\.)?([^\]]+)\]$/.exec(segment);
    if (!m) continue;
    const [, spread, name] = m;
    if (spread) params[name] = ['session'];
    else if (name === 'code') params[name] = joinCode;
    else params[name] = infoConversationId;
  }
  return params;
}

/** The request path, with dynamic segments filled and route groups removed. */
function pathFor(file: string): string {
  const parts = relative(APP, file).split(sep).slice(0, -1).filter((p) => !/^\(.*\)$/.test(p));
  const params = paramsFor(file);
  const filled = parts.map((p) => {
    const m = /^\[(\.\.\.)?([^\]]+)\]$/.exec(p);
    if (!m) return p;
    const v = params[m[2]];
    return Array.isArray(v) ? v.join('/') : v;
  });
  return `/${filled.join('/')}`;
}

/**
 * Drive one surface and return EVERYTHING it emitted — body, rendered markup,
 * or the error it threw. Errors count: a stack that quotes a row is still a
 * leak, and `notFound()`/`redirect()` throw by design.
 */
async function drive(file: string): Promise<string> {
  const mod = await import(/* @vite-ignore */ file);
  const emitted: string[] = [];
  const path = pathFor(file);
  const params = paramsFor(file);

  const record = async (fn: () => unknown) => {
    try {
      const out = await fn();
      if (out instanceof Response) emitted.push(await out.clone().text());
      else if (out != null && typeof out === 'object') emitted.push(renderToStaticMarkup(out as never));
      else emitted.push(String(out));
    } catch (e) {
      emitted.push(`${(e as Error).message}\n${(e as Error).stack ?? ''}`);
    }
  };

  if (file.endsWith('route.ts')) {
    for (const method of ['GET', 'POST', 'PATCH', 'PUT', 'DELETE'] as const) {
      const handler = mod[method];
      if (typeof handler !== 'function') continue;
      // The query carries both conversation ids: the list endpoints read them
      // from the query string, and this is the shape a probe would use.
      const target =
        `http://localhost:3000${path}` +
        `?conversationId=${infoConversationId}&c=${lowConversationId}&id=${infoConversationId}`;
      const req = new Request(target, {
        method,
        headers: { 'content-type': 'application/json' },
        body:
          method === 'GET'
            ? undefined
            : JSON.stringify({
                conversationId: infoConversationId,
                id: infoConversationId,
                family: joinCode,
                name: 'Kid',
                pin: '835492',
                email: 'probe@example.test',
                message: 'hello',
              }),
      });
      await record(() => handler(req, { params: Promise.resolve(params) }));
    }
    return emitted.join('\n');
  }

  // A page: an async server component.
  const page = mod.default;
  if (typeof page !== 'function') {
    throw new Error(`${relative(process.cwd(), file)} exports no default component`);
  }
  await record(() =>
    page({
      params: Promise.resolve(params),
      searchParams: Promise.resolve({
        c: lowConversationId,
        conversationId: infoConversationId,
        id: infoConversationId,
      }),
    }),
  );
  return emitted.join('\n');
}

// ── Seed ─────────────────────────────────────────────────────────────────────

beforeAll(async () => {
  const { ensurePolicyVersion } = await import('@/lib/guardrails/policy-store');
  const { hashPin } = await import('@/lib/auth/child-pin');
  const { ensureJoinCode } = await import('@/lib/auth/join-code');
  const policyVersion = await ensurePolicyVersion(pool);

  const mkFamily = async (name: string) => {
    const f = await pool.query(`insert into families (name) values ($1) returning id`, [name]);
    return f.rows[0].id as string;
  };
  familyId = await mkFamily('g1-subject');
  otherFamilyId = await mkFamily('g1-stranger');
  joinCode = await ensureJoinCode(pool, familyId);

  const mkParent = async (fid: string, email: string) =>
    (
      await pool.query(
        `insert into parents (family_id, email, consented_at) values ($1,$2,now()) returning id`,
        [fid, email],
      )
    ).rows[0].id as string;
  parentId = await mkParent(familyId, `g1-p-${Date.now()}@example.test`);
  otherParentId = await mkParent(otherFamilyId, `g1-o-${Date.now()}@example.test`);

  const mkChild = async (fid: string, name: string) =>
    (
      await pool.query(
        `insert into children (family_id, display_name, pin_hash, age_band, activated_at)
         values ($1,$2,$3,'8-11',now()) returning id`,
        [fid, name, await hashPin('835492')],
      )
    ).rows[0].id as string;
  childId = await mkChild(familyId, 'Kid');
  otherChildId = await mkChild(otherFamilyId, 'Stranger');

  /** A conversation that IS flagged and sits below the gate. */
  const seedBelowGate = async (severity: 'info' | 'low', childWords: string) => {
    const cv = await pool.query(
      `insert into conversations (child_id, age_band, max_severity) values ($1,'8-11',$2) returning id`,
      [childId, severity],
    );
    const conversationId = cv.rows[0].id as string;

    const m = await pool.query(
      `insert into messages (conversation_id, child_id, role, content)
       values ($1,$2,'child',$3) returning id`,
      [conversationId, childId, childWords],
    );
    await pool.query(
      `insert into messages (conversation_id, child_id, role, content)
       values ($1,$2,'assistant',$3)`,
      [conversationId, childId, CANARY_REPLY],
    );
    await pool.query(
      `insert into flags (conversation_id, message_id, severity, triggered_rules, policy_version, reason)
       values ($1,$2,$3,$4,$5,'seeded below the gate')`,
      [conversationId, m.rows[0].id, severity, JSON.stringify(['pii.email']), policyVersion],
    );
    return conversationId;
  };

  infoConversationId = await seedBelowGate('info', CANARY_INFO);
  lowConversationId = await seedBelowGate('low', CANARY_LOW);
});

afterAll(async () => {
  const { eraseFamily } = await import('@/lib/retention/jobs');
  await eraseFamily(pool, familyId).catch(() => {});
  await eraseFamily(pool, otherFamilyId).catch(() => {});
  await pool.end();
});

// ── The gate ─────────────────────────────────────────────────────────────────

const surfaces = discoverSurfaces(APP);
const serverSurfaces = surfaces.filter((f) => !isClientSurface(f));
const clientSurfaces = surfaces.filter(isClientSurface);

/** Every principal that must not see below-gate content. */
const principals = (): Array<{ label: string; session: Session | null }> => [
  { label: 'the family’s own guardian', session: { principalType: 'parent', familyId, parentId } },
  {
    label: 'a guardian of another family',
    session: { principalType: 'parent', familyId: otherFamilyId, parentId: otherParentId },
  },
  {
    label: 'a child of another family',
    session: { principalType: 'child', familyId: otherFamilyId, childId: otherChildId },
  },
  { label: 'nobody at all', session: null },
];

describe('the surface list itself', () => {
  it('found the surfaces, so an empty glob cannot pass as a clean run', () => {
    expect(surfaces.length).toBeGreaterThanOrEqual(20);
  });

  it('covers every route handler and page under src/app', () => {
    // The count is asserted rather than trusted: if discovery silently stops
    // finding files, every leak assertion below passes vacuously.
    const kinds = new Set(surfaces.map((f) => f.split(sep).pop()));
    expect(kinds.has('route.ts')).toBe(true);
    expect(kinds.has('page.tsx')).toBe(true);
  });

  it('accounts for every surface as either server-driven or client', () => {
    // The two lists must PARTITION the discovered set. A surface belonging to
    // neither would be a gap that reads as a pass — the exact failure this
    // suite exists to make impossible.
    expect(serverSurfaces.length + clientSurfaces.length).toBe(surfaces.length);
    expect(serverSurfaces.length).toBeGreaterThan(0);
  });
});

describe('no surface returns a child’s words from below the gate', () => {
  for (const file of serverSurfaces) {
    const name = relative(process.cwd(), file);

    it(`${name}`, async () => {
      for (const { label, session } of principals()) {
        current = session;
        // A surface that cannot be driven FAILS here rather than being skipped.
        const emitted = await drive(file);
        for (const canary of CANARIES) {
          expect(
            emitted.includes(canary),
            `${name} leaked below-gate content to ${label}`,
          ).toBe(false);
        }
      }
    });
  }
});

describe('a client surface holds no data of its own', () => {
  for (const file of clientSurfaces) {
    const name = relative(process.cwd(), file);

    it(`${name} queries nothing and reaches data only through a driven route`, () => {
      const src = readFileSync(file, 'utf8');
      // No pool, no drizzle, no SQL. If one of these ever appears, this surface
      // has become a server surface and must be driven instead.
      expect(src).not.toMatch(/@\/lib\/db\/|from 'pg'|\bpool\.query\b/);
      expect(src).not.toMatch(/\bselect\b[\s\S]{0,60}\bfrom\s+messages\b/i);
    });
  }
});

describe('the child who wrote them still can', () => {
  it('a child reads their own below-gate conversation, which is the point of the gate', async () => {
    const { getOwnTranscript } = await import('@/lib/chat/child-transcript');
    current = { principalType: 'child', familyId, childId };
    const own = await getOwnTranscript(pool, { principalType: 'child', familyId, childId }, infoConversationId);
    expect(JSON.stringify(own)).toContain(CANARY_INFO);
  });
});
