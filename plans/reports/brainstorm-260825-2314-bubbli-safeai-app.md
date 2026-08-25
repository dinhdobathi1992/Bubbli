# Brainstorm — Bubbli SafeAI (new app)

**Date:** 2026-08-25
**Inputs:** `PRD.md` v1.0.0 · `plans/reports/analysis-260825-2252-childai-architecture.md`
**Status:** contract accepted — 4 forks decided. Ready for `/ak:plan`.

---

## 1. Contract

**Outcome.** Web app: child chats with an AI tutor through a two-way safety gate; parent
sees **only** the conversations that gate flags, with reason, severity, and a review
action. Ships PRD §10 MVP.

**Constraints.**
- Every AI response cleared before display → **buffering is mandatory**, not a choice.
- COPPA / GDPR-K: parental consent, data minimisation, deletion on request.
- Child data must not train a third-party model → DPA + zero retention required.
- Solo maintainer. One deploy target.
- MVP guardrails are rule-based only (§10) → **no Python/ML runtime needed**.

**Non-goals.** PRD §10 Out-of-Scope verbatim (no ML classifiers, adaptive learning, voice,
images, mobile apps, classroom mode, i18n). Plus **no teacher/classroom tenancy** — that is
childAI's model, not this product's.

**Acceptance criteria.**
1. Red-team corpus of labelled child prompts run against the gate; precision/recall published.
2. A `medium+` flag appears on the parent dashboard; an `info`/`low` flag provably does not.
3. Rate-limit and authz tests that **fail when the guard is removed**.
4. Unflagged conversation content unreachable through every parent-facing endpoint — proven by test, not by policy.
5. Every parent view of flagged content written to an append-only audit log.

Criteria 3–5 exist because the equivalent code in childAI was untested and broken.

---

## 2. Decisions

| # | Fork | Decision | Why |
|---|---|---|---|
| D1 | Privacy enforcement | **Access control + audit** | Guardrails require plaintext; the AI provider receives plaintext regardless. Cryptographic parent-exclusion is unachievable. AES-256 at rest, flag-gated access, append-only audit. |
| D2 | AI provider | **Bedrock default, DeepSeek dev-only** | §6.1 and §13 were in direct conflict. Provider-agnostic router; production endpoint must carry a DPA + zero retention. |
| D3 | Child transparency | **Told plainly, age-appropriate** | Onboarding discloses the safety helper and that a parent may be told. Blocks explain why. Opacity fails catastrophically the first time a child feels surveilled. |
| D4 | Streaming UX | **Buffered + honest thinking state** | Output gating forces it. Designed loading state, not fake token replay. `<3s` in §11 to be restated as p95 total round-trip. Sentence-gating deferred to Phase 2 behind measurement. |

---

## 3. Direction — greenfield single Next.js app

Next.js App Router + Route Handlers · Postgres + Drizzle · one deploy.

**Rejected — refit childAI.** Its `canAccessConversation` and entire `moderationService` are
classroom-join-based. Stripping teacher/classroom means rewriting the authorization layer —
the one component you least want to half-rewrite — while inheriting six known defects.

**Rejected — split backend + frontend.** Solo maintainer, split auth/CORS, doubled deploy
surface, no MVP payoff.

Drops §6.1's Python fork: Phase-1 guardrails are regex + keyword, so "Python preferred if
guardrails use ML heavily" applies to nothing in scope. A future classifier is an HTTP call
in any language.

### Harvest from childAI — designs, not code

| Keep | Why it earned it |
|---|---|
| Two-layer gate ordering: deterministic rules **before** any model call | Free, fast, unbypassable; LLM only runs when rules pass |
| Buffered-before-display | Only defensible design for this product |
| Fail-closed when the classifier is unavailable | Correct instinct (`safetyPolicy.ts:44`) |
| Provider router + circuit breaker shape | Clean abstraction, right seams |
| `ai_provider_attempts`, `audit_events` (hashed IP/UA) | Right tables — populate them this time |
| Self-harm deflection copy | Non-judgmental, routes to 988 + trusted adult. Reuse near-verbatim. |
| AI calls outside DB transactions | Avoids holding locks across 30s network calls |

### Do NOT port

`limiter.ts` (never blocks — verified 20/20 allowed at limit 5) · `authRoutes.ts` (accepts
any OAuth client's access token; hardcoded fallback signing secret) · `listMessages` history
query (`ORDER BY created_at ASC` returns the **oldest** 20).

---

## 4. PRD amendments required before planning

Not yet applied to `PRD.md` — needs Thi's go-ahead.

| # | Section | Change |
|---|---|---|
| A1 | §7 Encryption | Rewrite. Drop "key derivation includes flag-based access control" — unachievable. State access-control + audit honestly. |
| A2 | §6.1 / §13 | Resolve the DeepSeek↔COPPA conflict per D2. |
| A3 | §11 | `<3s` → p95 total round-trip. Replace "Critical detection rate >95%" (unmeasurable — denominator is what you missed) with precision/recall vs a versioned red-team corpus. |
| A4 | §11 | FP rate must be measured across **all** tiers, not just parent-dismissed. Parents never see `info`/`low`, which is where rule matching fails most. |
| A5 | §7 rows 2 & 6 | Contradiction: parents see full flagged transcripts **and** "not raw PII". Pick one. |
| A6 | §5.3 / §7 | "Redacted after flagging" is destructive and irreversible — removes the detail a grooming disclosure most needs, and silently destroys false-positive homework questions. |
| A7 | §5.3 | `Info` "unless pattern detected" has no mechanism. Either build cross-conversation analysis or drop the clause. |
| A8 | §5.3 | Reframe "Grooming Detection" → **disclosure detection**. There is no adult in this system; the child talks only to the AI. Detectable signal is the child reporting outside manipulation. Different rules entirely. |
| A9 | §14 Q6 | Promote to requirement: `Critical` shows **in-band crisis resources to the child immediately**, in addition to parent push. childAI's largest gap was detecting self-harm then queueing it by recency. |
| A10 | New | Add: audit log · separated-household / custody handling · PIN brute-force lockout (server-side) · child-transparency copy per D3. |
| A11 | §6.2 | `is_visible_to_parent` — stop persisting derived state; compute at read from severity + current policy version, else it staleness-drifts when a parent retunes sensitivity. Drop `safety_score` float (noise in childAI); severity enum is the signal. |

---

## 5. Risks carried forward

| Risk | Note |
|---|---|
| Rule-based gate blocks curriculum | childAI evidence: `\b(naked\|sex)\b` flags "naked eye", "naked mole rat", biology. Red-team corpus must include **false-positive** cases, not only true positives. |
| Bedrock cost at child-chat volume | Not modelled. Needs a per-family ceiling that actually works (childAI's did not). |
| Custody / separated households | Family model assumes shared trust. This product will land in disputes. |
| Crisis escalation beyond push | If a parent doesn't respond at 2am, D3+A9 give the child in-band resources — but there is no further tier. Accepted for MVP; name it explicitly. |

---

## Unresolved questions

1. **Monetization** (PRD §14 Q1) — untouched. Affects rate limits, retention defaults, family/child caps.
2. **Consent verification depth** — §13 says parent email verification is the COPPA consent mechanism. Sufficient for under-13 in the US? Needs the legal review §12 already calls for, before launch not after.
3. **Retention clocks conflict** — §7 says flag-dismissal revokes content access after 30 days; §13 says conversations auto-delete at 90 days and flags are retained longer. Three clocks, undefined interaction. Needs one model.
4. **Age bands** — §5.1 uses 4–7 / 8–11 / 12–15; PRD title says "children" and §13 COPPA applies under 13. The 12–15 band straddles the COPPA boundary — do 13+ users get a different consent and privacy path?
5. **Conversation titles** (§14 Q4) — AI-generated titles mean a model call on unflagged content. Compatible with D1, but worth confirming it's wanted.
