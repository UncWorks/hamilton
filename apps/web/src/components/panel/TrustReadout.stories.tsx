import type { Meta, StoryObj } from '@storybook/react';
import { TrustReadout } from './TrustReadout';
import { BAND_EDGES, BAND_SAMPLES, ROE_FLOOR } from '@/stories/fixtures/avdiivka';
import { trustBand } from '@/lib/trust-gradient';

const meta = {
  title: 'Panel/TrustReadout',
  component: TrustReadout,
  parameters: {
    docs: {
      story: { inline: true },
      description: {
        component:
          'The trust-score numeral (`--text-readout`, tabular mono, band-colored) plus the ROE-floor indicator ' +
          '(1px `--trust-roe-line`; label turns `--gating-primary` below the floor). Includes the private ' +
          '`RoeFloorIndicator` subcomponent.',
      },
    },
  },
  args: { score: BAND_SAMPLES.nominal, roeFloor: ROE_FLOOR },
  argTypes: {
    score: { control: { type: 'range', min: 0, max: 1, step: 0.01 } },
    roeFloor: { control: { type: 'range', min: 0, max: 1, step: 0.05 } },
  },
} satisfies Meta<typeof TrustReadout>;

export default meta;
type Story = StoryObj<typeof meta>;

/** 1.00–0.85 · `--trust-nominal` (phosphor). */
export const Nominal: Story = { args: { score: BAND_SAMPLES.nominal } };
/** 0.85–0.60 · `--trust-watching`. */
export const Watching: Story = { args: { score: BAND_SAMPLES.watching } };
/** 0.60–0.30 · `--trust-degraded` — below ROE floor, label flips to gating amber. */
export const Degraded: Story = { args: { score: BAND_SAMPLES.degraded } };
/** < 0.30 · `--trust-failed`. */
export const Failed: Story = { args: { score: BAND_SAMPLES.failed } };

/** Exactly on the floor — still "above" (score >= roeFloor). */
export const OnRoeFloor: Story = { args: { score: 0.6 } };

/** Non-default ROE floor (NEXT_PUBLIC_ROE_FLOOR=0.75). */
export const CustomRoeFloor: Story = { args: { score: 0.7, roeFloor: 0.75 } };

/** Every band edge in one view — checks tabular digits don't jitter. */
export const BandEdges: Story = {
  render: (args) => (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
        gap: 'var(--space-6)',
      }}
    >
      {BAND_EDGES.map((s) => (
        <div key={s} style={{ display: 'grid', gap: 'var(--space-1)' }}>
          <code
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 'var(--text-micro)',
              color: 'var(--text-tertiary)',
            }}
          >
            {s.toFixed(3)} · {trustBand(s)}
          </code>
          <TrustReadout score={s} roeFloor={args.roeFloor} />
        </div>
      ))}
    </div>
  ),
};
