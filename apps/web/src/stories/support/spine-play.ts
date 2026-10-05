// Shared play functions for the COP spine stories (CesiumSpine, MapSpine):
// the production symbol is on the map, hover / focus opens the rating
// breakdown, and the dense fixture stacks as decision 6 says.

import { expect, fireEvent, waitFor, within } from '@storybook/test';

type Play = (ctx: { canvasElement: HTMLElement }) => Promise<void>;
const T = { timeout: 15_000 };

export const spinePlay = {
  /** Symbol hit target present; focus → rating breakdown (factor table); Escape closes. */
  symbolsAndTooltip:
    (id: string): Play =>
    async ({ canvasElement }) => {
      const c = within(canvasElement);
      const hit = await waitFor(() => c.getByTestId(`cop-symbol-${id}`), T);
      await expect(hit.getAttribute('aria-label')).toMatch(/link trust/);
      hit.focus();
      const tip = await waitFor(() => c.getByTestId('cop-rating-tip'), T);
      await expect(tip).toBeVisible();
      await expect(tip.querySelector('[data-factor="temporal"]')).toBeTruthy();
      fireEvent.keyDown(hit, { key: 'Escape' });
      await waitFor(() => expect(c.queryByTestId('cop-rating-tip')).toBeNull());
    },

  /** HS-20: tracks drawn, and no jammer symbol (present or anticipated) anywhere on the COP. */
  noPresumedJammer: (async ({ canvasElement }) => {
    const c = within(canvasElement);
    await waitFor(() => c.getByTestId('spine-overlay'), T);
    await expect(canvasElement.querySelector('[data-symbol-id^="__jammer"], [data-testid^="cop-symbol-__jammer"]')).toBeNull();
    await expect(canvasElement.querySelector('[data-symbol-id^="__candidate"], [data-testid^="cop-symbol-__candidate"]')).toBeNull();
  }) as Play,

  /** Three stacks (≥ 3 within 1.5·s), the hostile knot one of them, the NE pair left as singles; no jammer symbol. */
  dense: (async ({ canvasElement }) => {
    const c = within(canvasElement);
    await waitFor(() => expect(c.getAllByTestId('declutter-stack')).toHaveLength(3), T);
    const hostile = canvasElement.querySelector('[data-testid="declutter-member"][data-symbol-id="hostile_ew_1"]');
    await expect(hostile).toBeTruthy();
    await expect(canvasElement.querySelector('[data-symbol-id^="__jammer"]')).toBeNull();
    await expect(c.getByTestId('cop-symbol-civ_relay_8')).toBeTruthy();
    await expect(c.getByTestId('cop-symbol-unk_emitter_9')).toBeTruthy();
  }) as Play,
};
