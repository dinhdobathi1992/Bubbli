---
phase: 2
title: "The child palette"
status: completed
priority: P1
effort: "5h"
dependencies: [1]
---

# Phase 2: The child palette

## Overview

Give the warm register real values: a light room, a solid header, a filled
accent that reads as a control. Measured, not eyeballed.

## Requirements

- Functional: a light ground, panels lighter still, and a **solid coloured
  header** rather than a hairline.
- Functional: an accent saturated enough to carry a filled primary button with
  legible text on it.
- Functional: the severity ramp survives — a crisis message on the child surface
  must still read as different, without becoming alarming.
- Non-functional: every foreground/background pair >= 4.5:1, or >= 3:1 for large
  text, **computed** and recorded in the phase report.
- Non-functional: no raw `#000` or `#fff`. The neutral ramp stays hue-tinted,
  which is what makes a room read as a room rather than as grey.
- Non-functional: the guardian palette is untouched.

## Architecture

The original is the **reference, not the target**. Its values were never
measured for AA, and the mark and accent have both moved since:

| Role | `childAI` reference | Note |
|---|---|---|
| ground | `#F2FBF9` | near-white mint |
| panel | `#FFFFFF` | raw white — will not survive the no-`#fff` rule |
| header | `#0A3D3C` | deep teal, solid |
| accent | `#EE6742` | saturated orange |
| accent tint | `#DAF0EE` | mint |

The current accent is peach `#f0a882` on dark. On a light ground that inverts:
a light-register accent needs enough depth to carry white text at AA on a filled
button — closer to the original's orange than to today's peach.

The forked tokens are exactly the colour set. Spacing, radii and the type ramp
are inherited from phase 1's shared scale and are not redeclared here; a colour
that needs a new radius to work is a colour that has not been chosen properly.

**Measurement is part of the phase, not a checkbox after it.** Every pair goes
through the same contrast script used for the Forest work, and the numbers go in
the phase report so the next person does not have to re-derive them.

## Related Code Files

- Modify: `src/app/globals.css` — the `[data-register='warm']` block only

## Implementation Steps

1. Choose the ground, two panel steps, the ink ramp and the line colour.
2. Choose the accent, and its hover and soft variants, against the filled-button
   requirement rather than against a swatch.
3. Re-cut the severity ramp for a light ground. The dark ramp took two attempts
   to become distinguishable; assume this one will too.
4. Compute every pair. Record the table in the phase report.
5. Check the whole child surface with the OS in both modes.

## Success Criteria

- [x] Every child-register pair measured, with the numbers recorded
- [x] Filled accent button: label text >= 4.5:1 on the accent
- [x] Header is a solid colour, distinguishable from the ground without a border
- [x] Severity colours distinguishable from each other by more than lightness
- [x] No `#000`, no `#fff`, no untinted grey
- [x] Guardian palette byte-unchanged
- [x] Both OS modes produce the same child rendering

## Risk Assessment

**Copying the original's values because they look right.** They were built
before this project measured anything; `#FFFFFF` panels alone violate a rule the
current system holds deliberately.

**Signal it broke:** a pair below 4.5:1 discovered after the fact.
**Response:** the measurement step was skipped or done on a subset. Redo it over
the full set — the Forest work needed 28 pairs, and this is a comparable surface.

**The severity ramp stops working on light.** Reds and ambers that separate on a
near-black ground collapse on a near-white one.

**Signal it broke:** two adjacent severities within ~1.2:1 of each other, or
under 15 degrees of hue apart.
**Response:** re-cut the ramp; do not compensate with weight or an icon, which
would put the whole distinction on one channel.
