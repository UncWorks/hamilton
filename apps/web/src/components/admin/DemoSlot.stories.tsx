import { useEffect, useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import { expect, waitFor, within } from '@storybook/test';
import { DemoSlot } from './DemoSlot';
import { FULL_VIEW } from '@/lib/demo-view';
import { useDemoView } from '@/store/demo-view';

/** Stands in for the MissionQueue 1 Hz tick: a timer that must survive hiding. */
function Ticker() {
  const [n, setN] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setN((x) => x + 1), 100);
    return () => clearInterval(t);
  }, []);
  return (
    <div data-testid="ticker" data-n={n} style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>
      tick {n}
    </div>
  );
}

const meta = {
  title: 'Admin/DemoSlot',
  component: DemoSlot,
  args: { id: 'side.missionQueue', children: <Ticker /> },
  decorators: [
    (Story) => {
      useDemoView.setState({ ...FULL_VIEW });
      return <Story />;
    },
  ],
  parameters: {
    docs: {
      description: {
        component:
          'Admin · Demo simulation wrapper (plan D8). Shown: `display: contents`, so layout is unchanged. Hidden: the `hidden` ' +
          'attribute. Children are never unmounted, so timers (the TSS tick, terminal polling) keep running.',
      },
    },
  },
} satisfies Meta<typeof DemoSlot>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Shown: Story = {};

/** Hidden, then shown again: the ticker kept counting, so it was never unmounted. */
export const HiddenKeepsTicking: Story = {
  play: async ({ canvasElement }) => {
    const slot = canvasElement.querySelector('[data-demo-id="side.missionQueue"]') as HTMLElement;
    const ticker = within(canvasElement).getByTestId('ticker');
    useDemoView.getState().toggle('side.missionQueue');
    await waitFor(() => expect(slot).toHaveAttribute('hidden'));
    await expect(slot).toHaveAttribute('data-demo-hidden');
    const before = Number(ticker.dataset.n);
    await waitFor(() => expect(Number(ticker.dataset.n)).toBeGreaterThan(before + 2));
    useDemoView.getState().toggle('side.missionQueue');
    await waitFor(() => expect(slot).not.toHaveAttribute('hidden'));
    await expect(within(canvasElement).getByTestId('ticker')).toBe(ticker);
  },
};
