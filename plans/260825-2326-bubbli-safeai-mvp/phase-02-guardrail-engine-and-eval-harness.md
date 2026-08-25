---
phase: 2
title: "Guardrail Engine and Eval Harness"
status: pending
priority: P1
effort: "9d"
dependencies: [1]
---

# Phase 2: Guardrail Engine and Eval Harness

> **Revised by red team:** findings #4, #5, #14 and second-tier items applied.
> Effort 5d → 9d. Hallucination-guard rules removed (V2). Second gate layer restored.
> Recall reported not gated (V3). Fourth age band added (V8).

> **Status 2026-08-26: IMPLEMENTED.** Two-layer engine, evasion normalization, non-destructive
> masking, held-out corpus (137 cases) and the CI gate are done. Precision 100% against an 85%
> gate; recall 100% on the held-out set, reported not gated per V3. **Not done:** the dev
> corpus split is unpopulated (only held-out exists), `policy_versions` rows are not yet
> written at boot, and the classifier has no live provider client until Phase 4 wires the router.

## Overview

Build the two-layer guardrail system (PRD §5.3, §8 Phase 1) **and** the held-out corpus that
measures it. The corpus is a deliverable, not a test artefact — it is the release gate (G4).

Sequenced before the chat pipeline on purpose: a safety gate you cannot measure is not a safety
gate, and Phase 4 has nothing to validate against without it.

## Requirements

**Functional**
- **Layer 1 — deterministic rules.** Input: PII detection, harmful intent, inappropriate
  requests, **disclosure detection**, **evasion normalization**. Output: content filtering,
  age appropriateness, emotional safety (sentiment, per `PRD.md:398`).
- **Layer 2 — Bedrock classifier**, runs only when layer 1 passes, **fail-closed** when
  unavailable. Restored per R1: the accepted contract kept it and the plan had dropped it on a
  rationale `PRD.md:267` refutes. Without it, ≥95% recall from regex alone is not reachable. (#5)
- Severity classification → `info | low | medium | high | critical`.
- Every result carries `policy_version`, **`age_band`, and `config_hash`** — the full input tuple,
  or the decision is not reproducible. (2nd tier)
- PII handling is **non-destructive**: content stored intact, masking applied at render only.
- Layer 1 deterministic and side-effect free. Layer 2 is an HTTP call and is explicitly not pure.

**Non-functional**
- **Precision ≥85% on the held-out set is a hard gate.** Recall on high/critical is **measured and
  reported with a recorded residual risk, not gated** (V3) — a corpus the rule author wrote cannot
  prove recall, and the plan already concedes this for disclosure detection. Publish the number.
- Every rule has ≥10 positive and ≥10 negative labelled cases.
- Layer 1 runs in <50ms p95 **including adversarial input**, not corpus-only.
- Rule patterns must be **linear-time** (RE2-style or equivalent). A catastrophically backtracking
  regex on a child's pasted game-chat text pins CPU on the request path the engine sits on twice.
- **A runtime kill switch per rule**, so a bad rule is disabled without a redeploy.

## Architecture

```
checkInput(text, ageBand, config)
  └─> Layer 1 rules ─ match ──> classify() ──> GuardrailResult   (layer 2 never runs)
                     └ pass ──> Layer 2 Bedrock classifier
                                  ├─ unsafe    ──> classify() ──> GuardrailResult
                                  ├─ safe      ──> pass
                                  └─ throws/unavailable ──> FAIL CLOSED: treat as blocked,
                                                            distinct audit reason
```

`GuardrailResult { passed, triggeredRules[], severity, policyVersion, ageBand, configHash, details }`

Rules are data, not code branches: a versioned rule table (id, category, pattern, severity,
ageBands, requiredContext, enabled). `policyVersion` identifies a row in `policy_versions`, which
stores the **rule-set body** — a hash alone resolves back to nothing once `rules.ts` is edited.

**Corpus provenance is split (R3).** Two artefacts, different provenance:
- `corpus/dev/` — author-written alongside the rules. **Not gate-eligible.**
- `corpus/heldout/` — the gate. Its **negatives are written from the curriculum list before the
  rule exists**; positives are paraphrase-driven, not derived from the pattern. Gating on a set
  the rule author wrote in the same commit certifies self-agreement and nothing else. (#4)

**Disclosure detection (renamed from "grooming").** There is no second human in a Bubbli
conversation. The detectable signal is the child *reporting* outside manipulation: instructions to
keep secrets from parents, requests for photos, requests to meet, private contact by someone met
online.

**Evasion normalization (new).** `PRD.md:540` lists evasion detection as the mitigation for "Child
circumvents guardrails"; it was in no phase. Leetspeak, deliberate misspelling, spacing and
homoglyph normalization run before matching, and evasion attempts are themselves flagged. (#14)

**False positives are a Phase 1 problem.** Prior art used `\b(naked|sex)\b`, which flags *"naked
eye"*, *"naked mole rat"*, and any biology-class use — on a homework product for ages 4-15.

**Removed: hallucination guard.** Not in PRD §8 or §10, and no MVP detector exists for "factual
claims, especially health/safety" at the precision the gate demands. Recorded as Q-G.

## Related Code Files

- Create: `src/lib/guardrails/rules.ts`, `engine.ts`, `classify.ts`, `mask.ts`, `normalize.ts`
- Create: `src/lib/guardrails/classifier.ts` — layer 2, Bedrock, fail-closed
- Create: `corpus/dev/*.jsonl`, `corpus/heldout/*.jsonl`
- Create: `corpus/eval.ts` — precision/recall harness, held-out only
- Create: `tests/guardrails/*.test.ts`, `tests/guardrails/redos.test.ts`
- Modify: `.github/workflows/ci.yml` — corpus gate

## Implementation Steps

1. Define `GuardrailResult` and the rule-set data shape. Persist rule-set bodies to `policy_versions`.
2. Implement `classify()` first, with unit tests — severity mapping is where quiet mistakes hide.
3. **Write the held-out negatives first**, from real curriculum, before any rule exists: astronomy
   ("naked eye"), biology ("naked mole rat", "sex of the animal", anatomy), history (violence in
   context), literature (death in stories), chemistry ("how to make crystals"). (#4)
4. Implement `normalize.ts` — leetspeak, spacing, homoglyphs — and flag evasion attempts. (#14)
5. Implement layer-1 input rules one category at a time, with dev-set cases alongside. Enumerate
   the rule count **before starting** and price the corpus from it; PII alone is five detectors.
6. Implement layer-1 output rules: content filter, age appropriateness per band, and emotional
   safety via sentiment (V2 — the §10 pair plus the one §8 authorises at `PRD.md:398`).
   **No hallucination guard** — no MVP detector reaches the precision gate, and a failing rule
   drags the global precision number down.
7. Implement `classifier.ts` (layer 2): Bedrock call, strict JSON, timeout. **On throw, timeout, or
   unparseable response, return blocked** with a distinct audit reason. Test it by forcing throws. (#5)
8. Enforce linear-time patterns and per-rule execution timeouts. Add `tests/guardrails/redos.test.ts`
   driving adversarial input (long strings, nested repetition) and asserting bounded time.
9. Implement the per-rule runtime kill switch, and document the rollback path for a bad rule set.
10. Implement non-destructive masking. Test: stored content byte-identical after a PII flag.
11. Author the held-out positives by paraphrase, not from the patterns.
12. Build `corpus/eval.ts`: per-rule and aggregate precision/recall as JSON, **held-out only**.
13. Wire the corpus gate into CI. Print the per-rule table on failure.
14. Benchmark p95 across corpus **and** adversarial inputs.

## Success Criteria

- [x] **Precision ≥85% on the held-out set** — hard gate (G4)
- [x] Recall on high/critical **measured, published, and its residual risk recorded** — not gated (V3)
- [ ] Age-appropriateness rules cover all four bands including the split at 13 (V8)
- [x] Held-out negatives were written before their rules — provable from commit order (#4)
- [x] Every rule has ≥10 positive and ≥10 negative cases; CI fails if any falls below
- [x] Curriculum negatives pass: "naked eye", "naked mole rat", biology anatomy, historical violence
- [x] Layer 2 returns **blocked** when the classifier throws, times out, or returns garbage (#5)
- [x] Layer 2 never runs when layer 1 has already matched — asserted by test
- [x] Evasion normalization catches leetspeak and spaced variants; attempts are flagged (#14)
- [x] `redos.test.ts` passes: adversarial input completes within the per-rule timeout
- [x] A rule can be disabled at runtime without a redeploy
- [x] Stored content byte-identical after a PII flag
- [x] Every result carries `policyVersion`, `ageBand`, and `configHash`
- [ ] `policy_versions` stores rule-set bodies; a historical result resolves to its exact rules
- [x] Layer 1 p95 <50ms across corpus **and** adversarial inputs
- [x] No hallucination-guard rules present (Q-G)

## Risk Assessment

**Held-out recall <95% even with layer 2.** **Pre-decided (V3): this does not block release.**
Publish the measured recall, record the residual risk, and ship. Precision remains a hard gate.
This removes the deadlock the red team identified — previously "escalate, do not lower the gate"
had no landing place and would have stopped the project at Phase 2 of 7. (#5, V3)

**Corpus authored to match the rules.** The real hazard. Response: step 3 writes held-out
negatives before any rule exists, and step 11 authors positives by paraphrase. Commit order is
the evidence, and it is checkable.

**Phase 2 is the largest phase and the most likely to slip.** Signal: rule enumeration at step 5
prices the corpus above 9d. Response: shrink the rule set and record what was dropped. Do not
compress the corpus — an unmeasured rule is worse than an absent one.

**Disclosure-detection recall is unknowable from any self-authored corpus.** Accepted and stated.
Response: flag for external review before launch; highest-value signal, least verifiable in-house.

<!-- Updated: Validation Session 1 - V2 rule scope, V3 recall reported not gated, V8 four bands -->
