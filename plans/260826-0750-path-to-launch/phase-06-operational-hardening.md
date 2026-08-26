---
phase: 6
title: "Operational hardening"
status: pending
priority: P2
effort: "4h"
dependencies: [1, 2]
---

# Phase 6: Operational hardening

## Overview

The remaining Phase 7 items from the MVP plan that are neither gates nor features: log
redaction, the metrics posture, budget behaviour on blocked and aborted requests, and a
clean dependency audit and secret scan.

## Requirements

- Functional: no message content, PIN, email, or display name appears in any log line,
  including error paths and stack traces.
- Functional: metrics are authenticated or absent. There is no third option.
- Functional: budget behaviour on gate-blocked and aborted requests is decided and
  written down, not left to whatever the code happens to do.
- Non-functional: the dependency audit and secret scan run in CI, not by hand.

## Architecture

Redaction belongs at the logging boundary, not at each call site — a call-site
discipline fails the first time someone logs an error object that happens to carry a
message body. A single module that scrubs known-sensitive shapes before anything is
emitted is the only version that holds under maintenance.

Budget behaviour is a decision, not an implementation detail. A gate-blocked message
never reaches a provider, so charging it against the family's daily budget punishes a
child for tripping a safety rule — which is precisely backwards for a product whose
premise is that tripping a rule should be safe. Recommend: gate-blocked requests consume
the per-child rate window (they still cost work) but not the family daily budget. Record
whichever way it goes.

## Related Code Files

- Create: `src/lib/log/redact.ts`
- Create: `docs/decisions/0005-budget-on-blocked-requests.md`
- Modify: `src/lib/quota/limiter.ts` (only if the decision changes behaviour)
- Modify: `.github/workflows/ci.yml` (audit + secret scan steps)
- Create: `tests/log/redaction.test.ts`

## Implementation Steps

1. Write the redaction module and route every log through it.
2. Test with an error object carrying a message body, a PIN, and an email; assert none
   survive to output.
3. Confirm metrics are either authenticated or not exposed; remove any unauthenticated
   endpoint rather than documenting it.
4. Decide budget behaviour on gate-blocked and aborted requests; record it in `0005`
   and align the limiter if needed.
5. Add dependency audit and secret scan steps to CI with job-level `contents: read`.

## Success Criteria

- [ ] An error carrying message content, a PIN, and an email logs none of them
- [ ] No unauthenticated metrics endpoint exists
- [ ] Budget behaviour on blocked and aborted requests is recorded in a decision file
- [ ] Dependency audit and secret scan run in CI and pass
- [ ] `pnpm test` passes with the redaction test included

## Risk Assessment

Redaction that scrubs by field name misses content nested in an unfamiliar shape — a
provider SDK error, a pg error carrying the failing statement. Signal: a test with a
realistic nested error object leaks. Response: scrub by shape and by known-sensitive
value where the value is available, and treat the provider error path as the case to
test rather than the one to assume.
