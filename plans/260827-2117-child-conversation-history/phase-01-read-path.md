---
phase: 1
title: "The read path"
status: completed
priority: P1
effort: "3h"
dependencies: []
---

# Phase 1: The read path

<!-- Updated: Validation Session 1 — premise corrected; a list query already exists -->
<!-- Updated: Red Team Session 1 — D11 neutral label, D13 status codes, D14 throttle -->

## Overview

Replace the conversation list that already exists inline in the route handler with one
that lives in the allowlisted module, carries an excerpt, and excludes conversations
that never got a message.

**This phase was originally written as "add the missing query". That was wrong.**
Validation found a list query already at `src/app/api/chat/route.ts:130-140`. It works,
and it is why the UI *could* have shown history all along — nothing ever called it.

## What the existing query does and does not do

```sql
-- route.ts:131, today
select id, started_at,
       (select count(*)::int from messages m where m.conversation_id = c.id) as message_count
  from conversations c
 where child_id = $1
 order by started_at desc limit 30
```

| | Today | Needed |
|---|---|---|
| Location | inline in the route handler | `child-transcript.ts` — **forced**, see below |
| Row label | none | derived excerpt |
| Message count | all statuses | completed only |
| Empty conversations | included | excluded (D5) |
| Cap | 30, no continuation | 50 + `hasMore` (D6) |
| Non-child session | 401 | 403 (D9) |

**The location is not a style preference.** `eslint-rules/no-direct-message-query.js:9`
allows `messages.content` reads from exactly two files —
`src/lib/parent/transcript.ts` and `src/lib/chat/child-transcript.ts`. The current
query passes lint only because `count(*)` touches no content. Adding the excerpt in
place would fail the build unless the allowlist were widened, which is the one thing
that rule exists to prevent.

## Requirements

- Functional: given a child session, return that child's conversations newest first,
  each with an id, a start time, a completed-message count, and a short excerpt of the
  child's first message.
- Functional: a conversation with no completed message is omitted.
- Functional: **a conversation whose `max_severity` is `medium` or above returns NO
  excerpt** (D11). The caller renders a neutral label. Its content is unchanged and it
  opens normally — only the persistent label is suppressed.
- Functional: the endpoint is throttled (D14), and the throttle does not draw on the
  family's AI budget: a read is not a model call.
- Functional: at most 50 rows, plus `hasMore` so the caller can request older.
- Non-functional: a **parent** session receives 403, not 401 — it is authenticated and
  not authorized, and the two must not be conflated.
- Non-functional: a child session cannot read another child's conversations. The
  collection answers 403; a specific conversation answers **404** (D13).
- Non-functional: no audit event is written (`child-transcript.ts:1-11`).
- Non-functional: no new column on `conversations`. The excerpt is derived on read.

## Architecture

`listOwnConversations()` joins `getOwnTranscript` in
`src/lib/chat/child-transcript.ts`.

The excerpt is the child's first message, computed in SQL rather than by loading every
message. **`role` is `'child'`, not `'user'`** — `messages_role_ck` constrains the
column to `('child','assistant','system')`, so the obvious spelling silently matches
nothing:

```sql
select c.id,
       c.started_at,
       (select count(*)::int
          from messages m
         where m.conversation_id = c.id
           and m.status = 'completed')            as message_count,
       c.max_severity,
       (select left(m.content, 80)
          from messages m
         where m.conversation_id = c.id
           and m.role = 'child'                   -- NOT 'user'; see messages_role_ck
           and m.status = 'completed'
         order by m.created_at asc
         limit 1)                                 as excerpt
  from conversations c
 where c.child_id = $1
   and exists (select 1 from messages m2
                where m2.conversation_id = c.id
                  and m2.status = 'completed')
 order by c.started_at desc
 limit $2 offset $3
```

`max_severity` comes back so the caller can apply D11. **Suppress the excerpt in the
module, not in the component** — a component-side check leaves the text in the JSON
response, where it reaches the browser, the network tab, and any future consumer. The
whole point is that it does not travel.

The `exists` clause is D5 — it drops a conversation whose row was created by a send
that then failed. `conversations_child_idx` on `(child_id, started_at)` covers the
ordering; `messages_conversation_idx` on `(conversation_id, created_at)` covers both
subqueries.

**The excerpt is never stored.** That is what keeps validation decision V6 intact: no
column means no field a parent-side query can select by mistake, which is the exact
failure V6 was written against.

Authorization: `assertIsChild` (`src/lib/authz/index.ts`) rejects a parent principal
before any query runs. The route's current `if (!session?.childId) → 401` collapses
"not signed in" and "signed in as a parent" into one answer; split it.

## Related Code Files

- Modify: `src/lib/chat/child-transcript.ts` — add `listOwnConversations()`
- Modify: `src/app/api/chat/route.ts` — **delete** the inline query at 130-140, call the
  module, and split 401 from 403 at line 126
- Create: `tests/chat/child-conversation-list.test.ts`

## Implementation Steps

1. Add `ChildConversationSummary` (`id`, `startedAt`, `messageCount`, `excerpt`) and
   `listOwnConversations(db, session, { limit, offset })` to `child-transcript.ts`.
2. Delete the inline query from `route.ts` and call the module instead. Return
   `{ conversations, hasMore }`.
3. Split the auth check: no session → 401; session that is not a child → 403.
4. Write the tests below. The authz cases are the point of the phase, not an extra.

## Success Criteria

- [x] A child session gets its own conversations, newest first, with excerpt and count
- [x] A **parent** session gets **403** — asserted, not assumed
- [x] No session gets 401, and the two codes are distinguishable
- [x] A child session cannot see another child's conversations, even same family
- [x] A specific conversation belonging to another child answers **404**, not 403 (D13)
- [x] A conversation with zero completed messages is absent
- [x] `message_count` counts completed messages only
- [x] The excerpt is the child's first message — a test with an assistant-first
      conversation proves `role = 'child'` is right and `'user'` would have returned null
- [x] A conversation with `max_severity` `medium`/`high`/`critical` returns **no excerpt
      field at all** (D11) — asserted on the JSON, not on the rendered component
- [x] The endpoint is throttled, and the throttle consumes no AI quota (D14)
- [x] No audit row written by a list call — asserted against `audit_events`
- [x] No inline `messages` query remains in `route.ts`
- [x] `git diff src/db/schema.ts` empty: no column added
- [x] `pnpm typecheck && pnpm lint` clean — lint passing is itself evidence the content
      read is in an allowlisted module

## Risk Assessment

**The list endpoint becomes a way for a parent to read content unaudited.** The parent
path is severity-gated and audited on purpose; this one is neither by design. A parent
session satisfying it is a real bypass of the oversight record.

**Signal it broke:** the parent-session test returns anything other than 403.
**Response:** stop and fix the guard before any UI work. Do not proceed to phase 2 with
this test failing or skipped.

**`role = 'user'` reappears.** It is the spelling every other chat codebase uses, and
it fails silently here — no error, just a null excerpt on every row. The success
criteria include a test that would catch it rather than relying on the comment.

**Widening the G1 allowlist to avoid moving the query.** Rejected during validation.
The rule's value is that it is narrow; an entry added for convenience makes every later
entry easier to justify.

**The excerpt suppression is added to the component instead of the module.** It would
look equivalent and would not be: the crisis text would still be in the HTTP response.
The success criterion asserts on the JSON for exactly this reason.

**Throttle mechanism is unspecified here on purpose.** `checkChatQuota` is an AI-budget
limiter and is the wrong tool — a read costs no tokens. The identifier-scoped counter in
`src/lib/auth/login-rate-limit.ts` is the closer pattern. Pick one during implementation
and record which; do not reuse the AI quota.

**`left(content, 80)` splits a multi-byte character.** Postgres `left()` counts
characters, not bytes, so emoji and accented text are safe. Worth a test case rather
than a comment.
