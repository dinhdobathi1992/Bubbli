/**
 * AWS Bedrock provider, targeting the AgentCore agent runtime rather than a
 * raw inference profile.
 *
 * NOT USABLE UNTIL G9. Model access, a real inference call in the residency
 * region, service quotas and DPA + zero-retention terms are all unverified, and
 * the AWS identity available during Phase 1 was denied even
 * `bedrock:ListFoundationModels`. The provider is implemented so wiring it is a
 * configuration change rather than a build, and it fails loudly rather than
 * silently degrading if selected before the premises hold.
 */
import { settings, PROVIDER_COMPLIANCE } from '@/config/settings';
import { ProviderError, type AIProvider, type GenerateInput, type AIResponse } from './provider';

export function createBedrockProvider(): AIProvider {
  return {
    name: 'bedrock',
    model: settings.BEDROCK_AGENT_RUNTIME_ARN ?? settings.BEDROCK_MODEL_ID ?? 'bedrock-unconfigured',

    async generateBuffered(input: GenerateInput, signal: AbortSignal): Promise<AIResponse> {
      if (!settings.BEDROCK_AGENT_RUNTIME_ARN && !settings.BEDROCK_MODEL_ID) {
        throw new ProviderError(
          'bedrock',
          'auth',
          'Bedrock is not configured. Set BEDROCK_AGENT_RUNTIME_ARN, and satisfy G9 before ' +
            'routing child data here: ' + PROVIDER_COMPLIANCE.bedrock.note,
        );
      }

      const started = Date.now();

      // AgentCore invocation. Credentials come from the ambient AWS chain
      // (IAM role in deployment, SSO profile locally) rather than being
      // threaded through config, so no long-lived key exists to leak.
      // Resolved at runtime through a computed specifier: the SDK is
      // deliberately NOT a dependency until G9 is satisfied, so it must not be
      // a compile-time import either. Installing it before the DPA exists
      // would imply a readiness the project does not have.
      const specifier = ['@aws-sdk', 'client-bedrock-agentcore'].join('/');
      type AgentCoreModule = {
        BedrockAgentCoreClient: new (cfg: { region: string }) => {
          send: (cmd: unknown, opts?: { abortSignal?: AbortSignal }) => Promise<{ response?: Uint8Array }>;
        };
        InvokeAgentRuntimeCommand: new (input: { agentRuntimeArn: string; payload: Uint8Array }) => unknown;
      };
      let mod: AgentCoreModule;
      try {
        mod = (await import(/* webpackIgnore: true */ specifier)) as unknown as AgentCoreModule;
      } catch {
        throw new ProviderError(
          'bedrock',
          'transport',
          'AgentCore SDK not installed. Add @aws-sdk/client-bedrock-agentcore once G9 is satisfied.',
        );
      }
      const { BedrockAgentCoreClient, InvokeAgentRuntimeCommand } = mod;

      const client = new BedrockAgentCoreClient({ region: settings.AWS_REGION });

      const prompt = [
        input.systemPrompt,
        ...input.history.map((m) => `${m.role === 'child' ? 'Child' : 'Assistant'}: ${m.content}`),
        `Child: ${input.userMessage}`,
      ].join('\n\n');

      try {
        const out = await client.send(
          new InvokeAgentRuntimeCommand({
            agentRuntimeArn: settings.BEDROCK_AGENT_RUNTIME_ARN!,
            payload: new TextEncoder().encode(JSON.stringify({ prompt, maxTokens: input.maxTokens })),
          }),
          { abortSignal: signal },
        );

        const raw = out.response ? new TextDecoder().decode(out.response as Uint8Array) : '';
        const content = (() => {
          try {
            const j = JSON.parse(raw) as { output?: string; completion?: string };
            return j.output ?? j.completion ?? raw;
          } catch {
            return raw;
          }
        })();

        if (!content) throw new ProviderError('bedrock', 'bad_response', 'Empty response');

        return {
          content,
          provider: 'bedrock',
          model: settings.BEDROCK_AGENT_RUNTIME_ARN!,
          latencyMs: Date.now() - started,
        };
      } catch (err) {
        if (err instanceof ProviderError) throw err;
        if (signal.aborted) throw new ProviderError('bedrock', 'aborted', 'Request aborted');
        const name = (err as { name?: string })?.name ?? '';
        if (/AccessDenied|UnrecognizedClient/i.test(name)) {
          throw new ProviderError('bedrock', 'auth', `${name}: G9 is not satisfied`);
        }
        if (/Throttling|TooManyRequests/i.test(name)) {
          throw new ProviderError('bedrock', 'rate_limited', name);
        }
        throw new ProviderError('bedrock', 'transport', err instanceof Error ? err.message : 'unknown');
      }
    },
  };
}
