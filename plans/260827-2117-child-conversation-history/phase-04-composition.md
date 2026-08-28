---
phase: 4
title: "Composition at desktop height"
status: completed
priority: P2
effort: "2h"
dependencies: [3]
---

# Phase 4: Composition at desktop height

<!-- Updated: Validation Session 1 — D10 settles the conflict with 260826-0149 -->

## Overview

Settle what the chat looks like when it is nearly empty on a tall screen. Today a
single exchange sits on the floor of a 900px viewport with everything above it black.

## This changes a decision that was made on purpose

`chat-client.tsx:9` records the current behaviour as deliberate:

> `min-h-full` + `justify-end` on the inner column: short conversations [put the newest
> turn directly above the composer]

That is correct on a phone, and it is the behaviour phase 1 of
`260826-0149-child-chat-ui-rebuild` was written to produce. It is not a bug, and this
phase must not be written as if it were. What was never reconciled is a 1440x900
viewport, where the same rule leaves two-thirds of the screen empty.

So the change is scoped to wide-and-tall viewports, and the reasoning stays in the
comment rather than being deleted.

## Requirements

- Functional: empty state — the greeting sits in the optical centre of the conversation
  area, not on its floor.
- Functional: short conversation — the exchange is vertically composed rather than
  bottom-pinned, within a **capped column height** (D10) so the newest turn stays close
  to the composer.
- Functional: long conversation — unchanged. Scrolls normally, pinned to newest.
- Functional: mobile unchanged. The current behaviour is right there and stays.
- Non-functional: no JavaScript height measurement, no layout thrash, no CLS.
- Non-functional: `scrollIntoView` on new turns keeps working.
- Non-functional: reduced motion honoured.

## Architecture

The switch is a breakpoint, not a measurement. Below `md`, keep `justify-end`. At `md`
and up, the conversation area becomes a centred column with a max height, so content
grows from the middle and only pins to the bottom once it exceeds the space.

CSS-only, so there is nothing to measure and nothing to thrash:

```
mobile (unchanged)        desktop, empty         desktop, short
┌──────────────┐          ┌──────────────┐       ┌──────────────┐
│              │          │              │       │              │
│              │          │              │       │   ┌────────┐ │
│              │          │   Hi Thi.    │       │   │ msg    │ │
│              │          │   What shall │       │   └────────┘ │
│   ┌────────┐ │          │   we learn?  │       │  ┌─────────┐ │
│   │ msg    │ │          │              │       │  │ reply   │ │
│   └────────┘ │          │              │       │  └─────────┘ │
│ [composer]   │          │ [composer]   │       │ [composer]   │
└──────────────┘          └──────────────┘       └──────────────┘
   justify-end              centred                centred
```

The greeting and the message list are the same column; only its vertical alignment
changes with the breakpoint. Once content exceeds the column, `overflow-y-auto` and the
existing scroll-to-newest take over unchanged — which is why the long-conversation case
needs no special handling.

## Related Code Files

- Modify: `src/components/chat/chat-client.tsx` — the inner column at `chat-client.tsx:127`,
  and the comment at `chat-client.tsx:9` to record why the rule is now breakpoint-scoped

## Implementation Steps

1. Replace the unconditional `justify-end` with a breakpoint-scoped alignment.
2. Update the comment at the top of the file. Do not delete the original reasoning —
   extend it, so the next reader learns the rule was scoped rather than reversed.
3. Check all three states at 1440x900 and at 390x844: empty, one exchange, twenty.
4. Confirm the newest turn is still scrolled into view after a send in every state.

## Success Criteria

- [x] 1440x900 empty: no dead region taller than the composer
- [x] 1440x900 one exchange: composed, not floor-pinned, and the gap between the newest
      turn and the composer stays small enough that they read as one object (D10)
- [x] 1440x900 twenty turns: identical to today — scrolls, pinned to newest
- [x] 390x844 all three states: identical to today
- [x] New turns still scroll into view
- [x] No JS height measurement introduced; no CLS on load
- [x] The comment at `chat-client.tsx:9` explains the breakpoint, not just the rule
- [x] Both themes; reduced motion honoured

## Risk Assessment

**This re-breaks the thing `260826-0149` phase 1 fixed.** That phase's requirement was
"with a short conversation the last message sits directly above the composer". A
centred column at desktop puts a gap between the newest turn and the composer, which is
arguably a regression against that wording.

**Settled in validation session 1 (D10): cap the column's height.** The conversation
area centres at desktop but is bounded, so the newest turn stays near the composer and
both requirements hold. Full centring was rejected precisely because it would override
a shipped decision silently.

**Signal it broke:** the newest turn is far enough above the composer that the two stop
reading as one object — the exact failure the older phase named.
**Response:** tighten the cap. If no cap value satisfies both, the requirements
genuinely conflict at desktop height — stop and bring it to Thi rather than resolving
it in CSS.

**The sidebar changes the available width, so this is tuned against the wrong layout.**
Depends on phase 3 for that reason. Check with the sidebar both open and closed.
