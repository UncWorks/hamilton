import type { Meta, StoryObj } from '@storybook/react';
import Home from '../../../app/page';
import {
  CANDIDATES,
  GATE_OPEN,
  GATE_RESOLVED,
  PHASE_TRACKS,
  TERMINAL_EVENTS_API,
} from '@/stories/fixtures/avdiivka';
import { cesiumLoader } from '@/stories/support/cesium';

const candidates = { source_id: 'unit_b', items: CANDIDATES };
const eventsUpTo = (n: number) => TERMINAL_EVENTS_API.slice(TERMINAL_EVENTS_API.length - n);

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

/**
 * Live replay of the 0:45 → 1:20 crescendo: B decays 1.00 → 0.18 one tick per 1.5s, narration
 * bullets arrive, FR-04a candidates reveal at 0.61, and the kill-chain gate fires on the 0.60 crossing.
 */
export const CrescendoReplay: Story = {
  parameters: {
    mqtt: { script: 'crescendo', tickMs: 1500 },
    engineApi: { events: TERMINAL_EVENTS_API, stream: true },
  },
};

/** 0:00 — seeded from the page's own SEED_TRACKS (store empty on mount). */
export const SessionStart: Story = { parameters: { mqtt: { script: 'silent' }, engineApi: { events: [] } } };

/** 1:15 — candidate reveal, just before the gate. */
export const CandidateReveal: Story = {
  parameters: {
    hamilton: { tracks: PHASE_TRACKS.degraded, candidates, llmStatus: 'active' },
    engineApi: { events: eventsUpTo(4) },
  },
};

/** 1:20 — the gate is up over the COP (spec asks for an 8px COP blur; not implemented — see audit). */
export const Gated: Story = {
  parameters: {
    hamilton: {
      tracks: PHASE_TRACKS.degraded,
      candidates,
      gateActive: true,
      gateHistory: [GATE_OPEN],
      llmStatus: 'active',
    },
    engineApi: { events: eventsUpTo(5) },
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
