import type { Meta, StoryObj } from '@storybook/react';
import { CesiumSpine } from './CesiumSpine';
import {
  AFFILIATION_TRACKS,
  JAMMER_LOCATION,
  PHASE_TRACKS,
  tracksRecord,
} from '@/stories/fixtures/avdiivka';
import { cesiumLoader } from '@/stories/support/cesium';

const unitB = PHASE_TRACKS.degraded.unit_b!;

const meta = {
  title: 'COP/CesiumSpine',
  component: CesiumSpine,
  loaders: [cesiumLoader],
  decorators: [
    (Story) => (
      // Near-square box: the fixed camera (CesiumSpine.tsx:76-88) pushes the AO off the top edge on wide aspects (audit A26).
      <div style={{ height: 'min(100vh, 900px)', width: 'min(100%, 900px)' }}>
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
          'Tracks render as Cesium `point`s (circles) with an affiliation fill, trust-band outline and a static ' +
          'halo ellipse below 0.60. If `/public/cesium` is not staged the canvas stays empty (waitForCesium ' +
          'times out after 8s).',
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
