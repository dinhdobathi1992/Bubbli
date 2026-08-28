---
title: "Child conversation history"
description: "Give a child a collapsed sidebar of their past conversations, make a refresh keep its place, and stop the chat rendering as a black expanse on a desktop viewport."
status: completed
priority: P1
effort: "1-2d"
tags: [child-ui, chat, privacy, layout]
created: 2026-08-27
blocks: [260826-0149-child-chat-ui-rebuild]
---

# Child conversation history

## Overview

A child sends a message, refreshes, and lands on an empty greeting. Their words are
still in the database — nothing is lost — but nothing reads them back, so from the
child's side the conversation is gone.

Alongside it, the chat renders as a tall black expanse on a desktop viewport, with a
single exchange pinned to the bottom edge.

This plan adds the read path, the list UI, and a resumable URL, and settles what the
chat should look like when it is nearly empty.

## What is actually broken, and what is not

Established by reading the code, not inferred from the screenshots:

| # | Finding | Evidence |
|---|---------|----------|
| 1 | Messages persist correctly. Nothing is lost | `messages` rows written by `src/app/api/chat/route.ts` |
| 2 | The **pointer** is what is lost. `conversationId` lives in React state and dies on reload | `src/components/chat/chat-client.tsx:26` |
| 3 | A child-owned read path ALREADY exists and is already authorized | `GET /api/chat?conversationId=` → `getOwnTranscript()`, `src/lib/chat/child-transcript.ts:23` |
| 4 | That path is deliberately **not audited and not severity-gated** | `child-transcript.ts:1-11` — "a child may always read what they wrote… the child is the subject, not an observer of someone else" |
| 5 | ~~There is no LIST query anywhere~~ — **corrected in validation.** One already exists inline at `src/app/api/chat/route.ts:130-140`, capped at 30, with a message count and no excerpt. Nothing ever calls it | `route.ts:130-140` |
| 6 | The bottom-anchored layout is a **deliberate decision**, not a bug | `chat-client.tsx:9` documents `min-h-full` + `justify-end` as the chosen behaviour |

Finding 6 matters for how phase 4 is framed. The current layout does exactly what it
was designed to do — put the newest turn directly above the composer — and that is
right on a phone. It was simply never reconciled with a 900px-tall viewport, where
the same rule pushes everything to the floor and leaves the rest black.

## Decisions taken

| # | Decision | Why |
|---|----------|-----|
| D1 | **Collapsed sidebar** — rail on desktop, drawer on mobile, `+ New` at the top | History has to be discoverable without turning the chat into an app chrome exercise for a six-year-old. Collapsed by default keeps the chat the subject |
| D2 | **Row label is a derived excerpt**, computed on read, never stored | Validation decision V6 (`src/db/schema.ts:142`) forbids a stored title: it "needs a model call over content the parent cannot see, and becomes a leak vector in the flags list — the exact field the prior art leaked". Deriving it inside `child-transcript.ts` adds no column, so there is nothing for a parent-side query to select |
| D3 | **No delete, and no hide** | A conversation is the evidence behind a parent's alert. A child-side delete would let the flagged exchange be erased before the guardian opens it, which makes the whole dashboard promise conditional on the child's cooperation |
| D4 | **`/chat` starts fresh; `/chat?c=<id>` resumes** | This is the actual repair for the reported symptom. Moving the pointer from React state into the URL means reload keeps its place, `+ New` is an explicit act, and the greeting still gets its moment |
| D5 | **The list excludes conversations with no completed message** | A send that fails after the `conversations` row is inserted would otherwise leave a blank row in a child's history |
| D6 | **Cap the list at 50 with a "show older" control** | Unbounded history is a slow query and an unusable list. 50 covers weeks of normal use |
| D7 | Reading own history stays **unaudited** | Preserves D4 of the existing architecture. Do not add an audit write on this path; it would record a child observing themselves |
| D8 | **Rows carry a completed-message count alongside the excerpt** | Validation session 1. Costs a second correlated subquery per row; both are covered by `messages_conversation_idx` |
| D9 | **403 for a parent session, 401 only when there is no session** | Validation session 1. `route.ts:126` currently tests `session?.childId` and answers 401 for both, telling an authenticated parent to log in — wrong, and it hides an authorization failure behind an authentication one |
| D10 | **Phase 4 caps the conversation column's height** rather than fully centring it | Validation session 1. Full centring would override `260826-0149`'s shipped requirement that the newest turn sit directly above the composer. Capping satisfies both |
| D11 | **A flagged conversation gets a neutral label, not its excerpt** | Red team F4. `pipeline.ts:201-202` stores a child's message as `completed` even when it triggered a critical flag, so the excerpt query would select it. Without this, a child whose first message was a crisis disclosure sees that sentence in the sidebar on every visit, forever. Gated on `conversations.max_severity >= medium`, a column already on the row |
| D12 | **A band change forks a new conversation on resume** | Red team F1. `schema.ts:138` already promises this — *"Pinned at creation so a mid-conversation band change starts a new one"* — and nothing implements it. Dormant today because conversations die with the page session; phase 2 makes them long-lived, which activates it |
| D13 | **403 on the list endpoint, 404 on a specific conversation** | Red team F2. 404 for someone else's conversation is deliberate anti-enumeration (`route.ts:145`) and stays. D9's 403 applies to the collection, where there is no id to confirm or deny |
| D14 | **The read path is throttled** | Red team F3. `checkChatQuota` guards POST (`route.ts:64`); GET has nothing, and phase 1 makes it heavier — two correlated subqueries per row across 50 rows |

## Relationship to `260826-0149-child-chat-ui-rebuild`

That plan is still marked `pending`, but **its phases 1 and 2 are substantially
implemented**: `message.tsx`, `composer.tsx` and `suggestions.tsx` all exist, the
Bubbli mark is on assistant turns, and the bottom-anchoring is in place — via
`justify-end` rather than the `mt-auto` that plan specified.

Its Goal 1, *"Remove the dead viewport"*, overlaps this plan's phase 4 directly.
**Phase 4 here supersedes it**, because the sidebar changes the column structure the
older phase assumed. Marked `blocks:` in the frontmatter.

That plan's status is stale and should be reconciled separately — it is not this
plan's job to mark someone else's phases done, and guessing which parts shipped would
be worse than leaving it flagged.

## Goals

| # | Goal | Priority |
|---|------|----------|
| 1 | A child can see and reopen their past conversations | P1 |
| 2 | A refresh keeps the child where they were | P1 |
| 3 | No new leak surface: no stored title, no parent-visible field, no audit on the child's own read | P1 |
| 4 | The chat reads as a composed screen at 1440x900, not a black expanse | P2 |
| 5 | Nothing in the child UI can destroy safety evidence | P1 |

## Non-goals

- Search across conversations.
- Renaming, pinning, archiving, or deleting.
- Age-banded UI variants. Collapsed-by-default already answers the young-child concern.
- Any change to the parent dashboard, the flags list, or guardian visibility.
- Reconciling the stale status of `260826-0149` (see above).

## Phases

| # | Phase | Status | Depends on |
|---|-------|--------|------------|
| 1 | [The read path](./phase-01-read-path.md) | **Completed** | — |
| 2 | [Resumable conversations](./phase-02-resumable-url.md) | **Completed** | 1 |
| 3 | [The sidebar](./phase-03-sidebar.md) | **Completed** | 1, 2 |
| 4 | [Composition at desktop height](./phase-04-composition.md) | **Completed** | 3 |
| 5 | [Verification](./phase-05-verification.md) | **Completed** | 1-4 |

Phase 2 is the one that fixes the reported symptom. It is deliberately ahead of the
sidebar so the fix can ship without waiting for the UI.

## Success Criteria

- [x] Send a message, hard-refresh — the conversation is still on screen with its history
- [x] `/chat` with no param shows the greeting and an empty chat
- [x] Sidebar lists prior conversations, newest first, grouped Today / Yesterday / older
- [x] Selecting a row loads it; sending continues that conversation rather than starting a new one
- [x] Each row shows a completed-message count as well as the excerpt (D8)
- [x] No inline `messages` query remains in `src/app/api/chat/route.ts`
- [x] A parent session receives **403** and an anonymous request **401** — distinguishable, proven by tests (D9)
- [x] A flagged conversation shows a neutral label, never its text (D11) — proven with a `critical` fixture
- [x] Resuming a conversation whose band differs from the child's current band starts a new one (D12)
- [x] The list endpoint is throttled, and the throttle does not consume the family's AI budget (D14)
- [x] A child session requesting another child's conversation receives **404** — anti-enumeration, deliberate (D13)
- [x] `grep -c "title" ` against the `conversations` table definition stays at **0**
- [x] No control in the child UI deletes or hides a conversation
- [x] A conversation with no completed message never appears in the list
- [x] At 1440x900 no dead region taller than the composer, in either the empty or the short-conversation state
- [x] Both themes, WCAG AA, all controls >= 44px, sidebar reachable and dismissable by keyboard
- [x] `pnpm typecheck`, `pnpm lint`, `pnpm build`, full suite, and `pnpm corpus:eval` all pass

## Risks

| Risk | Mitigation |
|------|------------|
| The excerpt leaks into a parent-visible surface later | It is computed inside `child-transcript.ts` and returned only by the child endpoint. No column exists to select by accident. Phase 5 asserts the schema has no title field |
| The list endpoint is reachable by a parent session | `assertIsOwningChild` is the same guard the transcript read uses. Phase 1 tests it explicitly rather than trusting it |
| The sidebar re-breaks the reading measure | The conversation column keeps `max-w-2xl`; the sidebar sits outside it, not inside |
| Phase 4 re-litigates a decision that was made on purpose | `chat-client.tsx:9` is the record of that decision. Phase 4 changes it for wide viewports only and states why, rather than deleting it |
| A child with hundreds of conversations makes the list slow | D6 caps at 50. The `conversations_child_idx` index on `(child_id, started_at)` already covers the query |

## Validation Log

### Session 1 — 2026-08-27

**Verification pass (Full tier, 5 phases): 15 claims checked — 13 verified, 2 failed.**

| # | Claim | Result |
|---|-------|--------|
| 1 | "There is no LIST query anywhere" | **FAILED** — exists at `route.ts:130-140` |
| 2 | Excerpt SQL uses `m.role = 'user'` | **FAILED** — `messages_role_ck` allows only `('child','assistant','system')`; `'user'` matches nothing and returns a null excerpt silently |
| 3 | `conversationId` held in React state, lost on reload | verified `chat-client.tsx:26` |
| 4 | `getOwnTranscript` exists and is authorized | verified `child-transcript.ts:23` |
| 5 | That path is unaudited by design | verified `child-transcript.ts:1-11` |
| 6 | V6 forbids a stored title | verified `schema.ts:142` |
| 7 | Bottom-anchoring is a deliberate decision | verified `chat-client.tsx:9` |
| 8 | `conversations_child_idx` on `(child_id, started_at)` | verified `schema.ts:146` |
| 9 | `child-transcript.ts` is in the G1 allowlist | verified `eslint-rules/no-direct-message-query.js:13` |
| 10 | `messages.status` exists with a `completed` value | verified `messages_status_ck` |
| 11 | `audit_events` is the audit table | verified `schema.ts:306` |
| 12 | `assertIsOwningChild` guards by conversation | verified `src/lib/authz/index.ts:85` |
| 13 | `/parent/conversations/[id]` exists | verified |
| 14 | `dynamic = 'force-dynamic'` on the chat page | verified |
| 15 | `message.tsx`, `composer.tsx`, `suggestions.tsx` exist | verified |

Discrepancy, not a failure: `route.ts:126` answers **401** for a parent session; the
plan's criteria said 403. Settled as D9 below.

**Decisions taken**

| Q | Answer | Effect |
|---|--------|--------|
| What to do with the existing list query | **Replace it**; move to `child-transcript.ts` | Phase 1 rewritten. G1 lint forces it: reading `messages.content` from a route handler fails the build |
| Keep `message_count`? | **Keep both** count and excerpt | D8. Second subquery per row, accepted |
| 401 or 403 for a parent session | **403**, and change `route.ts:126` | D9 |
| Phase 4 vs the shipped "newest turn above the composer" requirement | **Cap the column height** | D10. Phase 4 risk section closed |

## Red Team Review

### Session 1 — 2026-08-27

Three adversarial lenses (Security Adversary, Assumption Destroyer, Failure Mode
Analyst) run against 5 phases. **4 findings, all carrying `file:line` evidence, all
accepted.** Reviewers were not spawned as subagents — `AGENT.md` §2A routes delegation
through herdr panes and `HERDR_ENV` is unset in this session, so the lenses were run
inline. Stated rather than silently skipped.

| # | Sev | Finding | Evidence | Disposition |
|---|-----|---------|----------|-------------|
| F1 | High | Resumability activates a dormant age-band bug. The conversation's band is pinned but nothing forks on drift; the guardrail always uses the child's *current* band | `schema.ts:138`, `route.ts:49`, `route.ts:66` | **Accept** → D12 |
| F2 | Medium | The plan contradicts itself: `getOwnTranscript` returns 404, D9 and phase 5 demand 403 | `route.ts:145` | **Accept** → D13 |
| F3 | Medium | The read path has no throttle. POST is quota-guarded, GET is not, and phase 1 makes GET heavier | `route.ts:64` vs GET branch | **Accept** → D14 |
| F4 | High | A crisis message becomes permanent sidebar furniture. Blocked child messages are stored `completed`, so the excerpt query selects them | `pipeline.ts:201-202` | **Accept** → D11 |

**What F1 and F4 have in common:** neither is a defect in the plan's own reasoning. Both
are latent conditions in the existing code that only become reachable *because* this
plan makes conversations persistent and lists them. That is the class of bug a red team
exists to find, and neither would have surfaced from reading the plan alone.

## Open questions

None. Navigation shape, deletion and row label were settled in the brainstorm; the four
questions above were settled in validation session 1.
