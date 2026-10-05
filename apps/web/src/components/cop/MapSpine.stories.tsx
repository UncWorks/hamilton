import type { Meta, StoryObj } from '@storybook/react';
import { useLayoutEffect, type ReactNode } from 'react';
import { expect, userEvent, waitFor, within } from '@storybook/test';
import { MapSpine } from './MapSpine';
import {
  AFFILIATION_TRACKS,
  PHASE_TRACKS,
  UNIT_EVALUATION,
  track,
  clustered,
  tracksRecord,
} from '@/stories/fixtures/avdiivka';
import { denseTracks } from '@/stories/fixtures/dense-tracks';
import { spinePlay } from '@/stories/support/spine-play';
import { AoeStoryFrame, GnssPaletteTable, aoePlay, aoeSeed, colourVisionPlay } from '@/stories/support/aoe-stories';
import { withVision } from '@/stories/support/vision-filters';
import { matchingPreset, type DemoComponentId } from '@/lib/demo-view';
import { useDemoView } from '@/store/demo-view';

const meta = {
  title: 'COP/MapSpine',
  component: MapSpine,
  args: { evaluations: UNIT_EVALUATION },
  decorators: [
    (Story) => (
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
          '2D fallback renderer (`NEXT_PUBLIC_RENDERER=maplibre`): a MapLibre GL map with deck.gl layers on it ' +
          '(`@deck.gl/mapbox` `MapboxOverlay`). Requires WebGL.\n\n' +
          '**Basemap** (`lib/basemap.ts`, System Design §6c): `NEXT_PUBLIC_BASEMAP=offline` (the default once ' +
          '`make fetch-tiles` has provisioned `/public/tiles`) is a Protomaps vector extract of the Avdiivka AO ' +
          '(`/tiles/avdiivka.pmtiles`, `pmtiles://` protocol) in a dark style derived from the Protomaps "dark" ' +
          'flavor and re-coloured with the Hamilton tokens; labels use self-hosted Noto Sans glyphs — no CDN, no ' +
          'sprite. `none` is the old bare `--surface-base` (see **Basemap off**); `online` is a dev-only OSM raster. ' +
          '© OpenStreetMap contributors, Protomaps.\n\n' +
          '**Symbols** — the decided track symbol (**Decisions/Track Symbology**): the same React component ' +
          '(`TrackSymbolG`) drawn in an SVG overlay. MapLibre owns the camera and each map move is mirrored ' +
          'synchronously into the controlled view state, so the overlay is projected in the frame the map paints. Chosen over an `IconLayer` because ' +
          'it is pixel-identical to the decided symbol (web-font T / J, dashed anticipated frame), needs no async ' +
          'icon-atlas packing, and is in the DOM for hover / keyboard / screen readers. No circular halo, no pulse. ' +
          'The jammer\'s position is never presumed (HS-20): no jammer symbol, ring or bearing line; the ' +
          'emitter estimate is drawn as an area of effect (FR-06a, `emitterEstimate`). Hover or Tab to a symbol ' +
          'for the rating breakdown; Escape closes.\n\n' +
          '**Camera fit** (`lib/camera-fit.ts`): Web-Mercator bounds fit of the tracks, ' +
          '64 px padding, ≥ 1.5 km framed, max zoom 17. Re-fits only on a new point or one leaving the frame, ' +
          'never after you pan or zoom; **Fit to tracks** (button or `F`) re-frames.\n\n' +
          '**Declutter** (`lib/declutter.ts` grouping, production `DeclutterStack`): three or more symbols within ' +
          '1.5 symbol sizes collapse into a bracketed stack with one locator line, hostile first, three frames + ' +
          '"+n"; hover or click to list every member.',
      },
    },
  },
} satisfies Meta<typeof MapSpine>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Nominal: Story = {
  parameters: { hamilton: { tracks: PHASE_TRACKS.nominal } },
  play: async (ctx) => {
    await spinePlay.symbolsAndTooltip('unit_a')(ctx);
    // The overlay draws the production symbol (2525E SIDC on the group), not a circle.
    // B is the forward observer (recon_static → COLT/FIST, jammer-aoe.md §0.4 finding 3).
    const g = ctx.canvasElement.querySelector('[data-cop-symbol="unit_b"] [data-sidc]');
    await expect(g?.getAttribute('data-sidc')).toBe('13031000111304000000');
  },
};

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

export const MixedAffiliations: Story = {
  parameters: { hamilton: { tracks: tracksRecord(...AFFILIATION_TRACKS) } },
};

export const NoTracks: Story = {};

/** Fifteen tracks: three knots stack (hostile first); the NE pair stays two singles. */
export const Dense: Story = {
  parameters: { hamilton: { tracks: tracksRecord(...denseTracks(track)) } },
  play: spinePlay.dense,
};

/** Opened at zoom 10 (~51 m/px): A/B/C collapse into one stack. The play function expands it. */
export const ZoomedOut: Story = {
  args: { initialZoom: 10 },
  parameters: { hamilton: { tracks: clustered(PHASE_TRACKS.watching) } }, // co-located A/B/C: the 8-unit layout never stacks
  play: async ({ canvasElement }) => {
    const c = within(canvasElement);
    const stack = await waitFor(() => c.getByTestId('declutter-stack'), { timeout: 15_000 });
    await userEvent.click(stack);
    await waitFor(() => expect(stack).toHaveAttribute('aria-expanded', 'true'));
    await expect(c.getAllByTestId('declutter-member')).toHaveLength(3);
  },
};

/**
 * Comparison: the Failed beat with `basemap="none"` — the pre-basemap COP, symbols on bare `--surface-base`.
 * Put it next to **Failed** to judge what the offline basemap costs the symbols (it should cost nothing:
 * the style keeps land within a few L of the surface and roads at L ≤ 40%; symbol ink is L 90%).
 */
export const BasemapOff: Story = {
  name: 'Basemap off',
  args: { ...Failed.args, basemap: 'none' },
  parameters: { hamilton: { tracks: PHASE_TRACKS.failed } },
  play: async ({ canvasElement }) => {
    const c = within(canvasElement);
    await waitFor(() => c.getByTestId('cop-symbol-unit_b'), { timeout: 15_000 });
    await expect(canvasElement.querySelector('[data-basemap]')?.getAttribute('data-basemap')).toBe('none');
    await expect(c.queryByTestId('basemap-attribution')).toBeNull();
  },
};

// ---------------------------------------------------------------------------
// Jammer area of effect (FR-06a)
// ---------------------------------------------------------------------------

const aoeDocs = (story: string) => ({ docs: { story: { inline: false, iframeHeight: 640 }, description: { story } } });

/** 1:15 — first estimate (frozen CP1 fixture): civil 90% tint + edge, 50% dashed, label, key; the card block. */
export const AoeFirstEstimate: Story = {
  name: 'AoE 1:15 first estimate',
  render: () => <AoeStoryFrame spine={(e) => <MapSpine emitterEstimate={e} evaluations={UNIT_EVALUATION} />} />,
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
      <AoeStoryFrame spine={(e) => <MapSpine emitterEstimate={e} evaluations={UNIT_EVALUATION} />} />
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
  render: () => <AoeStoryFrame spine={(e) => <MapSpine emitterEstimate={e} evaluations={UNIT_EVALUATION} />} />,
  parameters: { hamilton: aoeSeed('b150'), ...aoeDocs('B is outside the 90% area at its new position; the card lists both B reports (✕ 39 s at the old position, ○ 2 s now).') },
  play: aoePlay.b150,
};

/** 2:15 — jammer off, +10 s: STALE. Outline only, "Last est. HHMMZ", never "clear". */
export const AoeStale: Story = {
  name: 'AoE 2:15 stale',
  render: () => <AoeStoryFrame spine={(e) => <MapSpine emitterEstimate={e} evaluations={UNIT_EVALUATION} />} />,
  parameters: { hamilton: aoeSeed('b215'), ...aoeDocs('HS-25: outline only, no fill; label and card read "Last est. HHMMZ". It is removed on the empty retained payload (+120 s).') },
  play: aoePlay.b215,
};

/** Every reporting civil unit degraded: nothing drawn, the card reads "edge not observed". */
export const AoeUnbounded: Story = {
  name: 'AoE unbounded',
  render: () => <AoeStoryFrame spine={(e) => <MapSpine emitterEstimate={e} evaluations={UNIT_EVALUATION} />} />,
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
      <AoeStoryFrame spine={(e) => <MapSpine emitterEstimate={e} evaluations={UNIT_EVALUATION} />} />
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
