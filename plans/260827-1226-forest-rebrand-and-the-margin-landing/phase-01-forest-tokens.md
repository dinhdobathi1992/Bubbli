---
phase: 1
title: "The Forest token layer"
status: pending
priority: P1
effort: "4h"
dependencies: []
---

# Phase 1: The Forest token layer

## Overview

Replace the sepia ramp with Forest across the whole app, both themes. Foundational —
every other phase renders in these tokens.

## Requirements

- Functional: one token layer serves landing, child chat and parent dashboard.
- Non-functional: every text pair clears AA and every surface pair is distinguishable, in
  **both** themes. Measured before anything is called done.
- Non-functional: no component gains a raw hex. The existing discipline holds.

## Architecture

The values below are already measured — **28/28 pairs pass** across both themes, including
the full severity ladder and the crisis pair.

```
                    DARK        LIGHT
  ground            #0d1512     #f3f7f4
  surface           #16211d     #fbfdfb
  raised            #1e2a25     #e7eee9
  ink               #e8efe9     #101c17
  muted             #9ab0a4     #4d5f55
  subtle            #6d8176     #75897d
  accent            #f0a882     #a8482b
  on-accent         #12211a     #fdf8f5
  line              #25342e     #d3ded6
  sev info          #8fa89a     #61756a
  sev low           #d3ab6c     #8a6a35
  sev medium        #e0955c     #a05f2a
  sev high          #ef8a70     #a3412a
  sev critical      #ff9b85     #8f2318
  critical-bg       #331d18     #f6e4de
```

Two things carry over unchanged because they were right: the **dual definition** of every
colour (a value defined only inside a media query is the bug that made cream panels float
on black), and the **hairline discipline** — surfaces separate by a visible border rather
than by a lightness delta that vanishes.

The accent inverts between themes rather than merely lightening: peach on a dark ground,
terracotta on a light one. Both are the same hue family, so the brand survives the switch.

## Related Code Files

- Modify: `src/app/globals.css` — the whole token block, both themes
- Modify: the contrast script in the session scratchpad — Forest pairs
- Verify (no edit expected): every `src/app/**` and `src/components/**` surface

## Implementation Steps

1. Replace the `:root` and `prefers-color-scheme: dark` blocks with the values above.
2. Re-point `--accent-soft`, `--surface-sunken`, `--line-strong` and `--focus` into the
   Forest ramp; none may be left on a sepia value.
3. Update the `.hero-light` gradient — it derives from `--accent` via `color-mix`, so it
   follows automatically, but confirm the warm pool still reads on a green ground.
4. Extend the contrast script with the Forest pairs and run it for both themes.
5. Walk every surface in the browser in both themes and look for anything that went muddy,
   invisible or garish.

## Success Criteria

- [ ] 28/28 pairs pass in both themes, printed by the script
- [ ] Surface separation still passes: either a ≥1.2 delta or a visible hairline
- [ ] No raw hex introduced in any component
- [ ] Landing, chat, login, pair, parent dashboard and family page all render correctly in both themes
- [ ] `pnpm typecheck` and `pnpm lint` pass

## Risk Assessment

The severity ladder is the risk. Five tiers must stay distinguishable from each other **and**
carry meaning against a green ground — `low` and `medium` in particular sit close in hue to
the accent. Signal it broke: two tiers look alike on the dashboard, or a tier reads as the
brand colour rather than as a warning. Response: widen the lightness gap between adjacent
tiers rather than shifting hue, which would break their association with severity.
