---
phase: 3
title: "The dashboard"
status: completed
priority: P1
effort: "6h"
dependencies: [1, 2]
---

# Phase 3: The dashboard

<!-- Updated: Red Team Session 1 — D11 select whole array, D12 drop `reason` -->

## Overview

Rebuild `/parent` around the phase-1 vocabulary: readable rows, relative time, reviewed
history, no internal jargon, and a page that composes at desktop height.

## Requirements

- Functional: rows show the phase-1 headline, the child, and a relative time.
- Functional: reviewed flags remain visible under their own heading, excluded from the
  attention count (D6).
- Functional: recurrence is visible — a repeated concern shows how often, not just once.
- Functional: "Below the gate" is replaced with language a guardian understands. The
  distinction it draws stays; only the words change.
- Functional: relative time under 7 days, absolute beyond (D7).
- Functional: rows are obviously activatable, and the audit consequence is stated where
  the action is (D8).
- Non-functional: the severity boundary is unchanged. `opensTranscript` still decides
  what may be read (D9).
- Non-functional: composes at 1440x900 with no dead region taller than the tallest card.
- Non-functional: the empty state reassures without being cute — this is an instrument.

## Architecture

The query at `page.tsx:38-49` changes in three ways: it selects the **whole**
`triggered_rules` array rather than `->>0` (D11 — the first element is the
first-declared rule, not the most severe), it stops filtering `f.reviewed = false`,
partitioning on `reviewed` in the projection instead, and it stops selecting `reason`
(D12).

Three sections, in the order a guardian needs them:

```
  [ crisis card, when present ]        ← phase 2

  NEEDS YOUR ATTENTION                 ← unreviewed, above the gate
    Thi asked how to hurt someone
    2 hours ago                 [ Read what was said ]

  RECORDED, NOT SHOWN                  ← was "Below the gate"
    Counted so you know it happened. The words stay private to Thi.
    Thi asked about drugs · 2 times this week

  ALREADY REVIEWED                     ← D6, new
    Thi asked about sex · 3 times in the past week
```

The third section is what makes a pattern legible. One sexual-topic flag and three read
identically today because the reviewed ones are deleted from view; grouping by rule and
counting is what turns that into information.

**"Recorded, not shown"** replaces "Below the gate". The gate is the codebase's metaphor
for `opensTranscript`, and it is a good one internally — it is meaningless to a guardian
who has never read the source.

The vertical composition follows the chat's phase-4 lesson: bound the column and centre
it at `md` and up, rather than letting content pin to the top of a tall viewport.

## Related Code Files

- Modify: `src/app/(parent)/parent/page.tsx` — query, partition, sections, layout
- Modify: `src/lib/parent/dto.ts` — expose `reviewed`, drop the raw category **and `reason`** (D12)
- Create: `src/components/parent/flag-row.tsx` — shared by all three sections
- Create: `tests/parent/dashboard.test.ts`

## Implementation Steps

1. Change the query to include reviewed rows; partition in the projection.
2. Extract `flag-row.tsx` so the three sections cannot drift apart.
3. Add relative-time formatting with the 7-day cutover.
4. Rewrite the section headings and the explanatory copy.
5. Recompose the page vertically; check the empty state, one flag, and a dozen.

## Success Criteria

- [x] No string on the page matches `/^[a-z]+([._][a-z_]+)+$/`
- [x] The projection carries no `reason` and no rule id at all (D12)
- [x] A reviewed flag appears under its own heading and is absent from the attention count
- [x] A repeated concern shows its count
- [x] "Below the gate" does not appear; the distinction it drew still does
- [x] Relative under 7 days, absolute beyond
- [x] The audit sentence sits on the control that triggers it
- [x] Rows above and below the gate render from the SAME component
- [x] 1440x900: no dead region taller than the tallest card; also checked at 390x844
- [x] Empty state reads as reassurance, not as an error
- [x] Both themes, AA, controls >= 44px

## Risk Assessment

**Rewriting the query changes what a guardian may read.** Including reviewed rows widens
what the page selects. It must not widen what `opensTranscript` permits — a reviewed
below-gate flag stays counted, never quoted.

**Signal it broke:** content appearing under "Recorded, not shown".
**Response:** the partition is being applied after the gate rather than inside it. Stop
and re-derive; this is the product's central promise.

**The reviewed section becomes an archive nobody reads.** If it grows unbounded it stops
being a pattern and becomes noise. Bound it to a rolling window and say so in the copy.

**Three sections drift into three components.** `flag-row.tsx` is shared for that reason;
a divergence is how a below-gate row starts quoting content.
