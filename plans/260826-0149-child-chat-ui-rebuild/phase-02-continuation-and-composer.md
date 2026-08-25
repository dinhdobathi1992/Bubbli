---
phase: 2
title: "Continuation and composer"
status: pending
priority: P1
effort: "1h"
dependencies: [1]
---

# Phase 2: Continuation and composer

## Overview

Stop the conversation dead-ending. The assistant routinely closes a turn with a question
("Can you think of a time when the sky didn't look blue?") and the interface offers the
child nothing but an empty text field. Also make the safety promise permanent rather than
a sentence that vanishes after the first message.

## Requirements

- Functional: after any assistant turn, at least one tappable way to continue is present.
- Functional: the safety sentence is visible in every session state, not only when empty.
- Functional: the composer's primary action reads as available, not as disabled-by-default.
- Non-functional: suggestions are static and local — no extra model call, since a call over
  unflagged content is exactly what validation decision V6 removed.

## Architecture

Continuation chips are drawn from a small static set keyed to conversation state, not
generated. Three always-available moves cover the real cases a child needs and cost
nothing: **Tell me more**, **Why?**, and **Something else**. When the conversation is empty
the existing topic starters are shown instead. This keeps the affordance honest — the chips
never claim to understand the answer, they just give the child a way in.

The safety line moves out of the empty state into a persistent footnote directly above the
composer, where it is legible without competing with the conversation.

## Related Code Files

- Create: `src/components/chat/suggestions.tsx`
- Modify: `src/app/(child)/chat/page.tsx`

## Implementation Steps

1. Extract the starter chips into `Suggestions`, taking a list and an `onPick` handler.
2. Render topic starters when the conversation is empty and continuation moves after the
   most recent assistant turn; render nothing while a request is in flight.
3. Move the safety sentence above the composer as persistent, quiet footnote text.
4. Restyle the send control so its resting state reads as the primary action, and give
   disabled a distinct treatment that is not merely low opacity.
5. Swap the single-line input for an auto-growing textarea capped at ~4 rows, with Enter to
   send and Shift+Enter for a newline.

## Success Criteria

- [x] A continuation affordance is present after every assistant turn
- [x] Chips are hidden while a request is in flight and never fire twice
- [x] The safety sentence is visible in empty, mid-conversation and error states
- [x] Enter sends; Shift+Enter inserts a newline; the textarea grows and stops at the cap
- [x] Every control meets a 44px minimum touch target

## Risk Assessment

An auto-growing textarea changes composer height, which can fight the bottom anchor from
Phase 1. Signal it breaks: the last message is occluded as the composer grows. Response:
the scroll container already reacts to `messages` and `thinking`; add composer height to
that effect's dependencies rather than fixing the height.
