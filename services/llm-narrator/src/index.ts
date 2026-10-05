// llm-narrator service.
// Subscribes to integrity/trust/+, runs the provider chain on each update
// (per-source debounced to 1s), publishes a 3-bullet trace on
// integrity/narration/{source_id}.

import mqtt from 'mqtt';
import {
  TrustScorePayloadSchema,
  narrationTopic,
  trustTopic,
  TOPIC_TRUST_PREFIX,
  type TrustScorePayload,
} from '@hamilton/contracts';
import { deterministicProvider } from './providers/deterministic.js';
import { makeAnthropicProvider } from './providers/anthropic.js';
import { makeLocalProvider } from './providers/local.js';
import type { NarrationOutput, Provider } from './types.js';

const PROVIDER_TIMEOUT_MS = 2_000;
const PER_SOURCE_DEBOUNCE_MS = 1_000;

function buildChain(): Provider[] {
  const chain: Provider[] = [];
  const apiKey = process.env.ANTHROPIC_API_KEY;
  const claudeModel = process.env.ANTHROPIC_MODEL ?? 'claude-3-5-sonnet-latest';
  if (apiKey) chain.push(makeAnthropicProvider(apiKey, claudeModel));

  const ollamaUrl = process.env.OLLAMA_URL;
  const ollamaModel = process.env.OLLAMA_MODEL ?? 'llama3.2:3b';
  if (ollamaUrl) chain.push(makeLocalProvider(ollamaUrl, ollamaModel));

  chain.push(deterministicProvider);
  return chain;
}

async function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    return await p;
  } finally {
    clearTimeout(timer);
  }
}

async function narrate(
  payload: TrustScorePayload,
  chain: Provider[],
): Promise<NarrationOutput> {
  for (const provider of chain) {
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), PROVIDER_TIMEOUT_MS);
      try {
        const bullets = await provider.narrate(
          {
            source_id: payload.source_id,
            components: payload.components,
            score: payload.score,
            context: payload,
          },
          ctrl.signal,
        );
        return { source_id: payload.source_id, bullets, provider: provider.name };
      } finally {
        clearTimeout(timer);
      }
    } catch (err) {
      process.stderr.write(
        `provider ${provider.name} failed: ${(err as Error).message}\n`,
      );
    }
  }
  // The deterministic provider can't fail in practice, but TypeScript needs us to
  // be exhaustive.
  return {
    source_id: payload.source_id,
    bullets: [`${payload.source_id} narration unavailable`],
    provider: 'deterministic',
  };
}

async function main(): Promise<void> {
  const broker = process.env.MQTT_BROKER_URL ?? 'mqtt://localhost:1883';
  const chain = buildChain();
  process.stdout.write(
    `llm-narrator chain: ${chain.map((p) => p.name).join(' -> ')}\n`,
  );

  const client = mqtt.connect(broker, {
    clientId: 'hamilton-llm-narrator',
    keepalive: 30,
  });

  const lastEmitted = new Map<string, number>();

  client.on('connect', () => {
    process.stdout.write(`llm-narrator connected: ${broker}\n`);
    client.subscribe(`${TOPIC_TRUST_PREFIX}/+`);
  });

  client.on('message', async (topic, raw) => {
    if (!topic.startsWith(`${TOPIC_TRUST_PREFIX}/`)) return;
    let json: unknown;
    try {
      json = JSON.parse(raw.toString());
    } catch {
      return;
    }
    const parsed = TrustScorePayloadSchema.safeParse(json);
    if (!parsed.success) return;

    const now = Date.now();
    const last = lastEmitted.get(parsed.data.source_id) ?? 0;
    if (now - last < PER_SOURCE_DEBOUNCE_MS) return;
    lastEmitted.set(parsed.data.source_id, now);

    const out = await narrate(parsed.data, chain);
    client.publish(narrationTopic(out.source_id), JSON.stringify(out));
  });
}

void withTimeout(main(), 60_000).catch((err) => {
  process.stderr.write(`startup error: ${(err as Error).message}\n`);
  process.exit(1);
});
