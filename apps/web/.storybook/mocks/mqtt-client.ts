// Storybook stand-in for src/lib/mqtt-client.ts (swapped in via webpack
// alias in .storybook/main.ts). No broker, no `mqtt` package: it replays the
// Avdiivka crescendo into the same bindings the real client feeds, so the
// page-level stories exercise the real store + useHamiltonMqtt wiring.

import type { MqttBindings, MqttClientHandle, Narration } from '../../src/lib/mqtt-client';
import {
  B_DECAY_PAYLOADS,
  CANDIDATES_PAYLOAD,
  TRACE_BULLETS,
} from '../../src/stories/fixtures/avdiivka';

export type { MqttBindings, MqttClientHandle, Narration };

export type MqttScript = 'silent' | 'crescendo' | 'unreachable';

declare global {
  interface Window {
    __HAMILTON_STORY_MQTT__?: { script: MqttScript; tickMs: number };
  }
}

export function startMqtt(_url: string, bindings: MqttBindings): MqttClientHandle {
  const cfg =
    (typeof window !== 'undefined' && window.__HAMILTON_STORY_MQTT__) || {
      script: 'silent' as MqttScript,
      tickMs: 1000,
    };
  const timers: ReturnType<typeof setTimeout>[] = [];
  const later = (ms: number, fn: () => void) => timers.push(setTimeout(fn, ms));

  if (cfg.script === 'unreachable') {
    later(0, () => bindings.onConnectionChange?.(false));
  } else {
    later(0, () => bindings.onConnectionChange?.(true));
  }

  if (cfg.script === 'crescendo') {
    B_DECAY_PAYLOADS.forEach((payload, i) => {
      later((i + 1) * cfg.tickMs, () => {
        // Re-stamp so the store sees fresh timestamps on replay.
        bindings.onTrust({ ...payload, timestamp: new Date().toISOString() });
        const bullets =
          payload.score < 0.55 ? 3 : payload.score < 0.7 ? 2 : payload.score < 0.9 ? 1 : 0;
        if (bullets > 0) {
          bindings.onNarration({
            source_id: 'unit_b',
            bullets: TRACE_BULLETS.slice(0, bullets),
            provider: 'claude',
          });
        }
        if (payload.score <= 0.61 && payload.score > 0.55) {
          bindings.onCandidates({ ...CANDIDATES_PAYLOAD, timestamp: new Date().toISOString() });
        }
      });
    });
  }

  return {
    disconnect: () => timers.forEach(clearTimeout),
  };
}
