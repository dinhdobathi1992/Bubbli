---
title: Bubbli — SafeAI for Children
version: 1.1.0
date: 2026-08-25
author: Thi Dinh
status: Revised — brainstorm contract accepted
supersedes: 1.0.0
---

# Bubbli — SafeAI for Children

> **v1.1.0 changelog.** Amendments A1–A11 from
> `plans/reports/brainstorm-260825-2314-bubbli-safeai-app.md` applied. Four architectural
> forks are now decided (§0). The encryption model (§7), AI provider (§6.1), success
> metrics (§11), and critical-flag response (§5.4) changed materially. v1.0.0 is retained
> at `plans/reports/PRD-v1.0.0-backup-260825.md`.

---

## 0. Decided architecture (v1.1.0)

These four were open or contradictory in v1.0.0. They are now settled and the rest of this
document is written to them.

| # | Decision | Rationale |
|---|---|---|
| **D1** | **Privacy is enforced by access control + audit, not cryptography** | The guardrail engine requires plaintext to function, and the AI provider receives message content regardless. Cryptographic parent-exclusion is unachievable. See §7. |
| **D2** | **AWS Bedrock is the production provider; DeepSeek is dev-only** | v1.0.0 §6.1 (DeepSeek) contradicted §13 (COPPA/GDPR-K). Production requires a DPA and zero data retention. See §6.1. |
| **D3** | **The child is told the safety layer exists**, in age-appropriate language | Opacity fails permanently the first time a child feels surveilled. See §5.1. |
| **D4** | **Responses are buffered, then revealed with an honest loading state** | Output guardrails make buffering mandatory. No fake token-streaming. See §5.5. |

**Build direction:** single Next.js application (App Router + Route Handlers), PostgreSQL,
one deploy target. Not a split frontend/backend, and not a Python service — Phase-1
guardrails are rule-based (§8), so no ML runtime is required in MVP.

---

## 1. Vision

A web application that gives children a ChatGPT-like conversational AI experience while
giving parents visibility into unsafe interactions — without exposing benign conversations.

---

## 2. Problem Statement

Children increasingly use AI chat tools that have no parental oversight. Existing solutions
either:

- Give parents full access to every message (privacy violation, erodes trust).
- Give parents zero visibility (safety risk).

There is no middle ground that respects both **child privacy** and **parental safety
oversight**.

---

## 3. Core Principles

| Principle | Meaning |
|---|---|
| **Safety first** | Every AI response passes through guardrails before reaching the child. |
| **Privacy by default** | Parents see only conversations flagged as unsafe. Normal chats stay private — enforced by access control and audited on every access. |
| **Transparency to parents** | Parents understand *why* a conversation was flagged. |
| **Transparency to the child** | The child is told, in age-appropriate terms, that a safety helper checks messages and that a grown-up may be told about unsafe ones. We do not surveil silently. |
| **Honest claims** | We describe our privacy protections exactly as they work. We do not claim end-to-end encryption we cannot deliver. |
| **Age-appropriate** | The AI adapts tone, vocabulary, and topic boundaries to the child's age group. |
| **No data exploitation** | Children's conversations are never used for advertising, sold, or used to train third-party models. |

---

## 4. User Roles

### 4.1 Child

- Has their own login (display name + PIN, parent-provisioned).
- **PIN security is a launch requirement**: server-side attempt throttling with lockout
  after N failed attempts, per-child, backed by durable storage. A PIN without server-side
  lockout is defeated by a sibling in an afternoon.
- Chats with the AI in a friendly, age-appropriate interface.
- **Is told the safety layer exists** (D3) — see §5.1.
- Cannot see the parent dashboard, flag records, or severity levels.

### 4.2 Parent / Guardian

- Has their own login (email + password, or OAuth).
- Manages child accounts (add/remove children, set age groups).
- Views a **Safety Dashboard** showing only flagged conversations.
- Configures guardrail sensitivity and custom rules.
- Can review, dismiss, or escalate flagged conversations.
- **Every view of child conversation content is written to an append-only audit log** (§7.3).

### 4.3 Household structure

A `Family` may have more than one parent/guardian. v1.0.0 assumed shared trust between
them; that assumption does not hold in separated or contested households, which are common
for this product.

**MVP position:** all guardians on a family have identical access, and the audit log (§7.3)
is visible to every guardian on that family — so any guardian can see what the others
viewed. Differential access, guardian removal disputes, and court-order handling are
explicitly **out of scope for MVP** and must be designed before any custody-sensitive
launch.

### 4.4 Admin (future)

- Platform-level management, usage analytics, content policy configuration.

---

## 5. Feature Specification

### 5.1 Child Experience

| Feature | Description |
|---|---|
| **Chat Interface** | ChatGPT-style UI: message bubbles, loading state, markdown rendering for AI responses. |
| **Conversation History** | Child can scroll through their own past conversations. |
| **Safety Disclosure** (D3) | At onboarding and in an always-reachable "How Bubbli keeps you safe" page, the child is told: a safety helper reads messages to keep them safe; some things can't be discussed; if something looks like it could hurt them, a grown-up in their family may be told. Wording differs per age band. |
| **Block Explanations** | When a message is blocked, the child is told *that* it was blocked and broadly *why* ("that's not something I can help with") — never a rule name, never a bypass hint. |
| **Age-Adaptive Persona** | AI adjusts tone/complexity based on the child's configured age group (4–7, 8–11, 12–15). |
| **Safe Topics** | Homework help, creative writing, science questions, storytelling, general knowledge. |
| **Blocked Topics** | Violence, self-harm, sexual content, substance abuse, personal information solicitation — defined by guardrails. |
| **Session Limits** | Optional daily time limits and usage schedules set by parents. |

### 5.2 Parent Experience

| Feature | Description |
|---|---|
| **Safety Dashboard** | Lists flagged conversations, **sorted by severity first, recency second**. |
| **Conversation Detail** | Full transcript of a flagged conversation with triggering messages highlighted. |
| **Flag Reasons** | Each flag shows which guardrail rule was triggered and why. |
| **Actions on Flags** | Dismiss (false positive), Escalate (mark for further review), Talk to Child (conversation starters). |
| **Child Management** | Add/remove child profiles, set age groups, configure per-child rules. |
| **Guardrail Configuration** | Adjust sensitivity levels, add custom blocked topics, whitelist allowed topics. |
| **Usage Analytics** | Total messages, time spent, topics explored — aggregated stats. Never individual message content unless the conversation is flagged at `medium` or above. |
| **Access Log** | The parent can see their own (and co-guardians') history of viewing flagged content (§7.3). |
| **Weekly Summary** | Optional email digest: "Your child asked about X, Y, Z. No safety concerns this week." |

### 5.3 Guardrail System (The Core Safety Layer)

The guardrail system sits between the child's input and the AI provider, and between the
AI's output and the child's screen.

#### Input Guardrails (Child → AI)

| Rule | Action |
|---|---|
| **PII Detection** | Flag if the child shares name, address, phone, email, or school name. **Non-destructive** (A6): original content is stored intact; masking is applied at render time in aggregate and analytics views only. |
| **Harmful Intent** | Flag if the child expresses self-harm, suicidal ideation, or eating-disorder signals. |
| **Inappropriate Requests** | Block requests for violent, sexual, or age-inappropriate content. |
| **Disclosure Detection** (A8) | Flag when the child **reports** outside manipulation — someone told them to keep a secret from parents, asked for photos, asked to meet, or contacted them privately. There is no second human in a Bubbli conversation; the child talks only to the AI. What is detectable here is the child *disclosing* an external threat, not grooming occurring in-band. Rules, copy, and severity differ accordingly, and this is the highest-value signal the product can catch. |

> **Renamed from "Grooming Detection" in v1.0.0.** The original framing implied detecting a
> groomer inside the conversation. That threat model does not apply to this architecture and
> would have produced the wrong rules.

#### Output Guardrails (AI → Child)

| Rule | Action |
|---|---|
| **Content Filtering** | Block AI responses containing violence, sexual content, hate speech. |
| **Age Appropriateness** | Ensure response complexity and topics match the child's age group. |
| **Hallucination Guard** | For factual claims (especially health/safety), add "ask a trusted adult" disclaimers. |
| **Emotional Safety** | Detect if an AI response could be emotionally harmful (body-shaming, discouraging). |

#### Classification & Flagging

| Severity | Criteria | Parent Visibility |
|---|---|---|
| **Info** | PII shared (name, school) | Counted in aggregate statistics only. **Does not open the transcript.** |
| **Low** | Mildly inappropriate question, quickly redirected | Shown in weekly summary only. Does not open the transcript. |
| **Medium** | Repeated attempts to bypass guardrails, emotional distress signals | Shown on dashboard. **Opens the full transcript.** |
| **High** | Self-harm signals, external-manipulation disclosure, explicit content requests | Immediate dashboard alert + push notification. Opens the full transcript. |
| **Critical** | Active danger signals | In-band child crisis response (§5.4) + immediate push notification + optional emergency contact. Opens the full transcript. |

**Transcript access rule (A5).** Access is binary and driven by severity alone: a
conversation flagged `medium` or above is fully visible to the parent, including any PII it
contains — reviewing it is the entire point. A conversation whose only finding is `info`-
level PII is **never** opened; the parent sees a count and type, not content. v1.0.0
attempted to have both and contradicted itself.

**Cross-conversation pattern escalation is out of scope for MVP (A7).** v1.0.0 said `info`
findings surface "unless pattern detected", but nothing in the architecture performs
cross-conversation analysis — per-message rules cannot see patterns. The clause is removed.
Pattern-based escalation is a Phase 3 candidate (§8) and must not be implied to parents
until it exists.

### 5.4 Critical-Flag Response (A9 — requirement, not an open question)

v1.0.0 listed this as open question Q6. It is promoted to a launch requirement.

When a `Critical` flag fires, **all** of the following happen:

1. **In-band, immediately, to the child** — the response shown to the child includes
   age-appropriate crisis resources: encouragement to talk to a trusted adult now, and a
   region-appropriate crisis line (e.g. 988 in US/Canada). Non-judgmental, warm, and never
   implying the child is in trouble. This copy is the highest-stakes text in the product and
   is a named review deliverable, not incidental UI text.
2. **Push notification to every guardian**, not queued behind a digest.
3. **Top of the dashboard**, ranked above all other severities.
4. **Audit event written** regardless of whether any parent ever opens it.

Rationale: the reference implementation reviewed in
`plans/reports/analysis-260825-2252-childai-architecture.md` detected suicidal ideation
correctly and then placed the flag in a recency-ordered queue with no escalation and no
severity ranking. Detection without a response path is not a safety feature.

**Known MVP limit:** if no guardian responds, there is no further escalation tier. Step 1 is
what protects the child in that window. This is accepted for MVP and stated explicitly
rather than left implicit.

### 5.5 Response Delivery (D4)

Output guardrails require the complete AI response to be evaluated before any part of it
reaches the child. Therefore:

- The response is **generated in full server-side, cleared by the output guardrails, then
  revealed.**
- The waiting period uses a **designed loading state**. It must not simulate token-by-token
  streaming of already-complete text — that is dishonest UX and adds nothing.
- **Sentence-level gating** (generate → classify per sentence → release incrementally) is a
  Phase 2 candidate, to be built only if measured p95 latency proves unacceptable with real
  child users. It introduces a window in which a partially-cleared sentence is visible and
  must not be adopted casually.

---

## 6. Architecture

```
┌─────────────────────────────────────────────────┐
│              Next.js Application                 │
│  ┌──────────────┐    ┌────────────────────────┐ │
│  │  Child UI    │    │    Parent Dashboard    │ │
│  │  (Chat)      │    │    (Safety Review)     │ │
│  └──────┬───────┘    └───────────┬────────────┘ │
│         │                        │               │
│  ┌──────▼────────────────────────▼────────────┐ │
│  │            Route Handlers (API)             │ │
│  │   Auth  │  Chat  │  Parent  │  Audit       │ │
│  └──────────────────┬──────────────────────────┘ │
└─────────────────────┼───────────────────────────┘
                      ▼
┌─────────────────────────────────────────────────┐
│              Guardrail Engine                    │
│  ┌──────────┐  ┌──────────┐  ┌──────────────┐  │
│  │  Input   │  │  Output  │  │  Classifier  │  │
│  │  Filter  │  │  Filter  │  │  & Scorer    │  │
│  └──────────┘  └──────────┘  └──────────────┘  │
└─────────────────────┼───────────────────────────┘
                      │
          ┌───────────┼───────────┐
          ▼           ▼           ▼
┌──────────────┐ ┌──────────┐ ┌──────────────┐
│  AI Provider │ │    DB    │ │  Notification│
│  (Bedrock —  │ │(Postgres)│ │   Service    │
│  DPA + ZDR)  │ │          │ │(Email/Push)  │
└──────────────┘ └──────────┘ └──────────────┘
```

### 6.1 Technology Stack

| Layer | Technology | Rationale |
|---|---|---|
| **Application** | Next.js 14+ (App Router) + Tailwind CSS | One app, one deploy. SSR for the parent dashboard, client components for chat. |
| **API** | Next.js Route Handlers | **Not a separate Python service.** Phase-1 guardrails are regex and keyword matching (§8), so no ML runtime is needed in MVP. A future classifier is an HTTP call from any language. |
| **Database** | PostgreSQL | Relational data (families, children, conversations, flags, audit). |
| **ORM** | Drizzle | Type-safe SQL without ORM lock-in. |
| **AI Provider — production** | **AWS Bedrock** | **Requires a DPA and zero data retention.** Non-negotiable given §13. |
| **AI Provider — development** | DeepSeek, behind a flag | Local development only. **Must never receive production child data.** |
| **Provider abstraction** | Provider-agnostic router with fallback + circuit breaker | Lets the production endpoint change without touching the safety layer. |
| **Guardrails** | Custom rule engine (Phase 1) → optional managed classifier (Phase 2) | Child-specific logic stays in-house; content classification may be delegated later. |
| **Auth** | Parent: OAuth / email+password. Child: PIN with server-side lockout | See §4.1. |
| **Hosting** | Single Vercel deployment | One target. Migrate to AWS if scale or data-residency requires it. |
| **Notifications** | Resend (email) + Web Push API | Parent alerts. |

> **A2 — provider conflict resolved.** v1.0.0 §6.1 nominated DeepSeek as the initial
> provider while §13 committed to COPPA/GDPR-K compliance and §12 mitigated compliance risk
> with "no data sharing". Routing children's conversation content to a third-country
> processor without a DPA **is** that data sharing. Production runs on Bedrock (or another
> endpoint carrying a DPA and zero-retention terms). DeepSeek is a development convenience
> and is flag-gated out of production.

### 6.2 Data Model (Core Entities)

```
Family
  ├── id, name, created_at
  │
  ├── Parent[]                     (all guardians share access — see §4.3)
  │     ├── id, email, auth_provider, family_id
  │     └── notification_preferences
  │
  ├── Child[]
  │     ├── id, display_name, pin_hash, age_group, family_id
  │     ├── pin_failed_attempts, pin_locked_until      (§4.1)
  │     ├── guardrail_config (JSONB — per-child overrides)
  │     │
  │     └── Conversation[]
  │           ├── id, child_id, started_at, ended_at
  │           ├── title (AI-generated)
  │           ├── max_severity: info|low|medium|high|critical|null
  │           ├── flag_status: none | flagged | reviewed | dismissed
  │           │
  │           └── Message[]
  │                 ├── id, conversation_id
  │                 ├── role: child | assistant | system
  │                 ├── content, created_at
  │                 └── guardrail_result (JSONB)
  │                       ├── passed: bool
  │                       ├── triggered_rules: string[]
  │                       ├── severity: info|low|medium|high|critical
  │                       ├── policy_version: string
  │                       └── details: string
  │
  └── AuditEvent[]                 (append-only — §7.3)
        ├── id, family_id, actor_parent_id, created_at
        ├── event_type, entity_type, entity_id
        └── metadata (JSONB)
```

**A11 — two changes from v1.0.0:**

- **`is_visible_to_parent` is removed.** v1.0.0 persisted it as derived state. Persisted
  derived state goes stale the moment a parent retunes sensitivity, silently changing what
  is visible for historical conversations. Visibility is **computed at read time** from
  `severity` + the current policy version. `policy_version` is recorded on each result so a
  past decision remains explainable.
- **`safety_score (0.0–1.0)` is removed**, replaced by `max_severity` on Conversation. An
  aggregate float over a conversation has no defined meaning and was pure noise in the
  reference implementation. The severity enum is the signal the product actually uses.

---

## 7. Privacy Model

### 7.1 What the service can and cannot see

**Bubbli does not provide end-to-end encryption, and does not claim it.** Two facts make it
impossible for this product:

1. **The guardrail engine requires plaintext.** Server-side safety checks cannot run on
   content the server cannot read. Moving them client-side would make the safety layer
   inspectable and bypassable by anyone who opens developer tools.
2. **The AI provider receives every message in plaintext.** Any end-to-end claim is already
   void at the provider boundary, before storage is considered.

Parent exclusion from unflagged conversations is therefore an **access-control guarantee
enforced by the application and proven by audit**, not a cryptographic impossibility.

> **A1 — v1.0.0 §7 claimed:** *"Parent cannot decrypt unflagged conversations — the key
> derivation includes a flag-based access control."* This is not achievable. A key cannot be
> derived from a mutable, future, server-side fact. Envelope encryption with re-wrap-on-flag
> is implementable, but it requires the server to hold the plaintext data key at flag time —
> which it holds anyway, because it runs the guardrails. The claim is removed rather than
> restated more carefully, because a cryptographic promise that is actually an access-control
> policy is a regulatory exposure, not a documentation defect.

### 7.2 Visibility matrix

| Data | Child Sees | Parent Sees | Stored |
|---|---|---|---|
| Unflagged conversation content | ✅ Yes | ❌ No — blocked by access control, every attempt audited | ✅ Encrypted at rest (AES-256) |
| Conversation flagged `medium`+ | ✅ Yes | ✅ Full transcript, including any PII it contains | ✅ Encrypted at rest |
| Conversation with only `info`/`low` findings | ✅ Yes | ❌ Content never opened; count and type only | ✅ Encrypted at rest |
| Flag reasons & severity | ❌ No | ✅ Yes | ✅ Yes |
| Usage stats (time, count, topics) | ❌ No | ✅ Aggregated only | ✅ Yes |
| Guardrail config | ❌ No | ✅ Yes (can edit) | ✅ Yes |
| PII occurrences | ❌ No | ✅ Count and type in aggregate. Raw values only inside a `medium`+ transcript. | ✅ Stored intact; masked at render in aggregate views |
| Audit log | ❌ No | ✅ Yes — own and co-guardians' | ✅ Append-only |

### 7.3 Audit log

The product's entire value claim is *"parents see only flagged conversations."* That claim
must be provable, not asserted.

- Every parent access to child conversation content writes an **append-only** audit event:
  who, what, when, and the severity that authorised it.
- Every **denied** access attempt is also recorded.
- Audit events are never deleted or updated, and are visible to all guardians on the family.
- Acceptance criterion: a test proves unflagged content is unreachable through **every**
  parent-facing endpoint, and that each authorised access produced an audit row.

### 7.4 Encryption & retention

- All conversation content encrypted at rest (AES-256, managed keys).
- All transport over TLS.
- Retention: see §13. **The three conflicting clocks in v1.0.0 are unresolved and tracked in
  §14 Q2** — they must be reduced to a single model before implementation.

---

## 8. Guardrail Implementation Strategy

### Phase 1 — Rule-Based (MVP)

- Keyword/blocklist matching for obvious violations.
- Regex-based PII detection (phone numbers, addresses, emails, school names).
- Disclosure-detection rules (§5.3).
- Simple sentiment analysis for emotional safety.
- Severity scoring based on rule match count and type.

**False positives are a first-class Phase 1 problem, not a Phase 3 refinement.** Naive
keyword matching on an education product blocks curriculum: the reference implementation's
`\b(naked|sex)\b` rule flags *"naked eye"* (astronomy), *"naked mole rat"* (biology), and
any biology-class use of the word. The red-team corpus (§11) must contain labelled
**negative** cases from real homework topics, and precision is a release gate.

### Phase 2 — ML-Augmented

- Integrate a classification model (or a managed content-safety service) for nuanced classification.
- Improve disclosure-detection and self-harm-signal recall.
- Contextual understanding (a question about "killing" in a video game vs. real life).
- Evaluate sentence-level gating (§5.5) against measured latency.

### Phase 3 — Adaptive

- Learn from parent dismissals to reduce false positives.
- Per-child adaptation (a 12-year-old asking about chemistry vs. a 5-year-old).
- Conversation-level and cross-conversation context — the prerequisite for any
  pattern-based escalation of `info` findings (§5.3).

---

## 9. User Flows

### 9.1 Child Chat Flow

```
Child sends message
    │
    ▼
Input Guardrail Engine
    │
    ├── BLOCKED → Child sees: "I can't help with that. Let's talk about something else!"
    │              Flag created → severity-based parent visibility
    │              If CRITICAL → in-band crisis resources shown to child (§5.4)
    │
    ├── FLAGGED → Message passes to AI, but flag is recorded
    │              Parent notified based on severity
    │
    └── PASSED → Forward to AI Provider
                    │
                    ▼
              AI generates FULL response (buffered — §5.5)
                    │
                    ▼
              Output Guardrail Engine
                    │
                    ├── BLOCKED → Replace with safe fallback response
                    │              Flag created
                    │
                    └── PASSED → Reveal complete response to child
```

### 9.2 Parent Review Flow

```
Parent logs in
    │
    ▼
Safety Dashboard  (sorted by SEVERITY, then recency)
    │
    ├── No flags → "Everything looks good! ✅" + usage stats
    │
    └── Flags present → Critical first
          │
          ▼
        Click flag → AUDIT EVENT WRITTEN (§7.3)
          │           Full conversation transcript
          │           with highlighted trigger messages
          │
          ├── Dismiss (false positive) → Flag marked reviewed; feeds FP metric
          ├── Add Rule → Create custom rule based on this flag
          └── Talk to Child → System suggests conversation starters
```

---

## 10. MVP Scope (Phase 1)

### In Scope

- [ ] Child registration by parent (name, age group, PIN) **with server-side PIN lockout**.
- [ ] Child chat interface with AI (Bedrock), buffered delivery with designed loading state.
- [ ] Child safety disclosure + block explanations (D3, §5.1).
- [ ] Basic input guardrails: PII detection, harmful keyword detection, explicit content filter, disclosure detection.
- [ ] Basic output guardrails: content filter, age-appropriateness check.
- [ ] Conversation storage with guardrail results and `policy_version`.
- [ ] Parent login and safety dashboard, **severity-sorted**.
- [ ] Flag visibility rules — `medium`+ opens transcripts; `info`/`low` never do.
- [ ] Flag actions: dismiss, review.
- [ ] **Critical-flag response path in full (§5.4)** — in-band child crisis resources, push, dashboard ranking, audit.
- [ ] **Append-only audit log + parent-visible access log (§7.3)**.
- [ ] Email notification for high/critical flags.
- [ ] **Red-team corpus with labelled positive and negative cases (§11)**.

### Out of Scope (Future Phases)

- [ ] ML-based classification models.
- [ ] Adaptive guardrails learning from parent feedback.
- [ ] Cross-conversation pattern escalation of `info` findings.
- [ ] Sentence-level output gating.
- [ ] Differential guardian access / custody-dispute handling (§4.3).
- [ ] Multi-child household advanced features (sibling interactions).
- [ ] Voice input/output.
- [ ] Image generation or analysis.
- [ ] Mobile apps (iOS/Android).
- [ ] School/classroom mode.
- [ ] Multi-language support.

---

## 11. Success Metrics

| Metric | Target | How measured |
|---|---|---|
| **Guardrail precision** | ≥ 85% across **all** severity tiers | Against the versioned red-team corpus. Parent dismissals alone are insufficient — parents never see `info`/`low`, which is exactly where rule matching fails most (A4). |
| **Guardrail recall on high/critical categories** | ≥ 95% on the labelled corpus | Corpus recall, **not** "% of actual safety concerns flagged" (A3). The latter is unmeasurable: its denominator is the set of concerns you missed, which is by definition unobserved. |
| **Corpus coverage** | Every guardrail rule has ≥ 10 positive and ≥ 10 negative labelled cases | Negative cases drawn from real homework and curriculum topics. |
| **Parent-dismissed flag rate** | < 15% of `medium`+ flags | Secondary signal only — a proxy for precision on the visible tiers. |
| **Response latency** | p95 **total round-trip** ≤ 8s; p50 ≤ 4s | End-to-end, including full generation and both guardrail passes. Output gating makes time-to-first-token meaningless (A3). v1.0.0's `<3s` was not achievable with a buffered gate. |
| **Child engagement** | Child returns to chat > 3x/week | Product signal. |
| **Parent trust** | > 80% of parents report feeling "informed but not intrusive" | Survey. |

> **A3 / A4.** Two v1.0.0 metrics were not measurable as written. "Critical detection rate
> > 95% of actual safety concerns" has no observable denominator. "<3s for AI response
> including guardrail checks" contradicts mandatory buffering. Both are restated above
> against artefacts that exist.

---

## 12. Risks & Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Guardrails miss real danger | Critical | Multi-layer guardrails, err toward flagging, corpus recall gate, regular audit of missed cases |
| Too many false positives block curriculum | High | Negative cases in the red-team corpus, precision release gate, parent feedback loop, tunable sensitivity |
| Child circumvents guardrails | Medium | Detect evasion patterns (leetspeak, misspellings), log evasion attempts as flags |
| Privacy breach | Critical | Encryption at rest, access control on unflagged content **proven by test**, append-only audit, minimal retention |
| Parent over-reach / misuse of access | Medium | Access is severity-gated and fully audited; audit visible to co-guardians (§4.3, §7.3) |
| AI provider outage | Medium | Provider-agnostic router with fallback, graceful degradation ("I'm taking a break, try again soon!") |
| Provider data handling | Critical | Production endpoint must carry a DPA + zero retention (D2). Dev provider flag-gated out of production. |
| COPPA/GDPR-K compliance | High | Legal review pre-launch, no third-party training on child data, parental consent flow, deletion on request |
| Custody / contested households | Medium | MVP treats all guardians equally and audits access; differential access explicitly deferred (§4.3) |
| Bedrock cost at chat volume | Medium | **Not yet modelled.** Per-family message ceiling required, and it must be verified to actually enforce — the reference implementation's rate limiter never blocked a single request. |

---

## 13. Compliance Considerations

- **COPPA (US)**: Parental consent required before collecting data from children under 13. The parent account serves as the consent mechanism; verification depth is unresolved (§14 Q3).
- **GDPR-K (EU)**: Data minimisation, right to deletion, lawful basis for processing.
- **No third-party training**: the production AI provider must contractually exclude child data from training and retention (D2).
- **Data Retention**: a single retention model is required before implementation — see §14 Q2.
- **Parental Consent Flow**: parent must verify email + acknowledge the privacy policy before the child account activates.
- **Honest disclosure**: the privacy policy must describe §7.1 accurately — that the service can read conversation content and that parent exclusion is an access-control and audit guarantee.

---

## 14. Open Questions

Resolved in v1.1.0 and removed: AI provider (→ D2), guardrail transparency to the child
(→ D3), emergency protocols (→ requirement §5.4).

1. **Monetization** — Freemium (limited messages/day free, unlimited paid)? Subscription per family? School licensing? Affects rate limits, retention defaults, and per-family caps.
2. **Retention model** — v1.0.0 carried three conflicting clocks: content access revoked 30 days after flag dismissal; conversations auto-delete at 90 days; flags "retained longer". Their interaction is undefined. One model is needed before implementation.
3. **Consent verification depth** — is parent email verification sufficient COPPA consent for under-13? Requires the legal review §12 already calls for, **before** launch.
4. **Age bands vs the COPPA boundary** — the 12–15 band straddles the under-13 line. Do 13+ users get a different consent path, privacy posture, and guardrail sensitivity?
5. **Child auth beyond PIN** — PIN + server-side lockout is the MVP position (§4.1). Parent-managed magic links? Biometric on mobile later?
6. **Conversation titles** — AI-generated titles require a model call over unflagged content. Compatible with D1, but confirm it is wanted given the "no unnecessary processing" posture.

---

## 15. Naming

**Working title**: Bubbli
**Tagline**: *AI that's safe for them, transparent to you.*

---

*This PRD is a living document. Update as decisions are made and scope evolves.*
