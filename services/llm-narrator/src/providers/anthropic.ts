import Anthropic from '@anthropic-ai/sdk';
import type { NarrationInput, Provider } from '../types';

const SYSTEM = `You are a trust-trace narrator for the Hamilton comms-integrity layer.

You will be invoked with a structured "components" payload describing four
deterministic detector outputs: temporal, stability, spatial, fingerprint.
Each is a score in [0,1] where 1.0 = healthy. For fingerprint, 1.0 means no
jammer profile matched and a low value means a strong jammer-profile match
(fingerprint = 1 - overlap ratio).

Your ONLY job is to call the emit_bullets function with three plain-English
bullets describing the current state. Each bullet MUST reference a value from
the components payload. NEVER invent facts not in the input. NEVER use words
like "predicted", "likely", "model", "classified", "probability", or
"confidence" — this is a measurement instrument, not a classifier.`;

const TOOL = {
  name: 'emit_bullets',
  description: 'Emit exactly three trust-trace bullets for the operator panel.',
  input_schema: {
    type: 'object',
    properties: {
      bullets: {
        type: 'array',
        items: { type: 'string' },
        minItems: 1,
        maxItems: 3,
      },
    },
    required: ['bullets'],
    additionalProperties: false,
  },
} as const;

export function makeAnthropicProvider(apiKey: string, model: string): Provider {
  const client = new Anthropic({ apiKey });
  return {
    name: 'claude',
    async narrate(input: NarrationInput, signal: AbortSignal): Promise<string[]> {
      const userJson = JSON.stringify({
        source_id: input.source_id,
        score: input.score,
        components: input.components,
      });

      const response = await client.messages.create(
        {
          model,
          max_tokens: 256,
          system: SYSTEM,
          tools: [TOOL],
          tool_choice: { type: 'tool', name: 'emit_bullets' },
          messages: [{ role: 'user', content: userJson }],
        },
        { signal },
      );

      for (const block of response.content) {
        if (block.type === 'tool_use' && block.name === 'emit_bullets') {
          const input_obj = block.input as { bullets?: string[] };
          if (Array.isArray(input_obj.bullets)) {
            return input_obj.bullets.slice(0, 3);
          }
        }
      }
      throw new Error('claude provider returned no tool_use block');
    },
  };
}
