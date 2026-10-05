import type { Meta, StoryObj } from '@storybook/react';
import { expect, userEvent, waitFor, within } from '@storybook/test';
import { MapSpine } from './MapSpine';
import {
  AFFILIATION_TRACKS,
  PHASE_TRACKS,
  UNIT_EVALUATION,
  track,
  tracksRecord,
} from '@/stories/fixtures/avdiivka';
import { denseTracks } from '@/stories/fixtures/dense-tracks';
import { spinePlay } from '@/stories/support/spine-play';

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
    const g = ctx.canvasElement.querySelector('[data-cop-symbol="unit_b"] [data-sidc]');
    await expect(g?.getAttribute('data-sidc')).toBe('13031000151303000000');
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
  parameters: { hamilton: { tracks: PHASE_TRACKS.watching } },
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
