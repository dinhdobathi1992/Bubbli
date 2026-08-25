/**
 * Bubbli data model. PRD v1.1.0 §6.2, with every red-team and validation
 * correction applied.
 *
 * Deliberately ABSENT (both were red-team finding #11 / PRD A11):
 *   - `is_visible_to_parent` — persisted derived state goes stale the moment a
 *     parent retunes sensitivity, silently changing what is visible for
 *     historical conversations. Visibility is computed at read time.
 *   - `safety_score` float — an aggregate float over a conversation has no
 *     defined meaning. `conversations.max_severity` is the signal.
 */
import {
  pgTable,
  date,
  primaryKey,
  uuid,
  text,
  integer,
  boolean,
  timestamp,
  jsonb,
  smallint,
  index,
  uniqueIndex,
  check,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

const now = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow();

// ── Tenancy ──────────────────────────────────────────────────────────────────

export const families = pgTable('families', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name'),
  createdAt: now(),
});

export const parents = pgTable(
  'parents',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    familyId: uuid('family_id').notNull().references(() => families.id, { onDelete: 'restrict' }),
    email: text('email').notNull(),
    authProvider: text('auth_provider').notNull().default('password'),
    // Verifiable parental consent. A child cannot authenticate before this is
    // set, and no child data is collected before it (Phase 3, gated on Q-B).
    consentedAt: timestamp('consented_at', { withTimezone: true }),
    consentWithdrawnAt: timestamp('consent_withdrawn_at', { withTimezone: true }),
    notificationPrefs: jsonb('notification_prefs').notNull().default(sql`'{}'::jsonb`),
    createdAt: now(),
  },
  (t) => [uniqueIndex('parents_email_uq').on(t.email), index('parents_family_idx').on(t.familyId)],
);

export const children = pgTable(
  'children',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    familyId: uuid('family_id').notNull().references(() => families.id, { onDelete: 'restrict' }),
    displayName: text('display_name').notNull(),
    /** argon2id. Never a reversible encoding. */
    pinHash: text('pin_hash').notNull(),
    /**
     * Lockout counters live in Postgres, not a cache. A Redis-only counter
     * resets on eviction, and a reset counter is a bypass.
     */
    pinFailedAttempts: integer('pin_failed_attempts').notNull().default(0),
    pinLockedUntil: timestamp('pin_locked_until', { withTimezone: true }),
    /** Split at the COPPA-13 boundary (validation decision V8). */
    ageBand: text('age_band').notNull(),
    /** Per-child sensitivity overrides. PRD §5.2. */
    guardrailConfig: jsonb('guardrail_config').notNull().default(sql`'{}'::jsonb`),
    /** Pending until parental consent completes; purged by TTL if abandoned. */
    activatedAt: timestamp('activated_at', { withTimezone: true }),
    createdAt: now(),
  },
  (t) => [
    index('children_family_idx').on(t.familyId),
    check('children_age_band_ck', sql`${t.ageBand} in ('4-7','8-11','12','13-15')`),
  ],
);

// ── Policy provenance ────────────────────────────────────────────────────────

/**
 * Immutable rule-set bodies, not just their hashes.
 *
 * A hash proves inequality; it resolves back to nothing once `rules.ts` is
 * overwritten. Storing the body is what makes "past decisions stay
 * explainable" actually true.
 */
export const policyVersions = pgTable('policy_versions', {
  versionHash: text('version_hash').primaryKey(),
  rules: jsonb('rules').notNull(),
  activatedAt: timestamp('activated_at', { withTimezone: true }).notNull().defaultNow(),
});

// ── Conversation ─────────────────────────────────────────────────────────────

export const conversations = pgTable(
  'conversations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    childId: uuid('child_id').notNull().references(() => children.id, { onDelete: 'cascade' }),
    /**
     * Running MAXIMUM. Only ever rises (validation decision V7): a parent's
     * dismissal marks a flag reviewed and stops notifications, it never lowers
     * severity and never closes a transcript mid-read.
     */
    maxSeverity: text('max_severity'),
    flagStatus: text('flag_status').notNull().default('none'),
    /** Pinned at creation so a mid-conversation band change starts a new one. */
    ageBand: text('age_band').notNull(),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
    endedAt: timestamp('ended_at', { withTimezone: true }),
    createdAt: now(),
    // No `title`. Validation decision V6: an AI-generated title needs a model
    // call over content the parent cannot see, and becomes a leak vector in
    // the flags list — the exact field the prior art leaked.
  },
  (t) => [
    index('conversations_child_idx').on(t.childId, t.startedAt),
    index('conversations_severity_idx').on(t.maxSeverity, t.startedAt),
    check('conversations_max_severity_ck', sql`${t.maxSeverity} is null or ${t.maxSeverity} in ('info','low','medium','high','critical')`),
    check('conversations_flag_status_ck', sql`${t.flagStatus} in ('none','flagged','reviewed','dismissed')`),
  ],
);

export const messages = pgTable(
  'messages',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    conversationId: uuid('conversation_id').notNull().references(() => conversations.id, { onDelete: 'cascade' }),
    childId: uuid('child_id').notNull().references(() => children.id, { onDelete: 'cascade' }),
    role: text('role').notNull(),
    content: text('content').notNull(),
    /**
     * Deduplication point for retries. Buffered generation holds an HTTP
     * request open for seconds; a retry must not double-flag or produce a
     * second crisis notification.
     */
    idempotencyKey: text('idempotency_key'),
    /** completed | aborted | failed — an abandoned turn leaves a terminal state. */
    status: text('status').notNull().default('completed'),
    createdAt: now(),
  },
  (t) => [
    index('messages_conversation_idx').on(t.conversationId, t.createdAt),
    uniqueIndex('messages_idempotency_uq').on(t.childId, t.idempotencyKey),
    check('messages_role_ck', sql`${t.role} in ('child','assistant','system')`),
    check('messages_status_ck', sql`${t.status} in ('completed','aborted','failed')`),
  ],
);

// ── Safety ───────────────────────────────────────────────────────────────────

export const guardrailResults = pgTable(
  'guardrail_results',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    messageId: uuid('message_id').notNull().references(() => messages.id, { onDelete: 'cascade' }),
    direction: text('direction').notNull(),
    passed: boolean('passed').notNull(),
    triggeredRules: jsonb('triggered_rules').notNull().default(sql`'[]'::jsonb`),
    severity: text('severity'),
    /**
     * The FULL input tuple, not just the policy version. The engine is a pure
     * function of (text, age band, config); without the band and the config
     * hash a stored decision cannot be reproduced.
     */
    policyVersion: text('policy_version').notNull().references(() => policyVersions.versionHash, { onDelete: 'restrict' }),
    ageBand: text('age_band').notNull(),
    configHash: text('config_hash').notNull(),
    details: text('details'),
    createdAt: now(),
  },
  (t) => [
    index('guardrail_results_message_idx').on(t.messageId),
    check('guardrail_results_direction_ck', sql`${t.direction} in ('input','output')`),
    check('guardrail_results_severity_ck', sql`${t.severity} is null or ${t.severity} in ('info','low','medium','high','critical')`),
  ],
);

export const flags = pgTable(
  'flags',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    conversationId: uuid('conversation_id').notNull().references(() => conversations.id, { onDelete: 'cascade' }),
    /**
     * The message that actually contained the offending content. An output
     * flag attaches to the ASSISTANT message, never the child's — the prior
     * art attached both to the child, so moderators saw children flagged for
     * what the model produced.
     */
    messageId: uuid('message_id').notNull().references(() => messages.id, { onDelete: 'cascade' }),
    severity: text('severity').notNull(),
    triggeredRules: jsonb('triggered_rules').notNull().default(sql`'[]'::jsonb`),
    policyVersion: text('policy_version').notNull().references(() => policyVersions.versionHash, { onDelete: 'restrict' }),
    reason: text('reason').notNull(),
    reviewed: boolean('reviewed').notNull().default(false),
    reviewedByParentId: uuid('reviewed_by_parent_id').references(() => parents.id, { onDelete: 'set null' }),
    reviewerNotes: text('reviewer_notes'),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
    createdAt: now(),
  },
  (t) => [
    index('flags_review_queue_idx').on(t.reviewed, t.severity, t.createdAt),
    index('flags_conversation_idx').on(t.conversationId),
    check('flags_severity_ck', sql`${t.severity} in ('info','low','medium','high','critical')`),
  ],
);

// ── Provider telemetry ───────────────────────────────────────────────────────

/**
 * Restored per the accepted contract. Records every attempt including
 * failures, timeouts and aborts, so an abandoned turn is visible in metrics
 * rather than silently absent.
 */
export const aiProviderAttempts = pgTable(
  'ai_provider_attempts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    conversationId: uuid('conversation_id').references(() => conversations.id, { onDelete: 'cascade' }),
    messageId: uuid('message_id').references(() => messages.id, { onDelete: 'cascade' }),
    provider: text('provider').notNull(),
    model: text('model').notNull(),
    status: text('status').notNull(),
    latencyMs: integer('latency_ms'),
    inputTokens: integer('input_tokens'),
    outputTokens: integer('output_tokens'),
    errorCode: text('error_code'),
    createdAt: now(),
  },
  (t) => [
    index('ai_attempts_conversation_idx').on(t.conversationId, t.createdAt),
    check('ai_attempts_status_ck', sql`${t.status} in ('success','failed','timeout','aborted')`),
  ],
);

// ── Audit, and the erasure indirection that keeps it append-only ─────────────

/**
 * Erasable indirection between a real subject and its audit identity.
 *
 * GDPR erasure and an append-only audit log genuinely conflict: one demands
 * deletion, the other forbids it. Resolved structurally — erasure deletes the
 * pseudonym row, which renders every audit row referencing it unresolvable.
 * The audit rows themselves are never mutated or deleted.
 *
 * `family_id` is ON DELETE RESTRICT so a family cannot be dropped while its
 * pseudonyms exist: erasure has to be deliberate, never a side effect.
 */
export const familyPseudonyms = pgTable(
  'family_pseudonyms',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    familyId: uuid('family_id').notNull().references(() => families.id, { onDelete: 'restrict' }),
    subjectKind: text('subject_kind').notNull(),
    subjectId: uuid('subject_id').notNull(),
    pseudonym: uuid('pseudonym').notNull().defaultRandom(),
    createdAt: now(),
  },
  (t) => [
    uniqueIndex('family_pseudonyms_pseudonym_uq').on(t.pseudonym),
    uniqueIndex('family_pseudonyms_subject_uq').on(t.subjectKind, t.subjectId),
    index('family_pseudonyms_family_idx').on(t.familyId),
    check('family_pseudonyms_kind_ck', sql`${t.subjectKind} in ('parent','child','family')`),
  ],
);

/**
 * Append-only. INSERT and SELECT only for the runtime role, which owns nothing.
 *
 * Carries NO foreign keys by design. A referential action executes as the
 * referencing table's owner rather than the invoking role, so an ON DELETE
 * CASCADE from `families` would have deleted audit rows straight through the
 * privilege check. Opaque pseudonyms remove that path entirely.
 */
export const auditEvents = pgTable(
  'audit_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    actorPseudonym: uuid('actor_pseudonym').notNull(),
    subjectPseudonym: uuid('subject_pseudonym'),
    eventType: text('event_type').notNull(),
    entityType: text('entity_type').notNull(),
    entityId: uuid('entity_id'),
    /** Which severity authorised the access. Null for denials. */
    authorisingSeverity: text('authorising_severity'),
    outcome: text('outcome').notNull(),
    metadata: jsonb('metadata').notNull().default(sql`'{}'::jsonb`),
    createdAt: now(),
  },
  (t) => [
    index('audit_actor_idx').on(t.actorPseudonym, t.createdAt),
    index('audit_entity_idx').on(t.entityType, t.entityId),
    check('audit_outcome_ck', sql`${t.outcome} in ('granted','delivered','denied')`),
  ],
);

// ── Feedback ─────────────────────────────────────────────────────────────────

export const messageFeedback = pgTable(
  'message_feedback',
  {
    messageId: uuid('message_id').primaryKey().references(() => messages.id, { onDelete: 'cascade' }),
    score: smallint('score').notNull(),
    createdAt: now(),
  },
  (t) => [check('message_feedback_score_ck', sql`${t.score} in (-1, 1)`)],
);

// ── Authentication ───────────────────────────────────────────────────────────
// Parents authenticate through Better Auth. Children do NOT: see
// docs/decisions/0004-child-principal.md.

/** Better Auth's own tables, owned by the library. */
export const authUsers = pgTable('auth_users', {
  id: text('id').primaryKey(),
  email: text('email').notNull().unique(),
  emailVerified: boolean('email_verified').notNull().default(false),
  name: text('name'),
  image: text('image'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const authSessions = pgTable(
  'auth_sessions',
  {
    id: text('id').primaryKey(),
    userId: text('user_id').notNull().references(() => authUsers.id, { onDelete: 'cascade' }),
    token: text('token').notNull().unique(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('auth_sessions_user_idx').on(t.userId)],
);

export const authAccounts = pgTable(
  'auth_accounts',
  {
    id: text('id').primaryKey(),
    userId: text('user_id').notNull().references(() => authUsers.id, { onDelete: 'cascade' }),
    accountId: text('account_id').notNull(),
    providerId: text('provider_id').notNull(),
    accessToken: text('access_token'),
    refreshToken: text('refresh_token'),
    accessTokenExpiresAt: timestamp('access_token_expires_at', { withTimezone: true }),
    refreshTokenExpiresAt: timestamp('refresh_token_expires_at', { withTimezone: true }),
    scope: text('scope'),
    idToken: text('id_token'),
    password: text('password'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('auth_accounts_user_idx').on(t.userId)],
);

export const authVerifications = pgTable('auth_verifications', {
  id: text('id').primaryKey(),
  identifier: text('identifier').notNull(),
  value: text('value').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Child sessions. Opaque 256-bit token, stored as a SHA-256 hash so a database
 * read cannot impersonate a child. Revocation is a row delete, which is what
 * consent withdrawal, PIN lockout and guardian removal all require.
 */
export const childSessions = pgTable(
  'child_sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    childId: uuid('child_id').notNull().references(() => children.id, { onDelete: 'cascade' }),
    familyId: uuid('family_id').notNull().references(() => families.id, { onDelete: 'restrict' }),
    tokenHash: text('token_hash').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull().defaultNow(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    revokedReason: text('revoked_reason'),
    createdAt: now(),
  },
  (t) => [
    uniqueIndex('child_sessions_token_uq').on(t.tokenHash),
    index('child_sessions_child_idx').on(t.childId),
    check('child_sessions_revoked_ck', sql`(${t.revokedAt} is null) = (${t.revokedReason} is null)`),
  ],
);

/**
 * Login attempts, per IP and per identifier.
 *
 * Per-child lockout alone does not stop an attacker spreading a common PIN
 * across many accounts: each account sees one failure and never locks. The
 * login route is not an AI-invoking path, so Phase 7's quota middleware does
 * not cover it either.
 */
export const loginAttempts = pgTable(
  'login_attempts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ipHash: text('ip_hash').notNull(),
    /**
     * NOT a foreign key. This records what was ATTEMPTED, not a reference to a
     * real family — an attacker probing family codes must be recorded and
     * throttled, and an FK here made those exact attempts throw instead. Same
     * reasoning as audit_events carrying no foreign keys.
     */
    familyId: uuid('family_id'),
    identifier: text('identifier'),
    succeeded: boolean('succeeded').notNull(),
    createdAt: now(),
  },
  (t) => [
    index('login_attempts_ip_idx').on(t.ipHash, t.createdAt),
    index('login_attempts_family_idx').on(t.familyId, t.createdAt),
  ],
);

// ── Quota ────────────────────────────────────────────────────────────────────

export const quotaEvents = pgTable(
  'quota_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    childId: uuid('child_id').notNull().references(() => children.id, { onDelete: 'cascade' }),
    familyId: uuid('family_id').notNull().references(() => families.id, { onDelete: 'cascade' }),
    createdAt: now(),
  },
  (t) => [index('quota_events_child_idx').on(t.childId, t.createdAt)],
);

/**
 * The per-family daily ceiling, as a row that can be incremented atomically.
 *
 * A counter you read and then write is a race: two concurrent requests both
 * observe limit-1 and both proceed. The guarded UPDATE in quota/limiter.ts
 * enforces the ceiling inside the statement instead.
 */
export const familyDailyQuota = pgTable(
  'family_daily_quota',
  {
    familyId: uuid('family_id').notNull().references(() => families.id, { onDelete: 'cascade' }),
    day: date('day').notNull(),
    countUsed: integer('count_used').notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.familyId, t.day] })],
);
