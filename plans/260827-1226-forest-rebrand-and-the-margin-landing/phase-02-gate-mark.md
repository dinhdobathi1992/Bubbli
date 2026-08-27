---
phase: 2
title: "The Gate mark"
status: pending
priority: P2
effort: "2h"
dependencies: [1]
---

# Phase 2: The Gate mark

## Overview

Replace the two-circle mark with The Gate: a world above a dashed line. The old mark meant
"bubbles" — cover the wordmark and it could belong to a spa. This one's form comes from the
product.

## Requirements

- Functional: one component, `currentColor`, sized by prop, used everywhere the old one was.
- Functional: a favicon-optimised variant that stays legible at 16px.
- Non-functional: no raster asset, no second file for dark mode.

## Architecture

```
  circle  cx=12 cy=12 r=8.4   stroke 1.75          the world
  path    M4.4 14.4 H19.6     stroke 1.75 dashed   the gate
  circle  cx=12 cy=8.6 r=1.9  fill                 the child, above it
```

The dashed rule is the same device used on the landing page and the parent dashboard, so
the mark, the product and the mechanism become one shape.

**The dashes are the known weakness.** At 16px on a low-DPI screen they blur into a solid
rule and the idea is quietly lost. The favicon variant therefore uses a solid line and a
heavier stroke — one optical size, which is ordinary practice, not a compromise.

## Related Code Files

- Modify: `src/components/bubbli-mark.tsx`
- Create: `src/app/icon.tsx` (or a static `favicon.svg`) — the 16px variant
- Verify: the six surfaces that already import `BubbliMark`

## Implementation Steps

1. Replace the paths in `BubbliMark`, keeping the `size` prop and `aria-hidden`.
2. Add the favicon variant with a solid rule at a heavier stroke.
3. Check optical weight beside a 22px wordmark and at 26px beside an assistant reply —
   the mark must not out-weigh the message it sits next to.
4. Replace the existing `favicon.ico`.
5. Look at it at 16, 24, 40 and 64px in both themes.

## Success Criteria

- [ ] The mark renders at every existing call site with no layout shift
- [ ] Legible at 16px; the favicon variant does not read as a filled blob
- [ ] Inherits `currentColor` in both themes with no second asset
- [ ] Still meaningful with the wordmark covered — the test the old mark failed
- [ ] `pnpm lint` passes and no raster asset was added

## Risk Assessment

A three-element mark can read as clutter at small sizes where the old two-circle mark read
cleanly. Signal: the 16px version looks like a smudge, or the dot merges with the rule.
Response: increase the gap between dot and rule for the small variant before touching the
concept — the geometry is adjustable, the idea is not.
