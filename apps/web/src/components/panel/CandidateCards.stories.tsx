import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import { CandidateCards } from './CandidateCards';
import {
  CANDIDATES,
  CANDIDATE_NO_MUNITIONS,
  CANDIDATES_LONG,
  CANDIDATES_SINGLE_MATCH,
} from '@/stories/fixtures/avdiivka';

const meta = {
  title: 'Panel/CandidateCards',
  component: CandidateCards,
  decorators: [
    (Story) => (
      <div style={{ maxWidth: 420, background: 'var(--surface-panel)', padding: 'var(--space-6)' }}>
        <Story />
      </div>
    ),
  ],
  parameters: {
    docs: {
      story: { inline: true },
      description: {
        component:
          'FR-04a top-3 jamming-method candidates (Branding §10.4). Each card (private `CandidateCard`) shows ' +
          'method id, match score colored by trust band, named systems, affected munitions and a citation footer ' +
          '(private `CitationHover`, native `title` tooltip). Staggered `fingerprint-candidate-reveal` at 60ms. ' +
          'An empty `method_id` / zero score renders the dashed "no further match" filler.',
      },
    },
  },
  args: { candidates: CANDIDATES },
} satisfies Meta<typeof CandidateCards>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * Avdiivka 1:15 reveal, as the engine ranks the jammer RF against library.json:
 * ground_based_gps_uhf_barrage 1.00 (6/6) · pulsed_uhf_wide 0.67 (4/6) · cellular_uhf_barrage 0.17 (1/6)
 * (nominal / degraded / failed borders — match strength coloured on the trust gradient, Branding §10.4).
 */
export const TopThree: Story = {};

/** Only one candidate matched — remaining slots render the dashed filler card. */
export const SingleMatch: Story = { args: { candidates: CANDIDATES_SINGLE_MATCH } };

/** Single candidate with nothing in inventory — italic "(none in current inventory)". */
export const NoMunitionsAffected: Story = { args: { candidates: [CANDIDATE_NO_MUNITIONS] } };

/** Long method ids, system lists and citations — wrap/overflow stress test. */
export const LongContent: Story = { args: { candidates: CANDIDATES_LONG } };

/** Empty list renders nothing (component returns null). */
export const Empty: Story = { args: { candidates: [] } };

function RevealReplayDemo(props: React.ComponentProps<typeof CandidateCards>) {
  const [n, setN] = useState(0);
  return (
    <div style={{ display: 'grid', gap: 'var(--space-4)' }}>
      <button
        onClick={() => setN((v) => v + 1)}
        style={{
          justifySelf: 'start',
          fontFamily: 'var(--font-mono)',
          fontSize: 'var(--text-micro)',
          color: 'var(--text-tertiary)',
          letterSpacing: '0.16em',
          textTransform: 'uppercase',
        }}
      >
        ↻ replay reveal
      </button>
      <CandidateCards key={n} {...props} />
    </div>
  );
}

/** Replays the staggered reveal animation on click. */
export const RevealReplay: Story = {
  render: (args) => <RevealReplayDemo {...args} />,
};
