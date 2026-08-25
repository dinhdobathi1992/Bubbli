/**
 * Provider contract.
 *
 * Two providers are first-class today (DeepSeek, Bedrock AgentCore) and more
 * are expected. The seam exists so adding one is a file, not a refactor.
 *
 * `signal` is REQUIRED, not optional. The reviewed prior art raced a setTimeout
 * against the provider promise with no AbortController, so a "timed out" call
 * ran to completion: tokens billed, connection held, result discarded.
 */
import type { Provider } from '@/config/settings';

export interface GenerateInput {
  systemPrompt: string;
  history: Array<{ role: 'child' | 'assistant'; content: string }>;
  userMessage: string;
  maxTokens: number;
}

export interface AIResponse {
  content: string;
  provider: Provider;
  model: string;
  latencyMs: number;
  inputTokens?: number;
  outputTokens?: number;
}

export interface AIProvider {
  readonly name: Provider;
  readonly model: string;
  /** Generate a COMPLETE response. Buffered by design: nothing reaches a child ungated. */
  generateBuffered(input: GenerateInput, signal: AbortSignal): Promise<AIResponse>;
}

/** Distinguishable so the router can decide whether falling back is worthwhile. */
export class ProviderError extends Error {
  constructor(
    readonly provider: Provider,
    readonly kind: 'timeout' | 'aborted' | 'rate_limited' | 'auth' | 'transport' | 'bad_response',
    message: string,
  ) {
    super(message);
    this.name = 'ProviderError';
  }

  /** Auth failures do not improve on retry; everything else might. */
  get retryable(): boolean {
    return this.kind !== 'auth' && this.kind !== 'aborted';
  }
}
