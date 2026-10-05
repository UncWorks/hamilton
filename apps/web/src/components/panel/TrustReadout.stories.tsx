import type { Meta, StoryObj } from '@storybook/react';
import { TrustReadout } from './TrustReadout';
import { BAND_EDGES, BAND_SAMPLES, TSS_MIN_GPS_SCORE } from '@/stories/fixtures/avdiivka';
import { trustBand } from '@/lib/trust-gradient';

const meta = {
  title: 'Panel/TrustReadout',
  component: TrustReadout,
  parameters: {
    docs: {
      story: { inline: true },
      description: {
        component:
          'The trust-score numeral (`--text-readout`, tabular mono, band-colored) plus the TSS-minimum indicator ' +
          '(1px `--trust-roe-line`; the GPS-guided TSS minimum, C ≥ 0.60 from the TSS table in force; label turns ' +
          '`--gating-primary` and reads "BELOW" under it). Includes the private `TssMinIndicator` subcomponent.',
      },
    },
  },
  args: { score: BAND_SAMPLES.nominal, tssMin: TSS_MIN_GPS_SCORE },
  argTypes: {
    score: { control: { type: 'range', min: 0, max: 1, step: 0.01 } },
    tssMin: { control: { type: 'range', min: 0, max: 1, step: 0.05 } },
  },
} satisfies Meta<typeof TrustReadout>;

export default meta;
type Story = StoryObj<typeof meta>;

/** 1.00–0.85 · `--trust-nominal` (phosphor). */
export const Nominal: Story = { args: { score: BAND_SAMPLES.nominal } };
/** 0.85–0.60 · `--trust-watching`. */
export const Watching: Story = { args: { score: BAND_SAMPLES.watching } };
/** 0.60–0.30 · `--trust-degraded` — below the GPS-guided TSS minimum, label flips to gating amber and reads BELOW. */
export const Degraded: Story = { args: { score: BAND_SAMPLES.degraded } };
/** < 0.30 · `--trust-failed`. */
export const Failed: Story = { args: { score: BAND_SAMPLES.failed } };

/** Exactly on the TSS minimum — still "above" (score >= tssMin). */
export const OnTssMinimum: Story = { args: { score: 0.6 } };

/** Tightened TSS minimum (e.g. GPS-guided at B inside an RFA → 0.85). */
export const TightenedTssMinimum: Story = { args: { score: 0.7, tssMin: 0.85 } };

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
          <TrustReadout score={s} tssMin={args.tssMin} />
        </div>
      ))}
    </div>
  ),
};
