---
phase: 2
title: "The crisis card"
status: completed
priority: P1
effort: "4h"
dependencies: [1]
---

# Phase 2: The crisis card

<!-- Updated: Red Team Session 1 — D11, the predicate scans the whole array -->

## Overview

A self-harm flag stops being a row. It becomes a card at the top of the page carrying
plain language, the crisis line, and a way to start the conversation.

## Requirements

- Functional: a flag renders the crisis card when **any** id in `triggeredRules` is in
  the `harm.self.` family — not merely the first one (D11).
- Functional: the card carries the phase-1 headline, a relative time, a control to read
  what was said, and the crisis line.
- Functional: no other severity renders it. A `high` violence flag is a row.
- Functional: multiple self-harm flags collapse into one card, newest first — a guardian
  in that moment needs one clear thing, not a list.
- Non-functional: the crisis number comes from `LIFELINE` in `src/content/crisis/index.ts`.
  It is not retyped.
- Non-functional: the card states that opening the transcript is recorded, on the control
  that does it.
- Non-functional: grave, not alarming. No red flashing, no siren styling. A guardian
  reading this is already frightened.

## Architecture

`src/components/parent/crisis-card.tsx`, fed by the dashboard.

The trigger is the RULE FAMILY, not the severity. `critical` and `harm.self.*` overlap
today but are not the same predicate: a future critical rule about violence should not
render a self-harm card, and a `high` self-harm rule should still render one.

**And it scans the WHOLE array** (D11). Testing `triggered_rules->>0` was the plan's
original wording and the red team found it correct only by coincidence: `engine.ts:209`
iterates in declaration order, and `RULES` (`rules.ts:667-674`) spreads `harmfulIntent`
first. The guarantee rests on the order of two lines in an array literal. A message tripping both a self-harm rule and another one would render the
card today and stop rendering it the moment someone reorders the file — with no test
failing. The predicate is `triggeredRules.some(id => familyOf(id) === 'harm.self')`.

```
┌─────────────────────────────────────────────┐
│ Thi said something about not wanting to be  │  ← phase-1 headline
│ here.                                        │
│ 2 hours ago                                  │  ← relative, D7
│                                              │
│ [ Read what was said ]                       │  ← primary
│ Opening this is recorded, and other          │  ← D8: consequence at the control
│ guardians can see that record.               │
│ ───────────────────────────────────────────  │
│ If you would like help starting the          │
│ conversation, call or text 988.              │  ← LIFELINE, single source
└─────────────────────────────────────────────┘
```

Copy for the opening suggestion is deliberately short and non-prescriptive. A guardian
does not need a script; they need permission to begin. Anything longer becomes advice
this project is not qualified to give.

## Related Code Files

- Create: `src/components/parent/crisis-card.tsx`
- Create: `tests/parent/crisis-card.test.ts`
- Modify: `src/app/(parent)/parent/page.tsx` — partition flags before rendering

## Implementation Steps

1. Partition the dashboard's flags into `harm.self.*` and the rest.
2. Build the card against the phase-1 label, importing `LIFELINE` from the crisis module.
3. Collapse multiple self-harm flags to one card keyed on the newest.
4. Confirm by hand at 1440x900 and 390x844, both themes.

## Success Criteria

- [x] A `harm.self.*` flag renders the card; `inap.violence` at `high` does not
- [x] A flag whose array is `['inap.violence','harm.self.direct']` — self-harm NOT first —
      still renders the card (D11). This is the F1 regression
- [x] The literal `988` appears in exactly one module — asserted structurally
- [x] Two self-harm flags render ONE card, not two
- [x] The audit sentence sits on the control, not in a page footer
- [x] The card carries no rule id and quotes nothing the child wrote
- [x] Grave, not alarming: no `critical` red as a fill, only as an edge
- [x] Both themes, AA, controls >= 44px

## Risk Assessment

**Keying on severity, or on the first element, instead of scanning the family.** Both
coincide with the right answer today, which is what makes them dangerous: the wrong
predicate passes every test written against current data.

**Signal it broke:** reordering `rules.ts` changes which flags render the card.
**Response:** the predicate is reading position again. Nothing about a source file's
declaration order may affect what a guardian is shown.

**Signal it broke:** a non-self-harm flag rendering the crisis line.
**Response:** the predicate drifted to severity. Restore the rule-family check.

**The card reads as an emergency siren.** A guardian opening this at 11pm is already
frightened; styling that amplifies it makes the page harder to act on.

**Giving advice this project cannot stand behind.** The suggestion stays to one line and
routes onward. Anything resembling counselling is out of scope and is why the copy is
short by design, not by omission.
