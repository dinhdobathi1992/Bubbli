/**
 * Every route that can reach a model is quota-covered.
 *
 * The failure this prevents is not a bug in today's code — `/api/chat` checks
 * its quota. It is the route somebody adds in six months: a "regenerate", a
 * "summarise", a second chat entry point, wired to the pipeline and shipped
 * without a limiter, spending a family's daily budget from a path nobody
 * thought to look at.
 *
 * So the AI-invoking set is DISCOVERED, never listed. A new route that reaches
 * `src/lib/ai` is picked up automatically and must prove it checks the quota;
 * there is no allow-list to forget to update, and adding one to make this pass
 * is the thing a reviewer should refuse.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync, existsSync } from 'fs';
import { join, relative, dirname, resolve, sep } from 'path';

const ROOT = process.cwd();
const SRC = join(ROOT, 'src');
const APP = join(SRC, 'app');

/** Where generation actually happens. Reaching either means spending a model. */
const AI_MODULES = [join(SRC, 'lib', 'ai'), join(SRC, 'lib', 'chat', 'pipeline.ts')];

/** The limiter a spending route must call. */
const QUOTA_MODULE = join(SRC, 'lib', 'quota', 'limiter.ts');

function walk(dir: string, match: (f: string) => boolean, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, match, out);
    else if (match(full)) out.push(full);
  }
  return out;
}

/** Resolve an import specifier to a file on disk, or null if it leaves src/. */
function resolveImport(spec: string, fromFile: string): string | null {
  let base: string;
  if (spec.startsWith('@/')) base = join(SRC, spec.slice(2));
  else if (spec.startsWith('.')) base = resolve(dirname(fromFile), spec);
  else return null; // a package, not our code

  for (const candidate of [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    join(base, 'index.ts'),
    join(base, 'index.tsx'),
  ]) {
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
  }
  return null;
}

/**
 * Static imports, side-effect imports, re-exports, `await import()` and
 * `require()`.
 *
 * The lazy form matters and is not hypothetical: `src/lib/notify/dispatch.ts`
 * already uses `await import('./transports/email')`. A regex requiring
 * whitespace before the quote misses `import(` entirely, so a future
 * `/api/regenerate` doing `const { runTurn } = await import('@/lib/chat/pipeline')`
 * would escape discovery — the precise failure this file exists to prevent.
 *
 * `import type` is excluded: a type-only import is erased at build time and
 * cannot invoke anything.
 */
const IMPORT = /(?:\bfrom\s*|\bimport\s*\(\s*|\brequire\s*\(\s*|\bimport\s+)['"]([^'"]+)['"]/g;
const TYPE_ONLY = /\bimport\s+type\b[^'"]*['"]([^'"]+)['"]/g;

/** Every file a surface can reach, following our own modules only. */
function moduleGraph(entry: string): Set<string> {
  const seen = new Set<string>();
  const queue = [entry];
  while (queue.length) {
    const file = queue.pop()!;
    if (seen.has(file)) continue;
    seen.add(file);
    const src = readFileSync(file, 'utf8');
    const typeOnly = new Set([...src.matchAll(TYPE_ONLY)].map((m) => m[1]));
    for (const m of src.matchAll(IMPORT)) {
      if (typeOnly.has(m[1])) continue;
      const target = resolveImport(m[1], file);
      if (target && !seen.has(target)) queue.push(target);
    }
  }
  return seen;
}

const reaches = (graph: Set<string>, targets: string[]) =>
  [...graph].some((f) => targets.some((t) => f === t || f.startsWith(t + sep)));

/**
 * Pages and Server Actions spend a model just as a route handler does.
 *
 * Restricting this to `route.ts` left an RSC page or an `actions.ts` calling
 * the pipeline entirely invisible to the gate. The G1 suite already globs all
 * three; so does this.
 */
const SURFACE = new Set(['route.ts', 'page.tsx', 'actions.ts']);
const routes = walk(APP, (f) => SURFACE.has(f.split(sep).pop()!));
const graphs = new Map(routes.map((r) => [r, moduleGraph(r)]));
const aiRoutes = routes.filter((r) => reaches(graphs.get(r)!, AI_MODULES));
const named = (f: string) => relative(ROOT, f);

describe('discovery', () => {
  it('found route handlers to examine', () => {
    expect(routes.length).toBeGreaterThan(5);
  });

  it('found at least one AI-invoking route, so this cannot pass vacuously', () => {
    // If the graph walk silently stops resolving imports, `aiRoutes` empties
    // and every assertion below becomes true of nothing.
    expect(aiRoutes.length).toBeGreaterThan(0);
    expect(aiRoutes.map(named)).toContain(join('src', 'app', 'api', 'chat', 'route.ts'));
  });

  it('does not mistake every route for an AI route', () => {
    // A walk that over-resolves would mark the whole app as spending, which
    // would make the gate meaningless in the other direction.
    expect(aiRoutes.length).toBeLessThan(routes.length);
  });
});

describe('every AI-invoking route checks the quota', () => {
  for (const route of aiRoutes) {
    it(`${named(route)}`, () => {
      const src = readFileSync(route, 'utf8');
      // Reaching the limiter transitively is not enough — the pipeline itself
      // imports plenty. The ROUTE must call it, before it spends anything.
      expect(
        /checkChatQuota\s*\(/.test(src),
        `${named(route)} can reach a model but never calls checkChatQuota`,
      ).toBe(true);
      expect(reaches(graphs.get(route)!, [QUOTA_MODULE])).toBe(true);
    });
  }
});

describe('a route that spends must also record', () => {
  for (const route of aiRoutes) {
    it(`${named(route)} records usage against the budget it checked`, () => {
      // Checking without recording is a limiter that never fills: every request
      // passes, forever, and the budget is decorative.
      expect(/recordChatUsage\s*\(/.test(readFileSync(route, 'utf8'))).toBe(true);
    });
  }
});
