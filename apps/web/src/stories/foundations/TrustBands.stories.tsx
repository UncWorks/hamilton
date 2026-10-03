import type { Meta, StoryObj } from '@storybook/react';
import { trustBand, trustOklch, trustRgb, trustVarForBand } from '@/lib/trust-gradient';
import { rateLinkTrust } from '@/lib/link-trust-rating';
import { TrackSymbol } from '@/components/symbol';
import { TrustReadout } from '@/components/panel/TrustReadout';
import { BAND_SAMPLES, ROE_FLOOR } from '@/stories/fixtures/avdiivka';
import { Page, Section, mono } from '@/stories/support/foundation-ui';

const meta = {
  title: 'Foundations/Trust Bands',
  parameters: { layout: 'fullscreen', docs: { story: { inline: true } } },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

const ROWS = [1.0, 0.95, 0.85, 0.8, 0.72, 0.6, 0.55, 0.45, 0.31, 0.3, 0.25, 0.13, 0.0];

const th = { ...mono, color: 'var(--text-tertiary)', fontWeight: 400, textAlign: 'left' as const, padding: 'var(--space-2)' };
const td = { ...mono, padding: 'var(--space-2)', color: 'var(--text-secondary)' };

function MappingTable() {
  return (
    <Page>
      <Section
        title="Score → band → rating → map symbol (trust-gradient.ts + link-trust-rating.ts)"
        note={
          <>
            Bands: 1.00–0.85 nominal · 0.85–0.60 watching · 0.60–0.30 degraded · &lt;0.30 failed. ROE floor{' '}
            {ROE_FLOOR.toFixed(2)}. The map symbol (both live renderers) shows trust as the side gauge (fill height = score, band
            colour) and J right of the gauge: at rest below the floor, on hover above it. No halo, no pulse, no opacity change
            (Decisions/Track Symbology, decision 2).
          </>
        }
      >
        <table style={{ borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={th}>score</th>
              <th style={th}>band</th>
              <th style={th}>token</th>
              <th style={th}>css</th>
              <th style={th}>trustRgb</th>
              <th style={th}>rating</th>
              <th style={th}>J</th>
              <th style={th}>J at rest</th>
              <th style={th}>map symbol (32 px)</th>
            </tr>
          </thead>
          <tbody>
            {ROWS.map((s) => {
              const band = trustBand(s);
              const r = rateLinkTrust(s);
              return (
                <tr key={s} style={{ borderTop: '1px solid var(--surface-elevated)' }}>
                  <td className="tabular" style={{ ...td, color: `var(--trust-${band})` }}>{s.toFixed(2)}</td>
                  <td style={td}>{band}</td>
                  <td style={td}>{trustVarForBand(band)}</td>
                  <td style={td}>
                    <span style={{ display: 'inline-block', width: 28, height: 16, background: trustOklch(s) }} />
                  </td>
                  <td style={td}>
                    <span style={{ display: 'inline-block', width: 28, height: 16, background: `rgb(${trustRgb(s).join(' ')})` }} />
                  </td>
                  <td style={{ ...td, color: r.labelToken }}>{r.label}</td>
                  <td style={td}>{r.jCode}</td>
                  <td style={td}>{r.visibleAtRest ? 'yes' : 'hover'}</td>
                  <td style={td}>
                    <TrackSymbol track={{ affiliation: 'friendly', sensorType: 'offense', designation: 'B', score: s }} sizePx={32} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Section>
    </Page>
  );
}

/** The full score → color / rating / J / map-symbol table. */
export const Mapping: Story = { render: () => <MappingTable /> };

// ---------------------------------------------------------------------------

/** Spec §3.3 gradient stops (continuous) — interpolated in OKLCH. */
const SPEC_STOPS: Array<[number, [number, number, number]]> = [
  [1.0, [85, 0.18, 145]],
  [0.85, [85, 0.18, 145]],
  [0.6, [75, 0.16, 90]],
  [0.3, [62, 0.18, 60]],
  [0.0, [45, 0.14, 35]],
];

function specOklch(score: number): string {
  for (let i = 0; i < SPEC_STOPS.length - 1; i++) {
    const [s0, a] = SPEC_STOPS[i]!;
    const [s1, b] = SPEC_STOPS[i + 1]!;
    if (score <= s0 && score >= s1) {
      const t = s0 === s1 ? 0 : (s0 - score) / (s0 - s1);
      const mix = a.map((v, k) => v + (b[k]! - v) * t);
      return `oklch(${mix[0]!.toFixed(1)}% ${mix[1]!.toFixed(3)} ${mix[2]!.toFixed(1)})`;
    }
  }
  return 'transparent';
}

function Strips() {
  const steps = Array.from({ length: 101 }, (_, i) => 1 - i / 100);
  const strip = (fn: (s: number) => string) => (
    <div style={{ display: 'flex', height: 40, position: 'relative' }}>
      {steps.map((s) => (
        <div key={s} title={s.toFixed(2)} style={{ flex: 1, background: fn(s) }} />
      ))}
      <div
        aria-hidden
        style={{ position: 'absolute', left: `${(1 - ROE_FLOOR) * 100}%`, top: -6, bottom: -6, width: 1, background: 'var(--trust-roe-line)' }}
      />
    </div>
  );
  return (
    <Page>
      <Section title="Implemented — stepped bands (trustOklch)" note="What every component renders today: four flat colors.">
        {strip(trustOklch)}
      </Section>
      <Section title="Spec §3.3 — continuous gradient" note="Endpoints from the Branding doc, interpolated in OKLCH. Note the spec's watching/degraded/failed stop values differ from tokens.css.">
        {strip(specOklch)}
      </Section>
      <div style={{ ...mono, display: 'flex', justifyContent: 'space-between', color: 'var(--text-tertiary)' }}>
        <span>1.00</span>
        <span>ROE 0.60 ↑</span>
        <span>0.00</span>
      </div>
    </Page>
  );
}

/** Stepped implementation vs. continuous spec gradient, 1.00 → 0.00. */
export const GradientStrip: Story = { render: () => <Strips /> };

/** Readout numerals for one sample per band. */
export const Readouts: Story = {
  render: () => (
    <Page>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 'var(--space-6)' }}>
        {[BAND_SAMPLES.nominal, BAND_SAMPLES.watching, BAND_SAMPLES.degraded, BAND_SAMPLES.failed].map((s) => (
          <TrustReadout key={s} score={s} roeFloor={ROE_FLOOR} />
        ))}
      </div>
    </Page>
  ),
};
