import { DEFAULT_TSS_TABLE } from '@/lib/tss';
import type { Meta, StoryObj } from '@storybook/react';
import { TrustPanel } from './TrustPanel';
import {
  BAND_SAMPLES,
  CANDIDATES,
  PHASE_TRACKS,
  TRACE_BULLETS,
  track,
  tracksRecord,
} from '@/stories/fixtures/avdiivka';
import { StoreSeed } from '@/stories/support/mocks';

const candidatesForB = { source_id: 'unit_b', items: CANDIDATES };

const meta = {
  title: 'Panel/TrustPanel',
  component: TrustPanel,
  decorators: [
    (Story) => (
      <div style={{ width: 420, height: 720 }}>
        <Story />
      </div>
    ),
  ],
  parameters: {
    layout: 'fullscreen',
    docs: {
      story: { iframeHeight: 740 },
      description: {
        component:
          'Trust side panel (cols 9–12, Branding §7.2). Focuses the selected source, else the lowest-scoring track. ' +
          'Header (source id, affiliation · sensor), `TrustReadout`, 3-bullet trust trace (private `TraceBullets`, ' +
          '`--gating-secondary` leaders) and FR-04a `CandidateCards` when candidates belong to the focused source.',
      },
    },
  },
} satisfies Meta<typeof TrustPanel>;

export default meta;
type Story = StoryObj<typeof meta>;

/** No tracks in the store yet. */
export const AwaitingTelemetry: Story = {};

/** 0:00 — all three units at 1.00 (engine); focuses the lowest (tie → first). */
export const Nominal: Story = { parameters: { hamilton: { tracks: PHASE_TRACKS.nominal } } };

/** 0:45 — B WATCH 0.70 (cadence 1.0 s → 1.17 s, 3.4σ), first trace bullet; A and C 1.00. */
export const Watching: Story = { parameters: { hamilton: { tracks: PHASE_TRACKS.watching } } };

/** 1:05 — B WATCH 0.65 (CRC 6%), spatial localized, all three trace bullets; no candidates yet. */
export const Localized: Story = { parameters: { hamilton: { tracks: PHASE_TRACKS.localized } } };

/**
 * 1:15 — B 0.65 → 0.13, first score below the GPS-guided TSS minimum: 6.1 s gap, 14% CRC and the jammer
 * fingerprint (6/6) land together; full trace + candidate reveal.
 */
export const DegradedWithCandidates: Story = {
  parameters: { hamilton: { tracks: PHASE_TRACKS.degraded, candidates: candidatesForB } },
};

/** 1:50 — recovery initiates, B 0.22 (cadence 1.8 s, CRC 4%, jammer still matched) — still gated. */
export const Failed: Story = {
  parameters: { hamilton: { tracks: PHASE_TRACKS.failed, candidates: candidatesForB } },
};

/** 2:15 — recovered, B 1.00. */
export const Recovered: Story = { parameters: { hamilton: { tracks: PHASE_TRACKS.recovered } } };

/** Operator clicked Unit A — candidates for B are hidden because they belong to another source. */
export const SelectedOtherSource: Story = {
  parameters: {
    hamilton: { tracks: PHASE_TRACKS.degraded, candidates: candidatesForB, selectedSource: 'unit_a' },
  },
};

/** Enemy defense emitter focused — exercises affiliation/sensor label formatting. */
export const EnemyTrack: Story = {
  parameters: {
    hamilton: {
      tracks: tracksRecord({
        ...track('unit_b', 0.33), // synthetic, engine-reachable (componentsFor)
        source_id: 'hostile_ew_1',
        affiliation: 'enemy',
        sensor_type: 'recon_mobile',
        trace_bullets: ['Emitter cadence matches Zhitel barrage profile.'],
      }),
    },
  },
};

interface PlaygroundArgs {
  score: number;
  bullets: number;
  showCandidates: boolean;
  gpsMin: 'B' | 'C' | 'D';
}

/** Drive Unit B's score, trace depth and candidates from Controls. */
export const Playground: StoryObj<PlaygroundArgs> = {
  args: { score: BAND_SAMPLES.failed, bullets: 3, showCandidates: true, gpsMin: 'C' },
  argTypes: {
    score: { control: { type: 'range', min: 0, max: 1, step: 0.01 } },
    bullets: { control: { type: 'range', min: 0, max: 3, step: 1 } },
    gpsMin: { control: { type: 'inline-radio' }, options: ['B', 'C', 'D'] },
  },
  render: ({ score, bullets, showCandidates, gpsMin }) => (
    <StoreSeed
      seed={{
        tssTable: {
          ...DEFAULT_TSS_TABLE,
          rows: DEFAULT_TSS_TABLE.rows.map((r) => (r.id === 'gps_guided' ? { ...r, min_reliability: gpsMin } : r)),
        },
        tracks: tracksRecord(
          track('unit_a', 1),
          track('unit_b', score, { trace_bullets: TRACE_BULLETS.slice(0, bullets) }),
          track('unit_c', 1),
        ),
        candidates: showCandidates ? candidatesForB : null,
      }}
    >
      <TrustPanel />
    </StoreSeed>
  ),
};
