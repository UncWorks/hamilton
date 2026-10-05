import type { Meta, StoryObj } from '@storybook/react';
import { expect, userEvent, waitFor, within } from '@storybook/test';
import { CesiumSpine } from './CesiumSpine';
import {
  AFFILIATION_TRACKS,
  PHASE_TRACKS,
  UNIT_EVALUATION,
  track,
  tracksRecord,
} from '@/stories/fixtures/avdiivka';
import { denseTracks } from '@/stories/fixtures/dense-tracks';
import { cesiumLoader } from '@/stories/support/cesium';
import { spinePlay } from '@/stories/support/spine-play';

const meta = {
  title: 'COP/CesiumSpine',
  component: CesiumSpine,
  loaders: [cesiumLoader],
  args: { evaluations: UNIT_EVALUATION },
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
          '`baseLayer: false` and no Ion token. Requires WebGL. If ' +
          '`/public/cesium` is not staged the canvas stays empty (waitForCesium times out after 8s).\n\n' +
          '**Imagery** (`lib/basemap.ts`, System Design §6c): `NEXT_PUBLIC_BASEMAP=offline` (default once ' +
          '`make fetch-tiles` has provisioned `/public/tiles`) adds a `UrlTemplateImageryProvider` over ' +
          '`/tiles/raster/{z}/{x}/{y}.png` — 512 px tiles z10–15 rendered locally with MapLibre Native from the ' +
          'same Protomaps extract and Hamilton dark style as **COP/MapSpine**, so 2D and 3D match and nothing ' +
          'leaves the origin. Outside the AO the globe stays `--surface-base`. `none` is the old bare globe (see ' +
          '**Basemap off**); `online` is a dev-only, dimmed OSM raster. © OpenStreetMap contributors, Protomaps.\n\n' +
          '**Symbols** — the decided track symbol (**Decisions/Track Symbology**, `src/components/symbol`): FM 1-02 / ' +
          'MCRP 5-12A filled frame + function icon, T left, echelon / J / AR / H at ≥ 28 px (32 px here), the ' +
          'link-trust side gauge and J right of the frame. No circular halo, no pulse. Each symbol is a Cesium ' +
          '**billboard**: `trackSymbolSvg` rasterised at the device pixel ratio, anchored on the frame centre and ' +
          'cached by key (band / gauge step, STALE, J, selection, hover) — a tick that keeps the key only moves the ' +
          'entity. The jammer is the hostile **EW jamming** symbol J1 with the FR-04a method as its H field; ' +
          '`candidateSites` draw as anticipated (dashed) EW symbols. Hover or Tab to a symbol for the rating ' +
          'breakdown (`RatingExplanation`); Escape closes; click / Enter selects.\n\n' +
          '**Camera fit** (`lib/camera-fit.ts`): frames every track plus the jammer / candidate NAI at the ' +
          'fixed −55° pitch (bounding circle → HeadingPitchRange, min range 1.5 km). It re-fits only when a new ' +
          'point appears or one leaves the frame, and never after you pan or zoom; **Fit to tracks** (button or ' +
          '`F`) re-frames and resumes auto-fit.\n\n' +
          '**Declutter** (`lib/declutter.ts` grouping, production `DeclutterStack`): three or more symbols whose ' +
          'centres sit within 1.5 symbol sizes collapse into a bracketed stack with one locator line to their true ' +
          'location, hostile first, three frames + "+n" (FM 1-02 / MCRP 5-12A ¶5-8, decision 6). Hover or click a ' +
          'stack to list every member; Escape closes.',
      },
    },
  },
} satisfies Meta<typeof CesiumSpine>;

export default meta;
type Story = StoryObj<typeof meta>;

/** 0:00 — A/B/C at 1.00 over Avdiivka (engine). */
export const Nominal: Story = {
  parameters: { hamilton: { tracks: PHASE_TRACKS.nominal } },
  play: spinePlay.symbolsAndTooltip('unit_a'),
};

/** 0:45 — B WATCH 0.70 (cadence 1.17 s); A and C 1.00. */
export const Watching: Story = { parameters: { hamilton: { tracks: PHASE_TRACKS.watching } } };

/** 1:15 — B 0.13 (E5, gauge near empty), first below the GPS-guided TSS minimum. No jammer symbol, ring or bearing line (HS-20). */
export const Degraded: Story = {
  parameters: { hamilton: { tracks: PHASE_TRACKS.degraded } },
  play: spinePlay.noPresumedJammer,
};

/** 1:50 — B 0.22, still gated. No jammer symbol, ring or bearing line (HS-20). */
export const Failed: Story = {
  parameters: { hamilton: { tracks: PHASE_TRACKS.failed } },
  play: spinePlay.noPresumedJammer,
};

/** Friendly / hostile / neutral / unknown frames across all four bands (hostile_ew_1 draws as EW jamming). */
export const MixedAffiliations: Story = {
  parameters: { hamilton: { tracks: tracksRecord(...AFFILIATION_TRACKS) } },
};

/** Empty store — the AO fallback view over the basemap, no symbols. */
export const NoTracks: Story = {};

/**
 * Fifteen tracks. After the fit, three knots still hold ≥ 3 symbols within 1.5·s → three bracketed
 * stacks, hostile first. The north-east pair stays two singles.
 */
export const Dense: Story = {
  parameters: { hamilton: { tracks: tracksRecord(...denseTracks(track)) } },
  play: spinePlay.dense,
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

/** Comparison: the 1:50 beat with `basemap="none"` — the pre-basemap dark globe. */
export const BasemapOff: Story = {
  name: 'Basemap off',
  args: { basemap: 'none' },
  parameters: { hamilton: { tracks: PHASE_TRACKS.failed } },
  play: async ({ canvasElement }) => {
    const c = within(canvasElement);
    await waitFor(() => c.getByTestId('spine-overlay'), { timeout: 15_000 });
    await expect(canvasElement.querySelector('[data-basemap]')?.getAttribute('data-basemap')).toBe('none');
    await expect(c.queryByTestId('basemap-attribution')).toBeNull();
  },
};
