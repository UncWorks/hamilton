import type { Meta, StoryObj } from '@storybook/react';
import { Page, Section, mono, useTokens } from '@/stories/support/foundation-ui';
import { tokensWithPrefix } from '@/stories/support/tokens';

const meta = {
  title: 'Foundations/Spacing',
  parameters: { layout: 'fullscreen', docs: { story: { inline: true } } },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

function SpaceScale() {
  const space = tokensWithPrefix(useTokens(), '--space-');
  return (
    <Page>
      <Section title="Spacing scale" note="Parsed live from tokens.css. 'Quiet rhythm, not uniform' — no --space-5/7/9–11.">
        {space.map((t) => (
          <div key={t.name} style={{ display: 'grid', gridTemplateColumns: '140px 80px 1fr', gap: 'var(--space-4)', alignItems: 'center' }}>
            <code style={{ ...mono, color: 'var(--text-primary)' }}>{t.name}</code>
            <code style={{ ...mono, color: 'var(--text-tertiary)' }}>{t.value}</code>
            <div style={{ height: 12, width: `var(${t.name})`, background: 'var(--gating-primary)', opacity: 0.7 }} />
          </div>
        ))}
      </Section>
    </Page>
  );
}

/** The --space-* scale. */
export const Scale: Story = { render: () => <SpaceScale /> };

const OFF_SCALE = [
  { where: 'BrandBar.tsx:28', value: 'gap: 4 (px)', token: '--space-1' },
  { where: 'LlmToggle.tsx:64', value: "padding: '2px 6px'", token: 'none (between --space-1 and --space-2)' },
  { where: 'LlmToggle.tsx:41-42', value: '8 × 8 status dot', token: '--space-2 (8px) as size' },
  { where: 'EventTerminal.tsx:90', value: 'height - 32 (header height assumed)', token: 'derived — breaks if header padding changes' },
  { where: 'page.tsx:74', value: "gridTemplateRows: '56px 1fr 160px'", token: 'layout constants; spec §7.2 24px gutters not applied' },
  { where: 'KillChainGate.tsx:75', value: 'maxWidth: 720', token: 'no layout-width tokens' },
];

const RADII = [
  { where: 'CandidateCards.tsx:60', value: '4px', role: 'empty candidate card (dashed)' },
  { where: 'LlmToggle.tsx:34', value: '2px', role: 'toggle container' },
  { where: 'LlmToggle.tsx:43', value: '4px (circle)', role: 'status dot' },
  { where: 'everything else', value: '0', role: 'cards, modal, panel, buttons' },
];

/** Hard-coded spacing / sizing and the radii in use (no radius tokens exist). */
export const OffScaleValues: Story = {
  render: () => (
    <Page>
      <Section title="Off-scale spacing & sizes">
        <table style={{ borderCollapse: 'collapse' }}>
          <tbody>
            {OFF_SCALE.map((o) => (
              <tr key={o.where} style={{ borderTop: '1px solid var(--surface-elevated)' }}>
                <td style={{ ...mono, padding: 'var(--space-2)', color: 'var(--text-primary)' }}>{o.where}</td>
                <td style={{ ...mono, padding: 'var(--space-2)', color: 'var(--text-secondary)' }}>{o.value}</td>
                <td style={{ ...mono, padding: 'var(--space-2)', color: 'var(--text-tertiary)' }}>→ {o.token}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>
      <Section title="Border radii in use" note="The system is square by intent (instrument register); two components round corners.">
        <div style={{ display: 'flex', gap: 'var(--space-4)', flexWrap: 'wrap' }}>
          {RADII.map((r) => (
            <div key={r.where} style={{ display: 'grid', gap: 'var(--space-1)', justifyItems: 'start' }}>
              <div
                style={{
                  width: 96,
                  height: 48,
                  border: '1px solid var(--text-tertiary)',
                  borderRadius: r.value.startsWith('4') ? 4 : r.value.startsWith('2') ? 2 : 0,
                }}
              />
              <code style={{ ...mono, color: 'var(--text-primary)' }}>{r.value}</code>
              <code style={{ ...mono, color: 'var(--text-tertiary)' }}>{r.where}</code>
            </div>
          ))}
        </div>
      </Section>
    </Page>
  ),
};

const Z = [
  { layer: 'Brand bar', spec: 20, impl: '20 (BrandBar.tsx:17)' },
  { layer: 'Side panel / terminal', spec: 10, impl: 'none (grid flow)' },
  { layer: 'Citation hover card', spec: 50, impl: 'not implemented (native title tooltip)' },
  { layer: 'Modal scrim', spec: 90, impl: 'merged into frame container' },
  { layer: 'Modal frame', spec: 100, impl: '100 (KillChainGate.tsx:64)' },
];

/** §7.2 z-index discipline vs. implementation. */
export const ZIndex: Story = {
  render: () => (
    <Page>
      <Section title="Z-index layers">
        <table style={{ borderCollapse: 'collapse' }}>
          <tbody>
            {Z.map((z) => (
              <tr key={z.layer} style={{ borderTop: '1px solid var(--surface-elevated)' }}>
                <td style={{ ...mono, padding: 'var(--space-2)', color: 'var(--text-primary)' }}>{z.layer}</td>
                <td className="tabular" style={{ ...mono, padding: 'var(--space-2)', color: 'var(--text-secondary)' }}>spec {z.spec}</td>
                <td style={{ ...mono, padding: 'var(--space-2)', color: 'var(--text-tertiary)' }}>{z.impl}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>
    </Page>
  ),
};
