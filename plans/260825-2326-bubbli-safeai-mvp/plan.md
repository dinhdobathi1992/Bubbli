---
title: "Bubbli SafeAI MVP"
description: "Child-safe AI chat with severity-gated parental oversight. Implements PRD v1.1.0 §10 MVP."
status: pending
priority: P1
effort: "~37d solo"
tags: [greenfield, nextjs, child-safety, compliance]
created: 2026-08-25
revised: 2026-08-25
blockedBy: []
blocks: []
---

# Bubbli SafeAI MVP

> **Revised after red-team review (2026-08-25).** 15 findings accepted, 10 Critical. See
> `## Red Team Review` and `plans/reports/redteam-260825-2342-bubbli-mvp-plan.md`.
> Estimate moved 28d → ~37d. Three architectural decisions were re-opened and resolved (§0b).

## Overview

Greenfield Next.js application implementing **PRD v1.1.0 §10 MVP**: a child chats with an AI
tutor through a two-way safety gate; a parent sees **only** the conversations that gate flags
at `medium` severity or above.

**Inputs:**
- `PRD.md` v1.1.0 — the specification (§0 records four decided forks)
- `plans/reports/brainstorm-260825-2314-bubbli-safeai-app.md` — accepted delivery contract
- `plans/reports/analysis-260825-2252-childai-architecture.md` — prior-art review
- `plans/reports/redteam-260825-2342-bubbli-mvp-plan.md` — red-team adjudication

**Prior art is a liability, not a shortcut.** A near-identical system
(`dinhdobathi1992/Bubbli@b74204c` `childAI/`) was reviewed and found to have six
production-breaking defects — all six in untested code. This plan carries explicit
guard-removal tests because that codebase's guards were absent, not merely weak.

## Decided architecture (PRD §0)

| # | Decision |
|---|---|
| **D1** | Privacy enforced by **access control + audit**, **and** AES-256 at rest. Not cryptographic parent-exclusion. |
| **D2** | **AWS Bedrock** in production (DPA + zero retention); DeepSeek dev-only, flag-gated |
| **D3** | The child **is told** the safety layer exists, age-appropriately |
| **D4** | Responses **buffered in full**, then revealed with an honest loading state |

> D1 previously read "not cryptography", which dropped the at-rest half the contract kept
> (`brainstorm:41`). Restored — the two were never alternatives. (Red team #7)

## §0b — Decisions re-opened by red team and resolved

| # | Question | Resolution |
|---|---|---|
| **R1** | The plan dropped the accepted contract's **second gate layer**, fail-closed behaviour, circuit breaker, and `ai_provider_attempts` — while keeping a ≥95% recall gate that regex alone cannot reach. | **Restore all four.** The dropped rationale ("no ML runtime") is refuted by `PRD.md:267` — a classifier is an HTTP call. Second layer is a Bedrock classifier behind the same DPA. (Red team #5) |
| **R2** | Q-A's likely answer (pseudonymisation) requires `UPDATE` on an audit table Phase 1 makes append-only on day one. | **Design for pseudonymisation-without-UPDATE now.** Actor/subject identifiers are indirected through an erasable per-family pseudonym table, so audit rows stay genuinely append-only under either legal answer. Phase 1 no longer waits on Q-A. (Red team #1) |
| **R3** | G4 recall was gated on a corpus authored by the same person who wrote the rules, in the same commit. | **Split the corpus.** A rule-development set (not gate-eligible) and a **held-out** evaluation set whose negatives are written from the curriculum list *before* the rule exists. Precision and recall both gate on held-out only. (Red team #4) |

## Goals

| # | Goal | Priority |
|---|------|----------|
| 1 | Child can hold a safe, age-appropriate AI conversation end to end | P1 |
| 2 | Content below `medium` severity is unreachable by parents — proven by test, not policy | P1 |
| 3 | `medium`+ flags reach the parent dashboard, severity-first; `info`/`low` provably never open a transcript | P1 |
| 4 | A `Critical` flag triggers the full response path, child-facing crisis resources first | P1 |
| 5 | Guardrail precision/recall measured against a **held-out** corpus, gating release | P1 |
| 6 | Every parent access to child content is audited, append-only, co-guardian visible | P1 |
| 7 | Per-family AI spend ceiling that demonstrably enforces | P2 |
| 8 | COPPA/GDPR-K posture: consent before collection, no third-party training, deletion on request | P1 |

## Phases

| # | Phase | Status |
|---|-------|--------|
| 1 | [Phase 1: Foundation and Data Model](./phase-01-foundation-and-data-model.md) | Pending |
| 2 | [Phase 2: Guardrail Engine and Eval Harness](./phase-02-guardrail-engine-and-eval-harness.md) | Pending |
| 3 | [Phase 3: Auth Tenancy and Consent](./phase-03-auth-tenancy-and-consent.md) | Pending |
| 4 | [Phase 4: Chat Pipeline and AI Provider](./phase-04-chat-pipeline-and-ai-provider.md) | Pending |
| 5 | [Phase 5: Flags Severity and Critical Response](./phase-05-flags-severity-and-critical-response.md) | Pending |
| 6 | [Phase 6: Parent Dashboard and Audit](./phase-06-parent-dashboard-and-audit.md) | Pending |
| 7 | [Phase 7: Quotas Retention and Launch Hardening](./phase-07-quotas-retention-and-launch-hardening.md) | Pending |

**Effort:** 1: 4d · 2: 9d · 3: 6d · 4: 6d · 5: 4d · 6: 4d · 7: 4d — **~37d solo** (was 28d).
Phase 2 grew because G4 requires ≥10 positive and ≥10 negative cases per **rule** (PII alone is
five detectors, `PRD.md:149`); 25-40 rules × 20 cases is 500-800 hand-sourced labelled cases.
Phase 3 grew because child profile creation was missing entirely. (Red team #4, #8)

**Dependency graph:**

```
1 Foundation
├──> 2 Guardrail Engine ──┐
└──> 3 Auth & Consent ────┴──> 4 Chat Pipeline ──> 5 Flags & Critical ──> 6 Dashboard & Audit
                                                                                   │
                                                                    all ──> 7 Quotas & Hardening
```

Phase 2 precedes Phase 4 deliberately: the guardrail engine is the release gate, and the chat
pipeline cannot be validated without a held-out corpus to validate it against.

## Technology decisions

| Layer | Choice | Rationale |
|---|---|---|
| App | Next.js 15 (App Router) + Route Handlers, TypeScript strict | Single deploy per PRD §6.1. |
| DB | PostgreSQL, provisioned via **Vercel Marketplace** at implementation time | Selected through the marketplace flow so the integration is real. **Record the vendor's sub-processor and residency position** — the same test that rejected Clerk applies here (Q-H). |
| ORM | Drizzle + drizzle-kit | Type-safe SQL, explicit migrations. |
| Parent auth | **Better Auth**, self-hosted, Drizzle adapter | **Requires a Phase 3 spike** — carrying a second non-user principal is assumed, not verified. Clerk rejected: additional sub-processor holding children's identity data. |
| Child auth | Separate PIN credential path, argon2id, **lockout counters in Postgres**, ≥6 digits, family-scoped | Durable across restarts. Redis-only counters reset on eviction — a bypass. |
| AI generation | **AI SDK v6 + `@ai-sdk/amazon-bedrock`** direct, with **fallback + circuit breaker** | `PRD.md:272` and `:543` require the router to degrade, not just abstract. |
| AI safety classifier | **Bedrock classifier call, second gate layer, fail-closed** | R1. One HTTP call, same DPA, no ML runtime. |
| Rate limiting | **Named library + datastore decided in Phase 1**, never hand-rolled | Deferring the choice to Phase 7 risks discovering on day 30 that no proven library fits a Postgres-only serverless stack. (Red team #13) |
| Email / Push | Resend + Web Push (VAPID), **metadata-only payloads** | Payloads must not carry message content — they leave the audit and DPA boundary. |
| Validation | Zod for startup config and every route input | No `process.env` outside the parsed config object. |
| Tests | Vitest + Playwright + real Postgres in CI + **mutation testing on guards** | Guard-removal must be re-verified every CI run, not once by hand. |

### Deliberate divergence: direct Bedrock, not Vercel AI Gateway

Platform guidance prefers routing AI SDK calls through Vercel AI Gateway. **This plan does not**,
because D2 requires children's conversation content to traverse only endpoints covered by a DPA
with zero retention, and the Gateway inserts an additional processor.

**This premise is now verified, not assumed** — Phase 1 carries a step that confirms model access,
a real inference call in the residency region, current quotas, and DPA/ZDR terms in writing.
Without that artefact the divergence rests on nothing. (Red team #6)

### Region and residency

Bedrock region and Vercel function region must be chosen together **and the chosen model
confirmed available in that region by a real call**, since GDPR-K residency depends on both.

## Success Criteria

Release gates. Each maps to an acceptance criterion in the accepted brainstorm contract.

- [ ] **G1 — Isolation proven.** No parent-facing response contains content from any conversation
      with `max_severity < medium`. Enumerated by **filesystem glob** over `src/app/**`, covering
      route handlers, pages, and Server Actions, driven with **both** principal types. Seeded with
      `info`/`low` conversations, not merely unflagged ones. *(Restated — the previous predicate
      tested unflagged conversations and excluded the actual leak surface. Red team #2, #3)*
- [ ] **G2 — Visibility ladder proven.** A `medium`+ flag opens the transcript; a conversation whose
      only findings are `info`/`low` never does. Both directions asserted, including the flags-list
      payload, not only the transcript route.
- [ ] **G3 — Guards fail loudly.** Deleting the authorization check, the rate-limit check, or the
      PIN lockout each fails a named test. **Enforced every CI run** by mutation testing scoped to
      `src/lib/authz/`, `src/lib/quota/`, `src/lib/auth/child-pin.ts`, plus invocation assertions
      on every guarded route. *(Was a one-time human ritual. Red team, second tier)*
- [ ] **G4 — Corpus gate.** Precision ≥85% is a **hard gate** on the **held-out** set. Recall on
      high/critical is **measured and reported**, not gated, with a recorded residual risk — a
      self-authored corpus cannot prove recall (V3). Every rule has ≥10 positive and ≥10 negative cases.
      Negatives written from the curriculum list before the rule exists. *(R3)*
- [ ] **G5 — Audit completeness.** Every authorised parent view writes an append-only audit row;
      every denied attempt writes one; every notification dispatch writes one.
- [ ] **G6 — Critical path end-to-end.** A simulated `Critical` input produces crisis copy in the
      child's response **even when the database is forced to throw**, then guardian push,
      top-of-dashboard ranking, and an audit row — all before response flush.
- [ ] **G7 — Latency.** p95 total round-trip ≤8s, p50 ≤4s, measured on **passing** prompts
      representative of real use, warm and cold reported separately, with one concurrent-load run.
      *(Corpus prompts short-circuit generation and cannot measure this. Red team #13 tier)*
- [ ] **G8 — No unvalidated config.** No `process.env` access outside the Zod-parsed config module.
- [ ] **G9 — Compliance premises verified.** DPA + zero-retention confirmed in writing; at-rest
      encryption recorded; model access confirmed by a real inference call in the residency region.
      *(New — D2 and D1 both rested on unverified premises. Red team #6, #7)*

## Risks

| Risk | Signal it is breaking | Pre-decided response |
|---|---|---|
| Held-out precision <85% | Corpus eval fails on curriculum negatives | Narrow with required-context conditions; then lean on the second gate layer (R1). Do not lower the gate |
| Recall unreachable even with the classifier | Held-out recall <95% after R1 | **Escalate to Thi with the per-rule table.** Options are: accept reported-not-gated recall with a recorded residual risk, or cut rule categories. Both are scope decisions, not thresholds to move |
| Bedrock cost at chat volume | Per-family daily spend exceeds modelled ceiling in staging | Tighten per-family cap; escalate model tier before cutting safety passes |
| Buffered latency feels bad to real children | p95 >8s on passing prompts, or user testing shows abandonment | Post-MVP sentence-gating (PRD §5.5, §8 Phase 2) — only with a designed eval |
| Solo maintainer, 7 phases | Phase slip >30% on any phase | **Cuttable:** `/health` polish, metrics auth, analytics. **Not cuttable:** quota enforcement + its guard test (acceptance criterion 3), deletion-on-request, retention model, and all Phase 2/3/5 safety scope. Extend the date or cut the launch, never the compliance items *(rewritten — the previous policy sacrificed requested scope automatically. Red team, second tier)* |

## Open Questions

| # | Question | Gates | Status |
|---|---|---|---|
| ~~Q-A~~ | ✅ **RESOLVED V5** — 90d content / 1y flags / 2y audit. Retention model. Three conflicting clocks: access revoked 30d after dismissal, conversations auto-delete at 90d, flags "retained longer". One model needed. | **Phase 7** | 🔴 Blocking |
| **Q-B** | **COPPA consent depth.** Is parent email verification sufficient verifiable parental consent for under-13? Now also covers consent-before-*collection* and withdrawal. | **Phase 3** | 🔴 Blocking |
| ~~Q-F~~ | ✅ **RESOLVED V1** — accept volume encryption, amend §7.4. Does provider-managed at-rest encryption satisfy PRD §7.4's "AES-256, managed keys"?** If not, column-level encryption is required and Phase 1 grows. The privacy policy makes this claim publicly. | **Phase 1** | 🔴 Blocking |
| ~~Q-C~~ | ✅ **RESOLVED V8** — split at 13. Age bands vs the COPPA-13 boundary — the 12–15 band straddles it | Phase 3 | 🟡 Can default |
| Q-D | Monetization — affects rate limits, retention defaults, per-family caps | Phase 7 | 🟡 Can default |
| ~~Q-E~~ | ✅ **RESOLVED V6** — no titles in MVP. Conversation titles require a model call over unflagged content, and the title is a leak vector in the flags list | Phase 4, Phase 6 | 🟡 Default **off** |
| ~~Q-G~~ | ✅ **RESOLVED V2** — §10 two + emotional safety. Is §5.3's four-rule output table or §10's two-item list the MVP contract? PRD is internally inconsistent; §8 authorises emotional safety, nothing authorises a hallucination guard | Phase 2 | 🟡 Plan assumes §10 + §8 |
| Q-H | Why does the sub-processor test that rejected Clerk not apply to the Marketplace Postgres vendor storing every child message? | Phase 1 | 🟡 Record rationale |
| ~~Q-I~~ | ✅ **RESOLVED V7** — no, immutable. Does a parent's flag dismissal lower `max_severity` and therefore close a transcript? Undefined across Phases 5, 6, and Q-A | Phase 6 | 🟡 Decide in Phase 6 |
| ~~Q-J~~ | ✅ **RESOLVED** — counts only. Is usage analytics in MVP? In §5.2 and §7.2, absent from §10's checklist | Phase 6 | 🟡 Cut to counts |

**Repo state:** not yet a git repository. `git init` is Phase 1 step 1.

## Red Team Review

### Session — 2026-08-25
**Findings:** 40 raw → 15 adjudicated + 12 second-tier (0 rejected at adjudication)
**Severity breakdown:** 10 Critical, 5 High
**Reviewers:** Security Adversary · Failure Mode Analyst · Assumption Destroyer · Scope & Complexity Critic
**Full adjudication:** `plans/reports/redteam-260825-2342-bubbli-mvp-plan.md`

| # | Finding | Severity | Disposition | Applied To |
|---|---------|----------|-------------|-----------|
| 1 | Q-A gates Phase 1's irreversible audit-grant decision | Critical | Accept | plan.md §0b R2, Phase 1, Phase 7 |
| 2 | G1 tests unflagged; leak surface is the sub-medium flagged row | Critical | Accept | plan.md G1, Phase 6 |
| 3 | G1 enumeration unsound in scope and mechanism; `assertCanAccess` undelivered | Critical | Accept | Phase 3, Phase 4, Phase 6 |
| 4 | G4 self-certifying — rules and cases by one author in one commit | Critical | Accept (modified) | plan.md §0b R3, G4, Phase 2 |
| 5 | Four accepted-contract harvest items dropped from the safety layer | Critical | Accept | plan.md §0b R1, Phase 2, Phase 4 |
| 6 | Bedrock DPA/region/model unverified; PRD-mandated fallback dropped | Critical | Accept | plan.md G9, Phase 1, Phase 4 |
| 7 | Encryption at rest absent from all phases | Critical | Accept | plan.md D1, G9, Phase 1, Phase 7 |
| 8 | Child profile creation (PRD §10 #1) has no step, route, or file | Critical | Accept | Phase 3 |
| 9 | No transactions; 6+ independent writes per chat turn | Critical | Accept | Phase 4, Phase 5 |
| 10 | Unguarded DB writes ahead of the child's crisis response | Critical | Accept | Phase 5 |
| 11 | Append-only audit defeatable by FK cascade and table ownership | High | Accept | Phase 1, Phase 7 |
| 12 | No idempotency; retries double-flag and double-notify | High | Accept | Phase 1, Phase 4, Phase 5 |
| 13 | Quota check-then-act; budget consumed on blocked input; library may not fit | High | Accept | plan.md tech, Phase 4, Phase 7 |
| 14 | `medium` tier unreachable by a pure engine; no evasion rules; response-class oracle | High | Accept | Phase 2, Phase 5 |
| 15 | Child PIN: no entropy floor, family scoping, login rate limit, or unlock path | High | Accept | plan.md tech, Phase 3, Phase 7 |

**Corrected before adjudication:** the Scope Critic called emotional-safety rules unrequested added
scope. `PRD.md:398` authorises them ("Simple sentiment analysis for emotional safety"). Only the
hallucination guard is genuinely unrequested — recorded as Q-G and removed from Phase 2.

**Second tier** — 12 findings accepted in principle and folded into phases without individual
adjudication: notification payload boundary, abort orphan state, explainability tuple
(`age_band` + config hash on results), slip policy, analytics mechanism, consent-at-collection,
G3 CI enforcement, Better Auth spike, 403/404 oracle, audit phantom views, crisis-copy sign-off,
hallucination-guard removal.

<!-- slug: bubbli-safeai-mvp -->

### Whole-Plan Consistency Sweep — 2026-08-25

Run after applying all 15 accepted findings and the 12 second-tier items.

| Check | Result |
|---|---|
| Superseded terms (`assertCanAccess`, "unflagged content unreachable", hallucination guard, topic buckets, time-spent) | ✅ Present only inside change-rationale notes; zero live usage |
| Previously-absent items now specified (idempotency, fail-closed, circuit breaker, `ai_provider_attempts`, encryption, `ON DELETE`, `principal_type`, evasion rules, mutation testing, classifier layer, held-out corpus, `age_band`, `family_pseudonyms`) | ✅ All present, 1-4 files each |
| Transactions specified | ✅ 15 references, named TX groups in Phases 4 and 5 |
| Phase dependencies vs the graph in `## Phases` | ✅ Match: `[]`, `[1]`, `[1]`, `[2,3]`, `[4]`, `[5]`, `[1-6]` |
| Effort arithmetic | ⚠️ **Corrected** — breakdown summed to 37d while the total read 36d. Total now 37d |
| Cross-phase name collisions | ✅ `assertIsOwningChild` / `assertCanViewConversation` used identically in Phases 3, 4, 6; `principal_type` distinct from `messages.role`; age-band constant defined once in Phase 3 |
| G-gate references | ✅ G1-G9 consistent between `plan.md` and phase success criteria |
| `ak plan validate` | ✅ OK — 7 phases, 93 tasks (was 61) |

**Unresolved contradictions: none.**

Two things changed shape rather than content and are recorded here so they are not mistaken for drift:
- **G1's predicate changed** from "unflagged" to "`max_severity < medium`". Every phase referencing G1 was updated; the old wording survives only in the finding-2 rationale.
- **Phase 7 priority raised P2 → P1.** It holds deletion-on-request and acceptance criterion 3, so it is not optional hardening and must not be the automatic slip target.

## Validation Log

### Session 1 — 2026-08-25

**Verification pass:** skipped per the validate-workflow guard — `## Red Team Review` already
carries verification evidence (40 findings, every absence claim re-checked by grep). Zero
`[UNVERIFIED]` tags remained to resolve.

**Questions asked:** 8 (range 3-8). All eight resolved; three were blocking.

| # | Question | Decision | Propagated to |
|---|----------|----------|---------------|
| V1 | Q-F — does provider-managed at-rest encryption satisfy §7.4? | **Accept volume encryption; amend PRD §7.4 to describe it honestly.** No schema impact. | Phase 1, PRD §7.4 (pending) |
| V2 | Q-G — §5.3's four output rules or §10's two? | **§10's two + emotional safety** (authorised by §8 at `PRD.md:398`). Hallucination guard stays out. | Phase 2 |
| V3 | G4 deadlock — recall <95% even with the classifier? | **Gate on precision; report recall** with a recorded residual risk. | plan.md G4, Phase 2 |
| V4 | Crisis-copy sign-off with no second human | **Reuse the contract-vetted copy, cite the crisis-line source**, record self-review as an accepted risk. | Phase 5 |
| V5 | Q-A — the retention model | **90d content · 1y flags · 2y audit.** The third clock (30d post-dismissal) is dropped as redundant. | Phase 1, Phase 7 |
| V6 | Q-E — conversation titles | **No titles in MVP.** Removes a model call over unflagged content and a leak vector from the flags DTO. | Phase 4, Phase 6 |
| V7 | Q-I — does dismissal lower `max_severity`? | **No.** `max_severity` is immutable once set; dismissal marks reviewed and stops notifications. | Phase 5, Phase 6 |
| V8 | Q-C — the 12–15 band straddles COPPA-13 | **Split at 13**: bands `4-7`, `8-11`, `12`, `13-15`. | Phase 1, Phase 2, Phase 3 |

**Blocking questions resolved:** Q-F (V1), Q-A (V5). **Q-B remains blocking** — consent depth is a
legal question no design choice can answer, and V8's split at 13 sharpens rather than removes it.

**Net effect on the plan:** Phase 4 loses the title generator; Phase 2 loses the hallucination guard
and gains a fourth age band; Phase 1 gains retention columns and a band change. **Estimate is
unchanged at ~37d** — V2 and V6 remove roughly as much as V8 adds.

### Whole-Plan Consistency Sweep — Validation Session 1

| Check | Result |
|---|---|
| `recall ≥95%` as a gate | ✅ 0 occurrences — restated to precision-gated, recall reported (V3) |
| `Blocked on Q-F` / `Blocked on Q-A` | ✅ 0 occurrences — both unblocked by V1 and V5 |
| Hallucination guard | ✅ Present only in removal rationale (Phase 2 ×2, plan.md ×4) |
| 30d post-dismissal clock | ✅ Present only in "dropped as redundant" notes (V5, V7) |
| `12–15` as a live band | ✅ Only in the V8 resolution note; live bands are `4-7`, `8-11`, `12`, `13-15` |
| Conversation titles | ✅ All remaining `title` hits are frontmatter keys or explicit "no title" assertions (V6) |
| Title generator references | ✅ 0 — never entered the Phase 4 file list |
| Age-band constant | ✅ Defined once in Phase 3, four bands, imported by Phases 2, 4, 5 |
| `max_severity` monotonicity | ✅ Phase 5 declares immutable; Phase 6 enforces by CHECK/trigger (V7) |
| `ak plan validate` | ✅ OK — 7 phases, 104 tasks (was 93) |

**Unresolved contradictions: none.**

**Still blocking:** **Q-B** (COPPA consent depth) alone. It is a legal question no design choice can
answer, and V8's split at 13 sharpens it — the under-13 path now needs a defined verifiable-consent
mechanism, and the 13+ path needs confirmation that a lighter one is permissible.

**Recommendation:** proceed. Phase 1 is fully unblocked and has no dependency on Q-B. Phase 3
carries the only Q-B-gated steps (9–10) and can start its other eight steps meanwhile.
