---
phase: 4
title: "Child join code"
status: pending
priority: P2
effort: "3h"
dependencies: []
---

# Phase 4: Child join code

## Overview

The child login form asks for a raw 36-character family UUID. An eight-year-old cannot
type it and a fifteen-year-old will not. MVP Phase 3 specified "a family-scoped URL or a
parent-issued join code so display names are never a global namespace" — the security
scoping was implemented correctly and then the primary key was exposed as the input.

## Requirements

- Functional: a child signs in with a short code, or follows a family link and enters
  only their name and PIN.
- Functional: the code is unambiguous to read aloud and to type — no `O`/`0`, no `I`/`1`.
- Non-functional: family scoping is unchanged. The code resolves to a `familyId`
  server-side and grants nothing on its own; name and PIN are still required.
- Non-functional: a code is not a secret, so it must not weaken the rate limit. Probing
  codes is throttled exactly as probing family IDs is today.

## Architecture

A `join_code` column on `families`, unique and indexed, generated from a
confusable-free alphabet. The login route accepts either a code or a UUID during the
transition, resolving both to a `familyId` before anything else happens, so the
authorization path below it does not change at all.

`/login/<code>` prefills the family and renders a two-field form. The parent sends that
link once; the browser remembers it; the child types name and PIN thereafter.

The existing per-IP limiter already covers this: `checkLoginRate` throttles by hashed IP
before the family is resolved, so a code-enumeration probe is limited identically to a
UUID probe. This is exactly why dropping the `login_attempts` foreign key mattered — a
probe against a nonexistent family is now recorded and throttled rather than 500-ing.

## Related Code Files

- Create: `drizzle/0004_join_code.sql`
- Create: `src/lib/auth/join-code.ts`
- Create: `src/app/(child)/login/[code]/page.tsx`
- Modify: `src/db/schema.ts`
- Modify: `src/app/api/child/login/route.ts`
- Modify: `src/app/(child)/login/page.tsx`
- Modify: `scripts/seed-dev.ts` (print the code, not the UUID)

## Implementation Steps

1. Add `join_code` to `families`: unique, indexed, not null, backfilled for existing rows.
2. Generate from a confusable-free alphabet; verify collision handling on insert.
3. Resolve code or UUID to a `familyId` at the top of the login route; everything below
   is unchanged.
4. Add the `/login/<code>` route rendering name and PIN only.
5. Relabel the manual field "Family code" and stop asking for a UUID.
6. Update the dev seed to print the code and the family link.

## Success Criteria

- [ ] A child signs in with a short code
- [ ] `/login/<code>` prefills the family and asks only for name and PIN
- [ ] An invalid code is rate-limited and recorded exactly as an invalid UUID is
- [ ] A valid code alone grants nothing without a correct name and PIN
- [ ] Family scoping and the display-name namespace are unchanged
- [ ] `pnpm seed:dev` prints a code a child could actually type

## Risk Assessment

A short code invites the assumption that it is a secret and therefore a credential.
It is not — it is a namespace selector. Signal it drifted: a proposal to skip the PIN
for link visitors, or to lengthen the code "for security". Response: the code is public
by design; authentication is the PIN, and the rate limit is what protects it.
