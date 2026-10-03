import type { Meta, StoryObj } from '@storybook/react';
import { expect, waitFor, within } from '@storybook/test';
import Home from '../../../app/page';
import {
  CANDIDATES,
  PHASE_TRACKS,
  TERMINAL_EVENTS_API,
  crescendoEventsAt,
  terminalEventsUntil,
} from '@/stories/fixtures/avdiivka';
import { cesiumLoader } from '@/stories/support/cesium';
import { TrustHeartbeat } from '@/stories/support/mocks';
import { ab1001, ab1002, liveTracks, missionState, missionsRecord, B_SCORES } from '@/stories/fixtures/missions';

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
          'The full single-screen COP (`app/page.tsx`): BrandBar / Spine (2fr) + [fire-mission queue over TrustPanel] (1fr) / ' +
          'EventTerminal (160px). There is no modal: a call for fire that depends on a source failing TSS shows TSS FAIL in its ' +
          'own row (Fires/Mission Row). `useHamiltonMqtt` runs for real against a scripted, broker-free MQTT mock ' +
          '(`.storybook/mocks/mqtt-client.ts`) that also publishes the calls for fire; the engine HTTP API is mocked too. The spine ' +
          'draws the decided track symbol (Decisions/Track Symbology): B\'s side gauge drains and J appears at rest as it drops ' +
          'below the GPS-guided TSS minimum — no halo, no pulse. Hover or Tab to a unit for its rating breakdown.',
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
 * (6/6, fingerprint trust 1 → 0) land together. Calls for fire: AB1002 (OBS C, M795) at ~0:30 —
 * never gated — and AB1001 (OBS B, M982) at ~1:12, which arrives TSS PASS (B C3) and flips in-row to
 * **TSS FAIL — RELIABILITY E5 (min C) · rec. DO NOT LOAD** at 1:15. No modal, no scrim, focus untouched.
 * Narration bullets arrive at 0:45 / 0:55 / 1:05.
 */
export const CrescendoReplay: Story = {
  parameters: {
    mqtt: { script: 'crescendo', tickMs: CRESCENDO_TICK_MS },
    engineApi: { eventsAt: crescendoEventsAt(CRESCENDO_TICK_MS) },
  },
  play: async ({ canvasElement }) => {
    const row = await within(canvasElement).findByTestId('fm-row-AB1001', {}, { timeout: 12_000 });
    await waitFor(() => expect(row).toHaveAttribute('data-verdict', 'FAIL'), { timeout: 12_000 });
    await expect(document.querySelector('[aria-modal="true"]')).toBeNull();
  },
};

/** 0:00 — seeded from the page's own SEED_TRACKS (store empty on mount). */
export const SessionStart: Story = { parameters: { mqtt: { script: 'silent' }, engineApi: { events: [] } } };

/** 1:15 — candidate reveal; B 0.65 → 0.13, its first score below the GPS-guided TSS minimum. No mission open: nothing interrupts. */
export const CandidateReveal: Story = {
  parameters: {
    hamilton: { tracks: PHASE_TRACKS.degraded, candidates, llmStatus: 'active' },
    engineApi: { events: terminalEventsUntil(75) },
  },
};

/** 1:20 — AB1001 (M982 from OBS B) shows TSS FAIL in its row; the COP is untouched (no modal, no blur). */
export const TssFailInRow: Story = {
  name: 'TSS FAIL in row (1:20)',
  decorators: [(S) => <TrustHeartbeat><S /></TrustHeartbeat>],
  parameters: {
    hamilton: () => ({
      tracks: liveTracks(B_SCORES.e5),
      missions: missionsRecord(missionState(ab1002(new Date(Date.now() - 45_000).toISOString())), missionState(ab1001())),
      candidates,
      llmStatus: 'active',
      tssFailedThisSession: true,
    }),
    engineApi: { events: terminalEventsUntil(80) },
  },
};

/** 2:15 — recovered; the brand-bar hairline (any TSS FAIL this session) stays on. */
export const Recovered: Story = {
  parameters: {
    hamilton: { tracks: PHASE_TRACKS.recovered, tssFailedThisSession: true, llmStatus: 'active' },
    engineApi: { events: TERMINAL_EVENTS_API },
  },
};

/** Broker + engine down — LLM dot goes to gating amber, terminal stays empty. */
export const Offline: Story = {
  parameters: { mqtt: { script: 'unreachable' }, engineApi: { unreachable: true } },
};
