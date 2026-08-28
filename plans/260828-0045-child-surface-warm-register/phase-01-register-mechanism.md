---
phase: 1
title: "The register mechanism"
status: completed
priority: P1
effort: "4h"
dependencies: []
---

# Phase 1: The register mechanism

## Overview

Make "which register" a property of the surface rather than of the operating
system. Nothing else in this plan is expressible until it is.

## The blocker, precisely

`globals.css:70` switches the entire token layer on
`@media (prefers-color-scheme: dark)`, and `layout.tsx` puts `bg-ground text-ink`
on `<body>`. One global palette, chosen by the viewer's OS.

So today a child's room is dark because a parent set their laptop to dark at
night — and there is no way to say "this surface is always warm" without also
saying it about the guardian dashboard.

## Requirements

- Functional: a route group declares its register; every token beneath it
  resolves to that register's values.
- Functional: the child register does **not** follow `prefers-color-scheme`
  (D3). The guardian register continues to.
- Functional: the shared scale — spacing, radii, type ramp — is declared once and
  referenced by both. Only colour, weight and iconography fork (D1).
- Non-functional: no flash of the wrong register on first paint. The attribute is
  server-rendered, never applied by a client effect.
- Non-functional: `src/app/(parent)/**` renders byte-identically (D5).
- Non-functional: no JavaScript is required for the register to apply.

## Architecture

Both route groups exist and neither has a layout — that is the hook.

```
src/app/
  layout.tsx              shared scale, <body> stays register-neutral
  (child)/layout.tsx      NEW  <div data-register="warm">
  (parent)/layout.tsx     NEW  <div data-register="instrument">
```

In CSS the fork is by attribute, not by media query:

```css
:root { /* shared scale: spacing, radii, type ramp. NEVER colour. */ }

[data-register='warm'] { /* light, fixed — does not follow the OS */ }

[data-register='instrument'] { /* today's light values */ }
@media (prefers-color-scheme: dark) {
  [data-register='instrument'] { /* today's Forest dark values */ }
}
```

**The guardian block is today's `:root` and today's dark block, moved verbatim.**
Not rewritten, not re-tuned — moved. That is what makes "byte-unchanged" a
checkable claim rather than an intention.

`<body>` loses `bg-ground text-ink`: it cannot know which register it is under.
The colour moves to each register wrapper, which must be the element that paints
the ground so no surface floats on an unstyled backdrop — the omission that made
an earlier build unreadable in dark mode.

`/safety` sits outside both groups and is reachable by both audiences. It keeps
the instrument register for now and is named as a non-goal, not forgotten.

## Related Code Files

- Modify: `src/app/globals.css` — split `:root` into shared scale plus two registers
- Modify: `src/app/layout.tsx` — `<body>` stops carrying register colour
- Create: `src/app/(child)/layout.tsx`
- Create: `src/app/(parent)/layout.tsx`
- Create: `tests/design/register.test.ts`

## Implementation Steps

1. Split `globals.css`: shared scale in `:root`; move the existing light values
   verbatim into `[data-register='instrument']`, and the existing dark block into
   the media-guarded instrument block.
2. Add both layouts, each wrapping children in its register element and painting
   the ground there.
3. Remove `bg-ground text-ink` from `<body>`.
4. Add the warm register as a copy of the instrument light values for now —
   phase 2 replaces the values, this phase only proves the mechanism.
5. Confirm by hand with the OS in dark mode: `/chat` stays light, `/parent`
   goes dark.

## Success Criteria

- [x] With the OS in dark mode, `/chat` renders light and `/parent` renders dark
- [x] With the OS in light mode, both render light
- [x] No `prefers-color-scheme` rule applies to `[data-register='warm']`
- [x] Spacing, radius and type-ramp tokens appear exactly once in the file
- [x] No colour token is declared in the shared `:root` block
- [x] Rendered markup for `/parent` is unchanged — diffed before and after
- [x] No flash of the wrong register: the attribute is in the server HTML
- [x] `pnpm typecheck && pnpm lint && pnpm build` clean

## Risk Assessment

**Moving the guardian values instead of re-typing them.** Re-typing invites a
transcription error in a palette that took a hue-span analysis to arrive at.
Move the blocks; diff the file to prove only their selector changed.

**Signal it broke:** any guardian-surface colour differs from the shipped build.
**Response:** revert the move and redo it as a pure cut-and-paste.

**The ground stops being painted.** `<body>` currently guarantees it. If a
register wrapper does not paint, a surface floats on the browser default — the
exact failure that made an earlier build unreadable.

**Signal it broke:** white flash on navigation, or a panel on an unstyled backdrop.
**Response:** the wrapper must be the painting element, and it must be
full-height.

**`/safety` inherits nothing and renders unstyled.** It sits outside both groups.
Check it explicitly rather than assuming the root still covers it.
