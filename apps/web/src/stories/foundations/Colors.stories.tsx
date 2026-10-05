import type { Meta, StoryObj } from '@storybook/react';
import { Page, Section, Swatch, grid, mono, useTokens } from '@/stories/support/foundation-ui';
import {
  hexToRgb,
  oklchToRgb,
  parseOklch,
  rgbDistance,
  rgbToHex,
  tokensWithPrefix,
  type Rgb,
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
  { prefix: '--surface-', title: '§3.1 Surface tiers', note: 'Three dark depth levels plus the popover shadow tint.' },
  { prefix: '--text-', title: '§3.2 Text emphasis', note: 'Color tokens only (the --text-* size scale is on Typography).' },
  { prefix: '--trust-', title: '§3.3 Trust gradient', note: 'Load-bearing. Phosphor appears only in --trust-nominal and --gating-secondary.' },
  { prefix: '--gating-', title: '§3.4 TSS gating accent', note: 'Amber primary, phosphor secondary. Not red.' },
  { prefix: '--affiliation-', title: '§3.5 Track affiliation', note: 'Defined in CSS but unused by components. The live map symbols use the doctrinal fills (components/symbol DOCTRINAL_FILL), not these tokens.' },
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

const LITERALS: Array<{ where: string; literal: string; rgb: Rgb; nearest: string }> = [
  { where: 'CesiumSpine.tsx (globe base + background) · app/layout.tsx themeColor', literal: '#0a0d12', rgb: hexToRgb('#0a0d12'), nearest: '--surface-base' },
];

function HardCodedTable() {
  const tokens = useTokens();
  return (
    <Page>
      <Section
        title="Hard-coded color literals in components"
        note="Literals that bypass tokens.css. WebGL cannot read CSS custom properties, so the Cesium globe colour is a literal; it should match --surface-base."
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
