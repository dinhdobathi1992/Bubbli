---
phase: 7
title: "Compliance close-out"
status: blocked
priority: P1
effort: "unknown — external"
dependencies: []
---

# Phase 7: Compliance close-out

## Overview

G9 and Q-B. Neither is closeable by writing code, and both gate launch. This phase
exists so they are tracked as work rather than remembered as caveats.

## Requirements

- Functional: a DPA and zero-retention terms confirmed **in writing** for whichever
  provider will carry production child data, recorded in `docs/decisions/0002`.
- Functional: Bedrock AgentCore model access granted, and a real inference call made in
  the residency region — not an inference profile, per the standing product decision.
- Functional: `PROVIDER_COMPLIANCE` flipped to `productionCleared: true` only after the
  artefacts exist, and never before.
- Functional: Q-B resolved — whether the implemented consent flow clears "verifiable
  parental consent" for the target markets.

## Architecture

The compliance gate is already expressed in code as the principle rather than as a
provider name: `PROVIDER_COMPLIANCE` refuses production start-up while any provider in
the active chain is uncleared. That refusal is the gate functioning correctly. Nothing
in this phase should route around it — flipping the flag is the *last* step, after the
paperwork, not a way to unblock a deploy.

Q-B is a legal determination. Email-plus-affirmation is what is built; whether that is
"verifiable" under COPPA for the under-13 bands is not an engineering call, and the
bands `4-7`, `8-11` and `12` all depend on the answer.

## Related Code Files

- Modify: `docs/decisions/0002-compliance-premises.md`
- Modify: `src/config/settings.ts` (`PROVIDER_COMPLIANCE`, last step only)

## Implementation Steps

1. Obtain DPA and zero-retention terms in writing for the production provider.
2. Request Bedrock AgentCore model access in the residency region.
3. Make a real inference call through AgentCore and record the result.
4. Record the at-rest encryption position as actually provided.
5. Get a determination on Q-B for the target markets.
6. Only then, flip `productionCleared` and re-run the full gate set.

## Success Criteria

- [ ] DPA and zero-retention confirmed in writing and recorded in `0002`
- [ ] A real AgentCore inference call succeeds in the residency region
- [ ] Q-B answered for the target markets
- [ ] `PROVIDER_COMPLIANCE` flipped only after the artefacts exist
- [ ] Production start-up succeeds, proving the gate passes rather than was bypassed
- [ ] G7 re-measured on the cleared provider (Phase 5 is provisional until this)

## Risk Assessment

The failure mode is schedule pressure meeting a one-line flag: flipping
`productionCleared` to ship, intending to do the paperwork after. That converts a
working gate into a comment. Signal: a change to `PROVIDER_COMPLIANCE` in a diff whose
`0002` is untouched. Response: treat the pair as atomic — the flag and the recorded
artefact move in the same commit or neither moves.
