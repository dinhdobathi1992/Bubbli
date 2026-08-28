/**
 * Metrics are authenticated or absent. There is no third option.
 *
 * The reviewed prior art returned provider endpoints to anonymous callers,
 * disclosing internal infrastructure. This suite exists so the absence stays an
 * absence: a metrics route added later, unauthenticated, fails here rather than
 * shipping quietly.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join, relative } from 'path';

const ROOT = process.cwd();
const API = join(ROOT, 'src', 'app', 'api');

function routes(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) routes(full, out);
    else if (entry === 'route.ts') out.push(full);
  }
  return out;
}

const all = routes(API);
const named = (f: string) => relative(ROOT, f);

/**
 * Assert on CODE, not prose. The health route's own comment names the things it
 * refuses to disclose, so a naive grep over the whole file matches the
 * explanation and reports the opposite of the truth.
 */
const withoutComments = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ');

/** A route that observes the system rather than serving a user. */
const TELEMETRY = /metric|prometheus|telemetry|\bstats\b|diagnostic/i;

describe('no unauthenticated observability surface', () => {
  it('found routes to examine', () => {
    expect(all.length).toBeGreaterThan(5);
  });

  for (const file of all) {
    const rel = named(file);
    const src = withoutComments(readFileSync(file, 'utf8'));
    const looksLikeTelemetry = TELEMETRY.test(rel) || TELEMETRY.test(src);
    if (!looksLikeTelemetry) continue;

    it(`${rel} requires a principal`, () => {
      expect(
        /getSession\s*\(/.test(src),
        `${rel} looks like telemetry and resolves no principal`,
      ).toBe(true);
    });
  }
});

describe('the health endpoint stays liveness only', () => {
  const src = withoutComments(readFileSync(join(API, 'health', 'route.ts'), 'utf8'));

  it('discloses no provider, model, version or endpoint', () => {
    expect(src).not.toMatch(/deepseek|bedrock|resend|\bses\b|model|version|endpoint/i);
  });

  it('reads nothing from the database', () => {
    // A liveness probe that queries is a denial-of-service amplifier and a way
    // to infer schema state without a session.
    expect(src).not.toMatch(/@\/lib\/db\/|pool\.query/);
  });
});
