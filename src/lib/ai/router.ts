/**
 * Provider router: fallback plus circuit breaker.
 *
 * Red-team finding #6. PRD §6.2 and §12 both require the router to DEGRADE, not
 * merely abstract — "provider-agnostic router with fallback + circuit breaker",
 * and graceful degradation as the mitigation for provider outage. The plan had
 * built neither, spending the budget instead on a second provider that was
 * then fenced off.
 *
 * Every attempt is recorded in `ai_provider_attempts`, including failures,
 * timeouts and aborts, so an abandoned turn is visible in metrics rather than
 * silently absent.
 */
import type { Pool, PoolClient } from 'pg';
import { settings, type Provider } from '@/config/settings';
import { ProviderError, type AIProvider, type GenerateInput, type AIResponse } from './provider';
import { createDeepSeekProvider } from './deepseek';
import { createBedrockProvider } from './bedrock';

/** Shown to a child when every provider is unreachable. Warm, not technical. */
export const DEGRADED_RESPONSE =
  "I'm having a bit of trouble thinking right now. Can you try asking me again in a moment?";

const CB_FAILURE_THRESHOLD = 3;
const CB_OPEN_MS = 30_000;

interface BreakerState {
  failures: number;
  openedAt: number | null;
}

const breakers = new Map<Provider, BreakerState>();

function breaker(p: Provider): BreakerState {
  let s = breakers.get(p);
  if (!s) {
    s = { failures: 0, openedAt: null };
    breakers.set(p, s);
  }
  return s;
}

export function isCircuitOpen(p: Provider, now = Date.now()): boolean {
  const s = breaker(p);
  if (s.openedAt === null) return false;
  if (now - s.openedAt >= CB_OPEN_MS) {
    // Half-open: let one request through to test recovery.
    s.openedAt = null;
    s.failures = 0;
    return false;
  }
  return true;
}

function recordSuccess(p: Provider): void {
  const s = breaker(p);
  s.failures = 0;
  s.openedAt = null;
}

function recordFailure(p: Provider, now = Date.now()): void {
  const s = breaker(p);
  s.failures += 1;
  if (s.failures >= CB_FAILURE_THRESHOLD) s.openedAt = now;
}

/** Test seam. Never called by application code. */
export function resetBreakers(): void {
  breakers.clear();
}

function build(name: Provider): AIProvider {
  return name === 'deepseek' ? createDeepSeekProvider() : createBedrockProvider();
}

async function recordAttempt(
  db: Pool | PoolClient,
  row: {
    conversationId: string | null;
    messageId: string | null;
    provider: string;
    model: string;
    status: 'success' | 'failed' | 'timeout' | 'aborted';
    latencyMs: number;
    inputTokens?: number;
    outputTokens?: number;
    errorCode?: string;
  },
): Promise<void> {
  await db
    .query(
      `insert into ai_provider_attempts
         (conversation_id, message_id, provider, model, status, latency_ms, input_tokens, output_tokens, error_code)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [
        row.conversationId,
        row.messageId,
        row.provider,
        row.model,
        row.status,
        row.latencyMs,
        row.inputTokens ?? null,
        row.outputTokens ?? null,
        row.errorCode ?? null,
      ],
    )
    // Telemetry must never be the reason a child gets no answer.
    .catch(() => undefined);
}

export interface RouterResult {
  response: AIResponse | null;
  /** True when every provider failed and the caller should show DEGRADED_RESPONSE. */
  degraded: boolean;
  attempts: number;
}

export async function generateWithFallback(
  db: Pool | PoolClient,
  input: GenerateInput,
  ctx: { conversationId: string | null; messageId: string | null },
  signal: AbortSignal,
): Promise<RouterResult> {
  const order = settings.AI_PROVIDER_ORDER;
  let attempts = 0;

  for (const name of order) {
    if (isCircuitOpen(name)) continue;

    const provider = build(name);
    const started = Date.now();
    attempts += 1;

    // Per-provider deadline, so one slow provider cannot consume the whole
    // budget and leave no time for the fallback.
    const timer = new AbortController();
    const onAbort = () => timer.abort();
    signal.addEventListener('abort', onAbort, { once: true });
    const deadline = setTimeout(() => timer.abort(), settings.AI_TIMEOUT_MS);

    try {
      const response = await provider.generateBuffered(input, timer.signal);
      recordSuccess(name);
      await recordAttempt(db, {
        ...ctx,
        provider: name,
        model: provider.model,
        status: 'success',
        latencyMs: response.latencyMs,
        inputTokens: response.inputTokens,
        outputTokens: response.outputTokens,
      });
      return { response, degraded: false, attempts };
    } catch (err) {
      const latencyMs = Date.now() - started;
      const aborted = signal.aborted;
      const timedOut = !aborted && timer.signal.aborted;

      const status = aborted ? 'aborted' : timedOut ? 'timeout' : 'failed';
      const code = err instanceof ProviderError ? err.kind : 'unknown';

      await recordAttempt(db, {
        ...ctx,
        provider: name,
        model: provider.model,
        status,
        latencyMs,
        errorCode: code,
      });

      // A client that hung up is not a provider fault: do not trip the breaker
      // and do not try the next provider on their behalf.
      if (aborted) return { response: null, degraded: false, attempts };

      recordFailure(name);
      if (err instanceof ProviderError && !err.retryable) continue;
    } finally {
      clearTimeout(deadline);
      signal.removeEventListener('abort', onAbort);
    }
  }

  return { response: null, degraded: true, attempts };
}
