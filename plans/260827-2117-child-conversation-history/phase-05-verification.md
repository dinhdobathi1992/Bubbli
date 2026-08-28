---
phase: 5
title: "Verification"
status: completed
priority: P1
effort: "3h"
dependencies: [1, 2, 3, 4]
---

# Phase 5: Verification

<!-- Updated: Validation Session 1 — 401/403 split (D9), inline-query removal -->
<!-- Updated: Red Team Session 1 — D11 D12 D13 D14 -->

## Overview

Prove the three properties that are easy to lose quietly: no new leak surface, no way
for a child to destroy evidence, and no bypass of the parent oversight record.

Everything else in this plan announces itself when it breaks. These do not.

## Requirements

- The reported symptom is gone, checked by hand against the running app.
- Every authorization boundary on the new paths is asserted by a test, not reasoned about.
- No stored title, and no parent-visible surface carrying child content.
- No delete affordance anywhere in the child UI.
- Both themes, both breakpoints, keyboard-complete.
- All existing gates still pass.

## Architecture

Three of these need a structural check rather than a behavioural one, because the
failure is a future edit rather than a current bug:

| Property | Structural check |
|---|---|
| V6 holds | the `conversations` table definition contains no `title` / `summary` / `excerpt` column |
| The child module stays child-only | no file under `src/app/(parent)` or `src/lib/parent*` imports from `child-transcript.ts` |
| D3 holds | no delete / hide / archive / remove control in `src/components/chat/` |
| G1 holds | `messages.content` is read only from the two allowlisted modules — `pnpm lint` passing is the assertion |
| D11 holds | no code path returns an excerpt for a conversation whose `max_severity` is `medium`+ |

These belong in the test suite, not a checklist, because a checklist is not run again
in six months.

## Related Code Files

- Create: `tests/chat/child-history-boundaries.test.ts` — the three structural checks
- Modify: existing chat tests if the `ChatClient` props changed

## Implementation Steps

1. **Reproduce the original report**, against the running dev server: sign in as a
   child, send a message, hard-refresh. The conversation must survive. This is the
   acceptance test for the whole plan and it is done by hand, once, deliberately.
2. Write the three structural tests above.
3. Sweep both themes at 1440x900 and 390x844, across: empty chat, short conversation,
   long conversation, sidebar open, sidebar closed, empty history.
4. Keyboard-only pass: reach the toggle, open, move through rows, select, Escape,
   confirm focus returns to the toggle.
5. Run every gate: `pnpm typecheck`, `pnpm lint`, `pnpm build`, full suite,
   `pnpm corpus:eval`.
6. Confirm the guardrail path is untouched — `policyVersion()` unchanged and G4
   precision still 100%. Nothing in this plan touches rules, and that should be visible
   rather than assumed.

## Success Criteria

- [x] Send → hard-refresh → history intact, verified by hand on the running app
- [x] Parent session → child list endpoint → **403**, asserted
- [x] Anonymous request → **401**, asserted, and distinguishable from the 403 (D9)
- [x] No inline `messages` query remains in `src/app/api/chat/route.ts` — the content read
      lives only in the G1-allowlisted module
- [x] Child session → another child's conversation → **404**, asserted (D13, anti-enumeration)
- [x] A list call writes no row to `audit_events`, asserted
- [x] `conversations` has no title-shaped column, asserted structurally
- [x] No parent-side file imports `child-transcript.ts`, asserted structurally
- [x] No delete / hide / archive control in the child chat components, asserted structurally
- [x] Conversations with no completed message never listed
- [x] **A `critical`-flagged conversation returns no excerpt in the JSON** (D11) — asserted
      on the response body, so the text never reaches the browser at all
- [x] Resuming across a band change forks a new conversation; the old one still opens (D12)
- [x] The list endpoint is throttled and consumes no AI quota (D14)
- [x] Both themes x both breakpoints x six states: no contrast failure, no horizontal
      scroll, no dead region taller than the composer
- [x] Keyboard-complete, focus visible throughout, focus returns to the toggle on close
- [x] `policyVersion()` unchanged; G4 still 100% precision
- [x] `pnpm typecheck`, `pnpm lint`, `pnpm build`, full suite, `pnpm corpus:eval` — all pass

## Risk Assessment

**A green suite is taken as proof of the properties that were never tested.** This is
the specific failure this project has already hit once: G4 reported 100% recall on a
guardrail that missed the most obvious violence request in the language, because the
corpus shared the rule's blind spot. A test that was never written measures nothing,
and a metric derived from it is worse than no metric because it is reassuring.

**Signal it broke:** any success criterion above marked done without an accompanying
command output or assertion.
**Response:** it is not done. Write the assertion.

**The by-hand check is skipped because the unit tests pass.** The unit tests cover the
read path; they do not cover a real browser reload with a real session cookie, which is
what the user reported. Step 1 is not optional and is not replaceable by a test.

**D11 is verified by looking at the screen instead of the response.** A component that
renders a neutral label while the JSON still carries the crisis text passes a visual
check and fails the actual requirement. Assert on the response body.

**Structural tests are brittle and get deleted.** Each carries a comment naming the
decision it protects — V6, D3, the child-module boundary — so a contributor who hits
one learns why rather than reaching for the delete key.
