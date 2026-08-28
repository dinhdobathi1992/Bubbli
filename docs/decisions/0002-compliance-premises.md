# 0002 — Compliance premises

**Status:** partially satisfied. Release gate **G9 is NOT met.**
**Date:** 2026-08-26

G9 requires that the premises the architecture rests on are verified in writing,
not assumed. The prior-art review found a system whose entire provider strategy
rested on claims no step ever checked. This file is where those checks live.

---

## Data at rest — satisfied (validation decision V1)

| | |
|---|---|
| Host | Neon (serverless Postgres), PostgreSQL 17.11 |
| Region | `ap-southeast-1` (Singapore) |
| At-rest encryption | AES-256, host-managed keys, applied at the storage layer |
| In transit | TLS required (`sslmode=require`, channel binding on) |

**Decision V1:** host-managed volume encryption is accepted as satisfying PRD
§7.4. Column-level encryption of `messages.content` is **not** implemented.

**Action required:** PRD §7.4 currently claims "AES-256, managed keys" without
saying whose keys or at what layer. It must be amended to describe the above
accurately before any privacy policy is published, because the policy repeats
this claim to parents.

---

## AI providers — NOT satisfied

Neither provider is cleared for production child data. `PROVIDER_COMPLIANCE` in
`src/config/settings.ts` encodes this, and the application **refuses to start in
production** while any provider in the active chain is uncleared.

### DeepSeek — development only

| | |
|---|---|
| Status | Active development provider |
| DPA | **None on file** |
| Zero retention | **Not confirmed** |
| Jurisdiction | Third country relative to both COPPA and GDPR-K |
| Production cleared | **No** |

PRD §13 forbids third-party training on child data, and §12 mitigates compliance
risk with "no data sharing". Sending children's conversations to a processor
without a DPA is that data sharing. DeepSeek is therefore a development and
evaluation provider only.

### AWS Bedrock (AgentCore) — pending

| | |
|---|---|
| Status | Planned, Phase 4 |
| Runtime | **AgentCore agent runtime**, not raw `InvokeModel` inference profiles |
| Model access granted | **Not verified** |
| Real inference call in the residency region | **Not performed** |
| Service quotas captured | **No** |
| DPA + zero retention in writing | **Not obtained** |

**Blocked.** The AWS identity available during Phase 1
(`arn:aws:iam::275849198859:user/thidinh`) is denied even
`bedrock:ListFoundationModels`. Verification needs an account with Bedrock
access, and the DPA is a legal artefact that only the account owner can obtain.

Until this section is completed, the decision to call Bedrock directly rather
than through a gateway rests on an unverified premise.

---

## Sub-processors

| Party | Role | Reviewed |
|---|---|---|
| Neon | Stores all conversation content | Region and encryption recorded above. **Sub-processor terms not yet reviewed** (open question Q-H) |
| DeepSeek | Receives message content at inference time | Not cleared, development only |
| AWS | Planned inference | Pending |
| Vercel | Planned hosting | Not yet provisioned |
| Resend / AWS SES | Carry guardian alerts and sign-in codes | Gated by `EMAIL_COMPLIANCE` in `src/config/settings.ts`; **neither DPA reviewed** |

A mail transport is a sub-processor of children's data, not plumbing. A guardian
alert carries a child's display name and a safety severity, and it lands in the
provider's sending logs, the guardian's mail host, and a lock-screen preview —
three places outside our audit boundary. That is precisely why the alert carries
no message content ([0006](0006-notification-transport.md)) and why
`EMAIL_COMPLIANCE` refuses a production start on an uncleared transport, exactly
as `PROVIDER_COMPLIANCE` does for inference.

**Q-H remains open:** the plan rejected a hosted auth service because it would
place children's identity data with an additional sub-processor. The same test
has not been applied to the database host, which stores every child message.
Same test, opposite outcome, no recorded rationale.

---

## Outstanding before launch

- [ ] Amend PRD §7.4 to describe at-rest encryption accurately
- [ ] Obtain Bedrock model access and record a real inference call in the residency region
- [ ] Obtain DPA and zero-retention terms for the production provider, in writing
- [ ] Obtain DPA terms for the production **email** transport, and record its retention
      of message metadata — sending logs outlive the notification
- [ ] Review and record the database host's sub-processor position (Q-H)
- [ ] Decide the production data region (see `0001-region-and-residency.md`)
- [ ] Answer Q-B: verifiable parental consent depth for under-13
