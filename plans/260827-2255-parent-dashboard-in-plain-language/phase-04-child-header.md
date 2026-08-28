---
phase: 4
title: "The child header"
status: completed
priority: P2
effort: "2h"
dependencies: []
---

# Phase 4: The child header

## Overview

The child surface's header gives its loudest treatment to its least important action.
Fix the hierarchy without adding chrome.

## The specific problem

`chat-client.tsx` renders three controls beside the wordmark:

| Control | Current treatment | Actual importance |
|---|---|---|
| History toggle | bare icon, `text-muted` | primary — it is how a child finds their chats |
| "How you're kept safe" | bordered pill, `hover:border-accent` | tertiary — read once, rarely again |
| "Sign out" | `text-subtle`, no border | secondary, and nearly invisible |

The bordered pill is the heaviest element on a surface whose entire job is to feel calm,
and `text-subtle` on `Sign out` is the lowest-contrast text in the header.

## Requirements

- Functional: exactly one visually primary control in the header.
- Functional: every header control reachable and operable by keyboard, with a visible
  focus ring.
- Non-functional: `Sign out` meets AA contrast against the header background.
- Non-functional: the header does not compete with the conversation. Less weight, not more.
- Non-functional: both themes; every control >= 44px.
- Non-functional: no new controls. This is a hierarchy fix, not a redesign.

## Architecture

Demote rather than promote. The pill border comes off "How you're kept safe", leaving it
a plain link; `Sign out` moves up to `text-muted`; the history toggle keeps the only
affordance that reads as a button.

The wordmark stays put. It is the only thing in the header that should be noticed
without being looked for.

## Related Code Files

- Modify: `src/components/chat/chat-client.tsx` — the header block

## Implementation Steps

1. Remove the border from the safety link; keep the target >= 44px.
2. Raise `Sign out` to a token that passes AA, and verify by measurement.
3. Check the header at 390px: three controls plus a wordmark must not crowd.
4. Keyboard pass: tab order matches visual order, focus visible on each.

## Success Criteria

- [x] One visually primary control
- [x] `Sign out` passes AA — measured, not assumed
- [x] No control below 44px in either dimension
- [x] At 390px the header does not wrap or crowd
- [x] Tab order follows visual order; focus ring visible on every control
- [x] Both themes

## Risk Assessment

**Demoting the safety link buries a promise the product makes to the child.** "How
you're kept safe" exists because a child is told a safety helper reads their messages;
it must stay findable.

**Signal it broke:** the link is no longer distinguishable from body text.
**Response:** it needs to read as a link, just not as a button. Underline or accent
colour, not a border.

**Contrast fixed by eye.** `text-subtle` looked acceptable and is not. Measure the pair.
