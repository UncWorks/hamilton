import { useEffect, useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import { Page, Section, mono, useTokens } from '@/stories/support/foundation-ui';
import { tokensWithPrefix } from '@/stories/support/tokens';

const meta = {
  title: 'Foundations/Typography',
  parameters: { layout: 'fullscreen', docs: { story: { inline: true } } },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

const SCALE_ROLE: Record<string, string> = {
  '--text-micro': 'citation, timestamp, eyebrows',
  '--text-body': 'trust-trace bullets, body',
  '--text-panel': 'side-panel headers, modal options',
  '--text-modal': '"Kill-chain gated below ROE floor."',
  '--text-hero': 'deck slide titles (unused in app)',
  '--text-readout': 'the trust score numeral',
};

function TypeScale() {
  const scale = tokensWithPrefix(useTokens(), '--text-').filter((t) => t.value.startsWith('clamp'));
  return (
    <Page>
      <Section title="§4.2 Fluid type scale" note="Parsed live from tokens.css. Resize the viewport to see the clamp() ranges move.">
        {scale.map((t) => (
          <div
            key={t.name}
            style={{
              display: 'grid',
              gridTemplateColumns: '220px 1fr',
              alignItems: 'baseline',
              gap: 'var(--space-4)',
              padding: 'var(--space-3) 0',
              borderTop: '1px solid var(--surface-elevated)',
            }}
          >
            <div style={{ display: 'grid', gap: 2 }}>
              <code style={{ ...mono, color: 'var(--text-primary)' }}>{t.name}</code>
              <code style={{ ...mono, color: 'var(--text-tertiary)' }}>{t.value}</code>
              <span style={{ fontSize: 'var(--text-micro)', color: 'var(--text-tertiary)' }}>{SCALE_ROLE[t.name] ?? ''}</span>
            </div>
            <div style={{ fontSize: `var(${t.name})`, color: 'var(--text-primary)', lineHeight: 1.15 }}>
              {t.name === '--text-readout' ? <span className="trust-readout">0.42</span> : 'Trust on B-position below ROE floor.'}
            </div>
          </div>
        ))}
      </Section>
    </Page>
  );
}

/** The six-step fluid scale with its spec role. */
export const Scale: Story = { render: () => <TypeScale /> };

function FontStatus({ family, weight }: { family: string; weight: number }) {
  const [loaded, setLoaded] = useState<boolean | null>(null);
  useEffect(() => {
    if (typeof document === 'undefined' || !document.fonts) return;
    const spec = `${weight} 16px "${family}"`;
    document.fonts
      .load(spec)
      .then(() => setLoaded(document.fonts.check(spec)))
      .catch(() => setLoaded(false));
  }, [family, weight]);
  return (
    <span style={{ ...mono, color: loaded ? 'var(--trust-nominal)' : 'var(--gating-primary)' }}>
      {loaded === null ? 'checking…' : loaded ? 'woff2 loaded' : 'NOT LOADED — system fallback rendering'}
    </span>
  );
}

const FAMILIES = [
  { token: '--font-sans', family: 'Inter Tight', weights: [400, 500, 600], spec: 'Söhne Buch (Inter Tight = licensed substitute)' },
  { token: '--font-mono', family: 'JetBrains Mono', weights: [400, 500], spec: 'Berkeley Mono (JetBrains Mono = fallback)' },
];

/** The two families (§4.1), every weight in use, and whether the self-hosted woff2 actually loaded. */
export const Families: Story = {
  render: () => (
    <Page>
      {FAMILIES.map((f) => (
        <Section key={f.token} title={`${f.token} · ${f.family}`} note={`Spec: ${f.spec}. Files expected in /public/fonts (NFR-01).`}>
          {f.weights.map((w) => (
            <div key={w} style={{ display: 'grid', gridTemplateColumns: '220px 1fr', gap: 'var(--space-4)', alignItems: 'baseline' }}>
              <div style={{ display: 'grid' }}>
                <code style={{ ...mono, color: 'var(--text-tertiary)' }}>weight {w}</code>
                <FontStatus family={f.family} weight={w} />
              </div>
              <div style={{ fontFamily: `var(${f.token})`, fontWeight: w, fontSize: 'var(--text-panel)', color: 'var(--text-primary)' }}>
                HAMILTON · 0123456789 · O0 l1 · ground_based_gps_uhf_barrage — “Kill-chain gated.”
              </div>
            </div>
          ))}
        </Section>
      ))}
    </Page>
  ),
};

/** §4.3 tabular numerics — `.trust-readout` / `.tabular` vs. proportional digits. */
export const TabularNumerics: Story = {
  render: () => (
    <Page>
      <Section title=".trust-readout (tnum + zero)" note="Digits must not shift as the score ticks.">
        {['1.00', '0.81', '0.42', '0.18', '0.11'].map((n) => (
          <div key={n} className="trust-readout" style={{ fontSize: 'var(--text-readout)', color: 'var(--text-primary)', lineHeight: 1.1 }}>
            {n}
          </div>
        ))}
      </Section>
      <Section title="Proportional sans (what to avoid for scores)">
        {['1.00', '0.81', '0.42', '0.18', '0.11'].map((n) => (
          <div key={n} style={{ fontSize: 'var(--text-readout)', color: 'var(--text-tertiary)', lineHeight: 1.1 }}>
            {n}
          </div>
        ))}
      </Section>
    </Page>
  ),
};

const EYEBROWS = [
  { where: 'TrustPanel.tsx:88-97 "Trust trace"', style: { fontFamily: 'inherit', letterSpacing: '0.16em' } },
  { where: 'CandidateCards.tsx:17-27 "Top candidate methods"', style: { fontFamily: 'inherit', letterSpacing: '0.16em' } },
  { where: 'EventTerminal.tsx:70-86 "after-action log"', style: { fontFamily: 'var(--font-mono)', letterSpacing: '0.16em' } },
  { where: 'Spine.tsx:45-58 loader', style: { fontFamily: 'var(--font-mono)', letterSpacing: '0.16em' } },
  { where: 'TrustPanel.tsx:19-31 "Awaiting telemetry…"', style: { fontFamily: 'var(--font-mono)', letterSpacing: '0.06em' } },
  { where: 'BrandBar.tsx:57-71 right cluster', style: { fontFamily: 'var(--font-mono)', letterSpacing: '0.08em' } },
];

/** The uppercase micro "eyebrow" label as each component implements it — same role, three variants. */
export const EyebrowVariants: Story = {
  render: () => (
    <Page>
      <Section title="Eyebrow / section label variants" note="Same visual role, inconsistent family + tracking. Candidate for a single token/class.">
        {EYEBROWS.map((e) => (
          <div key={e.where} style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: 'var(--space-4)', alignItems: 'baseline' }}>
            <code style={{ ...mono, color: 'var(--text-tertiary)' }}>{e.where}</code>
            <span style={{ ...e.style, fontSize: 'var(--text-micro)', textTransform: 'uppercase', color: 'var(--text-tertiary)' }}>
              Trust trace · after-action log
            </span>
          </div>
        ))}
      </Section>
    </Page>
  ),
};

const TRACKING = ['0', '0.01em', '0.02em', '0.04em', '0.06em', '0.08em', '0.16em', '0.32em'];

/** Every letter-spacing value in use (no tracking tokens exist). */
export const LetterSpacingInventory: Story = {
  render: () => (
    <Page>
      <Section title="letter-spacing values found in components" note="Eight ad-hoc values; see Branding Audit for file:line.">
        {TRACKING.map((t) => (
          <div key={t} style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: 'var(--space-4)' }}>
            <code style={{ ...mono, color: 'var(--text-tertiary)' }}>{t}</code>
            <span style={{ letterSpacing: t, textTransform: 'uppercase', fontSize: 'var(--text-micro)', color: 'var(--text-primary)' }}>
              ROE floor · 0.60 · unit_b
            </span>
          </div>
        ))}
      </Section>
    </Page>
  ),
};
