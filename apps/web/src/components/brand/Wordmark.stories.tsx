import type { Meta, StoryObj } from '@storybook/react';
import { Wordmark } from './Wordmark';

const meta = {
  title: 'Brand/Wordmark',
  component: Wordmark,
  parameters: {
    docs: {
      description: {
        component:
          'Typographic-only wordmark (Branding §8.1). `H A M I L T O N`, sans 500, tracking 0.32em. ' +
          'Spec calls for inline SVG with flattened paths; the implementation is live text — see Branding Audit.',
      },
      story: { inline: true },
    },
  },
  args: { size: 18 },
  argTypes: {
    size: { control: { type: 'range', min: 10, max: 96, step: 1 } },
    color: { control: 'text' },
  },
} satisfies Meta<typeof Wordmark>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Brand-bar size (18px). */
export const Default: Story = {};

/** Every size the wordmark is used at or proposed for (bar → deck title). */
export const Scale: Story = {
  render: () => (
    <div style={{ display: 'grid', gap: 'var(--space-6)' }}>
      {[12, 18, 24, 36, 56, 72].map((s) => (
        <div
          key={s}
          style={{ display: 'grid', gridTemplateColumns: '56px 1fr', alignItems: 'center' }}
        >
          <code
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 'var(--text-micro)',
              color: 'var(--text-tertiary)',
            }}
          >
            {s}px
          </code>
          <Wordmark size={s} />
        </div>
      ))}
    </div>
  ),
};

/** Deck slide 1 / slide 4 lockup (§8.2, §9.2): hairline rule + wordmark + tagline. */
export const Lockup: Story = {
  args: { size: 48 },
  render: (args) => (
    <div style={{ display: 'inline-grid', gap: 'var(--space-2)', padding: 'var(--space-8)' }}>
      <div
        aria-hidden
        className="motion-hairline-extend"
        style={{ height: 1, background: 'var(--gating-primary)', opacity: 0.6 }}
      />
      <Wordmark {...args} />
      <span
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 'var(--text-micro)',
          color: 'var(--text-tertiary)',
        }}
      >
        link reliability for fires
      </span>
    </div>
  ),
};

/** Color override — gating accent (stage-cue variant). */
export const GatingAccent: Story = { args: { size: 36, color: 'var(--gating-primary)' } };

/** Dimmed — `--text-tertiary` (dead-state chrome). */
export const Tertiary: Story = { args: { size: 24, color: 'var(--text-tertiary)' } };
