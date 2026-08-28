---
title: "Email delivery honesty"
description: "Stop the OTP flow claiming a code was sent when it was not, and stop the env loaders authenticating with a corrupted SMTP password."
status: completed
priority: P1
effort: "0.5-1d"
tags: [email, auth, config, diagnostics]
created: 2026-08-27
---

# Email delivery honesty

## Overview

A parent asked for a sign-in code, got the "Enter your code" screen, and no code
ever arrived. Nothing anywhere reported a failure — not the UI, not the logs the
operator would look at first, and not the diagnostic script written for exactly
this question. The delivery problem itself was environmental and is already
fixed. What this plan repairs is that **every layer that should have said so,
lied.**

That is the theme. Three defects, one property: the system reports success it has
not earned.

## What actually happened (2026-08-27)

Established by measurement, in order:

| # | Fact | Evidence |
|---|------|----------|
| 1 | SES is in sandbox; only `info@dinhdobathi.com` is verified | `sesv2 get-account` → `ProductionAccess: false`; `list-email-identities` |
| 2 | `EMAIL_PROVIDER_ORDER` was `ses,resend` — SES first | `.env.local:25` |
| 3 | `chooseTransport()` picks the first **configured** provider and never falls back on failure | `src/lib/email/send.ts:70-78` |
| 4 | So Resend, fully working and second in the order, was never tried | (3) + (2) |
| 5 | SMTP credentials are valid; the app authenticates fine | `verifyMailTransport()` under `@next/env` → `SMTP AUTH OK … transport: ses` |
| 6 | `pnpm email:verify` nonetheless reported `535 Authentication Credentials Invalid` | script run, same machine, same `.env.local` |

Item 6 is the one that cost the most time. It is a false negative, and it pointed
the investigation at the credentials — which were fine — instead of the recipient.

**Already fixed, outside this plan:** `EMAIL_PROVIDER_ORDER` is back to
`resend,ses`, restoring the transport decision that was made yesterday and which
a later change had reverted without flagging it.

## Decisions taken

| # | Decision | Why |
|---|----------|-----|
| D1 | **One env loader, shared** by `tests/setup.ts` and `scripts/verify-email.ts` | The naive loader is copy-pasted in both, and `verify-email.ts` even documents the duplication. One correct implementation, two callers. |
| D2 | **The shared loader must expand `\$`** the way `@next/env` does | This is the whole bug. See "The loader defect" below. |
| D3 | **Diagnose D3 before fixing it** — do not assume Better Auth swallows the error | The relay may have accepted and dropped it later, in which case there is no swallowing bug and the fix is different. `send.ts:33-42` documents exactly this hazard. |
| D4 | Transport **fallback on failure** is raised as a question, not implemented | It would have masked this incident entirely — arguably good, arguably worse. Needs a call. See "Open questions". |

## The loader defect

`SES_SMTP_PASSWORD` contains two `$` characters. Next's `@next/env` runs
dotenv-expand, which treats a bare `$` as the start of a variable reference and
eats it — the app received 28 characters where the file held 32. The fix applied
earlier was to escape them in `.env.local` as `\$`.

That fix is correct **for the app**, and wrong for everything that does not expand:

```
.env.local holds        …\$…\$…        34 chars
@next/env expands to    …$…$…          32 chars   ← app: correct
naive loader passes     …\$…\$…        34 chars   ← tests + script: WRONG
```

`tests/setup.ts:9-27` and `scripts/verify-email.ts:15-27` both use the naive
loader. So the diagnostic script authenticates with a corrupted password and
reports `535`, and the test suite has been running against the same corrupted
value. No test asserts on it today, so nothing failed — the exposure is that
nothing *would* fail.

## Goals

| # | Goal | Priority |
|---|------|----------|
| 1 | A failed OTP send is visible to the parent, not hidden behind a code entry box | P1 |
| 2 | `pnpm email:verify` gives the same verdict as the running app, always | P1 |
| 3 | One env loader, correct, used by every non-Next entry point | P2 |
| 4 | A regression in any of the above fails a test rather than an inbox | P1 |

## Non-goals

- Requesting SES production access, or fixing the `dinhdobathi.com` SPF and the
  three unpublished DKIM CNAMEs. Real work, tracked elsewhere, not this.
- Changing the transport order again. It is correct now.
- Any change to what the OTP email says or how Better Auth issues codes.

## Phases

| # | Phase | Status | Depends on |
|---|-------|--------|------------|
| 1 | [Diagnose and surface the silent send failure](phase-01-surface-send-failure.md) | **completed** | — |
| 2 | [One correct env loader](phase-02-shared-env-loader.md) | **completed** | — |

Phases are independent and may run in either order.

## Acceptance criteria

- [x] Forcing a send failure produces a visible error and keeps the user on the
      email step. Live: `503 {"message":"Could not send the code."}`.
- [x] `tests/auth/otp-send-failure.test.ts` covers it and was **proven** to fail
      when the swallow is reintroduced.
- [x] `pnpm email:verify` and the app now agree; the spurious `535` is gone.
- [x] `tests/config/env-loader.test.ts` pins `\$` → `$` and pins the naive result
      as wrong.
- [x] `pnpm typecheck`, `pnpm lint`, `pnpm build`, 374 tests — all pass.
- [x] No secret value printed anywhere.

## Not done

- **Independent code review.** `AGENT.md` §2A requires a second read-only agent
  in a herdr pane; `HERDR_ENV` is unset in this session, so it could not be
  spawned. Self-review only. Flagged rather than silently skipped.
- Open question 1 below is still open and nothing was built for it.

## Risks

| Risk | Mitigation |
|------|------------|
| Phase 1's premise is wrong — the relay accepted and dropped, so there is nothing to surface | Phase 1 step 1 is a decision gate that settles this by measurement before any code changes |
| Surfacing transport errors leaks recipient or credential detail into the UI | Error text stays generic to the user; detail goes to the server log, which already redacts. `send.ts:113-119` and `:158-162` set the precedent |
| The shared loader diverges from `@next/env` on some other syntax (quotes, multiline, `${VAR}`) | Scope the loader to the expansion rules this repo actually uses, and test those cases explicitly rather than claiming general dotenv parity |

## Open questions

1. **Should a transport failure fall through to the next provider in the order?**
   Today it does not, which is why one sandboxed provider blocked a working one.
   Falling back would have delivered the code — but it would also have hidden a
   real misconfiguration, and it means a message about a child could silently move
   to a different sub-processor than the one the environment declared. That
   crosses `EMAIL_COMPLIANCE`, so it is a compliance decision, not a code
   preference. Not implemented pending an answer.
2. Should `pnpm email:verify` warn when the active transport cannot reach a given
   recipient — SES in sandbox with an unverified address is a knowable condition,
   and checking it is one API call.
