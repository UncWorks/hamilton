import type { Meta, StoryObj } from '@storybook/react';
import { AffiliationSchema, SensorTypeSchema, sensorTypeSides } from '@hamilton/contracts';
import { TrackGlyph } from '@/stories/support/TrackGlyph';
import { Wordmark } from '@/components/brand/Wordmark';
import { Page, Section, mono } from '@/stories/support/foundation-ui';

const meta = {
  title: 'Foundations/Iconography',
  parameters: { layout: 'fullscreen', docs: { story: { inline: true } } },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

/** §5.2 — side count encodes sensor type; enemy rotates 45°. From contracts `sensorTypeSides`. */
export const TrackSymbology: Story = {
  render: () => (
    <Page>
      <Section title="Sensor type → polygon (sensorTypeSides)" note="Rendered at score 1.0 with the CSS affiliation tokens.">
        <div style={{ display: 'flex', gap: 'var(--space-6)', flexWrap: 'wrap' }}>
          {SensorTypeSchema.options.map((s) => (
            <div key={s} style={{ display: 'grid', justifyItems: 'center', gap: 'var(--space-1)' }}>
              <TrackGlyph affiliation="friendly" sensorType={s} score={1} showLabel={false} />
              <code style={{ ...mono, color: 'var(--text-primary)' }}>{s}</code>
              <code style={{ ...mono, color: 'var(--text-tertiary)' }}>{sensorTypeSides[s]} sides</code>
            </div>
          ))}
        </div>
      </Section>
      <Section title="Affiliation treatment (§3.5)" note="Friendly / enemy filled; neutral outlined; unknown dashed outline.">
        <div style={{ display: 'flex', gap: 'var(--space-6)', flexWrap: 'wrap' }}>
          {AffiliationSchema.options.map((a) => (
            <div key={a} style={{ display: 'grid', justifyItems: 'center', gap: 'var(--space-1)' }}>
              <TrackGlyph affiliation={a} sensorType="defense" score={1} showLabel={false} />
              <code style={{ ...mono, color: 'var(--text-primary)' }}>{a}</code>
            </div>
          ))}
        </div>
      </Section>
    </Page>
  ),
};

/** Halo behaviour below the ROE floor — icon edge + (1-c)·24px, period 1200 − (1-c)·600ms. */
export const Halo: Story = {
  render: () => (
    <Page>
      <Section title="Pulsing halo (§5.2, §6.3)" note="Option 1 (live): halo-pulse keyframe in motion.css, scaled about the icon centre (.halo → transform-box: fill-box). MapSpine + CesiumSpine draw the same geometry via haloFrameAt(). Alternatives: Explorations/Halo Options.">
        <div style={{ display: 'flex', gap: 'var(--space-6)', alignItems: 'end', flexWrap: 'wrap' }}>
          {[0.65, 0.59, 0.45, 0.3, 0.18, 0.05].map((s) => (
            <TrackGlyph key={s} affiliation="friendly" sensorType="offense" score={s} />
          ))}
        </div>
      </Section>
    </Page>
  ),
};

const NON_TRACK_ICONS = [
  { glyph: '⏸', where: 'EventTerminal.tsx:84', role: 'pause (hover)' },
  { glyph: '·', where: 'BrandBar.tsx:70, EventTerminal.tsx:106, CandidateCards.tsx:118', role: 'separator' },
  { glyph: '—', where: 'CandidateCards.tsx:67', role: 'empty marker' },
  { glyph: '●', where: 'LlmToggle.tsx:37-47 (8px span)', role: 'status dot' },
];

/** §5.3 asks for a custom 16-glyph inline-SVG set. None exists yet — this is what ships instead. */
export const NonTrackIcons: Story = {
  render: () => (
    <Page>
      <Section
        title="Non-track icon set (§5.3) — not implemented"
        note="Spec: 16 stroke-only SVG glyphs, 24-unit grid, 1.5px stroke, square caps (play / pause / scrub / acknowledge / escalate …). Current UI uses Unicode glyphs instead."
      >
        <table style={{ borderCollapse: 'collapse' }}>
          <tbody>
            {NON_TRACK_ICONS.map((i) => (
              <tr key={i.where} style={{ borderTop: '1px solid var(--surface-elevated)' }}>
                <td style={{ padding: 'var(--space-2) var(--space-4)', fontSize: 24, color: 'var(--text-primary)' }}>{i.glyph}</td>
                <td style={{ ...mono, padding: 'var(--space-2)', color: 'var(--text-secondary)' }}>{i.role}</td>
                <td style={{ ...mono, padding: 'var(--space-2)', color: 'var(--text-tertiary)' }}>{i.where}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>
    </Page>
  ),
};

/** The wordmark is the only brand mark (§8.4 — no glyph). */
export const BrandMark: Story = {
  render: () => (
    <Page>
      <Wordmark size={48} />
    </Page>
  ),
};
