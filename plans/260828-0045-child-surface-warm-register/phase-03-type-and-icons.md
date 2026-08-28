---
phase: 3
title: "Type and icons"
status: completed
priority: P1
effort: "4h"
dependencies: [1]
---

# Phase 3: Type and icons

## Overview

Replace the serif with a heavy geometric sans on the child surface, and give it
the icon vocabulary it currently has none of.

## Requirements

- Functional: no serif on any child surface.
- Functional: headings and buttons in a heavier weight than body — the original
  used 600–800 against a 400–500 body.
- Functional: an icon set covering at minimum: new chat, send, history, close.
- Non-functional: fonts **self-hosted**, no runtime request to a font CDN (D4).
- Non-functional: icons inlined as SVG. One family, one stroke width (D6).
- Non-functional: no layout shift on font load.
- Non-functional: the guardian surface keeps the serif display.

## Architecture

`--font-display` is currently a serif system stack (`globals.css:136`) and
there is no `next/font` anywhere — every face is a system fallback. Two changes:

**Fonts.** `next/font/google` downloads at build time and self-hosts, so the
"Google Fonts" name is misleading: there is no runtime request and no CSP hole.
The original's pairing — Plus Jakarta Sans for headings and buttons, Inter for
body — is a reasonable starting point and both are available. `next/font` also
emits `font-display: swap` with a matched fallback metric, which is what removes
the shift.

The register fork means `--font-display` resolves differently per register
rather than being globally reassigned. The guardian surface never sees the sans.

**Icons.** The original pulled heroicons from a CDN. Inline them instead as a
small local set — a children's product should not make a third-party request to
render a button, and the offline case matters more than the convenience.

One family, one stroke width. Every icon gets `aria-hidden` and sits beside a
text label; **no icon-only control**, because a pre-literate child recognises the
pairing, not the glyph.

## Related Code Files

- Modify: `src/app/layout.tsx` — load and expose the two faces
- Modify: `src/app/globals.css` — per-register font tokens
- Create: `src/components/icons.tsx` — the inline set

## Implementation Steps

1. Load both faces with `next/font`, exposing them as CSS variables.
2. Point the warm register's display and body tokens at them; leave the
   instrument register untouched.
3. Build the icon set. Keep it to what is used — an unused icon is dead weight
   nobody reviews.
4. Verify no font or icon request leaves the origin at runtime.

## Success Criteria

- [x] No serif renders on `/chat`, `/login` or `/pair`
- [x] Headings and buttons visibly heavier than body text
- [x] Guardian surface still renders the serif display
- [x] No runtime request to `fonts.googleapis.com`, `fonts.gstatic.com` or any
      icon CDN — checked against the built output, not assumed
- [x] No layout shift attributable to font loading
- [x] Every icon is `aria-hidden` and paired with a text label
- [x] No icon-only control anywhere on the child surface

## Risk Assessment

**"Self-hosted" claimed rather than checked.** `next/font/google` self-hosts,
but a stray `<link>` or an `@import` reintroduces the request silently.

**Signal it broke:** any external font or icon URL in the built output.
**Response:** grep the build, not the source — the source can look clean while a
dependency injects one.

**The icon set grows past what is used.** Every unused glyph is bytes shipped to
a child's device and code nobody reviews.

**Icon-only controls creep in.** They read as clean to a designer and as a
mystery to a six-year-old.

**Signal it broke:** a control whose accessible name comes only from
`aria-label`.
**Response:** it needs visible text. The icon is reinforcement, never the message.
