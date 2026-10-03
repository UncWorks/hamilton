import type { Meta, StoryObj } from '@storybook/react';
import { expect, userEvent, waitFor, within } from '@storybook/test';
import { CesiumSpine } from './CesiumSpine';
import {
  AFFILIATION_TRACKS,
  CANDIDATE_SITES,
  JAMMER_LOCATION,
  PHASE_TRACKS,
  UNIT_EVALUATION,
  track,
  tracksRecord,
} from '@/stories/fixtures/avdiivka';
import { denseTracks } from '@/stories/fixtures/dense-tracks';
import { cesiumLoader } from '@/stories/support/cesium';
import { spinePlay } from '@/stories/support/spine-play';

const unitB = PHASE_TRACKS.degraded.unit_b!;
const JAMMER = { ...JAMMER_LOCATION, method_id: 'ground_based_gps_uhf_barrage' };

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
          '`baseLayer: false`, so it renders fully offline — no Ion token, no imagery. Requires WebGL. If ' +
          '`/public/cesium` is not staged the canvas stays empty (waitForCesium times out after 8s).\n\n' +
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

/**
 * 1:15 — B 0.13 (E5, gauge near empty), first below the GPS-guided TSS minimum: bearing line toward the suspected jammer.
 * The web draws the line when B < 0.60, i.e. from 1:15; Branding §10.3 places it at 1:05 (open UX
 * item, Branding Audit F02).
 */
export const DirectionalVector: Story = {
  args: { directionalFrom: { lat: unitB.lat, lon: unitB.lon }, directionalTo: JAMMER_LOCATION },
  parameters: { hamilton: { tracks: PHASE_TRACKS.degraded } },
};

/** 1:50 — B 0.22, still gated; the jammer fix J1 (hostile EW) with the top FR-04a method as its H field. */
export const JammerOverlay: Story = {
  args: {
    directionalFrom: { lat: unitB.lat, lon: unitB.lon },
    directionalTo: JAMMER_LOCATION,
    jammerLocation: JAMMER,
  },
  parameters: { hamilton: { tracks: PHASE_TRACKS.failed } },
};

/** 1:15 — FR-04a candidate sites (MOCK geolocations) as anticipated, dashed hostile EW symbols C1–C3. */
export const CandidateSites: Story = {
  args: {
    directionalFrom: { lat: unitB.lat, lon: unitB.lon },
    directionalTo: JAMMER_LOCATION,
    candidateSites: CANDIDATE_SITES,
    candidateNai: JAMMER_LOCATION,
  },
  parameters: { hamilton: { tracks: PHASE_TRACKS.degraded } },
};

/** Friendly / hostile / neutral / unknown frames across all four bands (hostile_ew_1 draws as EW jamming). */
export const MixedAffiliations: Story = {
  parameters: { hamilton: { tracks: tracksRecord(...AFFILIATION_TRACKS) } },
};

/** Empty store — bare globe. */
export const NoTracks: Story = {};

/**
 * Fifteen tracks + the jammer fix. After the fit, three knots still hold ≥ 3 symbols
 * within 1.5·s → three bracketed stacks, hostile first. The jammer J1 joins the hostile knot's stack, so its
 * method label (H) can no longer cross that stack's locator line. The north-east pair stays two singles.
 */
export const Dense: Story = {
  args: { jammerLocation: JAMMER },
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
