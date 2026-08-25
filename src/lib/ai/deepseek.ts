/**
 * DeepSeek provider. OpenAI-compatible chat completions over plain fetch.
 *
 * Development and evaluation only until `PROVIDER_COMPLIANCE.deepseek` is
 * cleared: no DPA and no zero-retention terms are on file, and PRD §13 forbids
 * sending children's conversations to such a processor. The config module
 * refuses to start in production while that remains true.
 */
import { settings } from '@/config/settings';
import { ProviderError, type AIProvider, type GenerateInput, type AIResponse } from './provider';

export function createDeepSeekProvider(): AIProvider {
  return {
    name: 'deepseek',
    model: settings.DEEPSEEK_MODEL,

    async generateBuffered(input: GenerateInput, signal: AbortSignal): Promise<AIResponse> {
      const started = Date.now();

      const messages = [
        { role: 'system', content: input.systemPrompt },
        ...input.history.map((m) => ({
          role: m.role === 'child' ? 'user' : 'assistant',
          content: m.content,
        })),
        { role: 'user', content: input.userMessage },
      ];

      let res: Response;
      try {
        res = await fetch(`${settings.DEEPSEEK_BASE_URL}/chat/completions`, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            authorization: `Bearer ${settings.DEEPSEEK_API_KEY}`,
          },
          body: JSON.stringify({
            model: settings.DEEPSEEK_MODEL,
            messages,
            max_tokens: input.maxTokens,
            temperature: 0.6,
            stream: false,
          }),
          // The signal really cancels the socket, which is the whole point.
          signal,
        });
      } catch (err) {
        if (signal.aborted) throw new ProviderError('deepseek', 'aborted', 'Request aborted');
        throw new ProviderError('deepseek', 'transport', err instanceof Error ? err.message : 'fetch failed');
      }

      if (res.status === 401 || res.status === 403) {
        throw new ProviderError('deepseek', 'auth', `Auth rejected (${res.status})`);
      }
      if (res.status === 429) {
        throw new ProviderError('deepseek', 'rate_limited', 'Rate limited');
      }
      if (!res.ok) {
        throw new ProviderError('deepseek', 'transport', `HTTP ${res.status}`);
      }

      let body: unknown;
      try {
        body = await res.json();
      } catch {
        throw new ProviderError('deepseek', 'bad_response', 'Response was not JSON');
      }

      const b = body as {
        choices?: Array<{ message?: { content?: string } }>;
        usage?: { prompt_tokens?: number; completion_tokens?: number };
      };
      const content = b.choices?.[0]?.message?.content;
      if (typeof content !== 'string' || content.length === 0) {
        throw new ProviderError('deepseek', 'bad_response', 'No content in response');
      }

      return {
        content,
        provider: 'deepseek',
        model: settings.DEEPSEEK_MODEL,
        latencyMs: Date.now() - started,
        inputTokens: b.usage?.prompt_tokens,
        outputTokens: b.usage?.completion_tokens,
      };
    },
  };
}
