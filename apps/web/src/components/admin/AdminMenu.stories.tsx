import type { Decorator, Meta, StoryObj } from '@storybook/react';
import { useState } from 'react';
import { expect, userEvent, waitFor, within } from '@storybook/test';
import { AdminMenu } from './AdminMenu';
import { useDemoView } from '@/store/demo-view';
import { matchingPreset, type DemoComponentId, type PresetId } from '@/lib/demo-view';

interface DemoViewSeed {
  hidden?: readonly DemoComponentId[];
  preset?: PresetId | 'custom';
}

/**
 * Seeds the demo-view store once per story mount (the store is a module
 * singleton). AdminMenu has no gate of its own (BrandBar mounts it only when
 * admin is enabled), so rendering it here is "admin forced on".
 */
const seedDemoView: Decorator = (Story, { parameters }) => {
  useState(() => {
    const seed = (parameters.demoView ?? {}) as DemoViewSeed;
    const hidden = seed.hidden ?? [];
    useDemoView.setState({ v: 1, hidden, preset: seed.preset ?? matchingPreset(hidden) });
    return true;
  });
  return <Story />;
};

/** A stand-in for the brand bar's right cluster, so the trigger sits top right. */
const barShell: Decorator = (Story) => (
  <div
    style={{
      height: 56,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'flex-end',
      gap: 'var(--space-4)',
      padding: '0 var(--space-6)',
      borderBottom: '1px solid var(--surface-panel)',
      fontFamily: 'var(--font-mono)',
      fontSize: 'var(--text-micro)',
      color: 'var(--text-tertiary)',
      letterSpacing: '0.08em',
      textTransform: 'uppercase',
    }}
  >
    <Story />
  </div>
);

const meta = {
  title: 'Admin/AdminMenu',
  component: AdminMenu,
  decorators: [barShell, seedDemoView],
  parameters: {
    layout: 'fullscreen',
    docs: {
      story: { iframeHeight: 720 },
      description: {
        component:
          'Presenter-only Admin trigger and its non-modal **Demo simulation** panel. A view filter over COP ' +
          'components on this screen only; it never changes data, timers or the after-action record. Mounted by ' +
          'BrandBar only in an admin session. Alt+Shift+A toggles the panel; Alt+Shift+0–4 apply presets even ' +
          'while it is closed; Escape, the trigger or a click outside closes it and focus returns.',
      },
    },
  },
} satisfies Meta<typeof AdminMenu>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Closed: one quiet word in the bar. */
export const Closed: Story = {};

/** Open on the Full view. */
export const Open: Story = {
  args: { defaultOpen: true },
};

/** Custom view: the trust panel (and its children) plus the log are hidden. */
export const CustomWithHidden: Story = {
  args: { defaultOpen: true },
  parameters: {
    demoView: { hidden: ['side.trustPanel', 'log.terminal', 'map.aoeKey'] satisfies DemoComponentId[] },
  },
};

/** Keyboard: open, toggle a checkbox, see Custom, Show all, Escape returns focus. */
export const KeyboardFlow: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const trigger = canvas.getByRole('button', { name: 'Admin' });
    trigger.focus();
    await userEvent.keyboard('{Enter}');
    const panel = await canvas.findByRole('region', { name: 'Admin' });
    await expect(trigger).toHaveAttribute('aria-expanded', 'true');
    await waitFor(() => expect(panel.contains(document.activeElement)).toBe(true));

    const cb = within(panel).getByTestId('admin-cb-map.aoeKey');
    cb.focus();
    await userEvent.keyboard(' ');
    await expect(cb).not.toBeChecked();
    await expect(within(panel).getByTestId('admin-state-map.aoeKey')).toHaveTextContent('hidden');
    await expect(within(panel).getByTestId('admin-preset-state')).toHaveTextContent('Custom');

    await userEvent.click(within(panel).getByTestId('admin-show-all'));
    await expect(within(panel).getByTestId('admin-preset-full')).toHaveAttribute('aria-checked', 'true');

    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(canvas.queryByRole('region', { name: 'Admin' })).toBeNull());
    await expect(document.activeElement).toBe(trigger);
  },
};
