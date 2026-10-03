import type { Meta, StoryObj } from '@storybook/react';
import { Spine } from './Spine';
import { JAMMER_LOCATION, PHASE_TRACKS } from '@/stories/fixtures/avdiivka';
import { cesiumLoader } from '@/stories/support/cesium';

const unitB = PHASE_TRACKS.degraded.unit_b!;

const meta = {
  title: 'COP/Spine',
  component: Spine,
  loaders: [cesiumLoader],
  decorators: [
    (Story) => (
      // Any aspect works since the camera fit (audit A26 fixed).
      <div style={{ height: 'min(100vh, 900px)', width: 'min(100%, 900px)', position: 'relative' }}>
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
          'Renderer switch: `NEXT_PUBLIC_RENDERER=cesium|maplibre` (build-time env, Cesium default). Both ' +
          'renderers are `next/dynamic` with `ssr:false`; while the chunk loads the private `SpineLoader` ' +
          'shows "LOADING CESIUM SPINE…" in tertiary mono caps. The env var is fixed per Storybook build, so ' +
          'see COP/CesiumSpine and COP/MapSpine for each renderer. Both draw the decided track symbol ' +
          '(Decisions/Track Symbology): CesiumSpine as billboards, MapSpine as an SVG overlay — no circles, halo or pulse.',
      },
    },
  },
} satisfies Meta<typeof Spine>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Page wiring at 1:15 — directional vector + jammer overlay. */
export const AsWiredOnPage: Story = {
  args: {
    directionalFrom: { lat: unitB.lat, lon: unitB.lon },
    directionalTo: JAMMER_LOCATION,
    jammerLocation: { ...JAMMER_LOCATION, method_id: 'ground_based_gps_uhf_barrage' },
  },
  parameters: { hamilton: { tracks: PHASE_TRACKS.degraded } },
};

export const Nominal: Story = { parameters: { hamilton: { tracks: PHASE_TRACKS.nominal } } };
