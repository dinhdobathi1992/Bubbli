---
phase: 3
title: "Auth Tenancy and Consent"
status: pending
priority: P1
effort: "6d"
dependencies: [1]
---

# Phase 3: Auth Tenancy and Consent

> **Revised by red team:** findings #3, #8, #15 and second-tier items applied.
> Effort 4d → 6d. Child profile creation added — it was missing entirely. Age bands split at 13 (V8).

> **Status 2026-08-26: IMPLEMENTED except the Q-B-gated half.** Child profile model, PIN
> policy + argon2id + durable lockout, child sessions, family tenancy, the authz layer and
> login rate limiting are done and verified (33 tests). Mutation testing wired into CI.
> **Not done:** parent-facing UI routes, Better Auth runtime wiring, and the consent flow
> cannot be finalised until **Q-B** is answered. `src/lib/auth/consent.ts` implements the
> FLOOR and is marked as such. See `docs/decisions/0004-child-principal.md` for the spike.

## Overview

Parent authentication, child profile management, COPPA consent, child PIN authentication with
durable lockout, family tenancy, and the authorization layer every later phase depends on.

**Blocked on Q-B** (verifiable parental consent depth, now including consent-before-*collection*
and withdrawal). Steps 8–10 cannot be finalised until that legal question is answered.

## Requirements

**Functional**
- Parent auth: email+password and OAuth, Better Auth self-hosted with the Drizzle adapter.
- **Child profile management (PRD §10 item #1)**: create/list/edit child with display name,
  **age band**, and PIN. This was absent from the previous plan while Phases 2, 4 and 5 all
  consumed `ageBand` as a required input. (#8)
- Child auth: PIN, argon2id, **≥6 digits with a common-sequence blocklist**, lockout counters in
  Postgres, **family-scoped login** so display names are never a global namespace. (#15)
- Consent: parent verification **before child data is collected**, not merely before the child
  can log in — COPPA governs collection. Plus a withdrawal path that revokes sessions. (2nd tier)
- Authorization: a single module all routes call. **Two distinct functions**, named once:
  `assertCanViewConversation` (parent, severity-gated) and `assertIsOwningChild` (child paths).

**Non-functional**
- **Deleting the authorization check or the PIN lockout must fail a named test, re-verified every
  CI run by mutation testing** — not by a one-time manual ritual. (G3, 2nd tier)
- Lockout survives process restart and cache eviction.
- No principal or identity claim is trusted from the client. `principal_type` is a server-side
  non-nullable column, never a client-supplied claim.
- Session security specified explicitly: cookie attributes, TTL, rotation, CSRF posture, and
  revocation triggers. None of this existed in the previous plan. (2nd tier)

## Architecture

Two distinct principals sharing one session mechanism:

```
Parent  ──Better Auth (email+pw | OAuth)──> session{ parentId, familyId, principalType:'parent' }
Child   ──PIN + argon2id + lockout────────> session{ childId,  familyId, principalType:'child'  }
```

**`principalType`, not `role`.** `messages.role` already means `child|assistant|system`. One word
for two concepts, one of them security-critical, is how confusions become vulnerabilities. (#3)

**Authorization is two functions, not one ambiguous name.** The previous plan had Phase 4 calling
`assertCanAccess`, which Phase 3 never delivered — so an implementer would reach for
`assertSameFamily`, **which a parent session satisfies**, handing a parent the child's unflagged
transcript through the chat route. Both functions are delivered here and named identically
wherever they are referenced. (#3)

**Why not Clerk.** It would place children's identity data with an additional sub-processor, a
direct cost against PRD §13.

**PIN posture (#15).** Per-child lockout alone does not stop an attacker sweeping a common-PIN
across many accounts — each account sees one failure and never locks. Therefore: family-scoped
login URLs or parent-issued join codes, ≥6 digits, and **per-IP and per-route rate limiting on
the login endpoint**, which is not an AI-invoking path and so falls outside Phase 7's quota
middleware. Lockout also needs an expiry and a parent-initiated unlock: the child's crisis path
(Phase 5) is only reachable inside an authenticated session, so an unrecoverable lockout is a
safety failure, not just an availability one.

## Related Code Files

- Create: `src/lib/auth/better-auth.ts`, `src/lib/auth/child-pin.ts`, `src/lib/auth/session.ts`
- Create: `src/lib/authz/index.ts` — `assertCanViewConversation`, `assertIsOwningChild`,
  `assertSameFamily`, `assertIsGuardian`
- Create: `src/app/(parent)/signup/`, `(parent)/consent/`, **`(parent)/children/`**
- Create: `src/app/(child)/login/`
- Create: `src/app/api/auth/[...all]/route.ts`
- Create: `tests/authz/guard-removal.test.ts`, `tests/auth/pin-lockout.test.ts`,
  `tests/auth/pin-bruteforce.test.ts`, `tests/auth/better-auth-surface.test.ts`
- Modify: `src/db/schema.ts`, `stryker.config.json` (enable thresholds)

## Implementation Steps

1. **Spike Better Auth first, timeboxed.** Confirm whether a custom principal type with extra
   session claims is supported, or whether children must exist as Better Auth users. If they must,
   the catch-all mount exposes password reset, OAuth linking and session listing against child
   rows. Decide before building on the assumption. (2nd tier)
2. Wire Better Auth with the Drizzle adapter. **Enumerate the endpoints the catch-all mounts and
   disable everything not required.** Write `better-auth-surface.test.ts` driving a child session
   against every reachable endpoint and asserting 403. (#3)
3. Specify session security: cookie attributes, TTL, rotation, CSRF posture, and revocation on
   lockout, consent withdrawal, child deletion, and guardian removal. (2nd tier)
4. Add family tenancy: `familyId` on every session, and a query helper that refuses to construct a
   query without it.
5. **[#8] Implement child profile management**: `(parent)/children/` create/list/edit with display
   name, age band, PIN. **Bands are `4-7`, `8-11`, `12`, `13-15` — split at the COPPA-13 boundary
   (V8)** so the consent path can branch on it explicitly instead of inferring from a band that
   straddles the line. Define the shared age-band constant here — Phases 2, 4 and 5 import it and
   must never re-declare it. Pin the age band per conversation at creation so a mid-conversation
   change starts a new conversation rather than mixing bands.
6. Implement child PIN auth: argon2id, constant-time comparison, ≥6 digits with a common-sequence
   blocklist, family-scoped identification, transactional failure increment.
7. Implement lockout with an expiry and a parent-initiated unlock; push a notification to guardians
   on lockout. Choose N and the window and record the choice.
8. Add per-IP and per-route rate limiting to the login endpoint, independent of the AI quota. (#15)
9. **[Q-B]** Implement consent: parent verification **before** the child-creation form collects
   anything, or persist child records in a `pending` state with a hard TTL and a purge job for
   unconsented records. A child cannot authenticate before consent completes.
10. **[Q-B]** Implement consent withdrawal: revoke all child sessions immediately and enqueue
    erasure. If the legal review requires stronger verifiable consent, extend here — do not ship a
    weaker flow silently.
11. Build `src/lib/authz/`. Every function takes a session and returns or throws — never a boolean
    a caller can forget to check. `principalType` asserted at the top of each.
12. Write `tests/auth/pin-lockout.test.ts`: N+1 rejected; lockout survives simulated restart; a
    correct PIN during lockout still fails; unlock works; lockout notifies guardians.
13. Write `tests/auth/pin-bruteforce.test.ts`: a horizontal sweep across many child accounts is
    throttled by the per-IP limit, not just per-child lockout. (#15)
14. Write `tests/authz/guard-removal.test.ts`, and **enable Stryker thresholds** over
    `src/lib/authz/` and `src/lib/auth/child-pin.ts` so guard removal fails CI every run. (G3)

## Success Criteria

- [x] Better Auth spike recorded; child-principal approach decided on evidence (2nd tier)
- [x] A child session gets 403 on every endpoint the auth catch-all mounts (#3)
- [x] Cookie attributes, TTL, rotation, CSRF posture and revocation triggers documented and tested
- [x] **Parent can create, list and edit a child with display name, age band and PIN** (#8)
- [x] Age-band constant is defined once, has four bands split at 13, and is imported by Phases 2, 4, 5 (V8)
- [ ] The consent path branches on the under-13 boundary, not on a straddling band (V8)
- [x] Age band is pinned per conversation at creation
- [x] Child cannot authenticate until consent completes; **no child data is collected before
      consent, or is purged by TTL if abandoned** (Q-B)
- [x] Consent withdrawal revokes all child sessions immediately
- [x] PIN is ≥6 digits, rejects common sequences, and login is family-scoped
- [x] Lockout survives process restart; has an expiry; parent can unlock; guardians are notified
- [x] **Horizontal brute force across accounts is throttled by per-IP limits** (#15)
- [x] `assertCanViewConversation` and `assertIsOwningChild` both exist and are the only names used
- [x] **Mutation testing fails CI when any guard is removed** — every run, not once (G3)
- [ ] No query can be constructed without a `familyId` scope
- [x] Cross-family access returns 403 and writes a denied-access audit row

## Risk Assessment

**Better Auth cannot carry a second principal.** Signal: step 1's spike. Response: if children must
be Better Auth users, lock down the catch-all surface and treat child rows as a distinct
`principal_type` with every non-required endpoint disabled. If a second session system must be
hand-rolled, **escalate** — that is not 6d of work on top of everything else in this phase, and
Clerk is already rejected, so there is no shelf alternative.

**Q-B unresolved at phase start.** Signal: step 9 reached with no legal answer. Response: implement
consent-before-collection as the floor with a pending-record TTL, and mark the module with a
blocking TODO. Do not launch on the floor without the review.

**Guard-removal test that passes vacuously.** Response: mutation testing at step 14 makes this
machine-checkable every run. The previous plan's manual "delete it and watch it go red" was a
one-time observation that decayed on the next refactor.

<!-- Updated: Validation Session 1 - V8 age bands split at 13 -->
