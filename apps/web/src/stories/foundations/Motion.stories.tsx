import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import { Page, Section, mono, useTokens } from '@/stories/support/foundation-ui';
import { tokensWithPrefix } from '@/stories/support/tokens';

const meta = {
  title: 'Foundations/Motion',
  parameters: { layout: 'fullscreen', docs: { story: { inline: true } } },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

const PRIMITIVES = [
  { cls: 'motion-modal-frame', spec: 'gating-modal-arrival', used: 'KillChainGate frame + options' },
  { cls: 'motion-modal-subtitle', spec: 'gating-modal-arrival (subtitle, +100ms)', used: 'KillChainGate subtitle' },
  { cls: 'motion-candidate-reveal', spec: 'fingerprint-candidate-reveal', used: 'CandidateCards' },
  { cls: 'motion-hairline-extend', spec: '§9.3 hairline extend', used: 'BrandBar hairline' },
  { cls: 'motion-recovery-pulse', spec: 'recovery-pulse', used: 'UNUSED' },
  { cls: 'motion-cop-blur', spec: 'gating-modal-arrival (COP blur 8px)', used: 'UNUSED — COP never blurs' },
];

const MISSING = ['trust-decay (800ms opacity tween)', 'score-numeral-tick', 'roe-floor-cross', 'playhead-scrub'];

function Primitives() {
  const [n, setN] = useState(0);
  const tokens = useTokens();
  return (
    <Page>
      <Section title="Motion classes (motion.css)" note="Click replay to re-run every primitive. Spec §6.1 lists seven named primitives.">
        <button
          onClick={() => setN((v) => v + 1)}
          style={{ ...mono, justifySelf: 'start', color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.16em' }}
        >
          ↻ replay
        </button>
        <div key={n} style={{ display: 'grid', gap: 'var(--space-3)' }}>
          {PRIMITIVES.map((p) => (
            <div key={p.cls} style={{ display: 'grid', gridTemplateColumns: '260px 1fr', gap: 'var(--space-4)', alignItems: 'center' }}>
              <div style={{ display: 'grid' }}>
                <code style={{ ...mono, color: 'var(--text-primary)' }}>.{p.cls}</code>
                <code style={{ ...mono, color: p.used.startsWith('UNUSED') ? 'var(--gating-primary)' : 'var(--text-tertiary)' }}>
                  {p.spec} · {p.used}
                </code>
              </div>
              <div
                className={p.cls}
                style={{
                  height: p.cls === 'motion-hairline-extend' ? 2 : 32,
                  background: p.cls === 'motion-hairline-extend' ? 'var(--gating-primary)' : 'var(--surface-elevated)',
                  borderLeft: '2px solid var(--gating-secondary)',
                }}
              />
            </div>
          ))}
        </div>
      </Section>
      <Section title="Spec primitives with no implementation">
        <ul style={{ ...mono, margin: 0, color: 'var(--text-tertiary)' }}>
          {MISSING.map((m) => (
            <li key={m}>{m}</li>
          ))}
        </ul>
      </Section>
      <Section title="Easing + duration tokens">
        {[...tokensWithPrefix(tokens, '--ease-'), ...tokensWithPrefix(tokens, '--duration-')].map((t) => (
          <div key={t.name} style={{ display: 'grid', gridTemplateColumns: '260px 1fr', gap: 'var(--space-4)' }}>
            <code style={{ ...mono, color: 'var(--text-primary)' }}>{t.name}</code>
            <code style={{ ...mono, color: 'var(--text-tertiary)' }}>{t.value}</code>
          </div>
        ))}
      </Section>
    </Page>
  );
}

/** All motion.css primitives, replayable, plus the easing/duration tokens. */
export const AllPrimitives: Story = { render: () => <Primitives /> };
