# 0003 — Rate limiting: library and datastore

**Status:** decided
**Date:** 2026-08-26

Red-team finding #13: deferring this choice to Phase 7 risked discovering on
day ~30 that no proven sliding-window library fits the stack, with both
alternatives already ruled out. Deciding it in Phase 1 is the fix.

## Constraint

The stack provisions exactly one datastore: PostgreSQL. Phase 3 rejects a
cache-only counter for security state, because a counter that resets on eviction
is a bypass. Mainstream sliding-window libraries are Redis-first.

## Decision

**Postgres-backed limiting, no new datastore, no new sub-processor.**

Two mechanisms, deliberately separate:

1. **Per-child rate limit** — sliding window over a `quota_events` table,
   pruned by the retention job.
2. **Per-family daily ceiling** — a single **atomic** statement:
   `UPDATE ... SET count = count + 1 WHERE count < limit RETURNING count`.
   Check-then-act overshoots by N-1 per boundary crossing under concurrency,
   and a sequential N/N+1 test cannot detect that.

## Why not a library

The red team's rule was "never hand-rolled", aimed at the prior art's Redis/Lua
limiter whose wrapper computed `allowed = remaining >= 0 && count <= limit` —
unconditionally true, so it admitted 20 of 20 requests against a limit of 5,
with zero tests.

The lesson is not "always use a library". It is "never ship an unproven limiter".
Adding Upstash or another Redis host would introduce a sub-processor holding
children's request metadata and a second residency decision, to avoid roughly
thirty lines of SQL. As the review itself put it: a small fully-tested
implementation is defensible; discovering the constraint on day 24 is not.

## Mandatory tests (Phase 7)

- Request N allowed, request N+1 refused, **at the real route**
- `limit + 10` requests fired in parallel admit **exactly** `limit`
- Removing the middleware fails a named test, re-verified every CI run by
  mutation testing (gate G3)
- Recorded decision on whether gate-blocked and aborted requests consume budget
