'use client';

// Renderer toggle — Cesium primary, MapLibre fallback per System Design §6c.
// Switched via NEXT_PUBLIC_RENDERER=cesium|maplibre.
//
// Both spines subscribe to the same Zustand store and the same MQTT topics.
// The contract boundary is the store, not the renderer.

import dynamic from 'next/dynamic';

const CesiumSpine = dynamic(
  () => import('./CesiumSpine').then((m) => m.CesiumSpine),
  { ssr: false, loading: () => <SpineLoader label="cesium" /> },
);

const MapSpine = dynamic(
  () => import('./MapSpine').then((m) => m.MapSpine),
  { ssr: false, loading: () => <SpineLoader label="maplibre" /> },
);

interface SpineProps {
  jammerLocation?: { lat: number; lon: number; method_id: string };
  directionalFrom?: { lat: number; lon: number };
  directionalTo?: { lat: number; lon: number };
  /** Candidate NAI centre — both spines frame it in their camera fit. */
  candidateNai?: { lat: number; lon: number };
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
  // MapSpine takes the same props now (jammer ring + camera fit included).
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
      loading {label} spine…
    </div>
  );
}
