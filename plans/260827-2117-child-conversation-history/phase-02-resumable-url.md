---
phase: 2
title: "Resumable conversations"
status: completed
priority: P1
effort: "3h"
dependencies: [1]
---

# Phase 2: Resumable conversations

<!-- Updated: Red Team Session 1 — D12 age-band fork on resume -->

## Overview

Move the active conversation pointer out of React state and into the URL, so a refresh
keeps its place. This is the phase that fixes the reported symptom, and it is placed
before the sidebar so it can ship on its own.

## Requirements

- Functional: `/chat?c=<uuid>` opens that conversation with its full history.
- Functional: `/chat` with no parameter opens a new, empty chat showing the greeting.
- Functional: sending the first message in a new chat replaces the URL with
  `?c=<new id>` **without** adding a history entry — the back button must not step
  through every message.
- Functional: sending into a resumed conversation continues it. No new row — **unless
  the child's age band no longer matches the conversation's pinned band**, in which case
  a new conversation starts (D12).
- Non-functional: an unknown, malformed, or other-child `c` value does not render an
  error screen. It falls back to a new chat.
- Non-functional: no flash of the greeting before a resumed conversation paints.

## The band problem this phase creates

`conversations.age_band` is pinned at creation, and `schema.ts:138` says why:

> Pinned at creation so a mid-conversation band change starts a new one.

**Nothing implements that.** `route.ts:49` reads the child's *current* band, uses it for
`checkInput` (`route.ts:66`), and writes it to `guardrail_results.age_band`. The pinned
column is recorded and never consulted.

Today that is invisible, because a conversation cannot outlive the page session that
created it. **This phase is what makes conversations long-lived, so this phase is what
activates the bug.** A child moving `8-11 → 12` who resumes an old thread would be
guarded at `12` inside a conversation the row calls `8-11` — and the bands genuinely
differ: `inap.sexual.topic.young` is `medium` for under-12s where `.older` is `low`.

D12: on resume, compare the child's current band to the conversation's pinned band. If
they differ, start a new conversation rather than appending. The child's actual age
always governs the guardrail, and the row never lies about which band its turns were
judged under.

## Architecture

`ChatPage` is already a server component that resolves the session (`page.tsx`). It
gains the `c` search param, and when present it calls `getOwnTranscript` **server-side**
and passes the messages to `ChatClient` as initial state.

That placement is deliberate and is what satisfies the no-flash requirement: doing the
fetch in a client `useEffect` guarantees one paint of the empty greeting first. It also
means an unauthorized id fails on the server, where `assertIsOwningChild` already
throws, rather than surfacing as a client error.

```
/chat?c=<id>  ──▶ ChatPage (server)
                    ├─ getSession()                     already there
                    ├─ getOwnTranscript(id)  ──▶ throws on wrong owner
                    │      └─ catch ──▶ treat as new chat
                    └─ <ChatClient initialTurns=… initialConversationId=… />
```

The catch is what turns a stale bookmark or a copied link into a harmless new chat
rather than an error page. A child should never see a permission error for a URL they
did not construct.

Client-side, `conversationId` stops being the source of truth and becomes a mirror of
the URL. After the first send, `history.replaceState` — not `push` — records the id.

The `dynamic = 'force-dynamic'` already on the page stays; this content is per-session
and must never be cached.

## Related Code Files

- Modify: `src/app/(child)/chat/page.tsx` — read `c`, hydrate, fall back on failure
- Modify: `src/components/chat/chat-client.tsx` — accept initial state, `replaceState`
  after first send
- Create: `tests/chat/resume-conversation.test.ts`

## Implementation Steps

1. Add `searchParams` to `ChatPage`; validate `c` is a UUID before touching the
   database, so a junk value costs no query.
2. Call `getOwnTranscript` inside a `try`. On any throw, log nothing user-facing and
   render a new chat.
3. Pass `initialTurns` and `initialConversationId` into `ChatClient`; seed `useState`
   from them.
4. After the first successful send in a new chat, `window.history.replaceState` to
   `?c=<id>`.
5. Verify by hand: send, hard-refresh, confirm the conversation is intact — the exact
   reproduction from the report.

## Success Criteria

- [x] Send a message, hard-refresh — history intact. **The reported symptom, gone**
- [x] `/chat` shows the greeting; `/chat?c=<valid>` shows that conversation
- [x] `/chat?c=not-a-uuid` renders a new chat, no error, no database query
- [x] `/chat?c=<another child's id>` renders a new chat, not a permission error
- [x] Back button after several messages leaves the chat, not the previous message
- [x] No greeting flash when resuming — the first paint already has the messages
- [x] Sending into a resumed conversation adds no `conversations` row
- [x] Resuming a conversation whose pinned band differs from the child's current band
      **starts a new conversation** (D12), and the old one stays readable
- [x] `guardrail_results.age_band` never disagrees with its conversation's `age_band`
- [x] `pnpm typecheck && pnpm lint && pnpm test` clean

## Risk Assessment

**A conversation id in a URL looks like a leak.** It is an opaque UUID and every read
of it is authorized by `assertIsOwningChild`; the parent side already addresses
conversations this way (`/parent/conversations/[id]`). It is not a capability — holding
the id grants nothing without the owning session. Worth stating in the code comment so
the next reader does not have to re-derive it.

**Signal it broke:** any path where the id alone, without the session, returns content.
**Response:** that is a authorization defect, not a URL-design defect. Fix the guard.

**Server-side hydration slows first paint on a long conversation.** A child's
conversation is tens of messages, not thousands, and the query is indexed. If it ever
matters, the answer is to cap the initial render and load older on scroll — not to move
the fetch back to the client, which would reintroduce the flash.

**The band fork is added to the read path instead of the write path.** Resuming to
*read* an old conversation must always work — the fork belongs at the moment of sending,
not the moment of opening. Getting this backwards would make a child's history
unreachable after a birthday.

**Signal it broke:** an old conversation stops opening after a band change.
**Response:** the check moved to the wrong side. Reads are never gated by band.

**`replaceState` conflicts with the Next router.** Using the native API rather than
`router.replace` avoids a re-render and a server round-trip for what is a cosmetic URL
update. If Next's router state and the URL disagree in a way that matters later,
`router.replace(url, { scroll: false })` is the fallback — at the cost of a re-render.
