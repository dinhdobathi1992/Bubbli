---
phase: 7
title: "Quotas Retention and Launch Hardening"
status: pending
priority: P1
effort: "4d"
dependencies: [1, 2, 3, 4, 5, 6]
---

# Phase 7: Quotas Retention and Launch Hardening

> **Revised by red team:** findings #11, #13, #15 and second-tier items applied. Priority raised
> P2 → P1: this phase holds deletion-on-request and acceptance criterion 3, neither of which is
> optional hardening.

> **Status 2026-08-26: PARTIAL.** Atomic family ceiling (concurrency-tested), per-child window,
> retention jobs on the V5 clocks, erasure by pseudonym, liveness-only /health, and Stryker
> wired into CI. **Not done:** login rate limiting is built but not yet applied as middleware to
> every unauthenticated route; log redaction; dependency audit.

## Overview

Per-family AI spend ceiling that demonstrably enforces, data retention, deletion on request, and
the pre-launch pass.

**Q-A resolved (V5): 90d content · 1y flags · 2y audit.** One clock per data class, longest-lived
last — flags outlive the conversations they describe so a purged conversation stays reviewable in
summary, and audit rows outlive both so the "parents saw only flagged content" proof survives the
content it proves. **The 30d post-dismissal clock is dropped as redundant** (V7: dismissal stops
notifications and nothing else). Legal still confirms the model; the shape no longer blocks work.
Phase 1's pseudonym indirection (R2) keeps erasure safe against the append-only audit.

## Requirements

**Functional**
- Per-child rate limit and per-family daily ceiling on **every** AI-invoking path, using the library
  and datastore **already chosen in Phase 1** (`docs/decisions/0003`).
- Per-IP and per-route limits on **unauthenticated** routes — the child login endpoint is not an
  AI-invoking path and was previously uncovered. (#15)
- Retention jobs implementing the single agreed Q-A model.
- Deletion on request: full family erasure, pseudonymising audit rows via `family_pseudonyms`.
- Health endpoint disclosing liveness only.

**Non-functional**
- **G3: deleting the quota middleware fails a named test, re-verified every CI run by mutation
  testing** — not a one-time manual check.
- The daily ceiling must be **atomic**, not check-then-act.
- Metrics endpoint authenticated, or absent.
- No message content, PIN, email, or display name in application logs. (2nd tier)

## Architecture

**Quota enforcement** uses the Phase 1-chosen library. It is **not** hand-rolled.

The prior art hand-rolled a Redis/Lua sliding-window limiter whose wrapper computed
`allowed = remaining >= 0 && count <= limit`. Because the script only added an entry in the
under-limit branch, the count could never exceed the limit, so the expression was unconditionally
true. Simulation confirmed **20 of 20 requests allowed against a limit of 5**. It had zero tests.
Both facts are the point.

**The daily ceiling is a separate mechanism and must be atomic (#13):**
`UPDATE ... SET count = count + 1 WHERE count < limit RETURNING count`, or an atomic INCR evaluated
on its return. A check-then-act ceiling overshoots by N-1 per boundary crossing under concurrency —
and a sequential N/N+1 test cannot detect that, which is why a **concurrency test** is required.

**Quota ordering (#13).** The quota check sits before the input gate, so a message the gate blocks
still consumes family budget despite never reaching Bedrock. Decide and record: either move the
decrement after a successful provider call, or refund on block and abort. State it explicitly — the
prior art consumed budget on blocked and failed calls both.

**Health endpoints.** The reviewed implementation returned provider endpoints to anonymous callers.
Here `/health` returns status and timestamp. No provider names, endpoints, or model ids.

## Related Code Files

- Create: `src/lib/quota/limiter.ts`, `quota/ceiling.ts`, `quota/middleware.ts`
- Create: `src/lib/retention/jobs.ts`, `retention/erase.ts`
- Create: `src/lib/log/redact.ts`
- Create: `src/app/api/health/route.ts`
- Create: `tests/quota/guard-removal.test.ts`, `concurrency.test.ts`, `route-coverage.test.ts`
- Create: `tests/retention/*.test.ts`, `tests/log/redaction.test.ts`
- Modify: `src/app/api/chat/route.ts`, `stryker.config.json`

## Implementation Steps

1. Implement the limiter over the Phase 1-chosen library and datastore. Do not re-open the choice
   here, and do not copy the prior-art Lua.
2. Implement the daily ceiling as a **single atomic operation**. (#13)
3. Apply the middleware to every AI-invoking route. Write `route-coverage.test.ts` enumerating those
   routes so a new one without quota fails.
4. Extend rate limiting to unauthenticated routes — child login above all. (#15)
5. **Write `tests/quota/guard-removal.test.ts`**: drive the real `/api/chat` past the limit, assert
   429. Add the quota modules to Stryker so removal fails **every** CI run, not once by hand. (G3)
6. Assert the off-by-one at the real route: with limit N, request N allowed, N+1 refused.
7. **Write `tests/quota/concurrency.test.ts`**: fire `limit + 10` requests in parallel, assert
   exactly `limit` succeed. This is the case a sequential test structurally cannot catch. (#13)
8. Decide and record whether gate-blocked and aborted requests consume budget. (#13)
9. **[V5]** Implement retention jobs: conversations purge at **90d**, flags at **1y**, audit rows at
   **2y**. No post-dismissal revocation job — that clock is dropped (V7).
10. **[V5]** Implement family erasure: delete child content, and **pseudonymise audit rows by
    deleting the `family_pseudonyms` row** — no `UPDATE` on `audit_events`, so Phase 1's
    append-only guarantee holds under GDPR erasure. (#11, R2)
11. Implement `/health` returning liveness only. Assert no provider name, endpoint or model id.
12. Authenticate the metrics endpoint, or omit it.
13. Implement `redact.ts` and `tests/log/redaction.test.ts`: no message content, PIN, email or
    display name reaches application logs. The prior art logged a child's full profile at info level
    on every login. (2nd tier)
14. Pre-launch pass: dependency audit, secret scan, confirm no `process.env` outside config (G8),
    and **confirm the G9 artefacts from Phase 1 are still current** — DPA, ZDR, at-rest encryption.

## Success Criteria

- [x] Request N allowed, N+1 refused, at the real route
- [x] **`limit + 10` parallel requests admit exactly `limit`** (#13)
- [x] **Mutation testing fails CI when the quota middleware is removed** — every run (G3)
- [ ] Every AI-invoking route covered; a new one without quota fails the enumeration test
- [ ] **Child login is rate-limited per-IP and per-route** (#15)
- [ ] Budget behaviour on gate-blocked and aborted requests is decided and recorded
- [x] Retention jobs implement **90d content / 1y flags / 2y audit**, with a test per clock (V5)
- [x] No post-dismissal revocation job exists (V5, V7)
- [x] **Family erasure pseudonymises audit rows without any `UPDATE` on `audit_events`** (#11)
- [x] `/health` contains no provider name, endpoint or model id
- [ ] Metrics authenticated, or absent
- [ ] No message content, PIN, email or display name in logs (2nd tier)
- [ ] G9 artefacts re-confirmed current at launch
- [ ] Dependency audit and secret scan clean

## Risk Assessment

**A limiter that unit-tests green but is not wired.** Signal: `tests/quota/*` passes while the real
route is unlimited. Response: step 5 drives the actual route, and Stryker re-checks it every run.

**Legal rejects the V5 retention model.** Signal: counsel requires shorter content retention or
longer audit retention than 90d/1y/2y. Response: the clocks are configuration, not structure —
change the values, keep the three-class shape. Only a demand to *delete* audit rows would be
structural, and R2's pseudonym indirection already answers that.

**Append-only audit vs right-to-erasure.** Previously an unresolved conflict discovered here.
Phase 1's `family_pseudonyms` indirection (R2) resolves it structurally: erasure deletes a pseudonym
row, audit rows are never mutated. Signal it is still unresolved: step 10 requires an `UPDATE` on
`audit_events`. Response: the Phase 1 design was not implemented as specified — fix there, not here.

**This phase is the slip target.** Signal: schedule pressure late in the project. Response: cuttable
here is `/health` polish, metrics auth, and log-redaction scope. **Not cuttable:** quota enforcement
and its guard test (acceptance criterion 3), and deletion-on-request (a legal obligation). Extend
the date or cut the launch instead.

<!-- Updated: Validation Session 1 - V5 retention model settled -->
