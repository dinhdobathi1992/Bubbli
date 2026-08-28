---
phase: 1
title: "Diagnose and surface the silent send failure"
status: completed
priority: P1
effort: "3-4h"
dependencies: []
---

# Phase 1: Diagnose and surface the silent send failure

## Overview

A parent requested a code, the send failed, and the UI advanced to code entry
anyway. Establish *why* the failure was invisible, then make it visible.

## The premise is not yet proven

The obvious explanation is that Better Auth catches whatever
`sendVerificationOTP` throws and still returns success. That is a guess. There is
a second explanation the codebase itself warns about:

> SES Mail Manager returns 250 OK and a message id the moment the relay takes
> custody, long before any rule set decides what to do with it.
> — `src/lib/email/send.ts:33-42`

If the relay accepted the message and dropped it afterwards, **nothing threw**,
Better Auth swallowed nothing, and there is no bug of the kind assumed — the fix
would instead be about delivery reporting. The two cases need different work, so
settle it first.

## Step 1 RESULT — Case A, confirmed by measurement

Probe: the real `betterAuth` shape with a `sendVerificationOTP` that throws
immediately, driven through `auth.handler`.

| Callback throws | Endpoint answered |
|---|---|
| plain `Error` | `200 {"success":true}` |
| Better Auth's own `APIError` | `200 {"success":true}` |

**Case A.** Better Auth swallows both. It is not the relay-accepted-then-dropped
case, so Step 2 applies.

A second finding changed the design. The failure cannot be surfaced from inside
the callback at all — `APIError` is swallowed just as completely as `Error`. It
has to be carried out by another route and converted afterwards, which is what
`hooks.after` does. A `WeakMap` keyed on the incoming `Request` was tried first
for the correlation and does **not** work: the object the callback receives is
Better Auth's internal context, not the `Request` the hook sees, so the two
never match. `AsyncLocalStorage` is what actually ties them together.

## Step 1 — Decision gate (do this before writing any code)

Determine which case holds:

1. Write a throwaway vitest that builds the Better Auth instance with a
   `sendVerificationOTP` that throws immediately, calls the send-OTP endpoint,
   and asserts on the HTTP status and body.
2. If the endpoint returns success → **Case A, Better Auth swallows.** Continue to
   Step 2.
3. If the endpoint returns an error → **Case B.** The throw does propagate, and
   the real cause is that SES Mail Manager accepted the message and dropped it
   downstream. Stop, record the finding in this file, and re-scope: the work
   becomes delivery reporting (SES event destination / bounce handling), not
   error surfacing, and that is a different plan.

Do not skip to Step 2 because Case A "feels right". The whole reason this phase
exists is that a plausible-sounding cause already cost an investigation once.

## Step 2 — Surface it (Case A only)

### Requirements

- Functional: when the transport rejects the message, the parent sees an error on
  the sign-in form and remains on the email step.
- Functional: the server log records enough for an operator to act — transport,
  status, and reason.
- Non-functional: the user-facing message reveals nothing about the recipient,
  the credentials, or the provider. Follow the redaction already practised at
  `send.ts:113-119` and `send.ts:158-162`.
- Non-functional: a transport that hangs must not hang the sign-in. The 10s
  timeouts at `send.ts:110` and `send.ts:140-143` already bound this; do not
  loosen them.

### Architecture

`sendVerificationOTP` at `src/lib/auth/better-auth.ts:53` awaits `sendMail` and
lets it throw. If Better Auth discards that, the throw has to be converted into
something the endpoint cannot ignore — the plugin's own error type, so the
existing `{ error }` contract the client already checks
(`src/app/(parent)/parent/sign-in/page.tsx:38-42`) carries it.

The client already handles the error correctly and shows
`"We could not send a code just now. Try again in a moment."` — **no client change
is expected.** If one turns out to be needed, that is a signal the diagnosis in
Step 1 was incomplete; go back to it.

### Related code files

- Modify: `src/lib/auth/better-auth.ts` — the `sendVerificationOTP` callback
- Verify only: `src/app/(parent)/parent/sign-in/page.tsx` — should already work
- Create: `tests/auth/otp-send-failure.test.ts`

### Implementation steps

1. Convert the transport throw into the error shape the endpoint propagates.
2. Log transport, status, and short reason server-side. Recipient and subject are
   the most that may be recorded (`send.ts:18-20`); the OTP itself never.
3. Confirm by hand against the dev server that the form shows the error and stays
   on the email step.

## Success criteria

- [x] Step 1 concluded in writing — Case A, both throw types answered `200 {"success":true}`
- [x] Case A: a forced transport failure returns an error — live dev server returns
      `503 {"message":"Could not send the code."}`
- [x] The sign-in form path is unchanged and already handles it: `page.tsx:38-42`
      shows the error and stays on the email step. No client edit was needed,
      as predicted.
- [x] `tests/auth/otp-send-failure.test.ts` — 6 tests. **Verified to fail without
      the fix:** re-enabling the swallow flipped both endpoint tests to FAIL.
- [x] No OTP, recipient, or credential in any log line or test output. The
      response is asserted not to contain the provider, its status, or the address.
- [x] `pnpm typecheck`, `pnpm lint`, `pnpm build`, 374 tests — all pass

## Risk assessment

**The diagnosis is wrong again.** Mitigated by Step 1 being a gate with a defined
experiment and a defined stop condition, rather than a formality.

**Signal it broke:** the Step 1 test shows an error already propagating.
**Response:** stop, record Case B, re-scope to delivery reporting. Do not proceed
to Step 2 and "fix" something that is not broken.

**Over-reporting to the user.** A parent does not need to know a sub-processor
rejected a recipient. Generic message to the UI, detail to the log.
