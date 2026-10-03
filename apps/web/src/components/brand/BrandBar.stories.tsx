import type { Meta, StoryObj } from '@storybook/react';
import { BrandBar } from './BrandBar';

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
          '(on once any fire mission has failed TSS this session, §10.6), LLM provider toggle, operator seat `FDC · ADAM`. ' +
          'Tagline: "link reliability for fires". Reads `tssFailedThisSession`, `llmMode`, `llmStatus` from the store.',
      },
    },
  },
} satisfies Meta<typeof BrandBar>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Session start — no TSS FAIL yet, LLM pending. */
export const Default: Story = {};

/** A mission has failed TSS — hairline rule extends and stays on (§10.6 "Hamilton was on its feet"). */
export const AfterTssFail: Story = {
  parameters: { hamilton: { tssFailedThisSession: true, llmStatus: 'active' } },
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
    hamilton: { tssFailedThisSession: true },
  },
};
