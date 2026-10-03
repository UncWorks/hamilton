import type { Meta, StoryObj } from '@storybook/react';
import { BrandBar } from './BrandBar';
import { GATE_OPEN, GATE_RESOLVED } from '@/stories/fixtures/avdiivka';

const meta = {
  title: 'Brand/BrandBar',
  component: BrandBar,
  parameters: {
    layout: 'fullscreen',
    docs: {
      story: { iframeHeight: 90 },
      description: {
        component:
          'Sticky 56px brand bar (Branding §7.2): wordmark + tagline lockup, conditional `--gating-primary` hairline ' +
          '(on once any kill-chain gate has fired this session, §10.6), LLM provider toggle, operator seat `FDC · ADAM`. ' +
          'Reads `gateHistory`, `llmMode`, `llmStatus` from the store.',
      },
    },
  },
} satisfies Meta<typeof BrandBar>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Session start — no gate yet, LLM pending. */
export const Default: Story = {};

/** A gate has fired — hairline rule extends and stays on (§10.6 "Hamilton was on its feet"). */
export const AfterGateFired: Story = {
  parameters: { hamilton: { gateHistory: [GATE_RESOLVED], llmStatus: 'active' } },
};

/** Gate currently open (the modal is on screen elsewhere). */
export const GateActive: Story = {
  parameters: { hamilton: { gateHistory: [GATE_OPEN], gateActive: true, llmStatus: 'active' } },
};

export const LlmClaudeActive: Story = {
  parameters: { hamilton: { llmMode: 'claude', llmStatus: 'active' } },
};

export const LlmLocalFallback: Story = {
  parameters: { hamilton: { llmMode: 'local', llmStatus: 'fallback' } },
};

export const LlmOffUnreachable: Story = {
  parameters: { hamilton: { llmMode: 'off', llmStatus: 'unreachable' } },
};

/** Narrow viewport — checks how the lockup and right cluster compete for width. */
export const Narrow: Story = {
  parameters: {
    viewport: { defaultViewport: 'mobile2' },
    hamilton: { gateHistory: [GATE_RESOLVED] },
  },
};
