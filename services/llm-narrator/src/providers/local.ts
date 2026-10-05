import type { NarrationInput, Provider } from '../types.js';

const SYSTEM_PROMPT = `You are a trust-trace narrator. Reply with valid JSON only:
{"bullets": ["...", "...", "..."]}

The bullets describe the current trust state from the components payload.
Every component is in [0,1] where 1.0 = healthy; a low fingerprint value means
a strong jammer-profile match (fingerprint = 1 - overlap ratio). Each bullet must reference a value in the payload. No predictions, no
probability, no classification — this is a measurement instrument.`;

interface OllamaResponse {
  response: string;
}

export function makeLocalProvider(url: string, model: string): Provider {
  return {
    name: 'local',
    async narrate(input: NarrationInput, signal: AbortSignal): Promise<string[]> {
      const userPrompt = `Components: ${JSON.stringify(input.components)}\nSource: ${input.source_id}\nScore: ${input.score}\n\nEmit JSON.`;
      const res = await fetch(`${url}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal,
        body: JSON.stringify({
          model,
          prompt: `${SYSTEM_PROMPT}\n\n${userPrompt}`,
          stream: false,
          format: 'json',
        }),
      });
      if (!res.ok) throw new Error(`ollama ${res.status}`);
      const body = (await res.json()) as OllamaResponse;
      const parsed = JSON.parse(body.response) as { bullets?: string[] };
      if (!Array.isArray(parsed.bullets)) {
        throw new Error('local provider returned no bullets');
      }
      return parsed.bullets.slice(0, 3);
    },
  };
}
