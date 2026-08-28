---
phase: 3
title: "The sidebar"
status: completed
priority: P1
effort: "5h"
dependencies: [1, 2]
---

# Phase 3: The sidebar

<!-- Updated: Validation Session 1 — rows carry a message count (D8) -->
<!-- Updated: Red Team Session 1 — D11 neutral label for flagged conversations -->

## Overview

The list a child actually sees: a rail on desktop, a drawer on mobile, collapsed by
default, with `+ New` at the top and conversations grouped by day.

## Requirements

- Functional: a toggle in the header opens and closes it; the state persists across
  navigation within the session.
- Functional: rows are grouped `TODAY` / `YESTERDAY` / `EARLIER`, newest first.
- Functional: each row shows the derived excerpt, a completed-message count (D8) and a
  time; the active conversation is visually current.
- Functional: when the endpoint returns no excerpt (D11 — the conversation is flagged),
  the row shows a neutral, time-based label such as *"A chat from this afternoon"*. It
  must read as ordinary, and must **not** be styled as a warning: a child should not be
  shown a badge on their own difficult moment.
- Functional: `+ New` navigates to `/chat`, clearing the `c` param.
- Functional: "Show older" appears only when `hasMore`, and appends rather than replaces.
- Functional: **no control deletes, hides, renames, pins or archives anything** (D3).
- Non-functional: collapsed by default, so the chat is the subject on first load.
- Non-functional: all controls >= 44px; the drawer traps focus and closes on Escape;
  the toggle is reachable and labelled for a screen reader.
- Non-functional: both themes, WCAG AA, reduced motion honoured on the open/close.
- Non-functional: the conversation column keeps its `max-w-2xl` reading measure.

## Architecture

A new `src/components/chat/conversation-list.tsx`, and a thin sidebar shell that owns
only the open/closed state. The list is a presentational component fed by the phase-1
endpoint; it holds no conversation state of its own, because the URL is the source of
truth after phase 2 and two sources would drift.

Layout at desktop: a two-column grid where the rail is a fixed width and the
conversation column keeps `max-w-2xl` *inside* the remaining space. The measure is a
property of the prose, not of the viewport, so it must not be recomputed from the space
the sidebar leaves.

```
 collapsed                       expanded
┌──┬──────────────────────┐    ┌────────────┬────────────────┐
│☰ │  header              │    │ ☰  + New   │  header        │
├──┼──────────────────────┤    ├────────────┼────────────────┤
│  │                      │    │ TODAY      │                │
│  │   max-w-2xl column   │    │  why is…   │  max-w-2xl     │
│  │                      │    │  how do…   │  column        │
│  │                      │    │ YESTERDAY  │  (unchanged    │
│  │  [composer]          │    │  tell me…  │   measure)     │
└──┴──────────────────────┘    └────────────┴────────────────┘
```

Mobile is the same component in a drawer over the chat, not a second implementation.

Day grouping is computed in the client from `startedAt` against the viewer's local
midnight. Doing it in SQL would bake the server's timezone into the labels.

**No delete affordance is not an omission to be filled in later.** D3 is a safety
decision: a conversation is the evidence behind a parent's alert. A comment in the
component should say so, or a future contributor will add the missing button as an
obvious improvement.

## Related Code Files

- Create: `src/components/chat/conversation-list.tsx`
- Create: `src/components/chat/sidebar.tsx` — shell, toggle, drawer behaviour
- Modify: `src/components/chat/chat-client.tsx` — host the sidebar, header toggle
- Create: `tests/chat/conversation-list.test.ts`

## Implementation Steps

1. Build `conversation-list.tsx` against the phase-1 response shape: grouping, active
   row, empty state, "show older".
2. Build the sidebar shell: rail at `md:` and up, drawer below, Escape to close, focus
   trap while open, `aria-expanded` on the toggle.
3. Wire the toggle into the existing header beside "How you're kept safe".
4. Restructure the chat layout to two columns without changing the prose measure.
5. Write the empty state: a child on day one has no history, and "No chats yet" must
   not read as an error.

## Success Criteria

- [x] Collapsed on first load; toggle opens and closes it
- [x] Rows grouped Today / Yesterday / Earlier, newest first
- [x] Each row shows excerpt, message count and time without crowding at the rail width
- [x] A flagged conversation shows a neutral label, indistinguishable in styling from any
      other row (D11) — no badge, no colour, no icon
- [x] Selecting a row navigates to `?c=<id>` and paints that conversation
- [x] The active row is visually distinguishable, and not by colour alone
- [x] `+ New` returns to `/chat` and the greeting
- [x] "Show older" appends; it is absent when there is nothing older
- [x] **No delete, hide, rename, pin or archive control exists anywhere** — grep the
      component for those words and find none
- [x] Escape closes the drawer; focus returns to the toggle; focus is trapped while open
- [x] Every control >= 44px; contrast passes AA in both themes
- [x] Prose measure unchanged with the sidebar open — messages do not reflow wider
- [x] Empty state reads as normal, not as a failure

## Risk Assessment

**The sidebar becomes the screen.** For a four-year-old, a list of past chats is noise
competing with the one thing they came to do. Collapsed-by-default is the mitigation,
and it is why the brainstorm rejected an always-open rail.

**Signal it broke:** the chat column narrows enough that assistant prose reflows, or
the composer stops being the obvious focus on open.
**Response:** the rail is too wide. Narrow it or make it an overlay at that breakpoint —
do not shrink the reading measure to make room.

**Someone adds a delete button later because its absence looks like an oversight.**
Mitigated by an explicit comment naming D3 and by a success criterion that greps for
it. This is the highest-value guard in the phase, because the failure is silent: the
product still works, it just stops being trustworthy.

**The neutral label is styled as a warning.** Marking the row would tell a child the
system noticed their crisis and filed it — which is a worse experience than showing the
text. The row must be visually ordinary; only the words change.

**Day grouping is wrong across a timezone change or midnight.** Computed client-side
against local midnight, so a child who travels sees labels relative to where they are.
Acceptable; the alternative bakes the server's zone into a child-facing label.
