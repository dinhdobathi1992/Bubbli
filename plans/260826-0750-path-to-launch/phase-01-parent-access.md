---
phase: 1
title: "Parent access"
status: completed
priority: P1
effort: "6h"
dependencies: []
---

# Phase 1: Parent access

## Overview

Better Auth is configured at the library level and `getSession()` has a comment where
the parent branch should be. There is no sign-in page, no handler mounted, and no way
to obtain a parent session — so `/parent` and the transcript route, both fully built
and tested, are unreachable by an actual human.

## Requirements

- Functional: a parent signs in with email and password and lands on `/parent` with a
  session `getSession()` resolves as `principalType: 'parent'`.
- Functional: an unauthenticated visitor to any parent surface is redirected, not shown
  an error, and never learns whether a resource exists.
- Non-functional: the parent session must not be forgeable into a child principal.
  `principalType` stays derived server-side from which store resolved, never read from
  a client claim.
- Non-functional: sign-in failures are rate-limited on the same per-IP basis the child
  login already uses.

## Architecture

`getSession()` already resolves the child store first and returns `null` otherwise.
The parent branch slots in behind it: ask Better Auth for a session, and on a hit
return `{ principalType: 'parent', familyId, parentId }` resolved from the `parents`
row, not from anything the client sent.

Order matters and is deliberate — child first. A request carrying both a child cookie
and a parent session resolves as the child, which is the safer failure: a child
principal can never read another conversation, whereas a parent principal can read
`medium`+ transcripts.

The mutation guard from G3 already proves a forged parent session carrying a `childId`
is rejected. That test must keep passing once a real parent session exists, so it is
re-run as an explicit success criterion here rather than assumed.

## Related Code Files

- Create: `src/app/(parent)/login/page.tsx`
- Create: `src/app/api/auth/[...all]/route.ts` (Better Auth handler mount)
- Create: `src/app/(parent)/layout.tsx` (redirect guard)
- Modify: `src/lib/auth/request-session.ts` (parent branch)
- Modify: `src/lib/auth/login-rate-limit.ts` (reuse for the parent identifier)

## Implementation Steps

1. Mount the Better Auth handler and confirm its tables match `drizzle/0002_auth.sql`;
   generate a migration if they have drifted.
2. Add the parent branch to `getSession()`, resolving `familyId`/`parentId` from the
   `parents` row keyed by the authenticated user.
3. Build the sign-in page in the parent register — denser and sharper than the child
   surface, same token layer, no raw hex.
4. Add a `(parent)` layout that redirects unauthenticated requests to the sign-in page.
5. Extend the per-IP login limiter to the parent identifier.
6. Re-run the G3 mutation gate and the parent-isolation tests unchanged.

## Success Criteria

- [ ] A seeded parent signs in and reaches `/parent` with a real session
- [ ] `getSession()` returns `principalType: 'parent'` with a resolved `familyId`
- [ ] An unauthenticated request to `/parent` and to the transcript route redirects
- [ ] A request carrying both a child cookie and a parent session resolves as the child
- [ ] The forged-parent-session-with-childId test still fails the mutant
- [ ] `pnpm test` and `pnpm test:mutation` pass

## Risk Assessment

Better Auth's generated schema may not match the hand-written `0002_auth.sql`. Signal:
sign-in fails on a missing column, or `db:migrate` from empty diverges from the running
database. Response: regenerate the migration from Better Auth's schema and reconcile in
one migration rather than patching columns by hand — CI runs migrations from empty and
will catch a drifted pair immediately.
