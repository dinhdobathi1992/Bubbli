---
phase: 1
title: "The vocabulary"
status: completed
priority: P1
effort: "5h"
dependencies: []
---

# Phase 1: The vocabulary

<!-- Updated: Red Team Session 1 — D10 family keys, D11 severity selection, D12 label in the DTO -->

## Overview

Write a parent-facing sentence for every guardrail rule, and make it structurally
impossible for a rule to reach a guardian without one.

This is the phase that removes the defect. If nothing else in this plan ships, this
should.

## Requirements

- Functional: every rule **family** resolves to a written, parent-facing sentence, and
  every id the engine can emit maps to a family — including the ones that are not in
  `RULES` at all.
- Functional: a dynamic id's suffix is stripped **before** any lookup, so a fragment of
  the child's message cannot reach a label even through the fallback (D10).
- Functional: when several rules fire, the one described is chosen by **severity**, never
  by position in the array (D11).
- Functional: a rule with no label is a **build failure**, not a fallback to the id.
- Functional: labels are per-rule and hand-written. None interpolates message content,
  a child's words, or anything derived from them.
- Functional: the sentence names what happened, not which rule matched. A guardian does
  not need to know the product has rules.
- Non-functional: severity governs tone. `harm.self.*` reads gravely; `inap.substance`
  does not.
- Non-functional: no change to `src/lib/guardrails/`. `policyVersion()` unchanged.

## Architecture

A new `src/content/flag-labels.ts`, beside the crisis copy rather than in
`src/config/vocabulary.ts` — this is **content**, subject to review and rewriting, not
configuration. `src/content/` already holds the highest-stakes text in the product and
is the right neighbourhood.

```ts
interface FlagLabel {
  /** What a guardian reads. Complete sentence, no rule vocabulary. */
  headline: string;
  /** One line of context. Optional. */
  detail?: string;
}
/** Keyed by FAMILY. `rank` decides which family speaks when several fire. */
export const FLAG_FAMILIES: Record<string, FlagLabel & { rank: number }>

/** Strips any dynamic suffix. `evasion.devoweled.kll` → `evasion.devoweled`. */
export function familyOf(ruleId: string): string

/** Takes the WHOLE array; picks by rank, never by position. */
export function labelFor(ruleIds: string[], childName: string): FlagLabel
```

**Keys are FAMILIES, not ids** (D10). The engine emits ids that are not in `RULES`:

| Source | Id | In `RULES`? |
|---|---|---|
| `engine.ts:112` | the rule's own id | yes |
| `engine.ts:143` | `` `evasion.devoweled.${alert.token}` `` | **no — and the suffix is a fragment of the child's message** |
| `engine.ts:164` | `out.age_complexity` | **no** |

So `familyOf(id)` strips to the longest declared family prefix and the token is discarded
before anything is looked up. That is what makes D3 hold structurally rather than by
care: there is no code path in which the token can be rendered, because it stops existing
at the boundary.

**The exhaustiveness guard is the point of the phase**, and after F2 it must cover more
than `RULES`. It enumerates `RULES` **and** the synthetic ids the engine constructs,
asserting each resolves to a family with copy. A new rule — or a new synthetic id —
without a label fails the suite, which is exactly the moment someone should be made to
write the sentence.

**Selection is by severity** (D11). `labelFor` takes the whole `triggeredRules` array and
picks the family with the highest declared rank, so the copy never depends on the order
of declarations in `rules.ts`.

Shape of the copy, for the two that matter most:

| Rule | Headline |
|---|---|
| `harm.self.not_here` | *"{child} said something about not wanting to be here."* |
| `harm.self.direct` | *"{child} talked about hurting themselves."* |
| `inap.violence` | *"{child} asked how to hurt someone."* |
| `inap.sexual.topic.young` | *"{child} asked about sex."* |
| `inap.substance` | *"{child} asked about drugs or alcohol."* |

The child's name is interpolated; **nothing the child wrote is**. That is the whole of
D3, and it is why the signature takes `childName` rather than the flag row.

`labelFor` must not throw on an unknown id at runtime — a rule could be added and
deployed before the test runs in a branch. It returns a deliberately bland fallback
(*"{child} said something that needs your attention."*) that leaks no identifier, while
the test makes the fallback unreachable in a healthy tree.

## Related Code Files

- Create: `src/content/flag-labels.ts`
- Create: `tests/parent/flag-labels.test.ts`
- Modify: `src/lib/parent/dto.ts` — carry the label; **remove `reason`** (D12)
- Verify only: `src/lib/guardrails/rules.ts` — read to enumerate; never edited

## Implementation Steps

1. `RULES` is already exported (`rules.ts:667`), so the test can enumerate it directly.
   List the synthetic ids from `engine.ts` alongside it — they are the half the table
   cannot show.
2. Write `FLAG_FAMILIES` covering every family. Write them in one sitting, in rank order,
   so the tonal ladder is deliberate rather than emergent.
3. Add `familyOf` and `labelFor`, with the bland fallback.
4. Thread the label through `projectFlagRow` so the page receives copy, never a category.
5. Remove `reason` from `FlagRowAtGate` (D12) and update the projection snapshot.
6. Write the enumeration test over `RULES` **plus** the synthetic ids, and confirm it
   FAILS with one family removed.

## Success Criteria

- [x] Every id in `RULES` **and every synthetic id in `engine.ts`** resolves to a family
      with copy — asserted by enumerating both
- [x] Removing one family fails the suite (verified by doing it)
- [x] `familyOf('evasion.devoweled.kll')` returns `evasion.devoweled` — the token is gone
- [x] No label contains `.` or `_` between lowercase words
- [x] No label interpolates anything but the child's name — asserted structurally
- [x] `labelFor` given `['inap.substance','harm.self.direct']` describes the SELF-HARM one,
      in either array order (D11)
- [x] `FlagRowAtGate` no longer has `reason` — asserted by the projection snapshot
- [x] `harm.self.*` labels read gravely; reviewed against severity, not house tone
- [x] `projectFlagRow` no longer exposes a raw rule id to the page
- [x] `policyVersion()` unchanged
- [x] `pnpm typecheck && pnpm lint && pnpm test` clean

## Risk Assessment

**Writing crisis-adjacent copy without a clinician.** Unavoidable here and named rather
than hidden: `src/content/crisis/index.ts` already records this as an ACCEPTED RISK with
a cited source. These labels join that body of copy and go for review together.

**Signal it broke:** a label that reads as reassuring for a `critical` rule.
**Response:** tone is reviewed against the severity ladder, not smoothed toward the
child surface's warmth. This page is an instrument.

**The fallback becomes load-bearing.** If the enumeration test is skipped or deleted,
the bland fallback silently absorbs every new rule and a guardian gets a uniform
non-message. The test is the control; the fallback only prevents a crash.

**Signal it broke:** more than one flag type rendering the same headline in real data.
**Response:** the test was disabled. Restore it before adding copy.

**The synthetic-id list in the test drifts from `engine.ts`.** It is a hand-kept list,
which is exactly the failure F2 exposed one level down. Keep it beside a comment pointing
at `engine.ts:143` and `:164`, and prefer a test that greps the engine for
`` ruleId: ` `` templates over one that trusts the list.

**Signal it broke:** a flag in real data whose family is not in `FLAG_FAMILIES`.
**Response:** the engine grew an id the list does not know. Add the family AND the grep.

**A family label becomes too coarse to be useful.** `inap.sexual` and
`inap.sexual.topic.young` are different conversations for a guardian. Families are
declared at the granularity the copy needs, not at the first dot.
