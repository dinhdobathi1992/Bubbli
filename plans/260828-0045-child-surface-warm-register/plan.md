---
title: "The child surface gets its own register"
description: "Split one design language into two registers — a warm, light, icon-led room for the child and the dark instrument the guardian needs — sharing a single spacing, radius and type scale."
status: completed
priority: P1
effort: "2d"
tags: [design-system, child-surface, tokens, accessibility]
created: 2026-08-28
---

# The child surface gets its own register

## Overview

The child chat is a near-black room with a serif headline, hairline borders, no
icons, a collapsed sidebar and a muted `+ New chat` that does not read as a
button. The original Bubbli — `JurneeGo_Assignment/childAI` — was a light mint
room with a solid teal header, a filled orange button carrying a `+` icon, an
always-visible sidebar and an illustrated empty state.

The cause is one decision, not seven. **A single design language is serving two
audiences whose needs are opposite.** "Warm paper and ink", later re-cut to
Forest, is *right* for the guardian dashboard — that surface was deliberately
built as an instrument. Applied to a four-year-old it reads adult and severe.

This plan splits the language into two registers over one system.

## What the comparison actually shows

Read from `childAI/frontend/dashboard-chatter.html` against the current build:

| | Original (`childAI`) | Current | Effect on a child |
|---|---|---|---|
| Room | light mint `#F2FBF9`, white panels | near-black `#0d1512` | dark reads adult, serious |
| Header | solid teal `#0A3D3C` bar + logo | transparent, hairline | no anchor, no brand presence |
| `+ New chat` | filled `#EE6742`, white text, shadow, `+` icon | `bg-accent-soft`, low contrast, no icon | does not read as a control |
| Sidebar | `hidden md:flex` — **always open** on desktop | collapsed by default | history is hidden work |
| Icons | heroicons throughout | none but the mark | nothing to recognise pre-literacy |
| Empty state | icon tile + "Ask me anything — I'm here to help!" | a serif greeting | no invitation |
| Type | Plus Jakarta Sans 600–800 + Inter | serif display | editorial, not playful |

## The architectural blocker

**Today the OS decides the theme, globally.** `globals.css:70` switches the
whole token layer on `@media (prefers-color-scheme: dark)`, and `layout.tsx`
puts `bg-ground text-ink` on `<body>`. There is no per-surface control, so
"light for the child, dark for the guardian" is not currently expressible.

Both route groups exist — `src/app/(child)/` and `src/app/(parent)/` — and
**neither has a layout**. That is the hook: a layout per group scopes a register
without touching the other.

## Decisions taken

| # | Decision | Why |
|---|----------|-----|
| D1 | **Two registers, one system** | The forked layer is colour, weight and iconography only. Spacing, radii and the type ramp stay shared — otherwise this becomes two design systems and no language |
| D2 | **Register is scoped by route group, not by OS** | `prefers-color-scheme` cannot express "this surface is always warm". A `data-register` attribute on a route-group layout can, and leaves the guardian surface untouched |
| D3 | **The child register is light, and does not follow the OS** | A child's room should not become a cave because a parent set their laptop to dark at night. The guardian surface keeps OS-following behaviour |
| D4 | **Fonts self-hosted via `next/font`** | No network fetch at runtime, no layout shift, no third-party request from a children's product. The original used a Google Fonts `<link>`; that is not acceptable here |
| D5 | **The parent surface keeps its every rendered colour, and gains exactly one wrapper** | It shipped hours ago, red-teamed and verified. **Amended during implementation:** "byte-unchanged" turned out to be literally false — phase 1 adds `(parent)/layout.tsx`, one element that names the register explicitly (D2) and paints the ground it already had. The instrument token blocks are diffed and identical; the markup gains one div. Recorded rather than quietly redefined |
| D6 | **Icons from one set, self-hosted as inline SVG** | The original used heroicons via CDN. One family, one stroke width, inlined — the CSP and the offline case both matter more than the convenience |

## Goals

| # | Goal | Priority |
|---|------|----------|
| 1 | A child's screen reads as an invitation, not an instrument | P1 |
| 2 | The guardian dashboard keeps the register it needs | P1 |
| 3 | One shared scale underneath both, so they stay one system | P1 |
| 4 | Both registers meet WCAG AA on their own measured pairs | P1 |
| 5 | No runtime network request for a font or an icon | P2 |

## Non-goals

- **Any change to `src/lib/guardrails/`, the pipeline, or the flag path.**
  `policyVersion()` must come out unchanged, asserted in phase 5.
- The guardian dashboard, the crisis card, the flag rows (D5).
- `The Margin` landing page. It reads to parents and stays as it is.
- `/safety`. Reachable by both audiences; a separate decision, not this one.
- The guardrail-config work (Track A). Independent, and blocked on the
  override-authority question.
- A teacher role. The original had one; this product does not, and inventing it
  here would be scope no one asked for.

## Phases

| # | Phase | Status | Depends on |
|---|-------|--------|------------|
| 1 | [The register mechanism](./phase-01-register-mechanism.md) | **Completed** | — |
| 2 | [The child palette](./phase-02-child-palette.md) | **Completed** | 1 |
| 3 | [Type and icons](./phase-03-type-and-icons.md) | **Completed** | 1 |
| 4 | [The child surfaces](./phase-04-child-surfaces.md) | **Completed** | 2, 3 |
| 5 | [Verification](./phase-05-verification.md) | **Completed** | 1-4 |

Phase 1 is the unlock. Nothing else is expressible until the register stops
being an OS preference.

## Success Criteria

- [x] `/chat`, `/login`, `/pair` render in the warm register regardless of the
      OS setting
- [x] `/parent`, `/parent/family`, `/parent/sign-in` keep every rendered colour;
      the instrument token blocks diff clean, and the only addition is the
      register layout (D5, amended)
- [x] Spacing, radius and type-ramp tokens are declared **once** and referenced
      by both registers — asserted structurally
- [x] Every foreground/background pair in the child register measures >= 4.5:1
      (>= 3:1 for large text), computed not eyeballed
- [x] `+ New chat` is a filled control with an icon and a >= 44px target
- [x] The sidebar is open by default on the child surface at `md` and up
- [x] The empty state carries an icon and an invitation, not only a greeting
- [x] No serif on any child surface
- [x] No runtime request to a font or icon CDN — asserted against the built output
- [x] `policyVersion()` unchanged
- [x] `pnpm typecheck`, `pnpm lint`, `pnpm build`, full suite, `pnpm corpus:eval` pass

## Risks

| Risk | Mitigation |
|------|------------|
| **Two token sets drift into two design systems** | D1: only colour, weight and iconography fork. The shared scale is asserted structurally in phase 5, so a divergence fails a test rather than a review |
| The guardian surface is changed by accident | D5 plus a rendered-markup diff. It shipped hours ago; a silent regression there is worse than anything this plan adds |
| A light child register fails contrast where the dark one passed | Every pair recomputed for the new palette. The Forest work produced 28 measured pairs and none of them transfer |
| Porting the original's palette wholesale | Rejected in the brainstorm. The old values are the *reference*, not the target — they were never measured for AA, and the mark and accent have moved since |
| Icons balloon the bundle or reach a CDN | D6: one set, inlined, tree-shaken by import. Asserted against the built output rather than assumed |

## Open questions

None for this track. **Track A (making `guardrail_config` actually change a
decision, then an admin surface) is deliberately not planned here** and is
blocked on one question: may a guardian set an override, or only an operator?
That changes the surface entirely.
