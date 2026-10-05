// Storybook stand-in for src/lib/mqtt-client.ts (swapped in via webpack
// alias in .storybook/main.ts). No broker, no `mqtt` package: it replays the
// Avdiivka crescendo into the same bindings the real client feeds, so the
// page-level stories exercise the real store + useHamiltonMqtt wiring.

import type { MqttBindings, MqttClientHandle, Narration } from '../../src/lib/mqtt-client';
import {
  CANDIDATES_PAYLOAD,
  CRESCENDO_STEPS,
  TRACE_BULLETS,
} from '../../src/stories/fixtures/avdiivka';
import { ab1001, ab1002 } from '../../src/stories/fixtures/missions';

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
    // One engine beat per tick (0:00, 0:45, 0:55, 1:05, 1:15, 1:20), with the
    // A/B/C payloads the fixed engine (PR #1) publishes at that beat. B is WATCH
    // from 0:45 and drops below the GPS-guided TSS minimum at 1:15 (0.65 →
    // 0.13), which is also when the jammer RF matches and the FR-04a
    // candidates are published. Calls for fire (comms-sim missions.py): AB1002
    // (M795) between 0:00 and 0:45 (0:30), AB1001 (M982 from OBS B) between
    // 1:05 and 1:15 (1:12) — so AB1001 arrives PASS (C3) and flips to TSS FAIL.
    let narrated = 0;
    later(1.5 * cfg.tickMs, () => bindings.onMission?.(ab1002(new Date().toISOString())));
    later(4.5 * cfg.tickMs, () => bindings.onMission?.(ab1001(new Date().toISOString())));
    // After the script, keep the 1:20 payloads coming at ~1 Hz like the engine
    // does, so report age stays fresh (no false STALE).
    const last = CRESCENDO_STEPS[CRESCENDO_STEPS.length - 1]!;
    const heartbeat = () => {
      const now = new Date().toISOString();
      for (const payload of last.payloads) bindings.onTrust({ ...payload, timestamp: now });
      later(1000, heartbeat);
    };
    later((CRESCENDO_STEPS.length + 1) * cfg.tickMs, heartbeat);
    CRESCENDO_STEPS.forEach((step, i) => {
      later((i + 1) * cfg.tickMs, () => {
        // Re-stamp so the store sees fresh timestamps on replay.
        const now = new Date().toISOString();
        for (const payload of step.payloads) bindings.onTrust({ ...payload, timestamp: now });
        if (step.bullets > narrated) {
          narrated = step.bullets;
          bindings.onNarration({
            source_id: 'unit_b',
            bullets: TRACE_BULLETS.slice(0, step.bullets),
            provider: 'claude',
          });
        }
        if (step.candidates) {
          bindings.onCandidates({ ...CANDIDATES_PAYLOAD, timestamp: now });
        }
      });
    });
  }

  return {
    disconnect: () => timers.forEach(clearTimeout),
  };
}
