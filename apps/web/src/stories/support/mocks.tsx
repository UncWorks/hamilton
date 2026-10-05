// Storybook runtime mocks: Zustand store seeding, engine HTTP API, MQTT
// replay script. Wired globally from .storybook/preview.tsx via `beforeEach`;
// stories opt in through `parameters.hamilton`, `parameters.engineApi` and
// `parameters.mqtt`.

import { useEffect, useLayoutEffect, type ReactNode } from 'react';
import type { DetectionEvent } from '@hamilton/contracts';
import { useHamilton } from '@/store/hamilton';

type HamiltonState = ReturnType<typeof useHamilton.getState>;
export type HamiltonSeed = Partial<
  Pick<
    HamiltonState,
    | 'tracks'
    | 'candidates'
    | 'selectedSource'
    | 'llmMode'
    | 'llmStatus'
    | 'tssTable'
    | 'missions'
    | 'selectedMission'
    | 'decisionLog'
    | 'tssFailedThisSession'
    | 'emitterEstimate'
    | 'emitterState'
    | 'emitterLog'
  >
>;

const INITIAL = useHamilton.getInitialState();

/** Replace the whole store with initial state + seed (actions preserved). */
export function seedHamilton(seed: HamiltonSeed = {}): void {
  useHamilton.setState({ ...INITIAL, ...seed }, true);
}

/** Args-driven seeding: applies before children paint, re-applies on change. */
export function StoreSeed({ seed, children }: { seed: HamiltonSeed; children: ReactNode }) {
  const key = JSON.stringify(seed);
  useLayoutEffect(() => {
    seedHamilton(seed);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return <>{children}</>;
}

// ---------------------------------------------------------------------------
// Engine HTTP API (/api/events, /api/missions/decision) — fetch interception
// ---------------------------------------------------------------------------

export interface EngineApiMock {
  /** Rows returned by GET /api/events (newest-first, like the engine). */
  events?: DetectionEvent[];
  /** Grow the visible log by one row per poll, oldest first. */
  stream?: boolean;
  /**
   * Time-synced log: rows visible `elapsedMs` after the mock is installed
   * (newest-first). Overrides `events` / `stream` — keeps the terminal in step
   * with a scripted MQTT replay.
   */
  eventsAt?: (elapsedMs: number) => DetectionEvent[];
  /** Simulate the engine being down (HTTP 503). */
  unreachable?: boolean;
}

const realFetch: typeof fetch | undefined =
  typeof window !== 'undefined' ? window.fetch.bind(window) : undefined;

/** Bodies POSTed to the engine's /api/missions/decision (branch log copies). */
export const engineSelections: unknown[] = [];

export function installEngineApi(mock: EngineApiMock = {}): void {
  if (typeof window === 'undefined' || !realFetch) return;
  let polls = 0;
  const installedAt = Date.now();
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (url.includes('/api/events')) {
      if (mock.unreachable) return new Response('engine offline', { status: 503 });
      const all = mock.events ?? [];
      polls += 1;
      const rows = mock.eventsAt
        ? mock.eventsAt(Date.now() - installedAt)
        : mock.stream
          ? all.slice(Math.max(0, all.length - polls))
          : all;
      return new Response(JSON.stringify(rows), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    if (url.includes('/api/missions/decision')) {
      const body = typeof init?.body === 'string' ? JSON.parse(init.body) : init?.body;
      engineSelections.push(body);
      // eslint-disable-next-line no-console
      console.info('[storybook] POST /api/missions/decision', body);
      return new Response('{}', { status: 200 });
    }
    return realFetch(input, init);
  };
}

// ---------------------------------------------------------------------------
// Trust heartbeat — the engine publishes every source at ~1 Hz, so report age
// stays ~0–1 s. Stories that seed static tracks mount this so the TSS
// report-age check sees fresh reports; `frozen` sources keep their timestamp
// (STALE / report-age stories).
// ---------------------------------------------------------------------------

export function TrustHeartbeat({ frozen = [], children }: { frozen?: string[]; children: ReactNode }) {
  const key = frozen.join(',');
  useEffect(() => {
    const id = setInterval(() => {
      const now = new Date().toISOString();
      useHamilton.setState((s) => ({
        tracks: Object.fromEntries(
          Object.entries(s.tracks).map(([k, t]) => [k, frozen.includes(k) ? t : { ...t, last_update: now }]),
        ),
      }));
    }, 1000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return <>{children}</>;
}

// ---------------------------------------------------------------------------
// MQTT replay script (consumed by .storybook/mocks/mqtt-client.ts)
// ---------------------------------------------------------------------------

export type MqttScript = 'silent' | 'crescendo' | 'unreachable';

export function setMqttScript(script: MqttScript = 'silent', tickMs = 1000): void {
  if (typeof window === 'undefined') return;
  (window as Window & { __HAMILTON_STORY_MQTT__?: unknown }).__HAMILTON_STORY_MQTT__ = {
    script,
    tickMs,
  };
}
