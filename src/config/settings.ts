/**
 * The ONLY module permitted to read `process.env`.
 *
 * Enforced by the `no-restricted-properties` ESLint rule (see eslint.config.mjs).
 * Release gate G8. The prior-art review found three settings that bypassed
 * validation by reading process.env directly, one of which silently disabled a
 * safety check in production.
 */
import { z } from 'zod';

/**
 * Providers the application can route generation through.
 *
 * Deliberately open-ended: DeepSeek and Bedrock (AgentCore) are first-class
 * today, and further layers (litellm, qwen, codex) are expected. Adding one
 * means adding it here and to PROVIDER_COMPLIANCE below, nothing more.
 */
export const PROVIDERS = ['deepseek', 'bedrock'] as const;
export type Provider = (typeof PROVIDERS)[number];

/** Age bands, split at the COPPA-13 boundary (validation decision V8). */
export const AGE_BANDS = ['4-7', '8-11', '12', '13-15'] as const;
export type AgeBand = (typeof AGE_BANDS)[number];

/** Severity ladder. `medium` and above open a transcript to a parent. */
export const SEVERITIES = ['info', 'low', 'medium', 'high', 'critical'] as const;
export type Severity = (typeof SEVERITIES)[number];

const csv = <T extends readonly [string, ...string[]]>(values: T) =>
  z
    .string()
    .transform((s) => s.split(',').map((p) => p.trim()).filter(Boolean))
    .pipe(z.array(z.enum(values)).min(1));

const schema = z.object({
  // ── App ────────────────────────────────────────────────────────────────
  APP_ENV: z.enum(['development', 'test', 'production']).default('development'),
  APP_PORT: z.coerce.number().int().positive().default(3000),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),

  // ── Data ───────────────────────────────────────────────────────────────
  /** Runtime role. Owns no tables; INSERT/SELECT only on audit_events. */
  DATABASE_URL: z.string().url(),
  /** Migration/owner role. CI and drizzle-kit only, never the running app. */
  DATABASE_MIGRATION_URL: z.string().url().optional(),

  // ── AI providers ───────────────────────────────────────────────────────
  /** Priority order. The router falls back left to right. */
  AI_PROVIDER_ORDER: csv(PROVIDERS).default(['deepseek']),
  AI_TIMEOUT_MS: z.coerce.number().int().positive().default(30_000),
  AI_MAX_OUTPUT_TOKENS: z.coerce.number().int().positive().default(512),

  DEEPSEEK_API_KEY: z.string().min(1).optional(),
  DEEPSEEK_BASE_URL: z.string().url().default('https://api.deepseek.com'),
  DEEPSEEK_MODEL: z.string().default('deepseek-chat'),

  AWS_REGION: z.string().default('ap-southeast-1'),
  /** Bedrock AgentCore runtime ARN. Not a raw inference profile. */
  BEDROCK_AGENT_RUNTIME_ARN: z.string().optional(),
  BEDROCK_MODEL_ID: z.string().optional(),

  // ── Parent authentication ──────────────────────────────────────────────
  /** Better Auth signing secret. Never logged, never sent to a client. */
  BETTER_AUTH_SECRET: z.string().min(32).optional(),
  /** Absolute origin. Also makes notification deep links resolvable in email. */
  APP_ORIGIN: z.string().url().default('http://localhost:3000'),
  /** Minutes an emailed sign-in code stays valid. */
  PARENT_OTP_TTL_MIN: z.coerce.number().int().positive().default(10),

  // ── Email delivery — AWS SES over SMTP ─────────────────────────────────
  /**
   * SES SMTP endpoint. Absent in development: messages go to the server log.
   *
   * SES SMTP credentials are NOT an IAM access key pair — the password is
   * derived from a secret key, so the SESv2 HTTPS API (which needs SigV4) is
   * not reachable with them. SMTP is the correct interface for these.
   */
  SES_SMTP_HOST: z.string().min(1).optional(),
  SES_SMTP_PORT: z.coerce.number().int().positive().default(587),
  SES_SMTP_USER: z.string().min(1).optional(),
  SES_SMTP_PASSWORD: z.string().min(1).optional(),
  /** Must be an identity SES has verified, or every send is rejected. */
  EMAIL_FROM: z.string().default('Bubbli <no-reply@bubbli.local>'),

  // ── Child device pairing ───────────────────────────────────────────────
  /** Minutes a parent-issued pairing code stays valid. */
  DEVICE_PAIRING_TTL_MIN: z.coerce.number().int().positive().default(15),
  /** Days a paired device may sign a child in without a PIN. */
  DEVICE_TRUST_DAYS: z.coerce.number().int().positive().default(30),

  // ── Safety ─────────────────────────────────────────────────────────────
  SAFETY_ENABLED: z.stringbool().default(true),
  /** Layer 2. Fail-closed when unavailable (Phase 2). */
  SAFETY_CLASSIFIER_ENABLED: z.stringbool().default(false),

  // ── Quota (library + datastore chosen in Phase 1, see decision 0003) ───
  QUOTA_PER_CHILD_PER_MIN: z.coerce.number().int().positive().default(10),
  QUOTA_PER_FAMILY_PER_DAY: z.coerce.number().int().positive().default(100),

  // ── Retention, in days (validation decision V5) ─────────────────────────
  RETENTION_CONTENT_DAYS: z.coerce.number().int().positive().default(90),
  RETENTION_FLAGS_DAYS: z.coerce.number().int().positive().default(365),
  RETENTION_AUDIT_DAYS: z.coerce.number().int().positive().default(730),
});

/**
 * Which providers are cleared to receive production child data.
 *
 * PRD §13 forbids sending children's conversations to a processor without a
 * DPA and zero-retention terms. Rather than hardcoding a ban on one provider
 * name, the constraint is expressed as the principle it comes from, so it keeps
 * holding as providers are added.
 *
 * Flip a provider to `true` ONLY when release gate G9 has been satisfied for
 * it: DPA and zero retention confirmed in writing, recorded in
 * docs/decisions/0002-compliance-premises.md.
 */
export const PROVIDER_COMPLIANCE: Record<Provider, { productionCleared: boolean; note: string }> = {
  deepseek: {
    productionCleared: false,
    note: 'No DPA and no zero-retention terms on file. Development and evaluation only.',
  },
  bedrock: {
    productionCleared: false,
    note: 'Pending G9: model access, a real inference call in the residency region, and DPA + ZDR in writing.',
  },
};

/**
 * Whether a layer-2 classifier client is actually wired into the pipeline.
 *
 * Flip to `true` in the same commit that supplies a real `ClassifierClient`.
 * Kept explicit rather than inferred so that enabling the layer is a deliberate
 * two-part act, not something a stray env var can do on its own.
 */
const CLASSIFIER_CLIENT_AVAILABLE = false;

function load() {
  const parsed = schema.safeParse(process.env);

  if (!parsed.success) {
    console.error('[config] Startup configuration is invalid:');
    for (const issue of parsed.error.issues) {
      console.error(`  [${issue.path.join('.') || '(root)'}] ${issue.message}`);
    }
    process.exit(1);
  }

  const s = parsed.data;

  // Every provider in the active chain must have credentials.
  const missing = s.AI_PROVIDER_ORDER.filter((p) =>
    p === 'deepseek'
      ? !s.DEEPSEEK_API_KEY
      : !s.BEDROCK_AGENT_RUNTIME_ARN && !s.BEDROCK_MODEL_ID,
  );
  if (missing.length > 0) {
    console.error(`[config] Provider(s) in AI_PROVIDER_ORDER lack credentials: ${missing.join(', ')}`);
    process.exit(1);
  }

  // Layer 2 is wired to a `null` client in the pipeline, and `classify()`
  // fail-closes on a null client by returning `passed:false, severity:'medium'`.
  // Turning this on therefore blocks EVERY message that passed layer 1 and
  // raises a `medium` flag on it — and `medium` is the threshold that opens a
  // transcript to a parent. A well-meant "enable the safety layer before
  // launch" would deflect every homework question and expose every innocuous
  // conversation. Refuse to start rather than fail that way silently.
  if (s.SAFETY_CLASSIFIER_ENABLED && !CLASSIFIER_CLIENT_AVAILABLE) {
    console.error(
      '[config] SAFETY_CLASSIFIER_ENABLED is true but no classifier client is wired.',
    );
    console.error(
      '  classify() fail-closes on a null client, so every message that passes layer 1',
    );
    console.error(
      "  would be blocked at 'medium' — the severity that opens a transcript to a parent.",
    );
    console.error('  Wire a ClassifierClient in src/lib/chat/pipeline.ts before enabling this.');
    process.exit(1);
  }

  // PRD §13 gate. Production refuses to start while any provider in the chain
  // is uncleared for child data. This replaces the plan's hardcoded
  // "production + deepseek exits non-zero" assertion with the rule it encoded.
  if (s.APP_ENV === 'production') {
    const uncleared = s.AI_PROVIDER_ORDER.filter((p) => !PROVIDER_COMPLIANCE[p].productionCleared);
    if (uncleared.length > 0) {
      console.error('[config] Refusing to start in production. Provider(s) not cleared for child data:');
      for (const p of uncleared) console.error(`  ${p}: ${PROVIDER_COMPLIANCE[p].note}`);
      console.error('  See release gate G9 and docs/decisions/0002-compliance-premises.md');
      process.exit(1);
    }
  }

  return s;
}

export const settings = load();
export type Settings = typeof settings;
