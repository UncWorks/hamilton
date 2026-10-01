import type { Meta, StoryObj } from '@storybook/react';
import { AffiliationSchema, SensorTypeSchema } from '@hamilton/contracts';
import { TrackGlyph } from '@/stories/support/TrackGlyph';
import { BAND_SAMPLES } from '@/stories/fixtures/avdiivka';

const meta = {
  title: 'COP/TrackSymbol (overlay)',
  component: TrackGlyph,
  parameters: {
    docs: {
      story: { inline: true },
      description: {
        component:
          'The map overlay icon + halo, rendered as SVG from `track-symbol.ts` (`symbolGeometry`, ' +
          '`affiliationRgb`) and `trust-gradient.ts` (`haloRadiusPx`, `haloPeriodMs`, `shouldHaloPulse`). ' +
          'This is the Branding §5.2 rule — side count = sensor type, 45° for enemy, opacity = score, pulsing ' +
          'halo below 0.60. Both live renderers currently draw circles instead, so this story is the reference ' +
          'for unifying them (see Branding Audit).',
      },
    },
  },
  args: { affiliation: 'friendly', sensorType: 'offense', score: 0.42, radius: 18, useCssToken: true },
  argTypes: {
    affiliation: { control: 'inline-radio', options: AffiliationSchema.options },
    sensorType: { control: 'select', options: SensorTypeSchema.options },
    score: { control: { type: 'range', min: 0, max: 1, step: 0.01 } },
    radius: { control: { type: 'range', min: 8, max: 48, step: 1 } },
  },
} satisfies Meta<typeof TrackGlyph>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {};

/** Unit B decaying through every band. */
export const UnitBDecay: Story = {
  render: (args) => (
    <div style={{ display: 'flex', gap: 'var(--space-4)', flexWrap: 'wrap', alignItems: 'end' }}>
      {[1.0, BAND_SAMPLES.watching, 0.6, 0.59, BAND_SAMPLES.degraded, BAND_SAMPLES.failed, 0.05].map((s) => (
        <TrackGlyph key={s} {...args} score={s} />
      ))}
    </div>
  ),
};

/** Sensor type × affiliation matrix at the degraded sample score. */
export const ShapeMatrix: Story = {
  render: (args) => (
    <table style={{ borderCollapse: 'collapse', fontFamily: 'var(--font-mono)', fontSize: 'var(--text-micro)' }}>
      <thead>
        <tr>
          <th />
          {AffiliationSchema.options.map((a) => (
            <th key={a} style={{ color: 'var(--text-tertiary)', fontWeight: 400, padding: 'var(--space-2)' }}>{a}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {SensorTypeSchema.options.map((s) => (
          <tr key={s}>
            <th style={{ color: 'var(--text-tertiary)', fontWeight: 400, textAlign: 'right', padding: 'var(--space-2)' }}>{s}</th>
            {AffiliationSchema.options.map((a) => (
              <td key={a} style={{ padding: 'var(--space-2)', textAlign: 'center' }}>
                <TrackGlyph {...args} affiliation={a} sensorType={s} />
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  ),
};

/** CSS affiliation token (left) vs. the hand-tuned deck.gl RGB mirror the renderers use (right). */
export const TokenVsRendererColor: Story = {
  render: (args) => (
    <div style={{ display: 'grid', gap: 'var(--space-4)' }}>
      {AffiliationSchema.options.map((a) => (
        <div key={a} style={{ display: 'flex', gap: 'var(--space-6)', alignItems: 'center' }}>
          <code style={{ width: 80, fontFamily: 'var(--font-mono)', fontSize: 'var(--text-micro)', color: 'var(--text-tertiary)' }}>{a}</code>
          <TrackGlyph {...args} affiliation={a} score={1} useCssToken showLabel={false} />
          <TrackGlyph {...args} affiliation={a} score={1} useCssToken={false} showLabel={false} />
        </div>
      ))}
    </div>
  ),
};
