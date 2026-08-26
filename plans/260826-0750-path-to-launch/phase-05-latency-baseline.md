---
phase: 5
title: "Latency baseline"
status: pending
priority: P2
effort: "3h"
dependencies: [2]
---

# Phase 5: Latency baseline

## Overview

G7 requires p95 ≤ 8s and p50 ≤ 4s on total round-trip. Decision L3: measure now on
DeepSeek as an explicitly provisional baseline, and make re-measurement on Bedrock
AgentCore launch-blocking.

## Requirements

- Functional: p50 and p95 total round-trip on **passing** prompts — ones that reach a
  provider. Corpus prompts short-circuit at the guardrail and cannot measure generation.
- Functional: warm and cold reported separately; one concurrent-load run.
- Functional: pipeline overhead reported separately from generation, so the
  provider-independent half of the number survives a provider change.
- Non-functional: every figure is labelled with the provider it was measured on. An
  unlabelled latency number will be mistaken for the production one.

## Architecture

Splitting the measurement into pipeline overhead and generation is what makes this
phase worth doing before G9 rather than after. Guardrail evaluation, the three
transactions, flag creation, and audit writes are provider-independent and measurable
today; only generation changes when Bedrock is cleared. If overhead alone is already
eating the budget, that is knowable now and no amount of provider clearance fixes it.

Measurement runs against the real pipeline with a real provider, not a mock — a mocked
generation call measures nothing about the gate.

## Related Code Files

- Create: `scripts/measure-latency.ts`
- Create: `plans/reports/latency-<date>-deepseek.md`
- Modify: `plans/260825-2326-bubbli-safeai-mvp/plan.md` (G7 status, labelled provisional)

## Implementation Steps

1. Assemble a prompt set that passes the guardrails and is representative of real use
   across the four age bands.
2. Instrument the pipeline to record overhead and generation separately.
3. Run cold, then warm, then one concurrent run at a realistic family count.
4. Report p50 and p95 for each, split by overhead and generation.
5. Write the report with the provider named in the title and the first line.
6. Record in the MVP plan that G7 is provisional and blocked on re-measurement.

## Success Criteria

- [ ] p50 and p95 exist for warm, cold, and concurrent runs
- [ ] Pipeline overhead is reported separately from generation
- [ ] Every figure names DeepSeek as the measured provider
- [ ] The prompt set demonstrably passes the guardrails rather than short-circuiting
- [ ] G7 is recorded as provisional, with re-measurement listed as launch-blocking

## Risk Assessment

A provisional number becomes the accepted number the moment someone quotes it without
the caveat. Signal: G7 cited as met, or the figure appearing without the provider name.
Response: the provider is in the report title and the first line for exactly this
reason; if it is quoted bare, correct it at the source rather than restating the caveat.
