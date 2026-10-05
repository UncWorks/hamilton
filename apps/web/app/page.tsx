'use client';

import { useEffect } from 'react';
import { BrandBar } from '@/components/brand/BrandBar';
import { Spine } from '@/components/cop/Spine';
import { TrustPanel } from '@/components/panel/TrustPanel';
import { MissionQueue } from '@/components/fires/MissionQueue';
import { EventTerminal } from '@/components/terminal/EventTerminal';
import { DemoSlot } from '@/components/admin/DemoSlot';
import { useHamiltonMqtt } from '@/hooks/useHamiltonMqtt';
import { useHamilton, type TrackState } from '@/store/hamilton';
import { useDemoLayout } from '@/store/demo-view';
import type { SensorType } from '@hamilton/contracts';

// Seed tracks: the 8-unit Avdiivka layout (docs/plans/jammer-aoe.md §6, plan
// D1; positions = the design §5 table, stories/fixtures/aoe-preview.json,
// mirrored by comms-sim). Roles per the scenario: A = firing unit (FU A, the
// AB1001 battery), B = forward observer (OBS B, the AB1001 observer). Live
// positions arrive on `integrity/trust/*` (lat/lon) and override these.
const SEED_UNITS: readonly { source_id: string; sensor_type: SensorType; lat: number; lon: number }[] = [
  { source_id: 'unit_a', sensor_type: 'offense', lat: 48.14449, lon: 37.65077 }, // FU A — firing battery
  { source_id: 'unit_b', sensor_type: 'recon_static', lat: 48.14, lon: 37.745 }, // OBS B — FO (AB1001 observer)
  { source_id: 'unit_c', sensor_type: 'detection', lat: 48.12653, lon: 37.70462 }, // TA radar (OBS C)
  { source_id: 'unit_d', sensor_type: 'recon_static', lat: 48.17593, lon: 37.75173 }, // FO 2
  { source_id: 'unit_e', sensor_type: 'recon_static', lat: 48.10407, lon: 37.74904 }, // FO 3
  { source_id: 'unit_f', sensor_type: 'offense', lat: 48.09508, lon: 37.66423 }, // Battery 2
  { source_id: 'unit_g', sensor_type: 'defense', lat: 48.16695, lon: 37.62385 }, // AD section (Bn CP area)
  { source_id: 'unit_h', sensor_type: 'recon_mobile', lat: 48.1939, lon: 37.72481 }, // UAS team
];

const SEED_TRACKS: TrackState[] = SEED_UNITS.map((u) => ({
  ...u,
  affiliation: 'friendly',
  score: 1.0,
  prev_score: 1.0,
  components: { temporal: 1, stability: 1, spatial: 1, fingerprint: 1 },
  trace_bullets: [],
  last_update: new Date().toISOString(),
}));

export default function Home() {
  useHamiltonMqtt();
  const upsertTrack = useHamilton((s) => s.upsertTrack);
  const tracks = useHamilton((s) => s.tracks);
  const emitterEstimate = useHamilton((s) => s.emitterEstimate);
  // Admin · Demo simulation view filter (docs/plans/admin-demo-menu.md D8):
  // a hidden log drops its row; a fully hidden side column gives the map the
  // whole width. Both spines track their container size.
  const layout = useDemoLayout();

  useEffect(() => {
    if (Object.keys(tracks).length === 0) {
      SEED_TRACKS.forEach(upsertTrack);
    }
  }, [tracks, upsertTrack]);

  return (
    <main
      style={{
        display: 'grid',
        gridTemplateRows: layout.gridTemplateRows,
        height: '100vh',
        width: '100vw',
        background: 'var(--surface-base)',
        overflow: 'hidden',
      }}
    >
      <BrandBar />
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: layout.gridTemplateColumns,
          minHeight: 0,
        }}
      >
        <div style={{ position: 'relative' }}>
          {/* The jammer's position is never presumed (HS-20): the spine draws only
              the published emitter estimate's area of effect (FR-06a). */}
          <Spine emitterEstimate={emitterEstimate} />
        </div>
        <div
          // Hidden (not unmounted) when every side block is hidden, so the
          // queue's TSS tick keeps running and the map spans both columns.
          hidden={!layout.sideColumn}
          // One scroll container for the queue and the trust panel: a FAIL row's
          // branches never clip under the panel, and the AoE card follows below.
          style={{
            display: layout.sideColumn ? 'flex' : 'none',
            flexDirection: 'column',
            minHeight: 0,
            overflowY: 'auto',
            background: 'var(--surface-panel)',
            borderLeft: '1px solid var(--surface-elevated)',
          }}
        >
          <DemoSlot id="side.missionQueue">
            <MissionQueue />
          </DemoSlot>
          <DemoSlot id="side.trustPanel">
            <TrustPanel />
          </DemoSlot>
        </div>
      </div>
      <DemoSlot id="log.terminal">
        <EventTerminal height={160} />
      </DemoSlot>
    </main>
  );
}
