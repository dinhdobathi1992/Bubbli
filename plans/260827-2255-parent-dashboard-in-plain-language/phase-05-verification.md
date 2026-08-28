---
phase: 5
title: "Verification"
status: completed
priority: P1
effort: "3h"
dependencies: [1, 2, 3, 4]
---

# Phase 5: Verification

<!-- Updated: Red Team Session 1 — F1, F2, F3 assertions -->

## Overview

Prove the rule id cannot come back, the crisis line has one home, and nothing about who
may read what has moved.

## Architecture

Four properties fail silently and so are asserted structurally, against source and
against a rendered page rather than by review:

| Property | Check |
|---|---|
| No identifier reaches a guardian | no rendered string matches `/^[a-z]+([._][a-z_]+)+$/` |
| Every rule has copy | enumerate `RULES` **and the synthetic ids in `engine.ts`**; every one resolves to a `FLAG_FAMILIES` entry |
| One crisis number | the literal `988` appears in exactly one module |
| Labels quote nobody | no label template interpolates anything but the child's name |
| A dynamic suffix never survives | `familyOf('evasion.devoweled.<token>')` drops the token; no rendered string contains it |
| Position never decides | reordering `RULES` changes nothing a guardian sees |
| No identifier in the projection | `FlagRowAtGate` has no `reason` and no rule id |

The first is the regression test for the whole plan. The second is what stops it
recurring the next time a rule is added — and it is the one that matters in six months,
when nobody remembers this page was ever wrong.

## Implementation Steps

1. Write the four structural tests.
2. **Verify each fails when its invariant is broken** — remove a label entry, retype 988
   in a component, interpolate content into a label. A guard that cannot fail is
   decoration; this project has already shipped one metric that measured nothing.
3. Drive the real page with a guardian session against seeded flags covering
   `harm.self.*`, `inap.*`, **a devoweled-evasion flag with a real token**, reviewed and
   unreviewed, above and below the gate.
3b. **Reorder `RULES` in a scratch branch and re-run.** Nothing a guardian sees may
   change. This is the only check that actually proves F1 is fixed rather than
   coincidentally correct again; revert the reorder afterwards.
4. Sweep both themes at 1440x900 and 390x844: empty, one flag, a dozen, crisis present.
5. Keyboard pass across both surfaces.
6. Run every gate.

## Success Criteria

- [x] No rendered string on `/parent` matches the identifier pattern — asserted
- [x] Every rule id has a label — asserted by enumeration, and PROVEN to fail without one
- [x] `988` in exactly one module — asserted, and proven to fail on a second copy
- [x] No label interpolates message content — asserted
- [x] `harm.self.*` renders the crisis card; `inap.violence` at `high` does not
- [x] Self-harm NOT first in the array still renders the card — the F1 regression
- [x] A devoweled-evasion flag renders copy containing none of the child's token — the F2 regression
- [x] The projection carries no `reason` — the F3 regression
- [x] A below-gate flag is counted and never quoted, reviewed or not
- [x] `opensTranscript` and the transcript route are byte-unchanged
- [x] `policyVersion()` unchanged — guardrails untouched
- [x] Both themes x both breakpoints x four states: no contrast failure, no horizontal
      scroll, no dead region taller than the tallest card
- [x] Keyboard-complete on both surfaces, focus visible throughout
- [x] `pnpm typecheck`, `pnpm lint`, `pnpm build`, full suite, `pnpm corpus:eval` pass

## Risk Assessment

**A green suite is read as proof of what was never tested.** This project has been here:
G4 reported 100% recall on a guardrail that missed the plainest violence request in the
language, because the corpus shared the rule's blind spot. A test that was never written
measures nothing, and a metric derived from it is worse than none because it reassures.

**Signal it broke:** a success criterion ticked without command output behind it.
**Response:** it is not done. Write the assertion.

**Step 2 is skipped because the tests already pass.** Passing proves they run, not that
they discriminate. Break each invariant once and watch the failure.

**The by-hand sweep is replaced by unit tests.** They cover the projection; they do not
cover a guardian session rendering a real page with real flags. Step 3 is not optional.
