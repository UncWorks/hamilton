import type { Meta, StoryObj } from '@storybook/react';
import { KillChainGate } from './KillChainGate';
import { TrustPanel } from '@/components/panel/TrustPanel';
import {
  CANDIDATES,
  GATE_OPEN,
  GATE_RESOLVED,
  PHASE_TRACKS,
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

/** Unit B crosses 0.60 → 0.42. Options are clickable (store closes the gate). */
export const Gated: Story = { parameters: { hamilton: gated(0.42) } };

/** Gate open while B has already fallen to the failed band. */
export const GatedFailedBand: Story = { parameters: { hamilton: gated(0.18, PHASE_TRACKS.failed) } };

/** The gate as it lands on the COP — trust panel behind the scrim (R16: context stays visible). */
export const OverTrustPanel: Story = {
  parameters: { hamilton: gated(0.42) },
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
 * option (c) hard-codes "B" — documented in the Branding Audit.
 */
export const OtherSource: Story = {
  parameters: {
    hamilton: {
      tracks: tracksRecord(track('unit_a', 0.97), track('unit_b', 0.95), track('unit_c', 0.51)),
      gateActive: true,
      gateHistory: [{ ...GATE_OPEN, source_id: 'unit_c', score_at_trigger: 0.51 }],
    },
  },
};

/** Gate already resolved — component renders nothing (empty canvas is the expected result). */
export const Resolved: Story = {
  parameters: { hamilton: { tracks: PHASE_TRACKS.failed, gateActive: false, gateHistory: [GATE_RESOLVED] } },
};
