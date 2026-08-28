---
phase: 2
title: "Notification delivery"
status: completed
priority: P1
effort: "5h"
dependencies: [1]
---

# Phase 2: Notification delivery

## Overview

`notifyGuardians` is built, tested, and correct about what it must not leak — and its
only transport writes to the console. A `critical` flag today reaches nobody. This is
the largest gap between what the product claims and what it does.

## Requirements

- Functional: a `high` or `critical` flag emails every consented guardian of that child.
- Functional: the payload carries `childName`, `severity`, `flagId` and a deep link and
  nothing else. Never message content, never the matched text, never the rule.
- Functional: every dispatch attempt writes an append-only audit row, delivered or not.
- Non-functional: a transport failure must not fail the child's request. Notification is
  downstream of the response, never in front of it.
- Non-functional: no provider credential reaches a log line or an error message.

## Architecture

The `Transport` interface already exists and `notifyGuardians` already takes an array,
so this phase adds an implementation rather than reshaping anything. The existing test
asserting the payload key set (`childName`, `deepLink`, `flagId`, `severity`) is the
contract and must not be relaxed to accommodate a template.

**Web push is deferred (decision L2).** iOS Safari delivers web push only to a PWA the
user installed, so for the majority of parents on iPhone a push-only alert fails
silently — the worst possible failure mode for a child-safety notification. Email is
the transport that works everywhere today. The `Transport` array means adding VAPID
later changes no call site.

Guardian resolution must respect consent and removal: a parent removed from a family, or
one whose consent was withdrawn, is not a recipient.

## Related Code Files

- Create: `src/lib/notify/transports/email.ts`
- Modify: `src/lib/notify/dispatch.ts` (register the transport; unchanged interface)
- Modify: `src/config/settings.ts` (Resend key and from-address, Zod-validated)
- Modify: `.env.example`
- Modify: `tests/pipeline/turn.test.ts` (extend the boundary assertions)

## Implementation Steps

1. Add the Resend settings to the config schema; the app must refuse to start with a
   transport enabled and no credential, matching how provider credentials behave.
2. Write the email transport against the existing `Transport` interface.
3. Compose the message from metadata only — subject and body carry the child's name,
   the severity, and the deep link. No excerpt, no category, no rule name.
4. Resolve recipients as consented, non-removed guardians of that child's family.
5. Write an audit row per dispatch attempt, recording outcome, so G5 stays complete.
6. Extend the existing payload-boundary test to assert the rendered email body also
   contains no content, not merely the payload object.

## Success Criteria

- [ ] A `critical` flag delivers an email to every consented guardian
- [ ] A removed or non-consented parent receives nothing
- [ ] The rendered email body contains no message content, matched text, or rule name
- [ ] Every dispatch attempt writes an audit row, success or failure
- [ ] A transport throwing does not fail the child's chat request
- [ ] No credential appears in any log line or error path
- [ ] Severities below `high` still send nothing

## Risk Assessment

The tempting shortcut is to put a helpful excerpt in the email so the parent knows what
happened. That inverts the entire visibility ladder — the ladder exists so a parent sees
content only after crossing `medium` *and* through an audited path. Signal it happened:
the body assertion fails, or a reviewer proposes "just a snippet". Response: the deep
link is the only route to content; hold the line.

Deferring push is recorded, not forgotten. Signal it needs revisiting: guardians report
missing time-critical alerts. Response: add the VAPID transport to the same array.
