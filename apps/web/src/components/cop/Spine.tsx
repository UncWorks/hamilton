'use client';

// Renderer toggle — Cesium primary, MapLibre fallback per System Design §6c.
// Switched via NEXT_PUBLIC_RENDERER=cesium|maplibre.
//
// Both spines subscribe to the same Zustand store and the same MQTT topics.
// The contract boundary is the store, not the renderer. Both draw the
// production track symbol (src/components/symbol): Cesium as billboards,
// deck.gl as a viewport-projected SVG overlay (see each file's header).

import dynamic from 'next/dynamic';
import type { CandidateSite, Evaluations } from './spine-symbols';
import type { BasemapMode } from '@/lib/basemap';
import type { AoeEstimateLike } from '@/lib/aoe';

const CesiumSpine = dynamic(
  () => import('./CesiumSpine').then((m) => m.CesiumSpine),
  { ssr: false, loading: () => <SpineLoader label="3D map" /> },
);

const MapSpine = dynamic(
  () => import('./MapSpine').then((m) => m.MapSpine),
  { ssr: false, loading: () => <SpineLoader label="map" /> },
);

interface SpineProps {
  /**
   * The FR-04b emitter estimate (integrity/emitter/estimate), drawn by both
   * spines as an area of effect (FR-06a). Null / absent = nothing drawn. The
   * jammer's position is never an input (HS-20): no point, ring or bearing.
   */
  emitterEstimate?: AoeEstimateLike | null | undefined;
  /** Geolocated FR-04a candidate sites, drawn as anticipated (dashed) hostile EW symbols. */
  candidateSites?: readonly CandidateSite[];
  /** S2 evaluation inputs (corroboration / J override) per source. */
  evaluations?: Evaluations;
  /** Symbol box, px (default 32). */
  symbolSizePx?: number;
  /** Basemap override (default NEXT_PUBLIC_BASEMAP — lib/basemap.ts). */
  basemap?: BasemapMode;
}

function pickRenderer(): 'cesium' | 'maplibre' {
  const v = process.env.NEXT_PUBLIC_RENDERER;
  return v === 'maplibre' ? 'maplibre' : 'cesium';
}

export function Spine(props: SpineProps) {
  const renderer = pickRenderer();
  if (renderer === 'cesium') {
    return <CesiumSpine {...props} />;
  }
  return <MapSpine {...props} />;
}

function SpineLoader({ label }: { label: string }) {
  return (
    <div
      style={{
        display: 'grid',
        placeItems: 'center',
        height: '100%',
        background: 'var(--surface-base)',
        color: 'var(--text-tertiary)',
        fontFamily: 'var(--font-mono)',
        fontSize: 'var(--text-micro)',
        letterSpacing: '0.16em',
        textTransform: 'uppercase',
      }}
    >
      Loading {label}…
    </div>
  );
}
