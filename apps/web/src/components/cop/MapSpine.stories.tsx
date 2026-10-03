import type { Meta, StoryObj } from '@storybook/react';
import { expect, userEvent, waitFor, within } from '@storybook/test';
import { MapSpine } from './MapSpine';
import {
  AFFILIATION_TRACKS,
  JAMMER_LOCATION,
  PHASE_TRACKS,
  track,
  tracksRecord,
} from '@/stories/fixtures/avdiivka';
import { denseTracks } from '@/lib/dense-tracks.fixture';

const unitB = PHASE_TRACKS.degraded.unit_b!;

const meta = {
  title: 'COP/MapSpine',
  component: MapSpine,
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
          '2D fallback renderer (deck.gl `MapView`, `NEXT_PUBLIC_RENDERER=maplibre`). No basemap ships yet ' +
          '(PMTiles pending), so it renders offline against `--surface-base`. Requires WebGL. Tracks are ' +
          '`ScatterplotLayer` circles (affiliation fill, alpha = score, trust-band stroke); halos pulse via a ' +
          'single RAF loop below 0.60. `jammerLocation` draws a 120 m ring (no label).\n\n' +
          '**Camera fit** (`lib/camera-fit.ts`): Web-Mercator bounds fit of tracks + jammer / candidate NAI, ' +
          '64 px padding, ≥ 1.5 km framed, max zoom 17. Re-fits only on a new point or one leaving the frame, ' +
          'never after you pan or zoom; **Fit to tracks** (button or `F`) re-frames.\n\n' +
          '**Declutter** (`lib/declutter.ts`, FM 1-02 / MCRP 5-12A ¶5-8): overlapping symbols collapse into a ' +
          'bracketed stack with an offset locator line and +n count, hostile first; hover or click to list.',
      },
    },
  },
} satisfies Meta<typeof MapSpine>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Nominal: Story = { parameters: { hamilton: { tracks: PHASE_TRACKS.nominal } } };

export const Watching: Story = { parameters: { hamilton: { tracks: PHASE_TRACKS.watching } } };

/** 1:15 — B 0.13, first below the ROE floor: pulsing halo + directional vector (drawn when B < 0.60). */
export const DirectionalVector: Story = {
  args: { directionalFrom: { lat: unitB.lat, lon: unitB.lon }, directionalTo: JAMMER_LOCATION },
  parameters: { hamilton: { tracks: PHASE_TRACKS.degraded } },
};

/** 1:50 — B 0.22, still gated — fastest halo period. */
export const Failed: Story = {
  args: { directionalFrom: { lat: unitB.lat, lon: unitB.lon }, directionalTo: JAMMER_LOCATION },
  parameters: { hamilton: { tracks: PHASE_TRACKS.failed } },
};

export const MixedAffiliations: Story = {
  parameters: { hamilton: { tracks: tracksRecord(...AFFILIATION_TRACKS) } },
};

export const NoTracks: Story = {};

/** Twelve tracks + jammer: A/B/C apart after the fit; three knots still stack (hostile listed first). */
export const Dense: Story = {
  args: { jammerLocation: JAMMER_LOCATION, directionalFrom: { lat: unitB.lat, lon: unitB.lon }, directionalTo: JAMMER_LOCATION },
  parameters: { hamilton: { tracks: tracksRecord(...denseTracks(track)) } },
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
