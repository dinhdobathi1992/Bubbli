---
title: "Child chat UI rebuild"
description: "Rebuild /chat so it reads as a companion a child wants to talk to, not a text box with an answer stranded in a void."
status: in-progress
priority: P1
effort: "3-4h"
tags: [ui, child-surface, design-system]
created: 2026-08-26
blockedBy: [260827-2117-child-conversation-history]
---

# Child chat UI rebuild

> **State, 2026-08-28.** Every functional item is built and shipped. What remains
> is capture evidence: the empty, short, long, blocked and crisis states. That
> was blocked on tooling until puppeteer was installed today, so it is now
> doable rather than deferred.

> **Status is stale, and Goal 1 is superseded.** Phases 1 and 2 are substantially
> implemented — `message.tsx`, `composer.tsx` and `suggestions.tsx` exist, the Bubbli
> mark is on assistant turns, and the bottom-anchoring shipped as `justify-end` rather
> than the `mt-auto` specified here — but nothing was ever marked done.
>
> Goal 1, "Remove the dead viewport", is now owned by
> [260827-2117-child-conversation-history](../260827-2117-child-conversation-history/phase-04-composition.md),
> which scopes the bottom-anchoring rule to a breakpoint rather than reversing it. That
> plan adds a sidebar, which changes the column structure this plan's phase 1 assumed.
>
> Reconcile the remaining phases against the shipped code before resuming this plan.

## Overview

The first redesign pass built a correct token layer and fixed the theming bug, but `/chat`
was styled rather than composed. Screenshot review found the layout itself is wrong: one
exchange occupies the top quarter of the viewport and roughly 1100px of dead ground sits
between the answer and the composer. Underneath that, the surface gives the child no sense
of who is speaking, no way to continue a conversation the assistant just invited, and no
persistent statement of the safety promise the PRD is built on.

This plan fixes composition, presence, and continuation. It does not touch the pipeline,
the guardrails, or any parent surface.

## Design decisions

| # | Decision | Why |
|---|----------|-----|
| D1 | **Keep the warm paper & ink token layer.** | Chosen deliberately earlier in this build and measured at 32/32 WCAG AA pairs across both themes. The `ui-ux-pro-max` database recommends Claymorphism with Comic Neue and Messenger blue for "children education"; adopting it would discard a settled decision, break the parent register (Comic Neue on a safety dashboard is wrong), and add a Google Fonts network dependency the app deliberately does not have. |
| D2 | **Adopt the tactile half of that recommendation, on the child register only.** | The database is right that a child surface should feel physical. Press-scale, spring easing and generous radii carry that without importing a palette or a typeface. |
| D3 | **Bubbli gets a presence, drawn as an inline SVG mark — not an illustration scene, not an emoji.** | A child needs to know who is talking. Project rules ban emoji-as-icon, and a hand-rolled illustration reads worse than none. A geometric bubble mark derived from the name is defensible at any size and themes correctly. |
| D4 | **The conversation is bottom-anchored.** | A chat that grows downward from the top is a document. A chat that sits on the composer is a conversation. This single change removes the void. |
| D5 | **The safety line stays visible for the whole session.** | PRD §3 requires the child to know a safety helper reads their messages. Today that sentence lives in the empty state and disappears permanently after the first message, making it a disclosure the child sees once and can never re-check. |

## Goals

| # | Goal | Priority |
|---|------|----------|
| 1 | Remove the dead viewport; conversation and composer read as one object | P1 |
| 2 | Give the assistant a visible identity and the child a legible one | P1 |
| 3 | Never leave the child at a dead end after an assistant question | P1 |
| 4 | Bring the reading load in line with the 4-7 and 8-11 bands | P2 |
| 5 | Keep every safety and accessibility property already proven | P1 |

## Phases

| # | Phase | Status |
|---|-------|--------|
| 1 | [Phase 1: Composition and presence](./phase-01-composition-and-presence.md) | Pending |
| 2 | [Phase 2: Continuation and composer](./phase-02-continuation-and-composer.md) | Pending |
| 3 | [Phase 3: Verification](./phase-03-verification.md) | Pending |

## Success Criteria

- [x] With one exchange on screen at 1440x900, no more than one viewport-height of empty
      ground sits between the last message and the composer
- [x] Assistant and child turns are distinguishable without relying on alignment alone
- [x] Assistant prose measure is <= 60ch at every breakpoint
- [x] A follow-up affordance is reachable after every assistant turn, not only the first
- [x] The safety sentence is visible at every point in the session
- [x] Surface separation (bubble vs ground) >= 1.25:1 in both themes; text pairs still AA
- [x] Renders correctly at 375px, 768px and 1440px, in light and dark, with reduced motion on
- [x] `pnpm typecheck`, `pnpm lint`, `pnpm test` and `pnpm corpus:eval` all still pass
- [x] No component contains a raw hex value

## Out of scope

Parent dashboard, transcript view, login, landing, the chat pipeline, guardrails, streaming
(PRD D4 makes buffered responses deliberate), and the family-code UX defect raised separately.
