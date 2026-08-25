---
phase: 6
title: "Parent Dashboard and Audit"
status: pending
priority: P1
effort: "4d"
dependencies: [5]
---

# Phase 6: Parent Dashboard and Audit

> **Revised by red team:** findings #2, #3 and second-tier items applied. G1's predicate was wrong
> and its enumeration mechanism unsound — both corrected. Analytics cut to counts.
> Titles removed (V6); dismissal no longer closes a transcript (V7).

## Overview

The parent side, and the phase that **proves the product's central claim**. Severity-sorted
dashboard, transcript access gated at `medium`+, dismiss/review, the co-guardian access log, and
the enumerating suite that makes G1 real.

## Requirements

**Functional**
- Dashboard listing flagged conversations, **sorted by severity first, recency second**.
- Transcript opens only at `medium`+. A conversation whose only findings are `info`/`low` shows
  **count and type only** — and that constraint applies to the **flags-list payload**, not just the
  transcript route.
- Flag actions: dismiss and review; dismissals feed the precision metric.
- Access log: each guardian sees their own and co-guardians' **granted** views.
- Aggregate usage: **message counts only.**

**Non-functional**
- **G1: no parent-facing response contains content from any conversation with
  `max_severity < medium`.** Enumerated by filesystem glob, covering route handlers, pages and
  Server Actions, driven with **both** principal types. (#2, #3)
- **G5**: every granted view, every denied attempt, and every notification dispatch writes an audit row.
- Visibility computed at read time from severity **under the policy version stored on the result**,
  never re-evaluated under the current one. (2nd tier)

## Architecture

```
GET /api/parent/flags
      -> assertIsGuardian(session)
      -> list, ORDER BY severity DESC, created_at DESC
      -> DTO per row:  severity, category, count, timestamp, child display name
         NO title exists at all (V6), NO preview, NO guardrail_result.details      [#2]

GET /api/parent/conversations/:id
      -> assertCanViewConversation(session, id)      [Phase 3]
           |- max_severity < medium  -> 404 + audit(denied)
           |- other family / missing -> 404 + audit(denied)     <- identical response  [2nd tier]
           \- max_severity >= medium -> audit(granted) THEN getTranscript()
                                        THEN audit(delivered)
```

**G1's predicate was wrong (#2).** It previously tested *unflagged* conversations. An `info`/`low`
conversation **is flagged**, so it sat outside the test set — and that is exactly where PRD §5.3
promises "count and type, not content". The prior art built this leak verbatim:
`moderationService.ts:50` returns `flagged_message_preview` with no severity gate. G1 now tests
`max_severity < medium`, and isolation tests are seeded with `info`/`low` conversations.

**Enumeration mechanism was unsound (#3).** A route manifest is emitted only by a compile step, and
Phase 1's CI runs none — so reflection would return empty and the suite would pass vacuously.
Catch-all segments collapse whole endpoint families to one entry, and RSC pages and Server Actions
serve content without appearing in any manifest at all. Therefore:
- Enumerate by **filesystem glob** over `src/app/**/{route.ts,page.tsx,actions.ts}`.
- **Enforce structurally, not only by list**: exactly one audited `getTranscript()` may read
  `messages.content`, with a lint rule forbidding direct message queries anywhere else. Then RSC
  pages and Server Actions are covered by construction.
- Drive every discovered surface with **both** principal types; cross-principal cells must be 403.

**Identical 404s (2nd tier).** "Does not exist", "not your family", and "below medium" return the
same response. A distinct 403 confirms a conversation exists and is below medium — a behavioural
profile of a child whose content the parent was promised no access to, assembled from the gate
meant to deny them. The distinction lives in the audit row only.

**Audit before content, plus delivered after (2nd tier).** `granted` is written before content so a
crash cannot produce an unlogged view; `delivered` is appended after success. The co-guardian log
renders **`delivered`** rows, so a failed retrieval never appears as an accusation in a custody
dispute — and `granted` rows still satisfy G5's completeness proof. Denied rows stay in the table
and are **not** rendered, since their `entity_id`s would leak sub-medium conversation ids.

**Analytics cut (2nd tier).** Topic buckets need a topic classifier that does not exist in MVP, and
"time spent" needs a session table Phase 1 does not define. Neither is in PRD §10. Cut to message
counts, derivable from `messages` with no new machinery. Recorded as Q-J.

## Related Code Files

- Create: `src/app/(parent)/dashboard/`, `(parent)/conversations/[id]/`, `(parent)/access-log/`
- Create: `src/app/api/parent/flags/route.ts`, `api/parent/conversations/[id]/route.ts`
- Create: `src/lib/parent/visibility.ts`, `src/lib/parent/transcript.ts` — sole content reader
- Create: `src/lib/parent/dto.ts` — explicit field projection per severity tier
- Create: `tests/parent/isolation.test.ts`, `visibility-ladder.test.ts`, `flags-dto.test.ts`,
  `response-uniformity.test.ts`, `tests/audit/completeness.test.ts`
- Create: `eslint-rules/no-direct-message-query.js`

## Implementation Steps

1. Implement `visibility.ts`: given `max_severity` and **the policy version stored on the result**,
   return `opens-transcript | aggregate-only`. Pure, unit tested. Assert a later rule-set change
   does not alter a historical conversation's visibility. (2nd tier)
2. Implement `transcript.ts` as the **only** module permitted to read `messages.content`. It audits
   internally. Add the `no-direct-message-query` lint rule and verify it fires. (#3)
3. Implement `dto.ts` with explicit field projection: sub-medium rows expose severity, category,
   count, timestamp and child name — nothing else. Snapshot the DTO. (#2)
4. Implement the flags list route, severity-first. Assert critical outranks a newer high.
5. Implement the transcript route: authz, then `audit(granted)`, then content, then
   `audit(delivered)`. Identical 404 for all denial reasons.
6. Implement dismiss and review, attributed to the acting guardian. **A dismissal never lowers
   `max_severity` and never closes the transcript (V7)** — it marks the flag reviewed and stops
   further notifications. A transcript disappearing mid-read because the parent judged it harmless
   would be a surprise, and a mis-click would permanently hide it.
7. Implement the access log rendering **`delivered`** rows only.
8. Implement aggregate message counts. No topic buckets, no time-spent.
9. **Write `tests/parent/isolation.test.ts`**: glob every surface under `src/app/`, drive each with
   a parent session **and** a child session, seeded with `info`/`low` conversations. Allowlist
   entries require a justification comment. Assert the discovered surface count is >0 and matches a
   committed snapshot. (#2, #3)
10. Verify G1 by adding a deliberately unguarded parent page **and a Server Action**, confirming the
    suite goes red for both. Then remove them.
11. Write `visibility-ladder.test.ts` (both directions, including the list payload),
    `flags-dto.test.ts`, `response-uniformity.test.ts` (all denial reasons identical).
12. Write `tests/audit/completeness.test.ts`: granted, delivered and denied each produce the correct
    rows with actor, entity and authorising severity.

## Success Criteria

- [ ] Dashboard sorts severity-first; critical outranks a newer high
- [ ] `medium`+ opens the full transcript, including any PII it contains
- [ ] **An `info`/`low`-only conversation never opens — in the transcript route AND the flags-list
      payload** (#2, G2)
- [ ] **G1 suite globs every surface** — routes, pages, Server Actions — and drives both principals;
      an unguarded page or Server Action makes it fail, verified in step 10 (#3)
- [ ] Only `transcript.ts` reads `messages.content`; the lint rule fires on any other query
- [ ] All denial reasons return an identical 404 (2nd tier)
- [ ] Access log renders `delivered` rows only; denied rows retained but never shown
- [ ] **G5**: granted, delivered and denied each write exactly one audit row
- [ ] Audit `granted` precedes content retrieval
- [ ] Visibility computed under the result's stored policy version; a later rule change does not
      silently alter a historical conversation's visibility (2nd tier)
- [ ] Analytics is message counts only (Q-J)
- [ ] **Dismissal marks reviewed and stops notifications; the transcript stays open** (V7)
- [ ] No `title` field exists in any DTO or table (V6)
- [ ] No `is_visible_to_parent` read or write anywhere

## Risk Assessment

**The isolation suite is the whole guarantee and it can rot.** Signal: the allowlist grows without
justification comments, or the glob returns fewer surfaces than the snapshot. Response: the count
assertion plus the structural lint rule. The lint rule is the durable half — a list decays, a
constraint on who may read `messages.content` does not.

**Server Actions bypass the enumeration.** Signal: a parent data path that never calls
`transcript.ts`. Response: step 2's lint rule makes this a compile-time failure rather than a
review-time catch.

**Dismissal semantics drift.** Signal: any code path that writes a lower `max_severity`. Response:
V7 settled this — the column only rises. Enforce with a DB `CHECK` or a trigger, not convention,
so a future feature cannot quietly reintroduce silent transcript closure.

<!-- Updated: Validation Session 1 - V6 no titles, V7 dismissal does not close transcripts -->
