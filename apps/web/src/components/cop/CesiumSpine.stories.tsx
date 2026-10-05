import type { Meta, StoryObj } from '@storybook/react';
import { useLayoutEffect, type ReactNode } from 'react';
import { expect, userEvent, waitFor, within } from '@storybook/test';
import { CesiumSpine } from './CesiumSpine';
import {
  AFFILIATION_TRACKS,
  PHASE_TRACKS,
  UNIT_EVALUATION,
  track,
  clustered,
  tracksRecord,
} from '@/stories/fixtures/avdiivka';
import { denseTracks } from '@/stories/fixtures/dense-tracks';
import { cesiumLoader } from '@/stories/support/cesium';
import { spinePlay } from '@/stories/support/spine-play';
import { AoeStoryFrame, GnssPaletteTable, aoePlay, aoeSeed, colourVisionPlay } from '@/stories/support/aoe-stories';
import { withVision } from '@/stories/support/vision-filters';
import { matchingPreset, type DemoComponentId } from '@/lib/demo-view';
import { useDemoView } from '@/store/demo-view';

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
  parameters: { hamilton: { tracks: clustered(PHASE_TRACKS.watching) } }, // co-located A/B/C: the 8-unit layout never stacks
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

// ---------------------------------------------------------------------------
// Jammer area of effect (FR-06a; converted from Previews/Jammer AoE)
// ---------------------------------------------------------------------------

const aoeDocs = (story: string) => ({ docs: { story: { inline: false, iframeHeight: 640 }, description: { story } } });

/** 1:15 — first estimate (frozen CP1 fixture): civil 90% tint + edge, 50% dashed, label, key; the card block. */
export const AoeFirstEstimate: Story = {
  name: 'AoE 1:15 first estimate',
  render: () => <AoeStoryFrame spine={(e) => <CesiumSpine emitterEstimate={e} evaluations={UNIT_EVALUATION} />} />,
  parameters: {
    hamilton: aoeSeed('b115'),
    ...aoeDocs(
      'GNSS degraded B, D, E, H; healthy C, A, F, G → `integrity/emitter/estimate`. Civil GPS only (military GPS / DAGR is listed in the card, D6). ' +
        'No jammer symbol, ring or bearing (HS-20). The card names who is inside, GPS-dependent first, and what is not assessed. ' +
        'D, E and H take synthetic link-trust samples (no engine beat for them yet).',
    ),
  },
  play: aoePlay.b115,
};

// --- Admin · Demo simulation view filter (docs/plans/admin-demo-menu.md D8) --

const MAP_DEMO_IDS: DemoComponentId[] = ['map.tracks', 'map.aoeArea', 'map.aoeLabel', 'map.aoeKey', 'map.fitButton'];

/** Applies `hidden` to the demo-view store while the story is mounted (args update it live). */
function DemoViewFrame({ hidden, children }: { hidden: readonly DemoComponentId[]; children: ReactNode }) {
  const key = hidden.join();
  useLayoutEffect(() => {
    const ids = key ? (key.split(',') as DemoComponentId[]) : [];
    useDemoView.setState({ hidden: ids, preset: matchingPreset(ids) });
  }, [key]);
  useLayoutEffect(() => () => useDemoView.getState().reset(), []);
  return <>{children}</>;
}

/**
 * The 1:15 beat with the map's demo-view components hidden (the Admin menu's
 * view filter). Toggle `demoHidden` to show / hide each one in place: the
 * polygons come back without replaying the fade, hidden symbols stay hidden
 * through a pan or zoom, and F still fits with the button hidden.
 */
export const AoeDemoView: StoryObj<{ demoHidden: DemoComponentId[] }> = {
  name: 'AoE 1:15 demo view (hidden components)',
  args: { demoHidden: MAP_DEMO_IDS },
  argTypes: { demoHidden: { control: 'check', options: MAP_DEMO_IDS } },
  render: (args) => (
    <DemoViewFrame hidden={args.demoHidden}>
      <AoeStoryFrame spine={(e) => <CesiumSpine emitterEstimate={e} evaluations={UNIT_EVALUATION} />} />
    </DemoViewFrame>
  ),
  parameters: {
    hamilton: aoeSeed('b115'),
    ...aoeDocs(
      'Admin · Demo simulation: `map.*` components hidden through the demo-view store. A view filter only: the estimate, ' +
        'the fade and the declutter keep running. The basemap attribution is never hidden.',
    ),
  },
  play: async ({ canvasElement, args }) => {
    const c = within(canvasElement);
    const layer = await c.findByTestId('aoe-layer', {}, { timeout: 15000 });
    const hidden = args.demoHidden;
    await waitFor(() => expect(layer.getAttribute('data-layers')).toContain('edge90-gnss_civil'), { timeout: 15000 });
    if (hidden.includes('map.aoeArea')) await expect(layer.getAttribute('data-hidden') ?? '').toContain('area');
    if (hidden.includes('map.aoeLabel')) await expect(c.queryByTestId('aoe-label')).toBeNull();
    if (hidden.includes('map.aoeKey')) await expect(c.queryByTestId('aoe-key')).toBeNull();
    if (hidden.includes('map.fitButton')) await expect(c.queryByTestId('fit-to-tracks')).toBeNull();
    if (hidden.includes('map.tracks')) await expect(canvasElement.querySelector('[data-testid^="cop-symbol-"], [data-testid="declutter-stack"]')).toBeNull();
  },
};

/** 1:50 — B moved 5 km west: healthy now, its old degraded report still counts; the estimate updates. */
export const AoeAfterMove: Story = {
  name: 'AoE 1:50 after B moves',
  render: () => <AoeStoryFrame spine={(e) => <CesiumSpine emitterEstimate={e} evaluations={UNIT_EVALUATION} />} />,
  parameters: { hamilton: aoeSeed('b150'), ...aoeDocs('B is outside the 90% area at its new position; the card lists both B reports (✕ 39 s at the old position, ○ 2 s now).') },
  play: aoePlay.b150,
};

/** 2:15 — jammer off, +10 s: STALE. Outline only, "Last est. HHMMZ", never "clear". */
export const AoeStale: Story = {
  name: 'AoE 2:15 stale',
  render: () => <AoeStoryFrame spine={(e) => <CesiumSpine emitterEstimate={e} evaluations={UNIT_EVALUATION} />} />,
  parameters: { hamilton: aoeSeed('b215'), ...aoeDocs('HS-25: outline only, no fill; label and card read "Last est. HHMMZ". It is removed on the empty retained payload (+120 s).') },
  play: aoePlay.b215,
};

/** Every reporting civil unit degraded: nothing drawn, the card reads "edge not observed". */
export const AoeUnbounded: Story = {
  name: 'AoE unbounded',
  render: () => <AoeStoryFrame spine={(e) => <CesiumSpine emitterEstimate={e} evaluations={UNIT_EVALUATION} />} />,
  parameters: { hamilton: aoeSeed('unbounded'), ...aoeDocs('HS-21: no healthy unit of the class, so no edge was observed — no area is drawn.') },
  play: aoePlay.unbounded,
};

/** 1:15 through a CVD filter (vision control) with the GNSS palette checks (FR-06a (4)). */
export const AoeColourVision: Story = {
  name: 'AoE colour vision',
  args: { vision: 'deuteranopia' } as never,
  argTypes: { vision: { control: 'inline-radio', options: ['normal', 'deuteranopia', 'protanopia', 'grayscale'] } } as never,
  decorators: [withVision],
  render: () => (
    <div style={{ position: 'relative', height: '100vh' }}>
      <AoeStoryFrame spine={(e) => <CesiumSpine emitterEstimate={e} evaluations={UNIT_EVALUATION} />} />
      <GnssPaletteTable />
    </div>
  ),
  parameters: {
    hamilton: aoeSeed('b115'),
    ...aoeDocs(
      'Machado 2009 (severity 1.0) filters over the whole frame. Checks: AoE hues vs trust / gating / enemy ΔE76 ≥ 30 under normal, deuteranopia and protanopia; ' +
        'edges ≥ 3:1 vs `--surface-base` (and vs the AO basemap pixels in `scripts/basemap/contrast-check.mjs`). Civil violet vs friendly blue is advisory (D2).',
    ),
  },
  play: colourVisionPlay,
};
