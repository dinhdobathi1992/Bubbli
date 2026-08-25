---
phase: 4
title: "Chat Pipeline and AI Provider"
status: pending
priority: P1
effort: "6d"
dependencies: [2, 3]
---

# Phase 4: Chat Pipeline and AI Provider

> **Revised by red team:** findings #3, #5, #6, #9, #12, #13 and second-tier items applied.
> Effort 5d → 6d. Provider fallback + circuit breaker restored; DeepSeek implementation dropped.
> **Title generator removed entirely (V6).**

## Overview

The child-facing product: send a message, pass the input gate, call Bedrock, buffer the full
response, pass the output gate, reveal. Plus the child UI, the safety disclosure (D3), and block
explanations.

## Requirements

**Functional**
- Provider router with Bedrock plus **fallback and a circuit breaker**. `PRD.md:272` and `:543`
  require the router to *degrade*, not merely abstract; the previous plan built neither and spent
  the budget on a DeepSeek implementation that must never run in production. (#6)
- Buffered generation (D4): full response generated, gated, **then** revealed. No token streaming.
- Input gate → AI → output gate, persisting every `guardrail_result` with `policyVersion`,
  `ageBand` and `configHash`.
- **Idempotency**: `POST /api/chat` requires a client-generated key; the unique constraint on
  `(child_id, idempotency_key)` is the deduplication point; a replayed key returns the stored
  result. (#12)
- Age-adaptive system prompt per band, using the Phase 3 shared constant.
- Child UI: message list, honest loading state, markdown rendering, conversation history.
  **No conversation titles (V6)** — the sidebar shows date and message count. This removes a model
  call over content the parent cannot see, and removes `title` as a leak vector from the Phase 6
  flags-list DTO, which is the exact field the prior art leaked.
- Safety disclosure page + block explanations that state *that* and broadly *why*, never a rule name.

**Non-functional**
- p95 total round-trip ≤8s, p50 ≤4s (G7) — **measured on passing prompts**, warm and cold reported
  separately, with one concurrent-load run. Corpus prompts short-circuit generation and cannot
  measure this. (2nd tier)
- Provider timeouts must **actually cancel** the in-flight request via `AbortSignal`, **and record
  a terminal state**. (#12, 2nd tier)
- Conversation history loads the **most recent** N messages.
- **Write groups are explicitly atomic** (below). (#9)
- DeepSeek is not implemented in MVP; if reinstated for local development it must be a config
  branch with a startup assertion, never a second SDK integration.

## Architecture

```
POST /api/chat  (requires idempotency key)
  -> assertIsOwningChild(session, conversationId)      [Phase 3 — NOT assertSameFamily]
  -> quota check                                       [Phase 7 wires enforcement]
  -> TX1 { persist child message (unique on idempotency_key) }
  -> checkInput(text, ageBand)                         [Phase 2, two layers, fail-closed]
       |- blocked -> TX2 { guardrail_result + flag + max_severity }
       |            crisis copy first if critical      [Phase 5]
       \- passed  -> TX2 { guardrail_result }
                     loadHistory(conversationId, N)    <- MOST RECENT N, excluding the just-saved message
                     generateBuffered(prompt, AbortSignal)   [router: fallback + circuit breaker]
                       |- all providers failed -> TX3 { ai_provider_attempts + message terminal state }
                       |                          return degradation copy (PRD 543)
                       |- aborted -> TX3 { ai_provider_attempts(aborted) + message terminal state }
                       \- ok      -> checkOutput(text, ageBand)   [Phase 2]
                                      |- blocked -> TX3 { output guardrail_result + flag + max_severity
                                      |                   + assistant message(safe fallback) }
                                      \- passed  -> TX3 { assistant message + output guardrail_result }
```

**Authorization name (#3).** The previous plan called `assertCanAccess`, which Phase 3 never
delivered. The chat path uses `assertIsOwningChild` — a parent session must not satisfy it.
`/api/chat` and child history routes are inside Phase 6's enumeration, driven with **both**
principals.

**Atomicity (#9).** Three transactions, named above. The AI call stays *outside* any transaction
(per the accepted contract) — but the writes around it do not. Without this, a crash between
`createFlag` and `updateMaxSeverity` shows a guardian a critical flag on the dashboard that 403s
when clicked, writing a denied-access row against them.

**Three prior-art defects designed out:**
1. **History ordering.** `ORDER BY created_at DESC LIMIT N`, reversed in application code, with the
   just-persisted child message excluded so it is not duplicated in the prompt.
2. **Timeouts that do not cancel.** The abort signal is threaded into the AI SDK call — **and the
   abort is recorded**, so an abandoned turn leaves a terminal state, not an orphan child message
   with no reply and no metric. (2nd tier)
3. **No fake streaming.** The wait is an honest designed loading state (D4, PRD §5.5).

## Related Code Files

- Create: `src/lib/ai/provider.ts` — interface, `generateBuffered(input, signal)`
- Create: `src/lib/ai/bedrock.ts`, `src/lib/ai/router.ts` — fallback + circuit breaker
- Create: `src/lib/ai/prompts.ts` — age-banded system prompts, in files not literals
- Create: `src/lib/chat/pipeline.ts`, `src/lib/chat/history.ts`, `src/lib/chat/idempotency.ts`
- Create: `src/app/api/chat/route.ts`, `src/app/(child)/chat/`, `src/app/(child)/safety/`
- Create: `tests/chat/pipeline.test.ts`, `history-ordering.test.ts`, `idempotency.test.ts`,
  `abort-state.test.ts`, `tests/ai/router-fallback.test.ts`, `tests/chat/principal.test.ts`

## Implementation Steps

1. Define the provider interface: `generateBuffered(input, signal)`. Signal is required.
2. Implement the Bedrock provider with AI SDK v6, threading `AbortSignal`. Record provider, model,
   latency and tokens into `ai_provider_attempts` — including failures and aborts. (#5)
3. **Implement the router: fallback across configured providers plus a circuit breaker**, and
   degradation copy when all fail (`PRD.md:543`). Test by forcing the provider to throw and to
   throttle. (#6)
4. Write age-banded system prompts using the Phase 3 shared constant. Never re-declare bands.
5. Implement `history.ts`. **Write `tests/chat/history-ordering.test.ts` first** — seed 30 messages,
   assert the loader returns 11–30, not 1–20.
6. Implement `idempotency.ts` and the unique constraint path: a replayed key returns the stored
   result and produces no second message, flag, or notification. (#12)
7. Implement `pipeline.ts` with the three named transactions. Persist a `guardrail_result` for both
   directions, always, including when passed.
8. Implement abort and total-failure handling: terminal message state, `ai_provider_attempts` row,
   and a UI retry that reuses the same idempotency key. (2nd tier)
9. Implement the chat UI with an honest loading state. No simulated token chunks.
10. Implement the safety disclosure page and onboarding copy per age band (D3), reachable from chat.
11. Implement block explanations. Never expose a rule name or category id. **Deflection copy must be
    byte-identical across all non-critical blocked severities** so the response class carries no
    severity signal a child can use as a bypass oracle. (#14)
12. Write `tests/chat/principal.test.ts`: a **parent** session against `/api/chat` and child history
    routes returns 403. (#3)
13. Measure p95/p50 on **passing** prompts, warm and cold separately, plus one concurrent run (G7).

## Success Criteria

- [ ] Child sends a message and receives a complete, gated response
- [ ] `history-ordering.test.ts` proves most-recent-N (seed 30, expect 11–30)
- [ ] The just-persisted child message does not appear twice in the prompt
- [ ] **A parent session on `/api/chat` or child history returns 403** (#3)
- [ ] **Replaying an idempotency key produces exactly one message, one flag, one notification** (#12)
- [ ] Provider timeout cancels the in-flight request **and records a terminal state** (2nd tier)
- [ ] **Router falls back across providers and opens the circuit breaker**; all-fail returns
      degradation copy, asserted by forcing throws (#6)
- [ ] Every write group in the pipeline is inside its named transaction (#9)
- [ ] A `guardrail_result` row exists for every message in both directions, carrying
      `policyVersion`, `ageBand`, `configHash`
- [ ] Deflection copy is byte-identical across all non-critical blocked severities (#14)
- [ ] Block explanations contain no rule name or category identifier
- [ ] Safety disclosure reachable from chat; copy differs per age band (four bands, V8)
- [ ] **No title generation anywhere; no model call touches unflagged content for labelling** (V6)
- [ ] p95 ≤8s, p50 ≤4s **on passing prompts**, warm/cold separate, one concurrent run (G7)

## Risk Assessment

**p95 exceeds 8s on passing prompts.** Signal: step 13. Response: reduce `maxTokens` and history N
first; escalate model tier second. If the measured floor still exceeds 8s, **the number moves or
the product design does — escalate to Thi**, since the target was asserted, not derived.
Sentence-gating is post-MVP (PRD §8) and needs a designed eval.

**Two providers means two DPAs.** Signal: the fallback provider is not covered by D2's terms.
Response: fallback must be a second Bedrock model or region under the same agreement, not a second
supplier. If no compliant fallback exists, record that and accept the outage risk explicitly rather
than adding an uncovered processor.

**Age-banded prompts drift from guardrail bands.** Response: one shared constant from Phase 3,
imported by both, never re-declared.

<!-- Updated: Validation Session 1 - V6 no titles, V8 four bands -->
