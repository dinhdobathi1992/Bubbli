---
phase: 3
title: "Verification"
status: pending
priority: P1
effort: "45m"
dependencies: [1, 2]
---

# Phase 3: Verification

## Overview

Prove the result rather than assert it. The previous pass measured text contrast and missed
that *surface* separation was the visible problem, so this phase measures both.

## Requirements

- Every claim in the plan's success criteria has a command or a screenshot behind it.
- No existing gate regresses.

## Architecture

Contrast is checked by extending the existing token script, which already reads the two
theme maps, with the surface pairs that were never in its list. Layout is checked visually
in the browser at three widths and both themes, since "the void" is not something a ratio
can catch.

## Related Code Files

- Modify: the token contrast script in the session scratchpad
- No product code changes expected; any fix loops back to Phase 1 or 2

## Implementation Steps

1. Add bubble-vs-ground and bubble-vs-bubble pairs to the contrast script; require >= 1.25:1
   separation for surfaces while keeping the 4.5/3.0 text thresholds.
2. Run the full gate set: `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm corpus:eval`.
3. Drive the live app in the browser: empty state, one exchange, a long multi-paragraph
   answer, a blocked reply, and the crisis card.
4. Capture each at 375px and 1440px, light and dark.
5. Re-run with reduced motion forced and confirm nothing animates.
6. Record anything unfixed in the report rather than quietly leaving it.

## Success Criteria

- [x] Contrast script passes including the new surface pairs, both themes
- [x] typecheck, lint, test and corpus:eval all pass
- [ ] Screenshots exist for empty / short / long / blocked / crisis states
      **Not met.** The browser screenshot tool returned a stale, clipped viewport after
      the first two captures. Empty and short states were captured; long, blocked and
      crisis were verified numerically through the DOM instead (bubble geometry,
      computed colours, paragraph count, crisis eyebrow and 988 presence).
- [x] No horizontal scroll at 375px
- [x] Reduced motion produces no animation

## Risk Assessment

Raising surface separation enough to be visible can push a bubble background close enough to
the text colour to threaten the AA text pair on that surface. Signal: the text check fails
after a surface change. Response: move the surface, not the ink — the ink ramp is shared
with the parent register and changing it there is out of scope.
