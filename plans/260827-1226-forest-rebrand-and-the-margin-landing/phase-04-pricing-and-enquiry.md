---
phase: 4
title: "Pricing and the enquiry form"
status: pending
priority: P2
effort: "4h"
dependencies: [1, 3]
---

# Phase 4: Pricing and the enquiry form

## Overview

Two cards — free beta, and self-hosting behind a conversation — plus a real form that
delivers to `info@dinhdobathi.com` through the SES transport already in place.

## Requirements

- Functional: a submitted enquiry arrives as an email; a failure is visible to the sender.
- Functional: the form is rate-limited and cannot be used to send mail to a third party.
- Non-functional: no third tier invented to fill a grid.
- Non-functional: no claim made about self-hosting that is not yet true.

## Architecture

The form posts to a route that composes a **fixed-recipient** message. The submitted address
appears only in the body as reply-to context — it is never the `to`. That is deliberate: a
form that emails an arbitrary address is an open relay, and this one runs on a verified SES
identity with a sending reputation to protect.

Reuses the existing per-IP limiter rather than adding a second mechanism: `checkLoginRate`
already throttles by hashed IP before anything else happens, and an enquiry form is exactly
the surface that attracts automated submissions.

**Copy correction carried in from the proposal.** The self-host card said *"your data never
leaves your estate"*. That is a claim about a deployment that does not exist yet, and it
must ship as *"designed to run entirely inside your infrastructure"* until it does.

## Related Code Files

- Create: `src/components/landing/pricing.tsx`
- Create: `src/components/landing/enquiry-form.tsx`
- Create: `src/app/api/enquiry/route.ts`
- Modify: `src/config/settings.ts` — the enquiry recipient
- Reuse: `src/lib/email/send.ts`, `src/lib/auth/login-rate-limit.ts`

## Implementation Steps

1. Build the two cards: free beta, and self-hosted with custom guardrails as its headline.
2. Add the grandfather line — what happens when beta ends — where the question forms.
3. Build the form: name, email, organisation, message. Labels visible, not placeholders.
4. Write the route: validate with Zod, throttle by IP, compose to the fixed recipient, send.
5. Return a clear success state, and a failure the sender can act on.
6. Add the recipient to config so it is not hardcoded in a route.

## Success Criteria

- [x] A submitted enquiry arrives at `info@dinhdobathi.com` with the sender's details in the body
- [x] The recipient cannot be influenced by anything in the request
- [ ] Repeated submissions from one IP are throttled
- [x] A transport failure surfaces to the sender rather than silently succeeding
- [x] Validation errors appear beside their field, with a recovery path
- [x] The self-host card claims only what is currently true
- [ ] Every control ≥44px; the form is keyboard-completable

## Risk Assessment

An unauthenticated form that sends email is the classic spam relay. The fixed recipient
removes the worst case, but the sending reputation of a verified SES identity can still be
damaged by volume. Signal: SES complaint or bounce rate climbing, or a burst of submissions.
Response: the per-IP limiter is the first line; if that proves insufficient, add a
proof-of-work or a hold-and-review queue rather than a CAPTCHA, which a parent on a phone
should not have to solve to ask a question.
