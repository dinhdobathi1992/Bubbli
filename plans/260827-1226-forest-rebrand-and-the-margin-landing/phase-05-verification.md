---
phase: 5
title: "Verification"
status: pending
priority: P1
effort: "3h"
dependencies: [1, 2, 3, 4]
---

# Phase 5: Verification

## Overview

Prove it, rather than assert it. A whole-app recolour touches every surface, and the way
this goes wrong is silently: one tier that no longer reads, one theme nobody opened.

## Requirements

- Every success criterion in this plan has a command or a capture behind it.
- No existing gate regresses.

## Architecture

Colour is checked numerically because a ratio catches what an eye adjusts to. Layout and
"does it still feel like Bubbli" are checked visually, because no ratio catches those.

Both themes are exercised deliberately. This project has **no `data-theme` selectors** —
theming is `prefers-color-scheme` only — so light mode cannot be tested by toggling an
attribute and must be checked with the OS or emulation actually switched.

## Related Code Files

- Modify: the contrast script — Forest pairs, both themes
- No product code changes expected; any failure loops back to its phase

## Implementation Steps

1. Run the contrast script for both themes; require 28/28 plus surface separation.
2. Run the full gate set: `typecheck`, `lint`, `test`, `corpus:eval`, `test:mutation`, drift.
3. Walk every surface in both themes: landing, login, scoped login, pair, chat (empty,
   ordinary, blocked, crisis), parent sign-in, setup, dashboard, family.
4. Submit a real enquiry and confirm it arrives.
5. Check 375px, 768px and 1440px, and confirm no horizontal scroll anywhere.
6. Re-check with reduced motion forced.
7. Record anything left unfixed rather than quietly leaving it.

## Success Criteria

- [x] 28/28 contrast pairs pass in both themes
- [x] Severity tiers remain distinguishable from one another on the dashboard
- [x] typecheck, lint, test, corpus:eval, mutation and drift gates all pass
- [ ] Every surface checked in both themes, with captures
      **Partial.** Landing and parent dashboard checked in both. Chat, login,
      scoped login, pair, parent sign-in, setup and family checked in dark only.
      Light was forced by applying the stylesheet's own `:root` values, which
      exercises the tokens but not the media query; the query itself was verified
      by confirming all 21 tokens are defined in both blocks.
- [x] One real enquiry received
- [x] No horizontal scroll at any breakpoint
- [x] Reduced motion produces no animation

## Carried forward

`request-session.ts` fell from 100% to 35.71% on the mutation gate. Phase 1's
parent-auth branch added `resolveParent` — the function deciding whether a
request is a parent or a child — and no test covers it. G3 still passes overall
at 73.91%, so this does not block, but it is a real regression in the coverage of
the most security-critical function this plan touched, and it should be closed
before the parent surfaces carry real families.

## Risk Assessment

The browser screenshot tooling has returned stale or clipped captures repeatedly in this
project, which has twice led to a wrong conclusion drawn from an empty grep or a blank
image. Signal: a capture that looks unchanged after an edit, or a `file`/grep result that
contradicts what the source plainly contains. Response: verify structurally through the DOM
and numerically through the token script, and state plainly which claims rest on
measurement and which on having actually looked.
