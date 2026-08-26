/**
 * The shared vocabulary: age bands, severities, provider names.
 *
 * Deliberately SEPARATE from `settings.ts`, and deliberately free of any
 * `process.env` access, because both the server and the browser need these
 * words. A client component that imported them from `settings.ts` pulled the
 * whole validated-config module into the browser bundle, where none of the
 * server variables exist — so Zod validation failed and the page crashed on
 * "[config] Startup configuration is invalid".
 *
 * It failed safe, but only by accident. Had validation passed, server
 * configuration would have been shipped to the client instead.
 */

/** Providers the application can route generation through. */
export const PROVIDERS = ['deepseek', 'bedrock'] as const;
export type Provider = (typeof PROVIDERS)[number];

/** Transports that can carry an email. */
export const EMAIL_PROVIDERS = ['resend', 'ses'] as const;
export type EmailProvider = (typeof EMAIL_PROVIDERS)[number];

/** Age bands, split at the COPPA-13 boundary (validation decision V8). */
export const AGE_BANDS = ['4-7', '8-11', '12', '13-15'] as const;
export type AgeBand = (typeof AGE_BANDS)[number];

/** Severity ladder. `medium` and above open a transcript to a parent. */
export const SEVERITIES = ['info', 'low', 'medium', 'high', 'critical'] as const;
export type Severity = (typeof SEVERITIES)[number];
