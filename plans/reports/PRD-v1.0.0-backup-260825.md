---
title: Bubbli — SafeAI for Children
version: 1.0.0
date: 2026-08-25
author: Thi Dinh
status: Draft
---

# Bubbli — SafeAI for Children

## 1. Vision

A web application that gives children a ChatGPT-like conversational AI experience while giving parents full visibility into unsafe interactions — without invading the child's privacy on benign conversations.

---

## 2. Problem Statement

Children increasingly use AI chat tools that have no parental oversight. Existing solutions either:

- Give parents full access to every message (privacy violation, erodes trust).
- Give parents zero visibility (safety risk).

There is no middle ground that respects both **child privacy** and **parental safety oversight**.

---

## 3. Core Principles

| Principle | Meaning |
|---|---|
| **Safety first** | Every AI response passes through guardrails before reaching the child. |
| **Privacy by default** | Parents see only conversations flagged as unsafe. Normal chats stay private. |
| **Transparency to parents** | Parents understand *why* a conversation was flagged. |
| **Age-appropriate** | The AI adapts tone, vocabulary, and topic boundaries to the child's age group. |
| **No data exploitation** | Children's conversations are never used for advertising or sold. |

---

## 4. User Roles

### 4.1 Child

- Has their own login (username + PIN, or parent-managed credentials).
- Chats with the AI in a friendly, age-appropriate interface.
- Sees the AI as a helpful companion — not a surveillance tool.
- Cannot see the parent dashboard or safety flags.

### 4.2 Parent / Guardian

- Has their own login (email + password, OAuth).
- Manages child accounts (add/remove children, set age groups).
- Views a **Safety Dashboard** showing only flagged conversations.
- Configures guardrail sensitivity and custom rules.
- Can review, dismiss, or escalate flagged conversations.

### 4.3 Admin (future)

- Platform-level management, usage analytics, content policy configuration.

---

## 5. Feature Specification

### 5.1 Child Experience

| Feature | Description |
|---|---|
| **Chat Interface** | ChatGPT-style UI: message bubbles, typing indicators, markdown rendering for AI responses. |
| **Conversation History** | Child can scroll through their own past conversations. |
| **Age-Adaptive Persona** | AI adjusts tone/complexity based on the child's configured age group (4–7, 8–11, 12–15). |
| **Safe Topics** | Homework help, creative writing, science questions, storytelling, general knowledge. |
| **Blocked Topics** | Violence, self-harm, sexual content, substance abuse, personal information solicitation — defined by guardrails. |
| **Session Limits** | Optional daily time limits and usage schedules set by parents. |

### 5.2 Parent Experience

| Feature | Description |
|---|---|
| **Safety Dashboard** | Lists all flagged conversations with severity (low/medium/high/critical). |
| **Conversation Detail** | Full transcript of a flagged conversation with the specific messages highlighted that triggered the flag. |
| **Flag Reasons** | Each flag shows which guardrail rule was triggered and why. |
| **Actions on Flags** | Dismiss (false positive), Escalate (mark for further review), Talk to Child (reminder note). |
| **Child Management** | Add/remove child profiles, set age groups, configure per-child rules. |
| **Guardrail Configuration** | Adjust sensitivity levels, add custom blocked topics, whitelist allowed topics. |
| **Usage Analytics** | Total messages, time spent, topics explored — aggregated stats, no individual message content unless flagged. |
| **Weekly Summary** | Optional email digest: "Your child asked about X, Y, Z. No safety concerns this week." |

### 5.3 Guardrail System (The Core Safety Layer)

The guardrail system sits between the child's input and the AI provider, and between the AI's output and the child's screen.

#### Input Guardrails (Child → AI)

| Rule | Action |
|---|---|
| **PII Detection** | Block or redact if child shares name, address, phone, school name. |
| **Harmful Intent** | Flag if child expresses self-harm, suicidal ideation, eating disorder signals. |
| **Inappropriate Requests** | Block requests for violent, sexual, or age-inappropriate content. |
| **Grooming Detection** | Flag if conversation pattern suggests external manipulation (adult asking child to keep secrets, share photos). |

#### Output Guardrails (AI → Child)

| Rule | Action |
|---|---|
| **Content Filtering** | Block AI responses containing violence, sexual content, hate speech. |
| **Age Appropriateness** | Ensure response complexity and topics match the child's age group. |
| **Hallucination Guard** | For factual claims (especially health/safety), add "ask a trusted adult" disclaimers. |
| **Emotional Safety** | Detect if AI response could be emotionally harmful (body-shaming, discouraging). |

#### Classification & Flagging

| Severity | Criteria | Parent Visibility |
|---|---|---|
| **Info** | PII shared (name, school) | Logged, not shown unless pattern detected |
| **Low** | Mildly inappropriate question, quickly redirected | Shown in weekly summary only |
| **Medium** | Repeated attempts to bypass guardrails, emotional distress signals | Shown on dashboard |
| **High** | Self-harm signals, grooming patterns, explicit content requests | Immediate dashboard alert + optional push notification |
| **Critical** | Active danger signals | Immediate push notification + optional emergency contact |

---

## 6. Architecture

```
┌─────────────────────────────────────────────────┐
│                   Frontend                       │
│  ┌──────────────┐    ┌────────────────────────┐ │
│  │  Child UI    │    │    Parent Dashboard    │ │
│  │  (Chat)      │    │    (Safety Review)     │ │
│  └──────┬───────┘    └───────────┬────────────┘ │
└─────────┼────────────────────────┼──────────────┘
          │                        │
          ▼                        ▼
┌─────────────────────────────────────────────────┐
│                   Backend API                    │
│  ┌──────────┐  ┌──────────┐  ┌──────────────┐  │
│  │   Auth   │  │  Chat    │  │   Parent     │  │
│  │ Service  │  │ Service  │  │   Service    │  │
│  └──────────┘  └────┬─────┘  └──────────────┘  │
└─────────────────────┼───────────────────────────┘
                      │
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
│  (DeepSeek / │ │(Postgres)│ │   Service    │
│   Bedrock)   │ │          │ │(Email/Push)  │
└──────────────┘ └──────────┘ └──────────────┘
```

### 6.1 Technology Stack (Recommended)

| Layer | Technology | Rationale |
|---|---|---|
| **Frontend** | Next.js 14+ (App Router) + Tailwind CSS | SSR for parent dashboard, client components for chat. Fast to build. |
| **Backend** | Next.js API Routes or standalone FastAPI (Python) | Python preferred if guardrails use ML models heavily. |
| **Database** | PostgreSQL | Relational data (users, families, conversations, flags). |
| **ORM** | Prisma (if Next.js) or SQLAlchemy (if FastAPI) | Type-safe queries. |
| **AI Provider** | DeepSeek API (initial), AWS Bedrock (scale) | DeepSeek for cost; Bedrock for AWS GuardRails integration later. |
| **Guardrails** | Custom engine + optional AWS Bedrock Guardrails / Guardrails AI | Hybrid: custom rules for child-specific logic, managed service for content classification. |
| **Auth** | NextAuth.js or Clerk | Parent OAuth + child PIN-based auth. |
| **Hosting** | Vercel (frontend) + Railway/Fly.io (backend) or AWS ECS | Start lean, migrate to AWS when scaling. |
| **Notifications** | Resend (email) + Web Push API | Parent alerts. |

### 6.2 Data Model (Core Entities)

```
Family
  ├── id, name, created_at
  │
  ├── Parent[]
  │     ├── id, email, auth_provider, family_id
  │     └── notification_preferences
  │
  └── Child[]
        ├── id, display_name, pin_hash, age_group, family_id
        ├── guardrail_config (JSONB — per-child overrides)
        │
        └── Conversation[]
              ├── id, child_id, started_at, ended_at
              ├── title (AI-generated)
              ├── safety_score (0.0 – 1.0)
              ├── flag_status: none | flagged | reviewed | dismissed
              │
              └── Message[]
                    ├── id, conversation_id
                    ├── role: child | assistant | system
                    ├── content, created_at
                    ├── guardrail_result (JSONB)
                    │     ├── passed: bool
                    │     ├── triggered_rules: string[]
                    │     ├── severity: info|low|medium|high|critical
                    │     └── details: string
                    └── is_visible_to_parent: bool (derived from severity)
```

---

## 7. Privacy Model

| Data | Child Sees | Parent Sees | Stored |
|---|---|---|---|
| Normal conversation content | ✅ Yes | ❌ No | ✅ Encrypted at rest |
| Flagged conversation content | ✅ Yes | ✅ Yes (only flagged) | ✅ Encrypted at rest |
| Flag reasons & severity | ❌ No | ✅ Yes | ✅ Yes |
| Usage stats (time, count) | ❌ No | ✅ Aggregated only | ✅ Yes |
| Guardrail config | ❌ No | ✅ Yes (can edit) | ✅ Yes |
| PII detected in messages | ❌ No | ✅ Alert only (not raw PII) | Redacted after flagging |

### Encryption

- All conversation content encrypted at rest (AES-256).
- Parent cannot decrypt unflagged conversations — the key derivation includes a flag-based access control.
- On flag dismissal by parent, the flag record is retained but content access is revoked after 30 days.

---

## 8. Guardrail Implementation Strategy

### Phase 1 — Rule-Based (MVP)

- Keyword/blocklist matching for obvious violations.
- Regex-based PII detection (phone numbers, addresses, emails).
- Simple sentiment analysis for emotional safety.
- Severity scoring based on rule match count and type.

### Phase 2 — ML-Augmented

- Integrate a classification model (or AWS Bedrock Guardrails) for nuanced content classification.
- Train/fine-tune on child safety datasets for grooming detection, self-harm signals.
- Contextual understanding (a question about "killing" in a video game vs. real life).

### Phase 3 — Adaptive

- Learn from parent dismissals to reduce false positives.
- Per-child adaptation (a 12-year-old asking about chemistry vs. a 5-year-old).
- Conversation-level context (understanding ongoing topic when evaluating new messages).

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
    │
    ├── FLAGGED → Message passes to AI, but flag is recorded
    │              Parent notified based on severity
    │
    └── PASSED → Forward to AI Provider
                    │
                    ▼
              AI generates response
                    │
                    ▼
              Output Guardrail Engine
                    │
                    ├── BLOCKED → Replace with safe fallback response
                    │              Flag created
                    │
                    └── PASSED → Show response to child
```

### 9.2 Parent Review Flow

```
Parent logs in
    │
    ▼
Safety Dashboard
    │
    ├── No flags → "Everything looks good! ✅" + usage stats
    │
    └── Flags present → Sorted by severity (critical first)
          │
          ▼
        Click flag → Full conversation transcript
          │           with highlighted trigger messages
          │
          ├── Dismiss (false positive) → Flag marked reviewed
          ├── Add Rule → Create custom rule based on this flag
          └── Talk to Child → System suggests conversation starters
```

---

## 10. MVP Scope (Phase 1)

### In Scope

- [ ] Child registration by parent (name, age group, PIN).
- [ ] Child chat interface with AI (DeepSeek).
- [ ] Basic input guardrails: PII blocklist, harmful keyword detection, explicit content filter.
- [ ] Basic output guardrails: content filter, age-appropriateness check.
- [ ] Conversation storage with guardrail results.
- [ ] Parent login and safety dashboard.
- [ ] Flag visibility rules (only medium+ severity shown to parents).
- [ ] Flag actions: dismiss, review.
- [ ] Email notification for high/critical flags.

### Out of Scope (Future Phases)

- [ ] ML-based classification models.
- [ ] Adaptive guardrails learning from parent feedback.
- [ ] Multi-child household advanced features (sibling interactions).
- [ ] Voice input/output.
- [ ] Image generation or analysis.
- [ ] Mobile apps (iOS/Android).
- [ ] School/classroom mode.
- [ ] Multi-language support.

---

## 11. Success Metrics

| Metric | Target |
|---|---|
| **False positive rate** | < 15% of flags dismissed by parents |
| **Critical detection rate** | > 95% of actual safety concerns flagged |
| **Child engagement** | Child returns to chat > 3x/week |
| **Parent trust** | > 80% of parents report feeling "informed but not intrusive" |
| **Response latency** | < 3s for AI response (including guardrail checks) |

---

## 12. Risks & Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Guardrails miss real danger | Critical | Multi-layer guardrails, err on the side of flagging, regular audit of missed cases |
| Too many false positives | High | Parent feedback loop, tunable sensitivity, per-child adaptation |
| Child circumvents guardrails | Medium | Detect evasion patterns (leetspeak, misspellings), log evasion attempts as flags |
| Privacy breach | Critical | Encryption at rest, no parent access to clean conversations, minimal data retention |
| AI provider outage | Medium | Fallback provider, graceful degradation ("I'm taking a break, try again soon!") |
| COPPA/GDPR-K compliance | High | Legal review pre-launch, no data sharing, parental consent flow, data deletion on request |

---

## 13. Compliance Considerations

- **COPPA (US)**: Parental consent required before collecting data from children under 13. Parent account serves as consent mechanism.
- **GDPR-K (EU)**: Similar requirements for EU residents. Data minimization, right to deletion.
- **Data Retention**: Conversations auto-delete after configurable period (default: 90 days). Flags retained longer for safety audit.
- **Parental Consent Flow**: Parent must verify email + acknowledge privacy policy before child account activates.

---

## 14. Open Questions

1. **Monetization**: Freemium (limited messages/day free, unlimited paid)? Subscription per family? School licensing?
2. **AI Provider**: Start with DeepSeek for cost, but should we architect for Bedrock from day one to get AWS GuardRails for free?
3. **Child Auth**: PIN-only for young children? Parent-managed magic links? Biometric on mobile later?
4. **Conversation Titles**: Should the AI generate titles, or should they be topic-based?
5. **Guardrail Transparency**: How much should the child know about guardrails? ("I can't talk about that" vs. no explanation?)
6. **Emergency Protocols**: When critical flags trigger, should the system provide crisis resources (hotlines) to the child directly?

---

## 15. Naming

**Working title**: Bubbli
**Tagline**: *AI that's safe for them, transparent to you.*

---

*This PRD is a living document. Update as decisions are made and scope evolves.*
