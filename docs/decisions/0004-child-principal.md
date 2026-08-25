# 0004 — How the child principal authenticates

**Status:** decided (Phase 3, step 1 spike)
**Date:** 2026-08-26

The plan assumed "two distinct principals sharing one session mechanism" without
validating it. The red team flagged that as a load-bearing, unverified
assumption — if wrong, Phase 3 either puts children in the parent identity
namespace or hand-rolls a second session system inside an already-full budget.
This is the spike.

## Finding

Better Auth 1.7.1 is organised around a **single principal type**: `user`, with
`session`, `account` and `verification` tables hanging off it. Plugins extend
what a user can do; they do not introduce a second kind of subject.

Making children `user` rows would therefore mean:

- Children sit in the same identity namespace as their parents.
- The catch-all mount at `/api/auth/[...all]` exposes Better Auth's whole
  surface — password reset, email change, OAuth account linking, session
  listing — against child rows. The plan's stated mitigation ("role is asserted
  at the top of every authz function") does not apply, because those handlers
  live inside the library, not in `src/lib/authz/`.
- Consent withdrawal must revoke child sessions immediately. Doing that through
  a library that assumes self-service account management is working against it.

## Decision

**Better Auth for parents only. Children get a purpose-built server-side
session.**

| | Parent | Child |
|---|---|---|
| Mechanism | Better Auth (email+password, OAuth) | Opaque token in `child_sessions` |
| Credential | password / provider | 6+ digit PIN, argon2id |
| Session store | Better Auth `session` table | `child_sessions` row |
| Revocation | Better Auth API | `DELETE` the row |
| Reaches `/api/auth/*` | yes | **never** |

This is not hand-rolled cryptography. It is the ordinary server-side session
pattern: a random 256-bit token, stored hashed, looked up per request. What it
buys over reusing the library:

1. **Children never enter the parent identity namespace**, so the auth
   catch-all is structurally irrelevant to them rather than defended against.
2. **Revocation is a row delete.** Consent withdrawal, PIN lockout, guardian
   removal and child deletion all need immediate, server-side session kill.
   That is the requirement the library fits worst and a session table fits best.
3. **Nothing self-service exists for a child.** No password reset, no email
   change, no account linking — because none of it is implemented, not because
   it is disabled.

## Cost accepted

We own the child session lifecycle: creation, expiry, rotation, revocation, and
the cookie attributes. All of it is covered by tests in
`tests/auth/child-session.test.ts`, and none of it involves inventing a
primitive.

## Consequence for naming

`principal_type` is `'parent' | 'child'` and is derived **server-side** from
which session store resolved the request. It is never read from a client claim,
and it is deliberately not called `role` — `messages.role` already means
`child | assistant | system`, and one word for two security-relevant concepts is
how confusions become vulnerabilities.
