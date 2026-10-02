import type { Meta, StoryObj } from '@storybook/react';
import Home from '../../../app/page';
import {
  CANDIDATES,
  GATE_OPEN,
  GATE_RESOLVED,
  PHASE_TRACKS,
  TERMINAL_EVENTS_API,
  crescendoEventsAt,
  terminalEventsUntil,
} from '@/stories/fixtures/avdiivka';
import { cesiumLoader } from '@/stories/support/cesium';

const candidates = { source_id: 'unit_b', items: CANDIDATES };

const meta = {
  title: 'Pages/COP',
  component: Home,
  loaders: [cesiumLoader],
  parameters: {
    layout: 'fullscreen',
    docs: {
      story: { iframeHeight: 760 },
      description: {
        component:
          'The full single-screen COP (`app/page.tsx`): BrandBar / Spine (2fr) + TrustPanel (1fr) / ' +
          'EventTerminal (160px) / KillChainGate. `useHamiltonMqtt` runs for real against a scripted, ' +
          'broker-free MQTT mock (`.storybook/mocks/mqtt-client.ts`); the engine HTTP API is mocked too.',
      },
    },
  },
} satisfies Meta<typeof Home>;

export default meta;
type Story = StoryObj<typeof meta>;

const CRESCENDO_TICK_MS = 1500;

/**
 * Live replay of the 0:00 → 1:20 crescendo, one engine beat per 1.5 s (PR #1 engine values):
 * A and C hold 1.00; B goes 1.00 → 0.70 (0:45, WATCH, cadence 1.17 s) → 0.65 (0:55, CRC 6%) →
 * 0.65 (1:05, localized) → 0.13 at 1:15, when the 6.1 s gap, 14% CRC and the jammer fingerprint
 * (6/6, fingerprint trust 1 → 0) land together. That is B's first crossing below 0.60: FR-04a
 * candidates reveal and the store raises the kill-chain gate on it (the storyboard's modal beat is
 * 1:20). Narration bullets arrive at 0:45 / 0:55 / 1:05.
 */
export const CrescendoReplay: Story = {
  parameters: {
    mqtt: { script: 'crescendo', tickMs: CRESCENDO_TICK_MS },
    engineApi: { eventsAt: crescendoEventsAt(CRESCENDO_TICK_MS) },
  },
};

/** 0:00 — seeded from the page's own SEED_TRACKS (store empty on mount). */
export const SessionStart: Story = { parameters: { mqtt: { script: 'silent' }, engineApi: { events: [] } } };

/** 1:15 — candidate reveal; B 0.65 → 0.13, its first crossing below the ROE floor. */
export const CandidateReveal: Story = {
  parameters: {
    hamilton: { tracks: PHASE_TRACKS.degraded, candidates, llmStatus: 'active' },
    engineApi: { events: terminalEventsUntil(75) },
  },
};

/** 1:20 — the gate is up over the COP (B 0.13) (spec asks for an 8px COP blur; not implemented — see audit). */
export const Gated: Story = {
  parameters: {
    hamilton: {
      tracks: PHASE_TRACKS.degraded,
      candidates,
      gateActive: true,
      gateHistory: [GATE_OPEN],
      llmStatus: 'active',
    },
    engineApi: { events: terminalEventsUntil(80) },
  },
};

/** 2:15 — recovered; the brand-bar hairline stays on. */
export const Recovered: Story = {
  parameters: {
    hamilton: { tracks: PHASE_TRACKS.recovered, gateHistory: [GATE_RESOLVED], llmStatus: 'active' },
    engineApi: { events: TERMINAL_EVENTS_API },
  },
};

/** Broker + engine down — LLM dot goes to gating amber, terminal stays empty. */
export const Offline: Story = {
  parameters: { mqtt: { script: 'unreachable' }, engineApi: { unreachable: true } },
};
