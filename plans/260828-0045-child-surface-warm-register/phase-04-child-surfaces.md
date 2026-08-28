---
phase: 4
title: "The child surfaces"
status: completed
priority: P1
effort: "6h"
dependencies: [2, 3]
---

# Phase 4: The child surfaces

## Overview

Apply the register: a solid header, a filled `+ New chat`, a sidebar that is
open by default, and an empty state that invites rather than announces.

## Requirements

- Functional: solid coloured header carrying the mark and the child's name.
- Functional: `+ New chat` is a **filled** control with an icon, >= 44px.
- Functional: the sidebar is **open by default** at `md` and up; the drawer
  behaviour below `md` is unchanged.
- Functional: the empty state carries an icon and an invitation, not only a
  greeting.
- Functional: the composer's send control carries an icon beside its label.
- Non-functional: everything already proven stays proven — focus order, the
  focus trap, Escape-to-close, reduced motion, 44px targets.
- Non-functional: **no delete, hide, rename, pin or archive control** appears.
  Its absence is a safety decision and a test already asserts it.
- Non-functional: the flagged-conversation label still withholds its text.

## Architecture

The pieces exist; this is a re-dress, not a rebuild. `chat-client.tsx`,
`sidebar.tsx`, `conversation-list.tsx`, `composer.tsx`, `message.tsx` and
`suggestions.tsx` keep their structure and behaviour.

Two behavioural changes, both small and both reversals of a decision made for
the dark register:

**The sidebar opens by default at `md` and up.** It was collapsed because a list
of past chats is noise for a four-year-old competing with the one thing they came
to do. In a light room with a solid header the sidebar reads as furniture rather
than as chrome, which is why the original could leave it open. Below `md` it
stays a drawer — an open sidebar on a phone is not furniture, it is the screen.

**The header shows the child's name.** Currently nothing on screen says whose
chat this is once the greeting scrolls away. The original carried an avatar
initial, a name and an email; the name alone is the part that matters, and the
email is a piece of PII with no reason to be on a child's screen.

## Related Code Files

- Modify: `src/components/chat/chat-client.tsx` — header, layout, default state
- Modify: `src/components/chat/sidebar.tsx` — default open at `md`
- Modify: `src/components/chat/conversation-list.tsx` — filled control, icons
- Modify: `src/components/chat/composer.tsx` — send icon
- Modify: `src/components/chat/suggestions.tsx` — chip treatment
- Modify: `src/app/(child)/login/page.tsx`, `src/app/(child)/pair/page.tsx`

## Implementation Steps

1. Header: solid ground, mark, child's name, one primary control.
2. `+ New chat`: filled accent, white-on-accent label, `+` icon, >= 44px.
3. Sidebar: open by default at `md` and up; leave the drawer alone.
4. Empty state: icon tile plus an invitation.
5. Composer and suggestion chips into the warm register.
6. `/login` and `/pair` — a child meets these first, and they must not still be
   the dark room.

## Success Criteria

- [x] Solid header carrying the mark and the child's name
- [x] `+ New chat` filled, iconed, >= 44px, label >= 4.5:1 on the accent
- [x] Sidebar open by default at `md` and up; drawer unchanged below
- [x] Empty state carries an icon and an invitation
- [x] Send control carries an icon beside its label
- [x] `/login` and `/pair` are in the warm register
- [x] No email or other PII rendered on a child surface
- [x] Focus order, focus trap, Escape and reduced motion all still pass
- [x] No delete/hide/rename/pin/archive control — the existing test still passes
- [x] A flagged conversation still withholds its text

## Risk Assessment

**Re-dressing quietly breaks a behaviour that was tested.** The sidebar's focus
trap, the flagged-label suppression and the no-delete rule are each guarded, and
each is easy to disturb while moving classNames.

**Signal it broke:** any existing chat test failing.
**Response:** the behaviour is the contract; the styling is not. Restore it
before continuing.

**An always-open sidebar crowds the conversation.** It was collapsed for a
reason, and the reason has not disappeared — only weakened.

**Signal it broke:** the prose measure reflows, or the composer stops being the
obvious focus on load.
**Response:** narrow the rail. Do not shrink the reading measure to make room.

**The child's name becomes a foothold for more.** Name is enough. An avatar, an
email or an account menu on a child's screen is surface no one asked for.
