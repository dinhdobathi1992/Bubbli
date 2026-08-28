---
phase: 5
title: "Verification"
status: completed
priority: P1
effort: "4h"
dependencies: [1, 2, 3, 4]
---

# Phase 5: Verification

## Overview

Prove the two registers stayed one system, the guardian surface did not move,
and nothing a child's device fetches left the origin.

## Architecture

Four properties fail silently and so are asserted structurally:

| Property | Check |
|---|---|
| One system, two registers | spacing, radius and type-ramp tokens declared exactly once; no colour token in the shared block |
| The guardian surface is untouched | rendered markup for `/parent` identical before and after |
| Nothing leaves the origin | no font or icon URL in the built output |
| The child register ignores the OS | no `prefers-color-scheme` rule applies to `[data-register='warm']` |

The first is the one that matters in six months. Two registers is a reasonable
design; two *systems* is what it decays into, and the decay is invisible until
someone adds a radius to one side only.

## Implementation Steps

1. Write the four structural tests.
2. **Verify each fails when its invariant is broken** — add a colour to the
   shared block, add a font `<link>`, put a media query on the warm register. A
   guard that cannot fail is decoration; this project has already shipped one
   metric that measured nothing.
3. Contrast sweep over the child register: every pair, computed, recorded.
4. Both OS modes x both breakpoints x every child surface: `/chat` empty,
   `/chat` with history, sidebar open and closed, `/login`, `/pair`.
5. Keyboard pass across the child surface.
6. Run every gate, including `policyVersion()` and `corpus:eval` — nothing here
   touches the guardrails, and that should be visible rather than assumed.

## Success Criteria

- [x] Shared scale declared once; no colour in the shared block — asserted, and
      proven to fail when a colour is added
- [x] `/parent` rendered markup byte-identical to the shipped build
- [x] No font or icon URL in the built output — asserted against the build
- [x] No `prefers-color-scheme` rule reaches `[data-register='warm']`
- [x] Every child-register pair >= 4.5:1 (>= 3:1 large), recorded in the report
- [x] Both OS modes produce the same child rendering
- [x] No serif on any child surface
- [x] Keyboard-complete on the child surface, focus visible throughout
- [x] Existing chat tests all pass — focus trap, no-delete, flagged-label
- [x] `policyVersion()` unchanged
- [x] `pnpm typecheck`, `pnpm lint`, `pnpm build`, full suite, `pnpm corpus:eval` pass

## Risk Assessment

**A green suite read as proof of what was never tested.** This project has been
here: G4 reported 100% recall on a guardrail that missed the plainest violence
request in the language, because the corpus shared the rule's blind spot. A test
that was never written measures nothing, and a metric derived from it is worse
than none because it reassures.

**Signal it broke:** a success criterion ticked without command output behind it.
**Response:** it is not done. Write the assertion.

**The by-hand sweep replaced by unit tests.** They cover tokens and markup; they
do not cover a real browser in dark mode showing a child a light room. Step 4 is
not optional.

**"Byte-unchanged" asserted from the diff of the source.** The guardian surface
can change because a shared token moved underneath it. Diff the RENDERED markup,
not the component files.
