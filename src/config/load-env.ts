/**
 * Load `.env.local` the way the running app loads it.
 *
 * Next loads env itself, so no app code imports this. It exists for the entry
 * points that are NOT Next — the vitest bootstrap and the `tsx` scripts — which
 * previously each carried their own hand-rolled parser.
 *
 * Those parsers were wrong in a way that was expensive to find. Next runs
 * dotenv-expand, which treats a bare `$` as the start of a variable reference;
 * `SES_SMTP_PASSWORD` contains two, so the file has to escape them as `\$`. A
 * parser that does not expand hands the backslashes straight through:
 *
 *     .env.local holds     …\$…\$…     34 chars
 *     expanded             …$…$…       32 chars   ← what the app authenticates with
 *     naive parser         …\$…\$…     34 chars   ← what tests and scripts used
 *
 * The result was `pnpm email:verify` reporting `535 Authentication Credentials
 * Invalid` for credentials the app was using perfectly well, and the whole
 * suite silently running against a corrupted password. A diagnostic that
 * disagrees with production is worse than no diagnostic.
 *
 * ── Why this does not just call `@next/env` ──────────────────────────────────
 *
 * That was the obvious answer and it does not work. `loadEnvConfig` skips
 * `.env.local` entirely when `NODE_ENV === 'test'` — deliberately, so that test
 * runs are reproducible — and vitest sets `NODE_ENV=test`. Measured 2026-08-27:
 * called from the vitest bootstrap it returns `loadedEnvFiles: []` and sets
 * nothing, with `forceReload` making no difference. So for the one caller that
 * matters most it is structurally unable to do the job.
 *
 * Hence a small expander here, matching dotenv-expand on the rules this repo
 * actually relies on: `\$` escapes, `$NAME` and `${NAME}` substitute from
 * already-resolved values, an unknown name resolves to empty, and a
 * single-quoted value is taken literally. Those cases are pinned in
 * `tests/config/env-loader.test.ts` against real fixtures.
 */
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

/**
 * dotenv-expand's substitution, over the syntax this repo uses.
 *
 * `env` is the lookup source, which is `process.env` plus anything already
 * resolved from earlier lines — the same ordering dotenv-expand uses, so a
 * later value can reference an earlier one.
 */
export function expandValue(value: string, env: Record<string, string | undefined>): string {
  let out = '';
  for (let i = 0; i < value.length; i += 1) {
    const c = value[i];

    // `\$` is the escape that makes a literal dollar survive.
    if (c === '\\' && value[i + 1] === '$') {
      out += '$';
      i += 1;
      continue;
    }

    if (c === '$') {
      const rest = value.slice(i + 1);
      const match = rest.match(/^\{([A-Za-z_][A-Za-z0-9_]*)\}/) ?? rest.match(/^([A-Za-z_][A-Za-z0-9_]*)/);
      if (match) {
        // An unresolved name becomes empty, which is what silently ate two
        // characters out of the SMTP password before it was escaped.
        out += env[match[1]] ?? '';
        i += match[0].length;
        continue;
      }
      // A dollar with no name after it is just a dollar.
      out += '$';
      continue;
    }

    out += c;
  }
  return out;
}

let loaded = false;

/**
 * Idempotent, so every entry point can call it without coordinating.
 *
 * A value already present in `process.env` always wins. That precedence is
 * load-bearing: it is what lets a caller override a single key for one run
 * (`EMAIL_PROVIDER_ORDER=ses pnpm email:verify`) without editing the file.
 */
export function loadEnv(dir: string = process.cwd()): void {
  if (loaded) return;
  loaded = true;

  const path = join(dir, '.env.local');
  if (!existsSync(path)) return;

  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) continue;

    const eq = trimmed.indexOf('=');
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();

    const singleQuoted = value.startsWith("'") && value.endsWith("'") && value.length >= 2;
    const doubleQuoted = value.startsWith('"') && value.endsWith('"') && value.length >= 2;
    if (singleQuoted || doubleQuoted) value = value.slice(1, -1);

    // dotenv does not expand inside single quotes.
    if (!singleQuoted) value = expandValue(value, process.env);

    if (!(key in process.env)) process.env[key] = value;
  }
}
