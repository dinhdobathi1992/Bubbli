# 0001 — Region and residency

**Status:** development decided, **production undecided (blocking before launch)**
**Date:** 2026-08-26

## Development

| | |
|---|---|
| Database | Neon, `ap-southeast-1` (Singapore) |
| Compute | Not yet provisioned |
| AI provider | DeepSeek (third country relative to both COPPA and GDPR-K) |

Singapore is a **development-only** choice (validation decision V2 on residency).
It was selected because the database already existed, not from a compliance
analysis.

## Production — not decided

The production region must be settled before any real child uses the product,
because it is a compliance input rather than an operational preference:

- **COPPA (US)** does not mandate a region, but data-transfer disclosures in the
  privacy policy depend on where content actually rests.
- **GDPR-K (EU)** requires a lawful transfer mechanism for EU children's data
  leaving the EEA. Singapore has no EU adequacy decision, so Standard
  Contractual Clauses would be needed, or the data must stay in the EEA.
- The Bedrock region and the compute region must be chosen **together**: a model
  must be available in the region, and a model that is not moves the data.

## Why the model region is not a free choice

Bedrock model availability is per-region and per-account. Release gate G9
requires a **real inference call succeeding in the residency region** before the
provider decision is treated as verified. Until that call is made, "we will use
Bedrock in region X" is an assumption.

If the chosen model is unavailable in the residency-compliant region, the choice
is between the provider decision and the compliance posture. That is an
escalation, not an engineering trade-off.

## Decision needed

- [ ] Production database region
- [ ] Production compute region
- [ ] Production Bedrock region, confirmed by a real inference call
- [ ] Transfer mechanism if any of the above sits outside the EEA
