'use client';

import { useEffect } from 'react';
import { BrandBar } from '@/components/brand/BrandBar';
import { Spine } from '@/components/cop/Spine';
import { TrustPanel } from '@/components/panel/TrustPanel';
import { KillChainGate } from '@/components/modal/KillChainGate';
import { EventTerminal } from '@/components/terminal/EventTerminal';
import { useHamiltonMqtt } from '@/hooks/useHamiltonMqtt';
import { useHamilton, type TrackState } from '@/store/hamilton';

const SEED_TRACKS: TrackState[] = [
  {
    source_id: 'unit_a',
    affiliation: 'friendly',
    sensor_type: 'recon_static',
    lat: 48.1422,
    lon: 37.745,
    score: 1.0,
    prev_score: 1.0,
    components: { temporal: 1, stability: 1, spatial: 1, fingerprint: 1 },
    trace_bullets: [],
    last_update: new Date().toISOString(),
  },
  {
    source_id: 'unit_b',
    affiliation: 'friendly',
    sensor_type: 'offense',
    lat: 48.14,
    lon: 37.745,
    score: 1.0,
    prev_score: 1.0,
    components: { temporal: 1, stability: 1, spatial: 1, fingerprint: 1 },
    trace_bullets: [],
    last_update: new Date().toISOString(),
  },
  {
    source_id: 'unit_c',
    affiliation: 'friendly',
    sensor_type: 'detection',
    lat: 48.1378,
    lon: 37.745,
    score: 1.0,
    prev_score: 1.0,
    components: { temporal: 1, stability: 1, spatial: 1, fingerprint: 1 },
    trace_bullets: [],
    last_update: new Date().toISOString(),
  },
];

const JAMMER_LOCATION = { lat: 48.142, lon: 37.762 };

export default function Home() {
  useHamiltonMqtt();
  const upsertTrack = useHamilton((s) => s.upsertTrack);
  const tracks = useHamilton((s) => s.tracks);

  useEffect(() => {
    if (Object.keys(tracks).length === 0) {
      SEED_TRACKS.forEach(upsertTrack);
    }
  }, [tracks, upsertTrack]);

  const unitB = tracks.unit_b;
  const candidates = useHamilton((s) => s.candidates);
  const showDirectional = Boolean(unitB && unitB.score < 0.6);
  const topCandidate = candidates?.items[0];
  const showJammer = Boolean(showDirectional && topCandidate && topCandidate.score >= 0.5);

  return (
    <main
      style={{
        display: 'grid',
        gridTemplateRows: '56px 1fr 160px',
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
          gridTemplateColumns: '2fr 1fr',
          minHeight: 0,
        }}
      >
        <div style={{ position: 'relative' }}>
          <SpineWithProps
            unitB={unitB}
            showDirectional={showDirectional}
            showJammer={showJammer}
            jammerMethod={topCandidate?.method_id ?? ''}
          />
        </div>
        <TrustPanel />
      </div>
      <EventTerminal height={160} />
      <KillChainGate />
    </main>
  );
}

interface SpineWithPropsProps {
  unitB: TrackState | undefined;
  showDirectional: boolean;
  showJammer: boolean;
  jammerMethod: string;
}

function SpineWithProps({
  unitB,
  showDirectional,
  showJammer,
  jammerMethod,
}: SpineWithPropsProps) {
  const props: React.ComponentProps<typeof Spine> = {};
  if (showDirectional && unitB) {
    props.directionalFrom = { lat: unitB.lat, lon: unitB.lon };
    props.directionalTo = JAMMER_LOCATION;
  }
  if (showJammer) {
    props.jammerLocation = {
      lat: JAMMER_LOCATION.lat,
      lon: JAMMER_LOCATION.lon,
      method_id: jammerMethod,
    };
  }
  return <Spine {...props} />;
}
