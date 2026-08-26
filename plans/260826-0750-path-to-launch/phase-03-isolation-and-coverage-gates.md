---
phase: 3
title: "Isolation and coverage gates"
status: pending
priority: P1
effort: "5h"
dependencies: [1]
---

# Phase 3: Isolation and coverage gates

## Overview

G1 is currently enforced structurally by an ESLint rule and not at all at runtime.
Decision L1 keeps the rule and adds the suite the MVP plan specified. Two smaller
coverage holes close here too: nothing proves every AI-invoking route is quota-covered,
and the history-ordering test was never written.

## Requirements

- Functional: the G1 suite enumerates every surface by filesystem glob over `src/app/**`
  — route handlers, pages, and Server Actions — and drives each with both principal types.
- Functional: seeds are `info`/`low` conversations, not merely unflagged ones. The leak
  surface is a flagged row below the gate; an unflagged row does not exercise it.
- Functional: a new AI-invoking route added without a quota check fails a test.
- Non-functional: the suite must fail loudly when a surface is added, not silently skip it.

## Architecture

The ESLint rule and the runtime suite prove different things and neither subsumes the
other, which is why decision L1 keeps both.

| | ESLint rule (built) | Runtime suite (this phase) |
|---|---|---|
| Proves | Who may read `messages.content` | What a real request actually returns |
| Covers RSC pages and Server Actions | Yes — sees every file | Only if the glob finds them |
| Catches a leak through an audited module | No — that module is allow-listed | Yes |
| Fails when | Code is written | Code is run |
| Blind spot | A permitted module leaking downstream | A surface the glob misses |

The rule constrains *who may read the column* and therefore covers surfaces no route
manifest can enumerate. The suite proves *what a real request returns*, which no static
rule can establish.

Quota coverage is enumerated the same way, which is the only mechanism that survives
someone adding a route and forgetting: discover the routes from the filesystem, assert
each AI-invoking one calls the limiter, and fail on an unrecognised new route rather
than passing by omission.

## Related Code Files

- Create: `tests/isolation/g1-surfaces.test.ts`
- Create: `tests/routes/quota-coverage.test.ts`
- Create: `tests/chat/history-ordering.test.ts`
- Modify: `plans/260825-2326-bubbli-safeai-mvp/plan.md` (record that G1 is proven both ways)

## Implementation Steps

1. Glob `src/app/**` for route handlers, pages, and Server Actions; build the surface list
   at test time so a new file is discovered automatically.
2. Seed a family with conversations at `info` and at `low` — flagged, below the gate.
3. Drive every surface with a parent principal and with a child principal; assert no
   response body contains any seeded message content.
4. Assert the suite itself fails when a surface is added to the glob but not to the
   drive list, so an untested surface cannot pass silently.
5. Enumerate AI-invoking routes and assert each calls `checkChatQuota`.
6. Write the history-ordering test: seed 30 messages, expect most-recent-N returns 11–30.

## Success Criteria

- [ ] G1 suite globs every surface and drives both principal types
- [ ] Seeds are flagged `info`/`low` conversations, not unflagged ones
- [ ] Adding a surface without covering it fails the suite
- [ ] Every AI-invoking route is quota-covered; an uncovered new route fails
- [ ] History ordering proves most-recent-N (seed 30, expect 11–30)
- [ ] The ESLint rule stays in place and `pnpm lint` is clean

## Risk Assessment

A glob-driven suite that cannot construct a valid request for some surface will be
tempted to skip it, and a skipped surface reads as a pass. Signal: a `skip`, a `try/catch`
that swallows, or a surface count that drops between runs. Response: assert the surface
count explicitly and fail on any surface the suite could not drive, rather than
tolerating a silent gap in the gate that protects a child's conversation from a parent.
