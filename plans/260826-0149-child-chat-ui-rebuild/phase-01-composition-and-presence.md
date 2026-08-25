---
phase: 1
title: "Composition and presence"
status: pending
priority: P1
effort: "2h"
dependencies: []
---

# Phase 1: Composition and presence

## Overview

Fix the layout so the conversation and the composer read as one object, and give both
speakers an identity that does not depend on which side of the screen they sit on.

## Requirements

- Functional: with a short conversation the last message sits directly above the composer;
  with a long one the list scrolls normally and stays pinned to the newest turn.
- Functional: every assistant turn carries the Bubbli mark; every child turn is visually
  the child's without needing the mark.
- Non-functional: assistant prose measure <= 60ch; no raw hex in any component; reduced
  motion honoured.

## Architecture

The current `main` is `flex-1 overflow-y-auto`, so content stacks from the top of a tall
box. Adding an inner wrapper with `mt-auto` inside the scroll container makes the content
sit on the bottom edge while remaining scrollable when it overflows — no JS, no height
measurement, and the existing `scrollIntoView` behaviour is unaffected.

Speaker identity is carried by three signals rather than one:

| Signal | Child turn | Assistant turn |
|---|---|---|
| Alignment | right | left |
| Surface | filled accent-soft | surface with hairline |
| Mark | none | Bubbli mark, 28px, in the gutter |

Consecutive assistant turns suppress the repeated mark and tighten the gap, so a
multi-turn answer reads as one voice rather than a stack of cards.

The mark lives in `src/components/bubbli-mark.tsx` as an inline SVG with `currentColor`,
so it themes automatically and needs no asset pipeline.

## Related Code Files

- Create: `src/components/bubbli-mark.tsx`
- Create: `src/components/chat/message.tsx`
- Modify: `src/app/(child)/chat/page.tsx`
- Modify: `src/app/globals.css` (surface-separation tokens, spring easing token)

## Implementation Steps

1. Add `--ease-spring` and a raised-surface pair with enough delta from ground in both
   themes; extend `@theme inline` so the pair is reachable as a utility.
2. Build `BubbliMark` — a geometric bubble in `currentColor`, `aria-hidden`, sized by prop.
3. Extract `Message` from the inline map in `page.tsx`, taking role, content, crisis and a
   `showMark` flag; split content on blank lines into paragraphs; cap measure at 60ch.
4. Wrap the message list in a `mt-auto` inner container so it rests on the composer.
5. Give the header the child's name and a sign-out affordance; keep the safety pill.
6. Apply press-scale and spring easing to the child-register controls.

## Success Criteria

- [x] One exchange at 1440x900 leaves <= 1 viewport-height of gap above the composer
- [x] Assistant turns render the mark; consecutive turns render it once
- [x] Paragraph breaks in a model reply become real paragraphs
- [x] Measure <= 60ch at 375px, 768px and 1440px
- [x] `pnpm typecheck` and `pnpm lint` pass; no raw hex added

## Risk Assessment

`mt-auto` inside an `overflow-y-auto` flex column is correct in current browsers but is
easy to break by adding a second flex child later. Signal it breaks: content re-anchors to
the top. Response: move the anchoring to an explicit spacer div rather than reworking the
scroll container.
