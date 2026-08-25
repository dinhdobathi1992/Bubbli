---
phase: 1
title: "Foundation and Data Model"
status: pending
priority: P1
effort: "4d"
dependencies: []
---

# Phase 1: Foundation and Data Model

> **Revised by red team:** findings #1, #6, #7, #11, #12 and second-tier items applied.
> Effort 3d → 4d.

> **Status 2026-08-26: IMPLEMENTED except G9.** Schema, migrations, append-only enforcement,
> config and CI are done and verified. **G9 is NOT met** — Bedrock model access, a real
> inference call in the residency region, and DPA/zero-retention terms are all unverified,
> and the AWS identity available has no Bedrock permission. See
> `docs/decisions/0002-compliance-premises.md`. Q-F resolved (V1); Q-H still open.

## Overview

Stand up the Next.js application, PostgreSQL schema, migrations, validated configuration, CI,
and the **compliance premises the rest of the plan rests on**. Delivers the spine every later
phase depends on and nothing user-facing.

**Q-F resolved (V1):** provider-managed volume encryption is accepted as satisfying PRD §7.4, and
§7.4 is amended to describe it honestly rather than implying something stronger. No column-level
encryption, no schema impact. Step 3 now records what the host provides and files the PRD amendment.
<!-- Updated: Validation Session 1 - Q-F resolved, phase unblocked -->

## Requirements

**Functional**
- Next.js 15 App Router project, TypeScript strict mode, pnpm.
- PostgreSQL provisioned; Drizzle schema + migrations for the full PRD §6.2 model **plus** the
  tables the red team restored (below).
- Zod-validated startup configuration that exits non-zero on invalid config.
- CI running typecheck, lint, unit tests, migrations, **and mutation testing** against a real Postgres.
- **Compliance verification artefacts** recorded (G9).

**Non-functional**
- No `process.env` access outside the config module (G8) — ESLint rule, not convention.
- All timestamps `timestamptz`. All enum-ish columns carry `CHECK` constraints.
- `audit_events` genuinely append-only **under every deletion path**, not only direct DML.

## Architecture

```
src/
  config/          Zod-parsed settings, the ONLY module reading process.env
  db/              Drizzle schema, client, migrations
  lib/             shared domain helpers (no framework imports)
  app/             App Router: (child) and (parent) route groups + api/
```

**Data model** — PRD §6.2 with its two corrections, plus the red-team additions:

Corrections already carried:
- **No `is_visible_to_parent`.** Visibility computed at read time; persisted derived state goes
  stale when a parent retunes sensitivity.
- **No `safety_score` float.** `conversations.max_severity` enum instead.

Red-team additions:
- **`ai_provider_attempts`** — restored. The accepted contract kept it (`brainstorm:71`) and the
  plan had dropped it. Records provider, model, latency, tokens, status, including aborts. (#5, #12)
- **`guardrail_results.age_band` and `.config_hash`** — the engine is a pure function of
  *(text, age band, config)*, so `policy_version` alone does not make a decision reproducible.
  Age band is parent-editable; without it every historical result becomes irreproducible. (2nd tier)
- **`policy_versions`** — immutable table storing the rule-set **body**, not just its hash. A hash
  proves inequality; it resolves back to nothing once `rules.ts` is overwritten. (2nd tier)
- **`family_pseudonyms`** — indirection for actor/subject identifiers in `audit_events`, so GDPR
  erasure can pseudonymise by deleting a pseudonym row rather than `UPDATE`ing an append-only
  table. This is R2: it makes Phase 1 safe under either legal answer to Q-A. (#1)
- **Age bands split at the COPPA-13 boundary (V8):** `4-7`, `8-11`, `12`, `13-15`. The boundary is
  explicit in the data model rather than hidden inside a band, so the consent path can branch on it.
- **Retention columns (V5):** content purges at 90d, flags at 1y, audit at 2y. The 30d
  post-dismissal clock is dropped as redundant — dismissal stops notifications, nothing else.
- **`children.pin_failed_attempts` / `.pin_locked_until` / `.age_band`**, and
  **`messages.idempotency_key`** with a unique constraint on `(child_id, idempotency_key)`. (#12, #15)
- **`children.guardrail_config`** JSONB — PRD §5.2 and §6.2 require per-child sensitivity, and the
  read-time-visibility rationale rests on parents retuning it. (2nd tier)

**Append-only enforcement — three mechanisms, because one was defeatable two ways:**
1. **Two DB roles.** A migration/owner role used only by CI and drizzle-kit, and a runtime role
   that **owns nothing** and holds `INSERT, SELECT` on `audit_events` with no `GRANT` option. A
   table owner can re-grant `DELETE` to itself; the previous single-role design could be undone in
   one statement by any SQL foothold. (#11)
2. **`ON DELETE RESTRICT`** on every foreign key into `audit_events`. Referential actions execute
   as the referencing table's owner, not the invoking role, so a cascade from `families` would
   have deleted audit rows straight through the privilege check. (#11)
3. Pseudonym indirection (above), so erasure never needs to touch these rows at all.

## Related Code Files

- Create: `package.json`, `tsconfig.json`, `next.config.ts`, `drizzle.config.ts`, `vitest.config.ts`
- Create: `src/config/settings.ts` — Zod schema, `process.exit(1)` on parse failure
- Create: `src/db/schema.ts`, `src/db/client.ts`, `drizzle/*.sql`
- Create: `eslint.config.mjs` — `no-restricted-properties` banning `process.env` outside `src/config/`
- Create: `.github/workflows/ci.yml`, `stryker.config.json`
- Create: `docs/decisions/0001-region-and-residency.md`
- Create: `docs/decisions/0002-compliance-premises.md` — DPA/ZDR, at-rest encryption, sub-processors
- Create: `docs/decisions/0003-rate-limit-library.md` — library + datastore, decided here not Phase 7

## Implementation Steps

1. `git init`. Scaffold Next.js 15 + TypeScript strict + Tailwind with pnpm.
2. Provision PostgreSQL through the Vercel Marketplace flow. **Record that supplier's
   sub-processor position and residency in `0002`** — the same test that rejected Clerk applies to
   any third party storing every child message (Q-H).
3. **[V1] Record what at-rest encryption the chosen Postgres provides**, and file the PRD §7.4
   amendment describing it accurately. Volume-level AES-256 with host-managed keys is accepted.
   Do **not** implement column-level encryption. The privacy policy must match what is recorded here.
4. **[G9] Verify the Bedrock premises before anything depends on them** — model access granted, a
   **real inference call succeeding in the residency region**, current service quotas captured, and
   DPA + zero-retention terms confirmed in writing. Record in `0002`. Without this artefact the
   entire Gateway divergence rests on nothing. (#6)
5. **Decide the rate-limit library and its datastore now**, and provision that datastore alongside
   Postgres so residency, DPA and sub-processor questions are answered once. Deferring to Phase 7
   risks discovering on day ~30 that no proven sliding-window library fits a Postgres-only
   serverless stack, with both alternatives already banned. Record in `0003`. (#13)
6. Write `src/config/settings.ts`: Zod schema covering DB URL, AWS region, Bedrock generation and
   classifier model ids, safety toggles, rate-limit datastore, notification keys.
7. Add the ESLint rule banning `process.env` outside `src/config/`. Verify it fires on a deliberate
   violation, then remove the violation.
8. Write the Drizzle schema for all tables above, including the red-team additions. `CHECK`
   constraints on every enum column. **Name the principal field `principal_type`**, never `role` —
   `messages.role` already means something else and the collision is a security hazard.
9. Create the two DB roles. Set `ON DELETE RESTRICT` on every FK into `audit_events`.
10. Generate and apply migrations. Integration test running every migration from empty.
11. **Write the append-only test suite**: the runtime role's direct `UPDATE`/`DELETE` is rejected;
    the runtime role is **not** the table owner; `GRANT DELETE ... TO CURRENT_USER` fails; and
    `DELETE FROM families` with audit rows present is **rejected**, not cascaded. (#11)
12. CI: typecheck, lint, unit tests, migration test, and Stryker mutation testing scaffolded
    (thresholds enforced from Phase 3 once guards exist). (G3)
13. Decide and document Bedrock + function region together in `0001`.

## Success Criteria

- [x] `pnpm typecheck`, `pnpm lint`, `pnpm test` pass in CI
- [x] Migrations run from empty and produce the full schema
- [x] Invalid config exits non-zero and names every offending field
- [x] ESLint fails on a `process.env` read outside `src/config/` (G8)
- [x] Runtime role is not the owner of `audit_events`; self-`GRANT` of `DELETE` fails
- [x] `DELETE FROM families` with audit rows present is **rejected** (no cascade path) (#11)
- [x] Schema contains no `is_visible_to_parent` and no `safety_score`
- [x] Schema contains `ai_provider_attempts`, `policy_versions`, `family_pseudonyms`,
      `guardrail_results.age_band`, `.config_hash`, `messages.idempotency_key` (unique per child),
      `children.guardrail_config`
- [x] Principal field is named `principal_type`, distinct from `messages.role`
- [ ] **[G9]** `0002` records: DPA + ZDR confirmed in writing, at-rest encryption position, a
      successful real Bedrock inference call in the residency region, and captured quotas
- [ ] `0003` names the rate-limit library and datastore, and that datastore is provisioned
- [ ] Region decision recorded with rationale
- [ ] Age band CHECK allows exactly `4-7`, `8-11`, `12`, `13-15` (V8)
- [ ] Retention columns support the 90d / 1y / 2y model (V5)
- [ ] PRD §7.4 amendment filed describing the actual at-rest encryption (V1)

## Risk Assessment

**Q-F answers "no".** Signal: the chosen Postgres host provides only volume-level encryption and
legal judges that insufficient for §7.4. Response: column-level encryption on `messages.content`,
which changes the schema and every read path — hence a blocking question resolved at step 3, not
discovered in Phase 6.

**Bedrock model unavailable in the residency-compliant region.** Signal: step 4's real inference
call fails with `AccessDeniedException` or model-not-found. Response: **stop and escalate** — the
choice is between D2 and §13 and is not an engineering decision. This is exactly why the call
happens in Phase 1 and not on day 17.

**Marketplace provisioning stalls.** Signal: no Postgres URL within the phase. Response: proceed
against local Docker Postgres and provision before Phase 3 — do not let it block schema work.

**Region chosen by default rather than decision.** Signal: `us-east-1` appears in config with no
`0001` entry. Response: treat as phase failure; residency is a compliance input.

<!-- Updated: Validation Session 1 - V1 encryption accepted, V5 retention columns, V8 age bands split -->
