import type { Meta, StoryObj } from '@storybook/react';
import { AffiliationSchema, SensorTypeSchema } from '@hamilton/contracts';
import { TrackSymbol } from '@/components/symbol';
import { SENSOR_FUNCTION, SYMBOL_FUNCTIONS } from '@/lib/track-sidc';
import { Wordmark } from '@/components/brand/Wordmark';
import { Page, Section, mono } from '@/stories/support/foundation-ui';
import { BAND_SAMPLES } from '@/stories/fixtures/avdiivka';

const meta = {
  title: 'Foundations/Iconography',
  parameters: { layout: 'fullscreen', docs: { story: { inline: true } } },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * The decided track symbol (Decisions/Track Symbology) — what CesiumSpine and MapSpine draw. FM 1-02 / MCRP 5-12A
 * frame + function icon; the contract sensor type picks the function. Replaces the §5.2 n-gons (archived, G01).
 */
export const TrackSymbology: Story = {
  render: () => (
    <Page>
      <Section title="Sensor type → function icon (track-sidc.ts SENSOR_FUNCTION)" note="Friendly frame, score 1.00, 32 px (detail state). Hostile EW sources use fn ew-jamming.">
        <div style={{ display: 'flex', gap: 'var(--space-6)', flexWrap: 'wrap', alignItems: 'end' }}>
          {SensorTypeSchema.options.map((s) => (
            <div key={s} style={{ display: 'grid', justifyItems: 'center', gap: 'var(--space-1)' }}>
              <TrackSymbol track={{ affiliation: 'friendly', sensorType: s, score: 1 }} sizePx={32} margin={4} />
              <code style={{ ...mono, color: 'var(--text-primary)' }}>{s}</code>
              <code style={{ ...mono, color: 'var(--text-tertiary)' }}>{SYMBOL_FUNCTIONS[SENSOR_FUNCTION[s]].name}</code>
            </div>
          ))}
          <div style={{ display: 'grid', justifyItems: 'center', gap: 'var(--space-1)' }}>
            <TrackSymbol track={{ affiliation: 'enemy', fn: 'ew-jamming', designation: 'J1' }} sizePx={32} margin={4} />
            <code style={{ ...mono, color: 'var(--text-primary)' }}>jammer fix</code>
            <code style={{ ...mono, color: 'var(--text-tertiary)' }}>{SYMBOL_FUNCTIONS['ew-jamming'].name}</code>
          </div>
          <div style={{ display: 'grid', justifyItems: 'center', gap: 'var(--space-1)' }}>
            <TrackSymbol track={{ affiliation: 'enemy', fn: 'ew-jamming', status: 'anticipated', designation: 'C1' }} sizePx={32} margin={4} />
            <code style={{ ...mono, color: 'var(--text-primary)' }}>candidate site</code>
            <code style={{ ...mono, color: 'var(--text-tertiary)' }}>status 1 (anticipated) — dashed</code>
          </div>
        </div>
      </Section>
      <Section title="Affiliation → frame (Table 4-1, p 4-3)" note="Filled frames, affiliation by shape and fill — distinguishable without colour.">
        <div style={{ display: 'flex', gap: 'var(--space-6)', flexWrap: 'wrap' }}>
          {AffiliationSchema.options.map((a) => (
            <div key={a} style={{ display: 'grid', justifyItems: 'center', gap: 'var(--space-1)' }}>
              <TrackSymbol track={{ affiliation: a, sensorType: 'defense', score: 1 }} sizePx={32} margin={4} />
              <code style={{ ...mono, color: 'var(--text-primary)' }}>{a}</code>
            </div>
          ))}
        </div>
      </Section>
    </Page>
  ),
};

/**
 * Trust cue below the ROE floor: the side gauge drains and J appears at rest. The pulsing halo this story used to show is
 * retired (Decisions/Track Symbology, decision 2) and lives only in Archive/Halo Options.
 */
export const TrustCue: Story = {
  render: () => (
    <Page>
      <Section title="Side gauge + J (decision 2)" note="Fill height = score in the band colour; J (evaluation rating) right of the gauge. No halo, no pulse, no blink — nothing to switch off under prefers-reduced-motion.">
        <div style={{ display: 'flex', gap: 'var(--space-6)', alignItems: 'end', flexWrap: 'wrap' }}>
          {[1, BAND_SAMPLES.watching, 0.59, BAND_SAMPLES.degraded, BAND_SAMPLES.failed, 0.05].map((s) => (
            <div key={s} style={{ display: 'grid', justifyItems: 'center', gap: 'var(--space-1)' }}>
              <TrackSymbol track={{ affiliation: 'friendly', sensorType: 'offense', designation: 'B', score: s }} sizePx={32} margin={4} />
              <code style={{ ...mono, color: 'var(--text-tertiary)' }}>{s.toFixed(2)}</code>
            </div>
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
