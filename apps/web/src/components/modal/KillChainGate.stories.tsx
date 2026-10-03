import type { Meta, StoryObj } from '@storybook/react';
import { KillChainGate } from './KillChainGate';
import { TrustPanel } from '@/components/panel/TrustPanel';
import {
  BAND_SAMPLES,
  CANDIDATES,
  GATE_OPEN,
  GATE_RESOLVED,
  PHASE_TRACKS,
  beatTrack,
  track,
  tracksRecord,
} from '@/stories/fixtures/avdiivka';

const meta = {
  title: 'Modal/KillChainGate',
  component: KillChainGate,
  parameters: {
    layout: 'fullscreen',
    docs: {
      story: { iframeHeight: 640 },
      description: {
        component:
          'Beat 1:20 — the load-bearing kill-chain gate (Branding §10.5). Portals to `document.body` when ' +
          '`gateActive` and a gate event exists. Headline (`--text-modal`, `--text-primary`), R18 subtitle ' +
          '"Kill-chain gated below ROE floor." (`--gating-primary`, glow), and three options — (a) delay 60s, ' +
          '(b) non-GPS munition, (c) confirm via alt channel. Selecting an option closes the gate and POSTs ' +
          '`/api/modal/selection` (mocked here; see the browser console).',
      },
    },
  },
} satisfies Meta<typeof KillChainGate>;

export default meta;
type Story = StoryObj<typeof meta>;

const gated = (score: number, tracks = PHASE_TRACKS.degraded) => ({
  tracks,
  candidates: { source_id: 'unit_b', items: CANDIDATES },
  gateActive: true,
  gateHistory: [{ ...GATE_OPEN, score_at_trigger: score }],
});

/**
 * 1:20 — engine values (PR #1). Unit B first crossed the floor at 1:15, 0.65 → 0.13, when the 6.1 s
 * gap, 14% CRC and the jammer fingerprint (6/6) landed together; it is still 0.13 at the modal beat.
 * Options are clickable (store closes the gate).
 */
export const Gated: Story = { parameters: { hamilton: gated(GATE_OPEN.score_at_trigger) } };

/**
 * SYNTHETIC — gate on a DEGRADED-band score (0.45). The demo timeline never sits in 0.30–0.60 (B
 * goes 0.65 → 0.13 in one beat); this covers the band with an engine-reachable score.
 */
export const GatedDegradedBand: Story = {
  parameters: {
    hamilton: gated(
      BAND_SAMPLES.degraded,
      tracksRecord(beatTrack('unit_a', 75), track('unit_b', BAND_SAMPLES.degraded), beatTrack('unit_c', 75)),
    ),
  },
};

/** The gate as it lands on the COP — trust panel behind the scrim (R16: context stays visible). */
export const OverTrustPanel: Story = {
  parameters: { hamilton: gated(GATE_OPEN.score_at_trigger) },
  render: () => (
    <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', height: '100vh' }}>
      <div
        style={{
          display: 'grid',
          placeItems: 'center',
          color: 'var(--text-tertiary)',
          fontFamily: 'var(--font-mono)',
          fontSize: 'var(--text-micro)',
          letterSpacing: '0.16em',
          textTransform: 'uppercase',
        }}
      >
        cop spine (see COP stories)
      </div>
      <TrustPanel />
      <KillChainGate />
    </div>
  ),
};

/**
 * Gate on a different unit. Headline derives from `source_id` (renders "UNIT_C-position") while
 * option (c) hard-codes "B" — documented in the Branding Audit. Synthetic: C never degrades in the
 * demo (engine keeps A and C at 1.00); 0.51 is an engine-reachable score solved by componentsFor.
 */
export const OtherSource: Story = {
  parameters: {
    hamilton: {
      tracks: tracksRecord(track('unit_a', 1), track('unit_b', 1), track('unit_c', 0.51)),
      gateActive: true,
      gateHistory: [{ ...GATE_OPEN, source_id: 'unit_c', score_at_trigger: 0.51 }],
    },
  },
};

/** Gate already resolved — component renders nothing (empty canvas is the expected result). */
export const Resolved: Story = {
  parameters: { hamilton: { tracks: PHASE_TRACKS.failed, gateActive: false, gateHistory: [GATE_RESOLVED] } },
};
