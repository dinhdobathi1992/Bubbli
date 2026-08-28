---
phase: 2
title: "One correct env loader"
status: completed
priority: P1
effort: "2-3h"
dependencies: []
---

# Phase 2: One correct env loader

## Overview

`tests/setup.ts` and `scripts/verify-email.ts` each carry their own copy of a
naive `.env.local` parser that does not expand `\$`. The app, running under
`@next/env`, does expand it. So the two disagree about the SMTP password, and the
diagnostic script reports an authentication failure the app does not have.

## Requirements

- Functional: one loader, used by both callers.
- Functional: `\$` in a value becomes a literal `$`, matching `@next/env`.
- Functional: `pnpm email:verify` and the running app reach the same verdict on
  the same machine.
- Non-functional: no secret value is ever printed, including in failure output.
- Non-functional: the config guard that exits when a provider in the chain has no
  credentials must keep working in tests — `tests/setup.ts:3-8` is explicit that
  tests exercise the real validated config and must not bypass that guard.

## Architecture

Two options, pick during implementation:

| Option | Cost | Trade-off |
|--------|------|-----------|
| **A** — use `@next/env`'s `loadEnvConfig` directly in the shared helper | smallest; guaranteed parity by construction | pulls a Next dependency into the test bootstrap and the scripts path |
| **B** — hand-written loader that expands `\$`, shared between callers | no new dependency | parity is asserted by test, not guaranteed; can drift from `@next/env` on syntax this repo does not use yet |

**RESULT: Option A was tried and is structurally impossible. Option B shipped.**

`@next/env` skips `.env.local` entirely when `NODE_ENV === 'test'` — deliberate,
so test runs are reproducible — and vitest sets `NODE_ENV=test`. Measured from
the vitest bootstrap: `loadedEnvFiles: []`, nothing set, and `forceReload` made
no difference. `fs` worked and the import resolved to the real package, so it is
the documented test-mode exclusion, not a resolution problem.

That is the concrete problem this section asked to be recorded. It is fatal for
the caller that matters most, so Option B shipped: `expandValue()` in
`src/config/load-env.ts`, matching dotenv-expand on the rules this repo uses —
`\$` escapes, `$NAME` and `${NAME}` substitute, an unknown name resolves to
empty, a lone `$` stays, and a single-quoted value is literal.

## Related code files

- Create: `src/config/load-env.ts` (or `tests/…`/`scripts/…` shared location —
  place it where both callers can import without widening the `server-only`
  boundary that `src/config/settings.ts` enforces)
- Modify: `tests/setup.ts` — replace the inline parser with the shared loader
- Modify: `scripts/verify-email.ts` — same
- Create: `tests/config/env-loader.test.ts`

## Implementation steps

1. Add the shared loader.
2. Point `tests/setup.ts` at it. Run the full suite — 362 tests today. Any new
   failure is a real disagreement that was previously masked by the wrong
   password, not noise; read it before touching it.
3. Point `scripts/verify-email.ts` at it. Delete the inline parser and the
   "Same loader the test bootstrap uses" comment, which will no longer be a
   caveat.
4. Run `pnpm email:verify`. It must now report auth OK and name the active
   transport — the `Active transport` line that never printed, because the script
   died at the verify step before reaching it.
5. Assert the expansion in a test, using a fixture value with `\$` in it. Never
   the real credential.

## Success criteria

- [x] One loader; both callers import `loadEnv` and neither parses `.env.local`
- [x] `tests/config/env-loader.test.ts` — 6 tests, none skipped. Pins `\$` → `$`
      and explicitly pins the naive result as wrong.
- [x] `pnpm email:verify` now prints `Active transport` — the line that never
      appeared because the script died at the verify step. Forcing the SES path
      (`EMAIL_PROVIDER_ORDER=ses`) reports `SMTP credentials accepted`; the
      spurious `535` is gone.
- [x] Full suite passes: **374 tests, 18 files**. No previously-masked failure
      surfaced.
- [x] No secret printed. The two live-env tests assert only length arithmetic
      and the absence of a backslash.

## Note

`src/config/load-env.ts` is added to the G8 `no-restricted-properties` ignore
list in `eslint.config.mjs`. It is the module that *populates* `process.env` for
non-Next entry points, so it necessarily runs before there is anything for
`settings.ts` to validate — the same reason `settings.ts` itself is exempt.

## Risk assessment

**Fixing the loader surfaces failures that were hidden.** A test that quietly
passed against a corrupted password may now fail against the real one. That is
the fix working. Read each one; do not weaken the test to make it green.

**Signal it broke:** a suite failure in a test unrelated to email.
**Response:** the shared loader is changing more values than the SMTP password —
diff the resolved env before and after (keys only, never values) and find what else
was being mangled.

**`@next/env` in the vitest bootstrap.** It changes when env is resolved relative
to module import. If a test depends on setting `process.env` before importing
`settings`, ordering may shift. The existing `if (!(key in process.env))` guard
shows that precedence is already load-bearing — preserve it.
