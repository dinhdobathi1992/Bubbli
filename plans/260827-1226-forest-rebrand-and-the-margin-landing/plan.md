---
title: "Forest rebrand and the Margin landing"
description: "Re-cut the token layer to Forest, replace the mark with The Gate, and build the Margin landing page with pricing and a self-host enquiry form."
status: in-progress
priority: P1
effort: "2-3d"
tags: [design, landing, brand, tokens]
created: 2026-08-27
---

# Forest rebrand and the Margin landing

> **State, 2026-08-28.** The token layer, the mark, the landing and the pricing
> surface all shipped. What remains is capture evidence: every surface checked
> in both themes. Unblocked by the puppeteer install today.

## Overview

The landing page was a router, not a pitch: it opened with "I'm a child / I'm a parent" and
assumed the visitor already knew what Bubbli is. The PRD's actual differentiator —
*visibility into unsafe interactions without exposing benign conversations* — appeared
nowhere on it.

This plan replaces it with **The Margin**: a real transcript down the centre, annotated in
the margin by the safety layer. The product demonstrates itself rather than describing
itself. Alongside it, two brand changes that were diagnosed rather than felt.

## Decisions taken

| # | Decision | Why |
|---|----------|-----|
| D1 | **Forest palette**, replacing sepia, across the whole app in both themes | The old palette spanned **31° of hue** end to end — ground, text, borders and accent all orange-brown. Nothing separated by hue, only lightness, which is what read as muddy. Forest gives **137°** of accent-to-ground separation. Verified: **28/28 AA pairs across both themes.** |
| D2 | **The Gate** replaces the two-circle mark | The old mark meant "bubbles" and nothing else — cover the wordmark and it could be a spa. The Gate's form comes from the product: a world above a dashed line, the same device already on the dashboard. |
| D3 | **Concept "The Margin"**, not a feature list | Every rival claims "safe AI for kids". Showing the machinery decide, turn by turn, is the one thing a competitor who hasn't built it cannot credibly copy. |
| D4 | **Free beta; self-hosting behind a form** | Honest about where the product is. "Free while we're getting this right" makes beta a reason to trust rather than a disclaimer. |
| D5 | **The crisis example is revealed on interaction**, not shown cold | It is the most powerful thing on the page and the heaviest. A parent should choose to see it. |
| D6 | **Two doors as a segmented pair**, not two loose buttons | Reads as "which door am I?" navigation and does not compete with the single hero CTA. |
| D7 | Enquiries deliver to **info@dinhdobathi.com** via the existing SES transport | Already verified end to end; no new dependency. |

## Goals

| # | Goal | Priority |
|---|------|----------|
| 1 | A cold visitor understands the product and the privacy promise in one screen | P1 |
| 2 | One coherent palette across landing and app, both themes, no regression in contrast | P1 |
| 3 | A mark that still means something with the wordmark covered | P2 |
| 4 | A school or clinic can start a self-hosting conversation | P2 |
| 5 | Nothing that currently passes stops passing | P1 |

## Phases

| # | Phase | Status | Priority |
|---|-------|--------|----------|
| 1 | [The Forest token layer](./phase-01-forest-tokens.md) | Pending | P1 |
| 2 | [The Gate mark](./phase-02-gate-mark.md) | Pending | P2 |
| 3 | [The Margin landing](./phase-03-margin-landing.md) | Pending | P1 |
| 4 | [Pricing and the enquiry form](./phase-04-pricing-and-enquiry.md) | Pending | P2 |
| 5 | [Verification](./phase-05-verification.md) | Pending | P1 |

## Success Criteria

- [x] Every colour pair passes WCAG AA in **both** themes — measured, not asserted
- [x] No component contains a raw hex value
- [x] The landing page states the differentiator above the fold
- [x] The crisis example is reachable but not shown cold
- [x] The two doors are ≥44px and keyboard-reachable
- [x] A submitted enquiry arrives at `info@dinhdobathi.com`
- [x] The mark is legible at 16px, including its favicon variant
- [x] `pnpm typecheck`, `lint`, `test`, `corpus:eval`, `test:mutation` and the drift gate all pass

## Out of scope

The chat surface's layout, the parent dashboard's layout, guardrails, auth, and the admin
page discussed separately. This plan re-colours those surfaces; it does not restructure them.

## Known risk carried in, not introduced here

The free tier runs on **DeepSeek**, which `PROVIDER_COMPLIANCE` marks as *not cleared for
production child data* — no DPA, no zero-retention terms — and production refuses to boot
because of it (G9). A public free tier means real children's conversations reaching that
processor. The "free beta" framing is honest about an unfinished product, but it is not a
substitute for closing G9, and no copy in this plan should imply otherwise.
