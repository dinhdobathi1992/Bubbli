---
phase: 5
title: "Flags Severity and Critical Response"
status: pending
priority: P1
effort: "4d"
dependencies: [4]
---

# Phase 5: Flags Severity and Critical Response

> **Revised by red team:** findings #9, #10, #12, #14 and second-tier items applied.
> Effort 3d → 4d. Critical-path ordering corrected — the previous order could return a 500 to a
> child in crisis. Crisis-copy sign-off resolved (V4); `max_severity` immutability fixed (V7).

## Overview

Turn guardrail results into flags, rank them by severity, and implement the **complete
critical-flag response path** (PRD §5.4) — a launch requirement, not an open question.

This is the phase the product exists for. The prior art detected suicidal ideation correctly,
wrote good deflection copy, then dropped the flag into a recency-ordered queue with no escalation.

## Requirements

**Functional**
- Flag creation from any `guardrail_result` at `info` or above, with correct message attribution.
- `conversations.max_severity` maintained **inside the same transaction as the flag insert** (#9),
  and **immutable once set (V7)** — it only ever rises. A parent's dismissal marks the flag reviewed
  and stops notifications; it never lowers severity and never closes a transcript mid-read.
- **Medium-tier escalator**: PRD defines `medium` as "repeated attempts to bypass guardrails" — a
  property of a *sequence*, which the pure Phase 2 engine cannot compute. A stateful escalator
  lives here: N blocked inputs within a conversation window synthesizes a `medium` flag. Without
  it the tier that *opens the transcript* is structurally almost unreachable. (#14)
- Critical response order: (1) **crisis copy composed before any write**, (2) writes, (3) guardian
  notification, (4) dashboard ranking, (5) audit — **all before HTTP response flush**. (#10)
- Notifications: email (Resend) and Web Push (VAPID), **metadata-only payloads**. (2nd tier)
- An audit row for every notification dispatch. (G5, 2nd tier)

**Non-functional**
- **A persistence failure must still return crisis copy to the child.** (#10)
- Notification failure must not swallow the flag; flag failure must not swallow the crisis copy.
- Notification payloads must not carry message content — they leave the audit and DPA boundary.
- Push subscriptions deleted on guardian removal and family erasure. (2nd tier)
- Crisis copy is a named review deliverable with a recorded sign-off.

## Architecture

```
GuardrailResult(severity >= info)
  0. crisisCopy = compose(severity, ageBand)     <- FIRST, pure, cannot fail
  1. TX { createFlag(...) ; updateMaxSeverity(...) }        [atomic — #9]
       on failure: log + alert, CONTINUE to step 2 with crisisCopy intact   [#10]
  2. if critical:
       a. notifyGuardians  -> push + email, metadata only, + audit row
       b. rank             -> surfaces above every other severity
       c. audit            -> written unconditionally
  3. return response containing crisisCopy       <- all of the above completes BEFORE flush
```

**Ordering is the correction (#10).** Previously `createFlag` and `updateMaxSeverity` sat *ahead*
of the crisis response with nothing wrapping them, so a connection-pool exhaustion returned a 500
to a child in acute distress — defeating this phase's own stated rationale. Crisis copy is now
computed first, from severity alone, and cannot be lost to a database failure.

**Everything completes before response flush.** On serverless, work scheduled after the response
may never run: the instance freezes. The previous wording read as "after" and its in-process test
would have passed either way. Steps 1–2 are milliseconds of writes plus a fire-and-forget dispatch;
they run before returning. (2nd tier)

**Attribution.** `messageId` is always the message that contained the offending content — output
flags attach to the assistant message, input flags to the child's. One flag-creation path serves
both directions.

**Idempotency.** A replayed request must not produce a second flag or a second 02:00 crisis
notification. The Phase 4 idempotency key is the deduplication point. (#12)

## Related Code Files

- Create: `src/lib/flags/create.ts`, `src/lib/flags/severity.ts`, `src/lib/flags/escalator.ts`
- Create: `src/lib/crisis/response.ts` + `src/content/crisis/*.md`
- Create: `src/lib/notify/email.ts`, `src/lib/notify/push.ts`, `src/lib/notify/payload.ts`
- Create: `src/lib/audit/write.ts`
- Create: `tests/flags/attribution.test.ts`, `tests/flags/escalator.test.ts`,
  `tests/crisis/critical-path.test.ts`, `tests/crisis/db-failure.test.ts`,
  `tests/notify/payload-boundary.test.ts`
- Modify: `src/lib/chat/pipeline.ts`

## Implementation Steps

1. Implement `createFlag` as the **only** insertion path into `flags`, and pair it with
   `updateMaxSeverity` **in one transaction**. Assert by test that no other module inserts. (#9)
2. Write `tests/flags/attribution.test.ts`: output flags reference the assistant message, input
   flags the child message.
3. **[#14] Implement `escalator.ts`**: count blocked inputs per conversation within a window and
   synthesize a `medium` flag at the threshold. Stateful, owned here, so the Phase 2 engine stays
   pure. Test that N blocked attempts produce exactly one `medium` flag.
4. **[V4] Write the crisis copy per age band by adapting the contract-vetted prior-art copy**
   (`brainstorm:72` — non-judgmental, routes to 988 and a trusted adult). Do not start from scratch.
   **Cite the crisis-line source in the content file.** Record self-review as an **accepted risk**
   with the reason stated: a solo project has no second signer, and a blocking gate cleared by the
   author records nothing. This is a named accepted risk, not a sign-off theatre.
5. Implement `crisisResponse()` as a **pure function of (severity, ageBand)**, computed before any
   write, so no database failure can prevent it reaching the child. (#10)
6. Wire the ordering above into the pipeline: compose, then transact, then notify, then return.
7. **[2nd tier] Implement `payload.ts`**: notification payloads carry child display name, severity,
   flag id and a deep link — **never message content, `guardrail_result.details`, or the title**.
   Write an audit row for every dispatch. Delete subscriptions on guardian removal and erasure.
8. Wrap all critical-path writes so a persistence failure logs, alerts, and continues with crisis
   copy intact.
9. Write `tests/crisis/critical-path.test.ts`: all steps occur in order, before flush, with crisis
   copy in the child's response.
10. **Write `tests/crisis/db-failure.test.ts`: force the database to throw and assert the child
    still receives crisis copy.** This is the mirror test the previous plan lacked. (#10)
11. Write `tests/notify/payload-boundary.test.ts`: no message content, details, or title appears in
    either transport.
12. Assert dashboard ranking puts critical first (consumed by Phase 6).

## Success Criteria

- [ ] `createFlag` is the sole insertion path into `flags`
- [ ] Flag insert and `max_severity` update are **in one transaction** (#9)
- [ ] Output flags attach to the assistant message; input flags to the child message
- [ ] **N blocked inputs in a conversation synthesize a `medium` flag** (#14)
- [ ] Critical input produces crisis copy in the child's response
- [ ] **Crisis copy still reaches the child when the database is forced to throw** (#10)
- [ ] All critical steps complete **before HTTP response flush**, asserted by test (2nd tier)
- [ ] Notification payloads contain no message content, details, or title (2nd tier)
- [ ] Every notification dispatch writes an audit row (G5)
- [ ] Push subscriptions deleted on guardian removal and family erasure
- [ ] A replayed idempotency key produces no second flag and no second notification (#12)
- [ ] Notification provider failure does not lose the flag or the child-facing response
- [ ] Critical writes an audit row even when no parent opens the dashboard
- [ ] Crisis copy is adapted from the contract-vetted source, cites its crisis-line reference, and
      carries a **recorded accepted risk** naming why no second signer exists (V4)
- [ ] `max_severity` never decreases; dismissal does not close a transcript (V7)

## Risk Assessment

**Crisis copy shipped without review.** Signal: merged with no accepted-risk note and no source
citation. Response: release blocker. Per V4 the bar is *adapted from vetted copy + cited source +
recorded accepted risk* — not a self-signature that records nothing.

**Notification provider becomes a hidden dependency of safety.** Signal: a test that passes only
when Resend/VAPID are reachable. Response: verify by running the critical-path test with
notifications forced to throw.

**The medium escalator misfires on a curious child.** Signal: `medium` flags on children who hit
the gate a few times out of ordinary curiosity, opening transcripts to parents unnecessarily.
Response: tune the window and threshold against the held-out corpus, and count only *blocked*
inputs — never merely flagged ones.

**No escalation tier beyond guardian push.** Accepted MVP limit, stated in PRD §5.4. Signal that it
needs revisiting: any real incident where no guardian responded within the session. Response:
replan — a product decision, not a patch.

<!-- Updated: Validation Session 1 - V4 crisis copy provenance, V7 max_severity immutable -->
