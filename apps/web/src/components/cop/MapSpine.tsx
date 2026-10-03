'use client';

import 'maplibre-gl/dist/maplibre-gl.css';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import 'maplibre-gl';
import DeckGL from '@deck.gl/react';
import { ScatterplotLayer, LineLayer } from '@deck.gl/layers';
import { LinearInterpolator, MapView, WebMercatorViewport, type MapViewState } from '@deck.gl/core';
import { affiliationRgb, symbolGeometry } from './track-symbol';
import {
  haloFrameAt,
  shouldHaloPulse,
  trustRgb,
} from '@/lib/trust-gradient';
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion';
import { useHamilton, type TrackState } from '@/store/hamilton';
import { boundsOf, fitMercator, isFitShortcut, needsRefit, type LatLon } from '@/lib/camera-fit';
import {
  affiliationRank,
  declutter,
  DECLUTTER_THROTTLE_MS,
  sameDeclutter,
  throttle,
  type DeclutterItem,
  type DeclutterResult,
} from '@/lib/declutter';
import { SpineOverlay, type StackMember } from '@/lib/spine-overlay';

// Fallback view until the first fit (lib/camera-fit.ts). Previously the only
// view — fixed regardless of where the tracks were.
const INITIAL_VIEW = {
  longitude: 37.745,
  latitude: 48.14,
  zoom: 13.5,
  pitch: 0,
  bearing: 0,
};

const ICON_RADIUS_PX = 18;
/** Declutter box: icon diameter + stroke (halo excluded). */
const ICON_BOX_PX = 2 * ICON_RADIUS_PX + 2;
const REFIT_DURATION_MS = 600;

type FitPoint = LatLon & { id: string };
type ScreenPos = Record<string, { x: number; y: number }>;

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
  /** Suspected jammer — drawn as a 120 m ring and framed by the camera fit. */
  jammerLocation?: { lat: number; lon: number; method_id?: string };
  /** Candidate NAI centre — framed by the camera fit when present. */
  candidateNai?: { lat: number; lon: number };
  /**
   * Open at this zoom around the fit centre instead of fitting, as if the
   * operator had zoomed out — auto-fit stays off until "Fit to tracks".
   */
  initialZoom?: number;
}

export function MapSpine({ directionalFrom, directionalTo, jammerLocation, candidateNai, initialZoom }: MapSpineProps) {
  const tracks = useHamilton((s) => s.tracks);
  const selectSource = useHamilton((s) => s.selectSource);
  const trackList = useMemo(() => Object.values(tracks), [tracks]);
  const reducedMotion = usePrefersReducedMotion();
  const reducedMotionRef = useRef(reducedMotion);
  reducedMotionRef.current = reducedMotion;
  // Absolute clock (ms). Each halo takes its phase modulo its OWN period in
  // haloFrameAt — the old `% 4000` wrap here made every halo jump mid-pulse
  // whenever 4000 wasn't a multiple of its period.
  const [haloClock, setHaloClock] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  // --- Viewport size + controlled view state -------------------------------
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) setSize({ width: r.width, height: r.height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const [viewState, setViewState] = useState<MapViewState>(INITIAL_VIEW);
  const viewStateRef = useRef(viewState);
  viewStateRef.current = viewState;

  // --- Camera fit ------------------------------------------------------------
  const fitPoints = useMemo<FitPoint[]>(() => {
    const pts: FitPoint[] = trackList.map((t) => ({ id: t.source_id, lat: t.lat, lon: t.lon }));
    if (jammerLocation) pts.push({ id: '__jammer', lat: jammerLocation.lat, lon: jammerLocation.lon });
    if (candidateNai) pts.push({ id: '__nai', lat: candidateNai.lat, lon: candidateNai.lon });
    return pts;
  }, [trackList, jammerLocation, candidateNai]);
  const fitPointsRef = useRef(fitPoints);
  fitPointsRef.current = fitPoints;
  const fittedIdsRef = useRef<Set<string> | null>(null);
  const userMovedRef = useRef(initialZoom !== undefined);
  const [manual, setManual] = useState(initialZoom !== undefined);
  const initialZoomRef = useRef(initialZoom);
  /** Our own fit transition is running — its view-state changes aren't the operator's. */
  const fitTransitionRef = useRef(false);

  const fit = useCallback(
    (animate: boolean, zoomOverride?: number) => {
      const pts = fitPointsRef.current;
      const bounds = boundsOf(pts);
      if (!size || !bounds) return;
      const v = fitMercator({ bounds, width: size.width, height: size.height });
      const next: MapViewState = { ...v, zoom: zoomOverride ?? v.zoom, pitch: 0, bearing: 0 };
      fittedIdsRef.current = new Set(pts.map((p) => p.id));
      if (animate) {
        fitTransitionRef.current = true;
        const done = () => {
          fitTransitionRef.current = false;
        };
        setViewState({
          ...next,
          transitionDuration: REFIT_DURATION_MS,
          transitionInterpolator: new LinearInterpolator(['longitude', 'latitude', 'zoom']),
          onTransitionEnd: done,
          onTransitionInterrupt: done,
        } as MapViewState);
      } else {
        fitTransitionRef.current = false;
        setViewState(next);
      }
    },
    [size],
  );

  const fitToTracks = useCallback(() => {
    userMovedRef.current = false;
    setManual(false);
    fit(!reducedMotionRef.current);
  }, [fit]);

  // Auto re-fit on a material change only (first fit / new point / point out
  // of frame); never on a plain tick, never after operator navigation.
  useEffect(() => {
    if (!size) return;
    if (initialZoomRef.current !== undefined && fittedIdsRef.current === null) {
      if (fitPoints.length > 0) fit(false, initialZoomRef.current);
      return;
    }
    const vp = new WebMercatorViewport({ ...viewStateRef.current, ...size });
    const screen = fitPoints.map((p) => {
      const [x, y] = vp.project([p.lon, p.lat]);
      return { x: x!, y: y! };
    });
    const reason = needsRefit({
      fittedIds: fittedIdsRef.current,
      ids: fitPoints.map((p) => p.id),
      screen,
      ...size,
      userMoved: userMovedRef.current,
    });
    if (reason) fit(reason !== 'initial' && !reducedMotionRef.current);
  }, [size, fitPoints, fit]);

  // "Fit to tracks" keyboard shortcut (F).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!isFitShortcut(e)) return;
      e.preventDefault();
      fitToTracks();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [fitToTracks]);

  // --- Declutter (throttled on view / track / size change) ------------------
  const [decl, setDecl] = useState<{ result: DeclutterResult; positions: ScreenPos }>({
    result: { singles: [], groups: [] },
    positions: {},
  });
  const runDeclutterRef = useRef<() => void>(() => {});
  runDeclutterRef.current = () => {
    if (!size) return;
    const vp = new WebMercatorViewport({ ...viewStateRef.current, ...size });
    const positions: ScreenPos = {};
    const items: DeclutterItem[] = trackList.map((t) => {
      const [x, y] = vp.project([t.lon, t.lat]);
      positions[t.source_id] = { x: x!, y: y! };
      return {
        id: t.source_id,
        x: x!,
        y: y!,
        width: ICON_BOX_PX,
        height: ICON_BOX_PX,
        rank: affiliationRank(t.affiliation),
      };
    });
    const result = declutter(items, { viewport: size });
    setDecl((prev) => (sameDeclutter(prev.result, result) ? prev : { result, positions }));
  };
  const declThrottle = useMemo(() => throttle(() => runDeclutterRef.current(), DECLUTTER_THROTTLE_MS), []);
  useEffect(() => () => declThrottle.cancel(), [declThrottle]);
  useEffect(() => {
    declThrottle.call();
  }, [viewState, size, trackList, declThrottle]);

  const grouped = useMemo(() => new Set(decl.result.groups.flatMap((g) => g.ids)), [decl]);
  const visibleTracks = useMemo(() => trackList.filter((t) => !grouped.has(t.source_id)), [trackList, grouped]);
  const haloTracks = useMemo(() => visibleTracks.filter((t) => shouldHaloPulse(t.score)), [visibleTracks]);

  // Single RAF for halo pulses — Branding §5.2. Idle when no track is below
  // the ROE floor or the operator prefers reduced motion (static ring).
  const animateHalos = haloTracks.length > 0 && !reducedMotion;
  useEffect(() => {
    if (!animateHalos) return;
    let raf = 0;
    const tick = (now: number) => {
      setHaloClock(now);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [animateHalos]);

  // Halo = disc + edge ring at the SAME position and in the SAME pixel units
  // as the icon layer, so it is concentric by construction. Outer radius is
  // measured from the icon edge: ICON_RADIUS_PX + (1 - c) * 24 (Option 1 in
  // Storybook Explorations/Halo Options).
  const haloLayer = useMemo(
    () =>
      new ScatterplotLayer({
        id: 'track-halo',
        data: haloTracks,
        getPosition: (d: TrackState) => [d.lon, d.lat, 0],
        getRadius: (d: TrackState) =>
          haloFrameAt(d.score, ICON_RADIUS_PX, haloClock, reducedMotion).radiusPx,
        getFillColor: (d: TrackState) => {
          const [r, g, b] = trustRgb(d.score);
          const { intensity } = haloFrameAt(d.score, ICON_RADIUS_PX, haloClock, reducedMotion);
          return [r, g, b, Math.round((reducedMotion ? 0.12 : 0.28 * intensity) * 255)];
        },
        getLineColor: (d: TrackState) => {
          const [r, g, b] = trustRgb(d.score);
          const { intensity } = haloFrameAt(d.score, ICON_RADIUS_PX, haloClock, reducedMotion);
          return [r, g, b, Math.round(0.9 * intensity * 255)];
        },
        radiusUnits: 'pixels',
        filled: true,
        stroked: true,
        getLineWidth: 2,
        lineWidthUnits: 'pixels',
        // billboard left at the default (false) to match the icon layer, so
        // both project identically if the view is ever pitched.
        updateTriggers: {
          getRadius: [haloClock, reducedMotion],
          getFillColor: [haloClock, reducedMotion],
          getLineColor: [haloClock, reducedMotion],
        },
      }),
    [haloTracks, haloClock, reducedMotion],
  );

  // Tracks inside a declutter stack are drawn by the overlay instead.
  const iconLayer = useMemo(
    () =>
      new ScatterplotLayer({
        id: 'track-icon',
        data: visibleTracks,
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
          getFillColor: [visibleTracks.map((t) => t.score).join(',')],
          getLineColor: [visibleTracks.map((t) => t.score).join(',')],
        },
      }),
    [visibleTracks, selectSource],
  );

  const jammerLayer = useMemo(() => {
    if (!jammerLocation) return null;
    return new ScatterplotLayer({
      id: 'jammer-overlay',
      data: [jammerLocation],
      getPosition: (d: LatLon) => [d.lon, d.lat, 0],
      getRadius: 120,
      radiusUnits: 'meters',
      radiusMinPixels: 6,
      filled: true,
      stroked: true,
      getFillColor: [220, 178, 90, 46],
      getLineColor: [220, 178, 90, 153],
      getLineWidth: 1.5,
      lineWidthUnits: 'pixels',
    });
  }, [jammerLocation]);

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

  const layers = [jammerLayer, haloLayer, iconLayer, directionalLayer].filter(Boolean);
  const members = useMemo(() => {
    const out: Record<string, StackMember> = {};
    for (const t of trackList) {
      out[t.source_id] = {
        id: t.source_id,
        score: t.score,
        affiliation: t.affiliation,
        fill: affiliationRgb(t.affiliation),
        outline: trustRgb(t.score),
      };
    }
    return out;
  }, [trackList]);
  const view = useMemo(() => new MapView({ repeat: false }), []);

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
        viewState={viewState}
        onViewStateChange={({ viewState: next, interactionState: is }) => {
          // An interaction outside our own fit transition = the operator
          // navigated (drag, wheel, keyboard, pinch). Deck also emits
          // interaction-free changes (e.g. on mount / resize) — those don't count.
          const interacting = Boolean(is.isDragging || is.isPanning || is.isZooming || is.isRotating);
          if (interacting && !fitTransitionRef.current && !userMovedRef.current) {
            userMovedRef.current = true;
            setManual(true);
          }
          setViewState(next as MapViewState);
        }}
        controller={true}
        views={view}
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
      {size && (
        <SpineOverlay
          groups={decl.result.groups}
          members={members}
          positions={decl.positions}
          onSelect={selectSource}
          onFit={fitToTracks}
          manual={manual}
          reducedMotion={reducedMotion}
        />
      )}
    </div>
  );
}

export const MAP_INITIAL_VIEW = INITIAL_VIEW;
