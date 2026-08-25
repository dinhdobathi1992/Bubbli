/**
 * Layer 2: the model classifier.
 *
 * Restored per §0b R1. The plan had dropped it on the rationale "Phase-1
 * guardrails are regex, so no ML runtime is needed" — which PRD.md:267 refutes
 * directly: a classifier is an HTTP call, not a runtime. Dropping it while
 * keeping a recall target regex alone cannot reach was the deadlock the red team
 * found.
 *
 * Two properties are non-negotiable:
 *
 *   FAIL-CLOSED. A throw, a timeout, a non-JSON body, or a shape that does not
 *   validate all return BLOCKED. The reviewed prior art treated classifier
 *   failure as "assume safe", which makes the layer worthless exactly when it is
 *   under stress.
 *
 *   NEVER RUNS WHEN LAYER 1 ALREADY MATCHED. Layer 1 is free and deterministic;
 *   spending a model call to re-confirm a decision already made would double
 *   latency on the request path for nothing.
 */
import type { AgeBand, Severity } from '@/config/settings';
import type { Category } from './rules';

export interface ClassifierVerdict {
  passed: boolean;
  category: Category | null;
  severity: Severity | null;
  reason: string;
  /** True when the verdict came from the fail-closed path, not the model. */
  failedClosed: boolean;
}

export interface ClassifierClient {
  /** Returns raw model text. Implementations are provided by Phase 4's router. */
  complete(input: { system: string; user: string; timeoutMs: number }): Promise<string>;
}

const SYSTEM_PROMPT = `You are a child-safety classifier for an AI tutor used by children aged 4 to 15.
Decide whether the text is safe for a child of the stated age band.

Reply with ONLY a JSON object, no prose:
{"safe": true|false, "category": null|"harmful_intent"|"inappropriate_request"|"disclosure"|"content_filter"|"emotional_safety", "severity": null|"info"|"low"|"medium"|"high"|"critical", "reason": "<=15 words"}

Be conservative about self-harm, eating disorders, and a child reporting that an
adult asked them to keep secrets, send photos, or meet alone. Ordinary homework
about biology, history, or literature is SAFE even when it mentions death,
anatomy, or violence in context.`;

const VALID_CATEGORIES = new Set([
  'harmful_intent',
  'inappropriate_request',
  'disclosure',
  'content_filter',
  'emotional_safety',
]);
const VALID_SEVERITIES = new Set(['info', 'low', 'medium', 'high', 'critical']);

function failClosed(reason: string): ClassifierVerdict {
  return {
    passed: false,
    category: 'content_filter',
    severity: 'medium',
    reason: `Classifier unavailable, failing closed: ${reason}`,
    failedClosed: true,
  };
}

/**
 * Run the classifier. Callers MUST only reach this when layer 1 passed.
 *
 * @param enabled  `SAFETY_CLASSIFIER_ENABLED`. When false the layer is skipped
 *                 entirely and the caller keeps layer 1's verdict — this is a
 *                 deliberate configuration, not a failure, so it does not
 *                 fail closed.
 */
export async function classify(
  text: string,
  ageBand: AgeBand,
  client: ClassifierClient | null,
  opts: { enabled: boolean; timeoutMs?: number } = { enabled: true },
): Promise<ClassifierVerdict | null> {
  if (!opts.enabled) return null;
  if (!client) return failClosed('no classifier client configured');

  let raw: string;
  try {
    raw = await client.complete({
      system: SYSTEM_PROMPT,
      user: `Age band: ${ageBand}\nText: ${text}`,
      timeoutMs: opts.timeoutMs ?? 5_000,
    });
  } catch (err) {
    return failClosed(err instanceof Error ? err.message : 'call threw');
  }

  let parsed: unknown;
  try {
    // Models wrap JSON in prose or fences often enough to be worth handling.
    const start = raw.indexOf('{');
    const end = raw.lastIndexOf('}');
    if (start === -1 || end === -1 || end <= start) return failClosed('no JSON object in response');
    parsed = JSON.parse(raw.slice(start, end + 1));
  } catch {
    return failClosed('response was not valid JSON');
  }

  const v = parsed as Record<string, unknown>;
  if (typeof v.safe !== 'boolean') return failClosed('response missing boolean "safe"');

  if (v.safe === true) {
    return { passed: true, category: null, severity: null, reason: 'classifier: safe', failedClosed: false };
  }

  const category = typeof v.category === 'string' && VALID_CATEGORIES.has(v.category) ? (v.category as Category) : 'content_filter';
  const severity = typeof v.severity === 'string' && VALID_SEVERITIES.has(v.severity) ? (v.severity as Severity) : 'medium';

  return {
    passed: false,
    category,
    severity,
    reason: typeof v.reason === 'string' ? v.reason.slice(0, 200) : 'classifier: unsafe',
    failedClosed: false,
  };
}
