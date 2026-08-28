---
title: "Path to launch"
description: "Everything genuinely unbuilt between today's 74% MVP and a Bubbli that can serve a real family."
status: in-progress
priority: P1
effort: "3-5d"
tags: [launch, parent-surface, notifications, gates, compliance]
created: 2026-08-26
continues: 260825-2326-bubbli-safeai-mvp
---

# Path to launch

## Overview

The MVP plan reports 74% (77/104). That number is misleading in both directions:
a batch of its open checkboxes describe work that is already built and passing, and
its closed ones hide the fact that **the parent half of a child-safety product cannot
be logged into and a critical flag currently notifies nobody**.

This plan is the honest remainder. Section 0 reconciles the stale bookkeeping with
evidence; the phases are only work that does not exist yet.

## 0. Reconciliation — MVP items already satisfied

Verified against the code on 2026-08-26. These stay unticked in the MVP plan only
because nobody went back to tick them; they are not open work.

| MVP item | Evidence |
|---|---|
| Age bands exactly `4-7`/`8-11`/`12`/`13-15` (V8) | `src/config/settings.ts` `AGE_BANDS`; schema CHECK; all four present in `src/lib/guardrails/rules.ts` |
| Retention columns support 90d/1y/2y (V5) | `RETENTION_*_DAYS` in settings; `src/lib/retention/jobs.ts` drives all three intervals |
| Region decision recorded | `docs/decisions/0001-region-and-residency.md` |
| Rate-limit library + datastore named and provisioned | `docs/decisions/0003-rate-limit-library.md`; Postgres `quota_events` / `family_daily_quota` live |
| PRD §7.4 at-rest amendment (V1) | PRD §7 describes provider-managed volume encryption |
| `policy_versions` stores rule bodies; historical resolution | `src/lib/guardrails/policy-store.ts`; `policyVersionId` recorded on each flag |
| Consent branches on the under-13 boundary (V8) | `src/lib/auth/consent.ts` |
| No title generation; no model call over unflagged content (V6) | zero hits in `src/lib/ai/` and `src/lib/chat/`; `schema.ts:118` documents the deliberate absence |
| No `title` field in any DTO or table (V6) | same |
| `max_severity` never decreases; dismissal does not close a transcript (V7) | `conversations_severity_monotonic` trigger + a test asserting the UPDATE is rejected |
| Access log renders `delivered` rows only | `src/lib/parent/` projection |
| **Child login rate-limited per-IP and per-route** (#15) | `checkLoginRate` hashes the IP, enforces per-IP *and* per-family windows, wired in `src/app/api/child/login/route.ts` |
| G4 — corpus gate | `pnpm corpus:eval` passes: precision gate + per-rule coverage |
| G8 — no unvalidated config | `no-restricted-properties` on `process.env` in `eslint.config.mjs`; `pnpm lint` clean |
| G2, G5, G6 | asserted in `tests/pipeline/turn.test.ts`, both ladder directions, audit row pairs, crisis path |

**Net effect:** the remaining scope is smaller than 27 items but contains two holes
the percentage never showed.

## Validation decisions (2026-08-26)

| # | Question | Decision |
|---|----------|----------|
| L1 | Does the ESLint rule satisfy G1, or is the glob suite still required? | **Both.** Keep the structural rule — it sees RSC pages and Server Actions a route manifest cannot — and build the runtime suite as originally specified. |
| L2 | What notification transport ships in MVP? | **Resend email first; web push deferred and recorded.** iOS Safari only delivers web push to an installed PWA, so push cannot be the primary channel for a child-safety alert without failing silently for most iPhone parents. |
| L3 | G7 measured on DeepSeek, which is not cleared for production child data? | **Measure now as an explicitly provisional baseline; re-measurement on Bedrock AgentCore is launch-blocking.** |
| L4 | Replacement for the raw 36-character family UUID on the child login form? | **Short indexed join code *and* a family-scoped link.** Link for the everyday case, code for a fresh device. |

## Goals

| # | Goal | Priority |
|---|------|----------|
| 1 | A parent can sign in and actually reach the dashboard | P1 |
| 2 | A critical flag reaches a human being | P1 |
| 3 | G1 proven at runtime, not only structurally | P1 |
| 4 | A child can sign in without typing a UUID | P2 |
| 5 | A latency figure exists, honestly labelled | P2 |
| 6 | No child data leaks through logs or metrics | P2 |
| 7 | Compliance premises closed or launch consciously deferred | P1 |

## Phases

| # | Phase | Status | Priority |
|---|-------|--------|----------|
| 1 | [Parent access](./phase-01-parent-access.md) | ✅ Complete | P1 |
| 2 | [Notification delivery](./phase-02-notification-delivery.md) | ✅ Complete | P1 |
| 3 | [Isolation and coverage gates](./phase-03-isolation-and-coverage-gates.md) | ✅ Complete | P1 |
| 4 | [Child join code](./phase-04-child-join-code.md) | ✅ Complete | P2 |
| 5 | [Latency baseline](./phase-05-latency-baseline.md) | Pending | P2 |
| 6 | [Operational hardening](./phase-06-operational-hardening.md) | Pending | P2 |
| 7 | [Compliance close-out](./phase-07-compliance-closeout.md) | Blocked | P1 |

## Success Criteria

- [x] A parent signs in and reaches `/parent` with a real session. **Amended:** email
      **OTP**, not email and password — there is no password to forget, reset or leak, and
      receiving the code re-proves mailbox control on every sign-in, which is what makes
      `parents.auth_user_id` safe to trust as the guardian link
- [x] A `high`/`critical` flag delivers an email to every consented guardian, carrying
      metadata only — no message content — and writes an audit row per dispatch **attempt**,
      carrying `delivered` or `failed` rather than the outcome that was hoped for
- [x] G1 runtime suite globs every surface, drives both principal types against seeded
      `info`/`low` conversations, and fails if any returns content — **and fails if a surface
      could not be driven at all.** The first version passed vacuously on 11 of 21 server
      surfaces; see phase 3
- [x] Every AI-invoking route is quota-covered; a new one without quota fails a test.
      Discovery follows `await import()` and covers pages and Server Actions, not only
      route handlers
- [x] A child signs in with a short join code, or follows a family link and types only
      name and PIN
- [ ] A p50/p95 figure exists, labelled as measured on a non-production provider *(phase 5)*
- [ ] No message content, PIN, email or display name appears in any log line *(phase 6.
      Partially advanced: provider error text now has the recipient removed before it can
      reach a log. The dev/preview log fallback still writes a guardian address and a
      child's display name to stdout — `src/lib/email/send.ts`, gated to non-production)*
- [x] `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm corpus:eval`, `pnpm test:mutation` pass
- [ ] Dependency audit and secret scan clean *(phase 6 — neither runs in CI yet)*

## Launch blockers outside this repo

Phase 7 cannot be closed by writing code. Until `PROVIDER_COMPLIANCE` has a cleared
provider, `src/config/settings.ts` refuses to boot in production **by design** — that
is the gate working, not a bug to route around.

## Open questions

- **Q-B (COPPA verifiable parental consent depth).** Email-plus-affirmation is what is
  built. Whether that clears "verifiable" for the target markets is a legal
  determination, not an engineering one, and it gates the under-13 bands.
