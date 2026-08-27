---
phase: 3
title: "The Margin landing"
status: pending
priority: P1
effort: "6h"
dependencies: [1, 2]
---

# Phase 3: The Margin landing

## Overview

Replace the landing page. A real transcript down the centre; in the margin, the safety layer
narrates what it did at each turn — *passed*, *recorded*, *you're told now*. The product
demonstrates itself.

## Requirements

- Functional: the differentiator is stated above the fold, in a parent's words.
- Functional: the crisis turn is **revealed on interaction**, never shown cold.
- Functional: two doors — "For children" and "For parents" — as one segmented object.
- Functional: exactly one primary CTA on the page.
- Functional: **the sample transcript is unmistakably an example.** Labelled in the
  transcript itself, not in fine print, and carrying no name that could collide with a
  real child.
- Non-functional: the margin pairing survives a single column on mobile.
- Non-functional: no invented statistics, no fabricated testimonials.

## Architecture

The page is a two-column grid: transcript left, margin notes right. Each note is bound to
its turn, so on mobile the grid collapses and each note follows the turn it describes rather
than floating to the end.

**The two doors are navigation, not conversion.** A segmented pair reads as "which door am
I?", where two separate buttons would read as two competing CTAs and dilute the single
"Start free". The parents half is filled and the children's outlined, because the page's job
is conversion and the parent is the decider — a returning child usually arrives by family
link or paired device and never sees this page.

**The sample must not be mistakable for real data.** The previous landing card was
labelled "What a parent sees" above a plausible conversation, and a guardian who reached
it while signed out read it as their own child's chat. Nothing leaked — that page makes no
database calls — but on a child-safety product, ambiguity about whose conversation you are
looking at is the worst possible ambiguity. The Margin makes the risk larger, not smaller,
because its transcript is longer and more realistic. So: an explicit label inside the
block, and no child name at all. The seeded dev child is called Emma, which is precisely
the collision that caused the confusion.

**The crisis turn sits behind a disclosure control.** It is the most persuasive thing on the
page and the heaviest; a parent should choose to see it. The control names what it will show
so the choice is informed — not "see more", but "show me what happens in an emergency".

Components already exist for almost all of it: bubbles, the mark, severity chips, the
crisis card and the dashed gate rule. Reusing them means the page cannot drift from the app.

## Related Code Files

- Modify: `src/app/page.tsx`
- Create: `src/components/landing/transcript.tsx` — the paired transcript and margin
- Create: `src/components/landing/doors.tsx` — the segmented pair
- Reuse: `src/components/bubbli-mark.tsx`, the bubble and severity styles

## Implementation Steps

1. Build the rail: mark, wordmark, nav, the segmented doors.
2. Build the hero — differentiator headline, one primary CTA, one line of reassurance.
3. Build the transcript with two ordinary turns visible by default.
4. Add the disclosure control and the crisis turn behind it, with the margin note that
   explains help is shown to the child *before* anything is written.
5. Collapse to one column below 820px, each margin note following its turn.
6. Add the closing line — "three messages, one reached you" — and the footer.
7. Honour `prefers-reduced-motion` on the disclosure.

## Success Criteria

- [x] The differentiator is legible above the fold at 1440×900 without scrolling
- [x] The crisis turn is absent from the initial render and reachable by keyboard
- [ ] Margin notes stay bound to their turns at 375px
- [x] Exactly one primary CTA
- [ ] Both doors ≥44px, keyboard-reachable, correct focus order
- [x] No horizontal scroll at 375px, 768px, 1440px
- [ ] Renders correctly in both themes
- [x] No raw hex, no invented statistic
- [x] The sample is labelled as an example inside the block, and names no child

## Risk Assessment

A transcript is content, and content rots: the sample answers must stay consistent with what
the model actually produces and what the guardrails actually do. If a rule changes so that
the shown turn would now be flagged differently, the page becomes a lie. Signal: someone
edits `rules.ts` and the landing example is no longer accurate. Response: keep the sample
short and archetypal, and add it to the checklist in the guardrail phase file so a rule
change prompts a look at the page.
