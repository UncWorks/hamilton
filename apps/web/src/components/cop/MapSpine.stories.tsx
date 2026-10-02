import type { Meta, StoryObj } from '@storybook/react';
import { MapSpine } from './MapSpine';
import {
  AFFILIATION_TRACKS,
  JAMMER_LOCATION,
  PHASE_TRACKS,
  tracksRecord,
} from '@/stories/fixtures/avdiivka';

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
          'single RAF loop below 0.60. Note: `jammerLocation` is not supported by this renderer.',
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
