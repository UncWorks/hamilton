import type { Meta, StoryObj } from '@storybook/react';
import { AffiliationSchema } from '@hamilton/contracts';
import { affiliationRgb } from '@/stories/archive/track-symbol';
import { trustRgb } from '@/lib/trust-gradient';
import { BAND_SAMPLES } from '@/stories/fixtures/avdiivka';
import { Page, Section, Swatch, grid, mono, useTokens } from '@/stories/support/foundation-ui';
import {
  hexToRgb,
  oklchToRgb,
  parseOklch,
  rgbDistance,
  rgbToHex,
  tokensWithPrefix,
  type Rgb,
  type Token,
} from '@/stories/support/tokens';

const meta = {
  title: 'Foundations/Colors',
  parameters: {
    layout: 'fullscreen',
    docs: { story: { inline: true } },
  },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

const GROUPS: Array<{ prefix: string; title: string; note: string }> = [
  { prefix: '--surface-', title: '§3.1 Surface tiers', note: 'Three dark depth levels + the Beat 1:20 scrim.' },
  { prefix: '--text-', title: '§3.2 Text emphasis', note: 'Color tokens only (the --text-* size scale is on Typography).' },
  { prefix: '--trust-', title: '§3.3 Trust gradient', note: 'Load-bearing. Phosphor appears only in --trust-nominal and --gating-secondary.' },
  { prefix: '--gating-', title: '§3.4 TSS gating accent', note: 'Amber primary, phosphor secondary. Not red.' },
  { prefix: '--affiliation-', title: '§3.5 Track affiliation', note: 'Defined in CSS but unused by components. The live map symbols use the doctrinal fills (components/symbol DOCTRINAL_FILL), not these tokens; the old RGB mirrors below are archived.' },
  { prefix: '--status-', title: '§3.6 Status states', note: 'Defined but unused anywhere in components.' },
  { prefix: '--citation-', title: '§3.7 Citation / provenance', note: '--citation-bg-hover is unused.' },
];

function srgbOf(value: string): string | null {
  const p = parseOklch(value);
  return p ? rgbToHex(oklchToRgb(p.l, p.c, p.h)) + (p.alpha < 1 ? ` @ ${p.alpha}` : '') : null;
}

function ColorPalette() {
  const tokens = useTokens().filter((t) => t.value.startsWith('oklch'));
  return (
    <Page>
      {GROUPS.map((g) => {
        const list = tokensWithPrefix(tokens, g.prefix);
        return (
          <Section key={g.prefix} title={`${g.title} · ${list.length}`} note={g.note}>
            <div style={grid(190)}>
              {list.map((t) => (
                <Swatch
                  key={t.name}
                  token={t.name}
                  value={t.value}
                  extra={<code style={{ ...mono, color: 'var(--text-tertiary)' }}>≈ {srgbOf(t.value)}</code>}
                />
              ))}
            </div>
          </Section>
        );
      })}
    </Page>
  );
}

/** Every color token parsed live from tokens.css, grouped by spec section, with sRGB equivalents. */
export const Palette: Story = { render: () => <ColorPalette /> };

// ---------------------------------------------------------------------------

function DriftRow({ label, token, tokens, mirror, source }: { label: string; token: string; tokens: Token[]; mirror: Rgb; source: string }) {
  const value = tokens.find((t) => t.name === token)?.value ?? '';
  const p = parseOklch(value);
  const css = p ? oklchToRgb(p.l, p.c, p.h) : ([0, 0, 0] as Rgb);
  const d = rgbDistance(css, mirror);
  return (
    <tr>
      <td style={{ ...mono, padding: 'var(--space-2)', color: 'var(--text-primary)' }}>{label}</td>
      <td style={{ padding: 'var(--space-2)' }}>
        <div style={{ display: 'flex', gap: 2 }}>
          <div title={`${token} ${value}`} style={{ width: 48, height: 28, background: `var(${token})` }} />
          <div title={source} style={{ width: 48, height: 28, background: `rgb(${mirror.join(' ')})` }} />
        </div>
      </td>
      <td style={{ ...mono, padding: 'var(--space-2)', color: 'var(--text-tertiary)' }}>
        {token} ≈ {rgbToHex(css)}
      </td>
      <td style={{ ...mono, padding: 'var(--space-2)', color: 'var(--text-tertiary)' }}>
        {source} = {rgbToHex(mirror)}
      </td>
      <td
        className="tabular"
        style={{ ...mono, padding: 'var(--space-2)', color: d > 40 ? 'var(--gating-primary)' : d > 20 ? 'var(--trust-degraded)' : 'var(--text-secondary)' }}
      >
        Δ {d}
      </td>
    </tr>
  );
}

function RendererMirrorTable() {
  const tokens = useTokens();
  return (
    <Page>
      <Section
        title="Renderer RGB mirrors vs. OKLCH source tokens"
        note="HISTORIC: the circle renderers hand-copied RGB triples (trust-gradient.ts trustRgb, the archived track-symbol.ts affiliationRgb). The live spines now draw the decided symbol from components/symbol, whose image colours are resolved from tokens.css literals (SYMBOL_COLOR_LITERALS, trustOklch), so the drift below no longer reaches the map symbols. Left chip = CSS token, right chip = the old mirror. Δ is sRGB Euclidean distance; >20 is visible, >40 is a different color."
      >
        <table style={{ borderCollapse: 'collapse' }}>
          <tbody>
            {(Object.keys(BAND_SAMPLES) as Array<keyof typeof BAND_SAMPLES>).map((band) => (
              <DriftRow
                key={band}
                label={`trust · ${band}`}
                token={`--trust-${band}`}
                tokens={tokens}
                mirror={trustRgb(BAND_SAMPLES[band])}
                source="trustRgb()"
              />
            ))}
            {AffiliationSchema.options.map((a) => (
              <DriftRow
                key={a}
                label={`affiliation · ${a}`}
                token={`--affiliation-${a}`}
                tokens={tokens}
                mirror={affiliationRgb(a)}
                source="affiliationRgb()"
              />
            ))}
          </tbody>
        </table>
      </Section>
    </Page>
  );
}

/** How far the map renderers' RGB approximations drift from the brand tokens. */
export const RendererMirrors: Story = { render: () => <RendererMirrorTable /> };

// ---------------------------------------------------------------------------

const LITERALS: Array<{ where: string; literal: string; rgb: Rgb; nearest: string }> = [
  { where: 'CesiumSpine.tsx:67,153,236 · layout.tsx:13', literal: '#0a0d12', rgb: hexToRgb('#0a0d12'), nearest: '--surface-base' },
  { where: 'CesiumSpine.tsx:152 (track label fill)', literal: '#f5f0e6', rgb: hexToRgb('#f5f0e6'), nearest: '--text-primary' },
  { where: 'CesiumSpine.tsx:235 (jammer label)', literal: '#dbb25a', rgb: hexToRgb('#dbb25a'), nearest: '--gating-primary' },
  { where: 'CesiumSpine.tsx:228,230,258 (jammer + vector)', literal: 'Color(0.86, 0.7, 0.35)', rgb: [219, 179, 89], nearest: '--gating-primary' },
  { where: 'MapSpine.tsx:140 (directional vector)', literal: '[220, 178, 90, 110]', rgb: [220, 178, 90], nearest: '--gating-primary' },
];

function HardCodedTable() {
  const tokens = useTokens();
  return (
    <Page>
      <Section
        title="Hard-coded color literals in components"
        note="Literals that bypass tokens.css. The overlay amber is the trustRgb('degraded') mirror, but Branding §10.3 specifies --gating-primary for the directional vector."
      >
        <table style={{ borderCollapse: 'collapse' }}>
          <tbody>
            {LITERALS.map((l) => {
              const v = tokens.find((t) => t.name === l.nearest)?.value ?? '';
              const p = parseOklch(v);
              const css = p ? oklchToRgb(p.l, p.c, p.h) : ([0, 0, 0] as Rgb);
              return (
                <tr key={l.where}>
                  <td style={{ ...mono, padding: 'var(--space-2)', color: 'var(--text-primary)' }}>{l.where}</td>
                  <td style={{ padding: 'var(--space-2)' }}>
                    <div style={{ display: 'flex', gap: 2 }}>
                      <div style={{ width: 48, height: 28, background: `rgb(${l.rgb.join(' ')})` }} />
                      <div style={{ width: 48, height: 28, background: `var(${l.nearest})` }} />
                    </div>
                  </td>
                  <td style={{ ...mono, padding: 'var(--space-2)', color: 'var(--text-tertiary)' }}>
                    {l.literal} → should be {l.nearest} ({rgbToHex(css)})
                  </td>
                  <td className="tabular" style={{ ...mono, padding: 'var(--space-2)', color: 'var(--text-secondary)' }}>
                    Δ {rgbDistance(l.rgb, css)}
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

/** Color literals in component code, compared with the token they should reference. */
export const HardCodedLiterals: Story = { render: () => <HardCodedTable /> };
