import type { Meta, StoryObj } from '@storybook/react';
import { expect, userEvent, waitFor, within } from '@storybook/test';
import { CesiumSpine } from './CesiumSpine';
import {
  AFFILIATION_TRACKS,
  JAMMER_LOCATION,
  PHASE_TRACKS,
  track,
  tracksRecord,
} from '@/stories/fixtures/avdiivka';
import { denseTracks } from '@/lib/dense-tracks.fixture';
import { cesiumLoader } from '@/stories/support/cesium';

const unitB = PHASE_TRACKS.degraded.unit_b!;

const meta = {
  title: 'COP/CesiumSpine',
  component: CesiumSpine,
  loaders: [cesiumLoader],
  decorators: [
    (Story) => (
      // Any aspect: the camera fits the tracks (lib/camera-fit.ts), so the old near-square box for audit A26 is gone.
      <div style={{ height: '100vh', width: '100%', position: 'relative' }}>
        <Story />
      </div>
    ),
  ],
  parameters: {
    layout: 'fullscreen',
    docs: {
      story: { iframeHeight: 520 },
      description: {
        component:
          'Primary 3D renderer (CesiumJS, System Design §6c). Loaded from the staged static build at ' +
          '`/public/cesium` (Storybook `staticDirs`; staged by `scripts/stage-cesium.mjs` on install) with ' +
          '`baseLayer: false`, so it renders fully offline — no Ion token, no imagery. Requires WebGL. ' +
          'Tracks render as Cesium `point`s (circles) with an affiliation fill, trust-band outline and a ' +
          'screen-space halo below 0.60. If `/public/cesium` is not staged the canvas stays empty (waitForCesium ' +
          'times out after 8s).\n\n' +
          '**Camera fit** (`lib/camera-fit.ts`): frames every track plus the jammer / candidate NAI at the ' +
          'fixed −55° pitch (bounding circle → HeadingPitchRange, min range 1.5 km). It re-fits only when a new ' +
          'point appears or one leaves the frame, and never after you pan or zoom; **Fit to tracks** (button or ' +
          '`F`) re-frames and resumes auto-fit.\n\n' +
          '**Declutter** (`lib/declutter.ts`, FM 1-02 / MCRP 5-12A ¶5-8): symbols whose 30 px boxes overlap or ' +
          'sit within 6 px collapse into a bracketed stack with an offset locator line to their true position ' +
          'and a +n count, hostile first. Hover or click a stack to list its members; Escape closes. The stack ' +
          'uses placeholder circles until the production symbol component is wired.',
      },
    },
  },
} satisfies Meta<typeof CesiumSpine>;

export default meta;
type Story = StoryObj<typeof meta>;

/** 0:00 — A/B/C at 1.00 over Avdiivka (engine). */
export const Nominal: Story = { parameters: { hamilton: { tracks: PHASE_TRACKS.nominal } } };

/** 0:45 — B WATCH 0.70 (cadence 1.17 s); A and C 1.00. */
export const Watching: Story = { parameters: { hamilton: { tracks: PHASE_TRACKS.watching } } };

/**
 * 1:15 — B 0.13, first below the ROE floor: halo + directional vector toward the suspected jammer.
 * The web draws the vector when B < 0.60, i.e. from 1:15; Branding §10.3 places it at 1:05 (open UX
 * item, Branding Audit F02).
 */
export const DirectionalVector: Story = {
  args: { directionalFrom: { lat: unitB.lat, lon: unitB.lon }, directionalTo: JAMMER_LOCATION },
  parameters: { hamilton: { tracks: PHASE_TRACKS.degraded } },
};

/** 1:50 — B 0.22, still gated; jammer overlay labelled with the top FR-04a method. */
export const JammerOverlay: Story = {
  args: {
    directionalFrom: { lat: unitB.lat, lon: unitB.lon },
    directionalTo: JAMMER_LOCATION,
    jammerLocation: { ...JAMMER_LOCATION, method_id: 'ground_based_gps_uhf_barrage' },
  },
  parameters: { hamilton: { tracks: PHASE_TRACKS.failed } },
};

/** Friendly / enemy / neutral / unknown across all four bands. */
export const MixedAffiliations: Story = {
  parameters: { hamilton: { tracks: tracksRecord(...AFFILIATION_TRACKS) } },
};

/** Empty store — bare globe. */
export const NoTracks: Story = {};

/**
 * Twelve tracks + jammer. After the fit, A/B/C stand apart but three knots still overlap (two friendlies on
 * Unit B, a hostile/unknown knot on the jammer, a NW pair) → three bracketed stacks, hostile listed first.
 */
export const Dense: Story = {
  args: { jammerLocation: { ...JAMMER_LOCATION, method_id: 'ground_based_gps_uhf_barrage' } },
  parameters: { hamilton: { tracks: tracksRecord(...denseTracks(track)) } },
};

/**
 * Opened at a 30 km range (as if the operator zoomed out): A/B/C sit ~5 px apart and collapse into one stack
 * with an offset locator line. The play function expands it. Press F or **Fit to tracks** to re-frame.
 */
export const ZoomedOut: Story = {
  args: { initialRangeM: 30_000 },
  parameters: { hamilton: { tracks: PHASE_TRACKS.watching } },
  play: async ({ canvasElement }) => {
    const c = within(canvasElement);
    const stack = await waitFor(() => c.getByTestId('declutter-stack'), { timeout: 15_000 });
    await userEvent.click(stack);
    await waitFor(() => expect(stack).toHaveAttribute('aria-expanded', 'true'));
    await expect(c.getAllByTestId('declutter-member')).toHaveLength(3);
  },
};
