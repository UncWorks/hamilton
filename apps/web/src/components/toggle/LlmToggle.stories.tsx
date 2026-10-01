import type { Meta, StoryObj } from '@storybook/react';
import { LlmToggle } from './LlmToggle';
import type { LlmMode, LlmStatus } from '@/store/hamilton';

const meta = {
  title: 'Toggle/LlmToggle',
  component: LlmToggle,
  parameters: {
    docs: {
      story: { iframeHeight: 80 },
      description: {
        component:
          'LLM narrator provider radiogroup (Claude / Local / Off) with a status dot. Status colors reuse trust/gating ' +
          'tokens rather than the `--status-*` tier — see Branding Audit. Clicking a mode updates the store live.',
      },
    },
  },
} satisfies Meta<typeof LlmToggle>;

export default meta;
type Story = StoryObj<typeof meta>;

const seeded = (llmMode: LlmMode, llmStatus: LlmStatus): Story => ({
  parameters: { hamilton: { llmMode, llmStatus } },
});

/** Initial state before the first narration arrives. */
export const ClaudePending = seeded('claude', 'pending');
/** Claude narrating (`--trust-nominal` dot). */
export const ClaudeActive = seeded('claude', 'active');
/** Local llama narrating. */
export const LocalActive = seeded('local', 'active');
/** Deterministic fallback narrator (`--trust-degraded` dot). */
export const DeterministicFallback = seeded('claude', 'fallback');
/** Broker / narrator unreachable (`--gating-primary` dot). */
export const Unreachable = seeded('claude', 'unreachable');
/** Narration off. */
export const Off = seeded('off', 'pending');
