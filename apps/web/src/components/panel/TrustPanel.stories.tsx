import type { Meta, StoryObj } from '@storybook/react';
import { TrustPanel } from './TrustPanel';
import {
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

/** 0:00 — all three units nominal; focuses the lowest (tie → first). */
export const Nominal: Story = { parameters: { hamilton: { tracks: PHASE_TRACKS.nominal } } };

/** 0:45 — B watching, first trace bullet. */
export const Watching: Story = { parameters: { hamilton: { tracks: PHASE_TRACKS.watching } } };

/** 1:15 — B degraded below ROE floor, full trace + candidate reveal. */
export const DegradedWithCandidates: Story = {
  parameters: { hamilton: { tracks: PHASE_TRACKS.degraded, candidates: candidatesForB } },
};

/** 1:50 — B failed. */
export const Failed: Story = {
  parameters: { hamilton: { tracks: PHASE_TRACKS.failed, candidates: candidatesForB } },
};

/** 2:15 — recovered. */
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
        ...track('unit_b', 0.33),
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
  roeFloor: number;
}

/** Drive Unit B's score, trace depth and candidates from Controls. */
export const Playground: StoryObj<PlaygroundArgs> = {
  args: { score: 0.42, bullets: 3, showCandidates: true, roeFloor: 0.6 },
  argTypes: {
    score: { control: { type: 'range', min: 0, max: 1, step: 0.01 } },
    bullets: { control: { type: 'range', min: 0, max: 3, step: 1 } },
    roeFloor: { control: { type: 'range', min: 0, max: 1, step: 0.05 } },
  },
  render: ({ score, bullets, showCandidates, roeFloor }) => (
    <StoreSeed
      seed={{
        roeFloor,
        tracks: tracksRecord(
          track('unit_a', 0.97),
          track('unit_b', score, { trace_bullets: TRACE_BULLETS.slice(0, bullets) }),
          track('unit_c', 0.95),
        ),
        candidates: showCandidates ? candidatesForB : null,
      }}
    >
      <TrustPanel />
    </StoreSeed>
  ),
};
