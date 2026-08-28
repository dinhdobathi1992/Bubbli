---
title: "The parent dashboard, in plain language"
description: "Stop showing guardians raw rule identifiers, give a self-harm flag its own treatment with the crisis line, keep reviewed flags visible so patterns show, and settle the chrome on both surfaces."
status: completed
priority: P1
effort: "1-2d"
tags: [parent-surface, safety-copy, ui, accessibility]
created: 2026-08-27
---

# The parent dashboard, in plain language

## Overview

A guardian whose child typed *"I don't want to be here anymore"* currently sees this
on `/parent`:

```
harm self not here · Thi                                    8/27/2026
```

That is `triggered_rules->>0` — the rule identifier — with dots swapped for spaces
(`src/app/(parent)/parent/page.tsx:42`, rendered at `:87`). Every alert on the page is
developer shorthand. "inap" is not a word.

**An alert a guardian cannot read is an alert that failed**, and this is the most
consequential thing the product does. That is why this is a P1 and why it is not a
styling job.

## What is actually wrong

Established by reading the page and the live flag data, not inferred from a screenshot:

| # | Finding | Evidence |
|---|---------|----------|
| 1 | The parent-facing label IS the rule id | `page.tsx:42` selects `triggered_rules->>0`; `page.tsx:87` renders `.replace(/[._]/g,' ')` |
| 2 | Live data already contains the worst case | flags table holds `harm.self.not_here`, `harm.self.direct`, `inap.sexual.topic.young`, `inap.violence`, `inap.sexual` |
| 3 | The page offers no next step | rows link to a transcript; nothing else, at any severity |
| 4 | Internal vocabulary is user-facing | "Below the gate" is the codebase's own term for `opensTranscript` |
| 5 | Reviewed flags disappear entirely | `page.tsx:46` — `where f.reviewed = false`. No history, so three flags in a week read as one |
| 6 | Absolute US dates on a time-sensitive alert | `toLocaleDateString()` → `8/27/2026` |
| 7 | The page ends around 900px on a tall viewport | `max-w-3xl px-6 py-14`, no vertical composition |
| 8 | The child header's loudest element is its least important action | "How you're kept safe" is a bordered pill; `Sign out` is `text-subtle` |
| 9 | **The rule shown is the first DECLARED, not the most severe** | `engine.ts:209` iterates `activeRules()` in table order; `:195` preserves it. Found by red team |
| 10 | **A rule id can contain the child's own words** | `engine.ts:143` builds `evasion.devoweled.${alert.token}` at runtime, and it is not in `RULES`. Found by red team |

## Decisions taken

| # | Decision | Why |
|---|----------|-----|
| D1 | **A re-think, not a re-skin** | A visual pass leaves `harm self not here` on screen in a nicer font. Findings 1–5 are about what the page says and does; the styling problems are downstream |
| D2 | **Every rule gets a written, parent-facing sentence** | Exhaustive by construction, asserted by a test enumerating `RULES` **and the synthetic ids `engine.ts` builds** — red team F2 showed the table alone does not cover them. Without it, the next rule added silently reintroduces finding 1 |
| D3 | **A label never quotes the child** | Labels are per-rule generic sentences. The flags list is exactly the surface the reviewed prior art leaked, and the same reasoning that forbids a stored conversation title (V6) applies here |
| D4 | **`harm.self.*` gets its own card with the crisis line** | A self-harm disclosure is categorically different from a violence question. It gets plain language, the 988 line, and a suggested opening — at the top, not in a row |
| D5 | **One source for the crisis number** | Parent guidance reuses `LIFELINE` from `src/content/crisis/index.ts`. Two copies of a helpline is a copy that goes stale, and that module already carries the citation and the accepted risk |
| D6 | **Reviewed flags stay visible under their own heading** | Repetition is often the actual signal. Today marking one reviewed deletes it from view |
| D7 | **Relative time under 7 days, absolute beyond** | "2 hours ago" is actionable; "8/27/2026" is a lookup |
| D8 | **The audit consequence moves to the point of action** | "Opening a transcript is recorded" is currently a grey footnote under a fold. It belongs on the button that does it |
| D9 | **The gate itself is untouched** | `opensTranscript` still decides what may be read. This changes presentation, never who may see what |
| D10 | **Labels are keyed on the rule FAMILY, not the exact id** | Red team F2. `engine.ts:143` builds `evasion.devoweled.${token}` from a fragment of the child's message. Stripping to the family *before* any lookup means the token is discarded and can never reach a label — not even through a fallback. It also means a new rule in an existing family inherits sensible copy instead of falling through |
| D11 | **The described rule is chosen by severity, never by position** | Red team F1. Selecting `triggered_rules->>0` picks whichever rule sits earliest in `rules.ts`. It works today only because `harmfulIntent` happens to be declared first — a cosmetic reorder would silently stop self-harm flags rendering the crisis card |
| D12 | **The projection carries the written label, not `reason`** | Red team F3. `FlagRowAtGate.reason` holds `"Matched inap.violence"`. Removing the field entirely means no downstream render can leak an identifier, and the existing snapshot test starts guarding the new contract |

## Relationship to other plans

- **`260827-1226-forest-rebrand`** put "the parent dashboard's layout" in its **non-goals**
  (`plan.md:69`). This plan completes what that one deliberately deferred. No conflict.
- **`260826-0750-path-to-launch`** is tagged `parent-surface`, but its phase 1 is *parent
  access* — sign-in and session — which is now implemented and reachable, though that plan
  still reads `Pending`. Different concern; no blocking dependency. Its stale status wants
  reconciling separately, and guessing which of its phases shipped would be worse than
  leaving it flagged.

## Goals

| # | Goal | Priority |
|---|------|----------|
| 1 | No rule identifier ever reaches a guardian's screen | P1 |
| 2 | A self-harm flag carries plain language, the crisis line, and a way to start talking | P1 |
| 3 | A guardian can see whether a concern is recurring | P2 |
| 4 | The page reads as a composed instrument, not a stub | P2 |
| 5 | Nothing about who may read what changes | P1 |

## Non-goals

- **No changes under `src/lib/guardrails/`.** No rule edits, no severity changes, no new
  rules. `policyVersion()` must come out unchanged, and phase 5 asserts it.
- Notification transports. Owned by `path-to-launch` phase 2.
- `/parent/family`, `/parent/setup`, and the transcript page, except where a shared row
  component touches them.
- A parent mobile app, or any new route.
- Clinician review of the new copy. Named as a risk below, not performed here.

## Phases

| # | Phase | Status | Depends on |
|---|-------|--------|------------|
| 1 | [The vocabulary](./phase-01-vocabulary.md) | **Completed** | — |
| 2 | [The crisis card](./phase-02-crisis-card.md) | **Completed** | 1 |
| 3 | [The dashboard](./phase-03-dashboard.md) | **Completed** | 1, 2 |
| 4 | [The child header](./phase-04-child-header.md) | **Completed** | — |
| 5 | [Verification](./phase-05-verification.md) | **Completed** | 1-4 |

Phase 1 is the whole point. If only one phase ships, it should be that one — it removes
the safety-relevant defect on its own.

## Success Criteria

- [x] No string rendered on `/parent` matches `/^[a-z]+([._][a-z_]+)+$/` — asserted, not eyeballed
- [x] **No rule identifier survives in the DTO** — `reason` is gone, asserted by the projection snapshot (D12)
- [x] **A dynamic id's suffix is discarded before lookup** — `evasion.devoweled.<token>` never reaches a label (D10)
- [x] **A self-harm flag renders the crisis card even when another rule fires first** (D11)
- [x] **Every rule id in `rules.ts` has a parent-facing label**, asserted by enumerating the rule table
- [x] A label is a written sentence; none is derived from message content
- [x] A `harm.self.*` flag renders the crisis card; no other severity does
- [x] The literal `988` appears in exactly one module
- [x] A reviewed flag stays visible under its own heading and is excluded from the attention count
- [x] Times render relative under 7 days, absolute beyond
- [x] "Below the gate" no longer appears as a user-facing heading
- [x] The audit warning sits on the control that triggers it
- [x] 1440x900: no dead region taller than the tallest card
- [x] Child header: exactly one visually primary action; `Sign out` passes AA
- [x] Both themes, WCAG AA, every control >= 44px
- [x] `policyVersion()` unchanged — the guardrails were not touched
- [x] `pnpm typecheck`, `pnpm lint`, `pnpm build`, full suite, `pnpm corpus:eval` all pass

## Risks

| Risk | Mitigation |
|------|------------|
| **Writing, unreviewed, the sentence a guardian reads at the worst moment of their week** | `src/content/crisis/index.ts` already carries this as a named ACCEPTED RISK with a cited source rather than pretending otherwise. The new labels inherit it and go to a clinician before launch, together, as one body of copy |
| A new rule ships with no label and the raw id returns | D2's enumeration test fails the build. This is the single highest-value guard in the plan |
| A label becomes specific enough to leak content | D3 keeps labels per-rule and written by hand. Phase 5 asserts no label interpolates a message |
| Softening the language makes a serious flag read as routine | Copy is reviewed against the severity it represents, not against a house tone. `harm.self.*` should read gravely |
| The rewrite quietly changes who can see what | D9. Phase 5 re-asserts the `opensTranscript` boundary and that the transcript route is unchanged |

## Red Team Review

### Session 1 — 2026-08-27

Three adversarial lenses over 5 phases. **3 findings, all carrying `file:line` evidence,
all accepted.** Reviewers were not spawned as subagents — `AGENT.md` §2A routes
delegation through herdr panes and `HERDR_ENV` is unset in this session, so the lenses
were run inline. Stated rather than silently skipped.

| # | Sev | Finding | Evidence | Disposition |
|---|-----|---------|----------|-------------|
| F1 | High | The crisis card works by accident. `triggered_rules->>0` is the first rule *as declared*, not the most severe. `RULES = [...harmfulIntent, ...pii, ...]` spreads self-harm first — **swapping two lines in that array literal would stop self-harm flags rendering the card**, with no test failing | `rules.ts:667-674`, `engine.ts:209`, `engine.ts:195` | **Accept** → D11 |
| F2 | High | A rule id can contain the child's own words. `evasion.devoweled.${token}` is built at runtime and is absent from `RULES`, so the enumeration test cannot see it and the fallback could echo the token | `engine.ts:143`, `engine.ts:164` | **Accept** → D10 |
| F3 | Medium | The DTO still carries a rule id. `FlagRowAtGate.reason` holds `"Matched inap.violence"`, one render call from the screen | `dto.ts` `FlagRowAtGate` | **Accept** → D12 |

**What F1 and F2 have in common:** both are places where the plan's stated guarantee held
only by coincidence. F1's correctness rested on the order of declarations in a source
file; F2's exhaustiveness test walked a table that does not contain every id the engine
can emit. Neither would have failed a review that read the plan alone — both needed the
engine read alongside it.

**F2 is the one that mattered most.** It defeated two decisions at once: D2's
exhaustiveness guard could not see the id, and D3's promise that a label never quotes the
child was breakable through the identifier itself — in the flags list, which is precisely
the surface the reviewed prior art leaked.

**Rejected:** fixing F2 at the source by making `engine.ts:143` emit a static id. It is
the cleanest repair and it edits the guardrail engine, which this plan declares a non-goal
and which would move `policyVersion()`. Recorded here so the option is not lost — it is
the right change to make in a plan that owns the engine.

## Open questions

None. Scope, crisis treatment and review history were settled in the brainstorm; the
helpline was already settled by `src/content/crisis/index.ts` (988, cited) and is reused
rather than re-decided.
