'use client';

import 'maplibre-gl/dist/maplibre-gl.css';
import { useEffect, useMemo, useRef, useState } from 'react';
import 'maplibre-gl';
import DeckGL from '@deck.gl/react';
import { ScatterplotLayer, LineLayer } from '@deck.gl/layers';
import { MapView } from '@deck.gl/core';
import { affiliationRgb, symbolGeometry } from './track-symbol';
import {
  haloPeriodMs,
  haloRadiusPx,
  shouldHaloPulse,
  trustRgb,
} from '@/lib/trust-gradient';
import { useHamilton, type TrackState } from '@/store/hamilton';

const INITIAL_VIEW = {
  longitude: 37.745,
  latitude: 48.14,
  zoom: 13.5,
  pitch: 0,
  bearing: 0,
};

const ICON_RADIUS_PX = 18;

function buildIconPolygons(track: TrackState) {
  const geom = symbolGeometry(track.affiliation, track.sensor_type);
  const cos = Math.cos((geom.rotation_deg * Math.PI) / 180);
  const sin = Math.sin((geom.rotation_deg * Math.PI) / 180);
  const polygon = geom.vertices.map(([x, y]) => {
    const rx = x * cos - y * sin;
    const ry = x * sin + y * cos;
    return [rx, ry];
  });
  return {
    source_id: track.source_id,
    polygon,
    fillColor: [
      ...affiliationRgb(track.affiliation),
      Math.max(70, Math.min(255, Math.round(track.score * 255))),
    ] as [number, number, number, number],
    score: track.score,
    centroid: [track.lon, track.lat] as [number, number],
  };
}

interface MapSpineProps {
  /** Optional directional vector overlay — Beat 1:05 spatial discrimination. */
  directionalFrom?: { lat: number; lon: number };
  directionalTo?: { lat: number; lon: number };
}

export function MapSpine({ directionalFrom, directionalTo }: MapSpineProps) {
  const tracks = useHamilton((s) => s.tracks);
  const selectSource = useHamilton((s) => s.selectSource);
  const trackList = useMemo(() => Object.values(tracks), [tracks]);
  const [haloPhase, setHaloPhase] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  // Single RAF for halo pulses — Branding §5.2.
  useEffect(() => {
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      setHaloPhase((now - start) % 4000);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  const haloLayer = useMemo(
    () =>
      new ScatterplotLayer({
        id: 'track-halo',
        data: trackList.filter((t) => shouldHaloPulse(t.score)),
        getPosition: (d: TrackState) => [d.lon, d.lat, 0],
        getRadius: (d: TrackState) => {
          const base = haloRadiusPx(d.score);
          const period = haloPeriodMs(d.score);
          const phase = (haloPhase % period) / period;
          const pulse = 0.7 + 0.3 * Math.sin(phase * 2 * Math.PI);
          return base * pulse;
        },
        getFillColor: (d: TrackState) => {
          const [r, g, b] = trustRgb(d.score);
          return [r, g, b, 90];
        },
        radiusUnits: 'pixels',
        stroked: false,
        updateTriggers: {
          getRadius: [haloPhase],
        },
      }),
    [trackList, haloPhase],
  );

  const iconLayer = useMemo(
    () =>
      new ScatterplotLayer({
        id: 'track-icon',
        data: trackList,
        getPosition: (d: TrackState) => [d.lon, d.lat, 0],
        getRadius: ICON_RADIUS_PX,
        radiusUnits: 'pixels',
        getFillColor: (d: TrackState) => {
          const [r, g, b] = affiliationRgb(d.affiliation);
          return [r, g, b, Math.max(60, Math.round(d.score * 255))];
        },
        getLineColor: (d: TrackState) => trustRgb(d.score).concat(220) as never,
        getLineWidth: 2,
        lineWidthUnits: 'pixels',
        stroked: true,
        pickable: true,
        onClick: ({ object }) => {
          if (object?.source_id) selectSource(object.source_id);
        },
        updateTriggers: {
          getFillColor: [trackList.map((t) => t.score).join(',')],
          getLineColor: [trackList.map((t) => t.score).join(',')],
        },
      }),
    [trackList, selectSource],
  );

  const directionalLayer = useMemo(() => {
    if (!directionalFrom || !directionalTo) return null;
    return new LineLayer({
      id: 'directional-vector',
      data: [
        {
          source: [directionalFrom.lon, directionalFrom.lat],
          target: [directionalTo.lon, directionalTo.lat],
        },
      ],
      getSourcePosition: (d) => d.source,
      getTargetPosition: (d) => d.target,
      getColor: [220, 178, 90, 110],
      getWidth: 2,
      widthUnits: 'pixels',
    });
  }, [directionalFrom, directionalTo]);

  const layers = [haloLayer, iconLayer, directionalLayer].filter(Boolean);

  return (
    <div
      ref={containerRef}
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        background: 'var(--surface-base)',
      }}
    >
      <DeckGL
        initialViewState={INITIAL_VIEW}
        controller={true}
        views={new MapView({ repeat: false })}
        layers={layers as never}
        style={{ position: 'absolute', top: '0', left: '0', right: '0', bottom: '0' }}
      >
        {/*
         * Phase 4 ships without a basemap — PMTiles bundle would land in
         * /public/tiles/avdiivka.pmtiles (Phase 10 hardening). The trust
         * layer reads cleanly against the dark base; the operator's eye
         * lands on icon decay, not on cartography.
         */}
      </DeckGL>
    </div>
  );
}

export const MAP_INITIAL_VIEW = INITIAL_VIEW;
