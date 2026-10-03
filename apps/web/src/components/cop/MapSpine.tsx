'use client';

// MapLibre 2D fallback spine (NEXT_PUBLIC_RENDERER=maplibre).
//
// Basemap: a maplibre-gl Map with the offline Protomaps vector extract
// (/tiles/avdiivka.pmtiles via the `pmtiles` protocol, Hamilton dark style,
// self-hosted glyphs — lib/basemap.ts, System Design §6c "Basemap"). The
// area / line graphics (jammer ring, bearing line) are deck.gl layers drawn
// on the map through @deck.gl/mapbox MapboxOverlay (overlaid: deck's canvas
// rides on the map and re-renders in the map's own render pass, so it never
// drifts from the basemap).
//
// Camera: MapLibre owns the camera (pan / zoom / keyboard), and every map
// `move` is mirrored synchronously (flushSync) into the React viewState, so
// the symbol overlay is projected in the same frame the map paints. The
// camera fit (lib/camera-fit.ts) drives the map with jumpTo / easeTo; a move
// carrying an originalEvent (pointer, wheel, key) is the operator navigating.
//
// Symbols: the production track symbol (src/components/symbol) as an SVG
// overlay positioned by the viewState — NOT an IconLayer. Why:
//  - it is the same React component (TrackSymbolG) as Decisions/Track
//    Symbology, so web-font J / T text, the dashed anticipated frame and the
//    selection frame are pixel-identical, with no rasterisation step;
//  - no async icon-atlas loads (IconLayer auto-packing fetches each data URL
//    and would re-pack on every new key), no texture-size limits;
//  - it is in the DOM: hover / keyboard / screen-reader access and Storybook
//    play tests come for free.
// The view is top-down (pitch 0, rotation disabled), so screen-space symbols
// are exact. Track counts are tens; if they reach thousands, switch to an
// IconLayer fed from symbol-raster.ts (same keys as the Cesium billboards).

import 'maplibre-gl/dist/maplibre-gl.css';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import maplibregl from 'maplibre-gl';
import { Protocol as PmtilesProtocol } from 'pmtiles';
import { MapboxOverlay } from '@deck.gl/mapbox';
import { LineLayer, PolygonLayer } from '@deck.gl/layers';
import { WebMercatorViewport, type MapViewState } from '@deck.gl/core';
import { basemapMode, maplibreStyle, type BasemapMode } from '@/lib/basemap';
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion';
import { useHamilton } from '@/store/hamilton';
import { boundsOf, fitMercator, isFitShortcut, needsRefit, type LatLon } from '@/lib/camera-fit';
import { declutter, DECLUTTER_THROTTLE_MS, throttle, type DeclutterItem, type DeclutterResult } from '@/lib/declutter';
import { LIVE_SYMBOL_PX, declutterBoxFor } from '@/lib/cop-symbols';
import { SpineOverlay, placeSymbols } from './SpineOverlay';
import { useSpineSymbols, type CandidateSite, type Evaluations } from './spine-symbols';
import { BasemapAttribution } from './BasemapAttribution';

// One pmtiles:// protocol handler per page (maplibre's protocol registry is global).
let pmtilesProtocolAdded = false;
function ensurePmtilesProtocol() {
  if (pmtilesProtocolAdded) return;
  maplibregl.addProtocol('pmtiles', new PmtilesProtocol().tile);
  pmtilesProtocolAdded = true;
}

function viewFromMap(map: maplibregl.Map): MapViewState {
  const c = map.getCenter();
  return { longitude: c.lng, latitude: c.lat, zoom: map.getZoom(), pitch: map.getPitch(), bearing: map.getBearing() };
}

// Fallback view until the first fit (lib/camera-fit.ts). Previously the only
// view — fixed regardless of where the tracks were.
const INITIAL_VIEW = {
  longitude: 37.745,
  latitude: 48.14,
  zoom: 13.5,
  pitch: 0,
  bearing: 0,
};

const REFIT_DURATION_MS = 600;
/** Jammer area of uncertainty (m) — an area graphic, unchanged by the symbol work. */
const JAMMER_RING_M = 120;

type FitPoint = LatLon & { id: string };

/** Ground circle as a lon/lat ring (small-area equirectangular approximation). */
function circlePolygon(lat: number, lon: number, radiusM: number, n = 64): [number, number][] {
  const dLat = radiusM / 111_320;
  const dLon = radiusM / (111_320 * Math.cos((lat * Math.PI) / 180));
  return Array.from({ length: n + 1 }, (_, i) => {
    const a = (2 * Math.PI * i) / n;
    return [lon + dLon * Math.cos(a), lat + dLat * Math.sin(a)];
  });
}

interface MapSpineProps {
  /** Optional directional vector overlay — Beat 1:05 spatial discrimination. */
  directionalFrom?: { lat: number; lon: number };
  directionalTo?: { lat: number; lon: number };
  /** Suspected jammer — the EW jamming symbol (fix) inside a 120 m ring, framed by the camera fit. */
  jammerLocation?: { lat: number; lon: number; method_id?: string };
  /** Candidate NAI centre — framed by the camera fit when present. */
  candidateNai?: { lat: number; lon: number };
  /** Geolocated FR-04a candidate sites — drawn as anticipated (dashed) hostile EW symbols. */
  candidateSites?: readonly CandidateSite[];
  /** S2 evaluation inputs (corroboration / J override) per source. */
  evaluations?: Evaluations;
  /** Symbol box, px (default 32: the detail state, J / echelon shown). */
  symbolSizePx?: number;
  /**
   * Open at this zoom around the fit centre instead of fitting, as if the
   * operator had zoomed out — auto-fit stays off until "Fit to tracks".
   */
  initialZoom?: number;
  /** Basemap override (default: NEXT_PUBLIC_BASEMAP, see lib/basemap.ts). */
  basemap?: BasemapMode;
}

export function MapSpine({ directionalFrom, directionalTo, jammerLocation, candidateNai, candidateSites, evaluations, symbolSizePx, initialZoom, basemap }: MapSpineProps) {
  const mode = basemap ?? basemapMode();
  const selectSource = useHamilton((s) => s.selectSource);
  const selectedId = useHamilton((s) => s.selectedSource);
  const { symbols, nowIso } = useSpineSymbols({ jammerLocation, candidateSites, evaluations });
  const sizePx = symbolSizePx ?? LIVE_SYMBOL_PX;
  const reducedMotion = usePrefersReducedMotion();
  const reducedMotionRef = useRef(reducedMotion);
  reducedMotionRef.current = reducedMotion;
  const containerRef = useRef<HTMLDivElement>(null);

  // --- Viewport size + controlled view state -------------------------------
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const measure = () => {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) setSize((p) => (p && p.width === r.width && p.height === r.height ? p : { width: r.width, height: r.height }));
    };
    // Measure now too: ResizeObserver callbacks run with rendering, which a
    // background / throttled tab may never do — the overlay must not wait on it.
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const [viewState, setViewState] = useState<MapViewState>(INITIAL_VIEW);
  const viewStateRef = useRef(viewState);
  viewStateRef.current = viewState;

  // --- MapLibre map + deck.gl overlay ----------------------------------------
  const mapDivRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const overlayRef = useRef<MapboxOverlay | null>(null);
  const modeRef = useRef(mode);
  /** Operator navigated (any map move with an originalEvent). Set below, read by the move handler. */
  const onUserMoveRef = useRef<() => void>(() => {});
  /** A camera call made from a React effect is running (its move events fire synchronously). */
  const inEffectRef = useRef(false);
  const fromEffect = useCallback((fn: () => void) => {
    inEffectRef.current = true;
    try {
      fn();
    } finally {
      inEffectRef.current = false;
    }
  }, []);

  useEffect(() => {
    const el = mapDivRef.current;
    if (!el) return;
    ensurePmtilesProtocol();
    const v = viewStateRef.current;
    const map = new maplibregl.Map({
      container: el,
      style: maplibreStyle(modeRef.current, window.location.origin),
      center: [v.longitude, v.latitude],
      zoom: v.zoom,
      pitch: 0,
      bearing: 0,
      maxPitch: 0,
      dragRotate: false,
      pitchWithRotate: false,
      touchPitch: false,
      renderWorldCopies: false,
      attributionControl: false,
      // Hamilton fades the fit itself; no inertia surprises for the overlay.
      fadeDuration: 0,
    });
    map.touchZoomRotate.disableRotation();
    map.keyboard.disableRotation();
    // A missing tile / glyph range must not take the spine down; log once.
    let warned = false;
    map.on('error', (e) => {
      if (warned) return;
      warned = true;
      console.warn('[MapSpine] basemap error (symbols unaffected):', e.error?.message ?? e);
    });
    map.on('move', (e) => {
      if ((e as { originalEvent?: unknown }).originalEvent) onUserMoveRef.current();
      const next = viewFromMap(map);
      // Same frame as the map paints: the SVG symbol overlay never trails the
      // basemap. Moves we trigger synchronously from a React effect (jumpTo,
      // resize) are already inside React's commit — a plain update there.
      if (inEffectRef.current) setViewState(next);
      else flushSync(() => setViewState(next));
    });
    const overlay = new MapboxOverlay({ interleaved: false, layers: [] });
    map.addControl(overlay as unknown as maplibregl.IControl);
    mapRef.current = map;
    overlayRef.current = overlay;    return () => {
      overlayRef.current = null;
      mapRef.current = null;
      map.remove();
    };
  }, []);

  // Basemap mode switch (stories / controls) without rebuilding the map.
  useEffect(() => {
    if (modeRef.current === mode) return;
    modeRef.current = mode;
    mapRef.current?.setStyle(maplibreStyle(mode, window.location.origin));
  }, [mode]);

  // Keep the map canvas sized with the container (same measurement as the overlay).
  useEffect(() => {
    const map = mapRef.current;
    if (size && map) fromEffect(() => map.resize());
  }, [size, fromEffect]);

  // --- Camera fit ------------------------------------------------------------
  const fitPoints = useMemo<FitPoint[]>(() => {
    const pts: FitPoint[] = symbols.filter((s) => s.kind === 'track').map((s) => ({ id: s.id, lat: s.lat, lon: s.lon }));
    if (jammerLocation) pts.push({ id: '__jammer', lat: jammerLocation.lat, lon: jammerLocation.lon });
    if (candidateNai) pts.push({ id: '__nai', lat: candidateNai.lat, lon: candidateNai.lon });
    return pts;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbols, jammerLocation?.lat, jammerLocation?.lon, candidateNai?.lat, candidateNai?.lon]);
  const fitPointsRef = useRef(fitPoints);
  fitPointsRef.current = fitPoints;
  const fittedIdsRef = useRef<Set<string> | null>(null);
  const userMovedRef = useRef(initialZoom !== undefined);
  const [manual, setManual] = useState(initialZoom !== undefined);
  const initialZoomRef = useRef(initialZoom);
  // Operator navigation suspends auto-fit until "Fit to tracks". A move with
  // an originalEvent is always the operator (our own fits never carry one),
  // including a drag that interrupts a running fit.
  onUserMoveRef.current = () => {
    if (userMovedRef.current) return;
    userMovedRef.current = true;
    setManual(true);
  };

  const fit = useCallback(
    (animate: boolean, zoomOverride?: number) => {
      const pts = fitPointsRef.current;
      const bounds = boundsOf(pts);
      const map = mapRef.current;
      if (!size || !bounds || !map) return;
      const v = fitMercator({ bounds, width: size.width, height: size.height });
      const camera = { center: [v.longitude, v.latitude] as [number, number], zoom: zoomOverride ?? v.zoom, pitch: 0, bearing: 0 };
      fittedIdsRef.current = new Set(pts.map((p) => p.id));
      map.stop();
      if (animate) {
        // Linear, like the deck.gl LinearInterpolator it replaces; frames run in rAF.
        fromEffect(() => map.easeTo({ ...camera, duration: REFIT_DURATION_MS, easing: (t) => t }));
      } else {
        fromEffect(() => map.jumpTo(camera));
      }
    },
    [size, fromEffect],
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

  // --- Screen positions (every render: the overlay tracks the map exactly) --
  const positions = useMemo(() => {
    const out: Record<string, { x: number; y: number }> = {};
    if (!size) return out;
    const vp = new WebMercatorViewport({ ...viewState, ...size });
    for (const s of symbols) {
      const [x, y] = vp.project([s.lon, s.lat]);
      if (Number.isFinite(x) && Number.isFinite(y)) out[s.id] = { x: x!, y: y! };
    }
    return out;
  }, [viewState, size, symbols]);
  const positionsRef = useRef(positions);
  positionsRef.current = positions;

  // --- Declutter grouping (throttled on view / symbol / size change) -------
  const [grouping, setGrouping] = useState<DeclutterResult>({ singles: [], groups: [] });
  const runDeclutterRef = useRef<() => void>(() => {});
  runDeclutterRef.current = () => {
    if (!size) return;
    const box = declutterBoxFor(sizePx);
    const items: DeclutterItem[] = symbols
      .filter((s) => positionsRef.current[s.id])
      .map((s) => ({ id: s.id, ...positionsRef.current[s.id]!, width: box.width, height: box.height, rank: s.rank }));
    const result = declutter(items, { viewport: size, minSeparationPx: box.minSeparationPx, minCount: box.minCount });
    setGrouping((prev) => (sameGrouping(prev, result) ? prev : result));
  };
  const declThrottle = useMemo(() => throttle(() => runDeclutterRef.current(), DECLUTTER_THROTTLE_MS), []);
  useEffect(() => () => declThrottle.cancel(), [declThrottle]);
  useEffect(() => {
    declThrottle.call();
  }, [viewState, size, symbols, sizePx, declThrottle]);

  const { singles, stacks } = useMemo(() => placeSymbols(symbols, grouping, positions), [symbols, grouping, positions]);

  // --- Area / line graphics (deck.gl) --------------------------------------
  const jammerLayer = useMemo(() => {
    if (!jammerLocation) return null;
    return new PolygonLayer({
      id: 'jammer-area',
      data: [{ polygon: circlePolygon(jammerLocation.lat, jammerLocation.lon, JAMMER_RING_M) }],
      getPolygon: (d: { polygon: [number, number][] }) => d.polygon,
      filled: true,
      stroked: true,
      getFillColor: [220, 178, 90, 46],
      getLineColor: [220, 178, 90, 153],
      getLineWidth: 1.5,
      lineWidthUnits: 'pixels',
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jammerLocation?.lat, jammerLocation?.lon]);

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [directionalFrom?.lat, directionalFrom?.lon, directionalTo?.lat, directionalTo?.lon]);

  useEffect(() => {
    overlayRef.current?.setProps({ layers: [jammerLayer, directionalLayer].filter(Boolean) as never });
  }, [jammerLayer, directionalLayer]);

  return (
    <div
      ref={containerRef}
      data-basemap={mode}
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        background: 'var(--surface-base)',
      }}
    >
      <div ref={mapDivRef} data-testid="maplibre-map" style={{ position: 'absolute', inset: 0 }} />
      <BasemapAttribution mode={mode} />
      {size && (
        <SpineOverlay
          singles={singles}
          stacks={stacks}
          drawSingles
          sizePx={sizePx}
          viewport={size}
          selectedId={selectedId}
          onSelect={selectSource}
          onFit={fitToTracks}
          manual={manual}
          reducedMotion={reducedMotion}
          nowIso={nowIso}
        />
      )}
    </div>
  );
}

function sameGrouping(a: DeclutterResult, b: DeclutterResult): boolean {
  return a.singles.join() === b.singles.join() && a.groups.map((g) => g.ids.join()).join(';') === b.groups.map((g) => g.ids.join()).join(';');
}

export const MAP_INITIAL_VIEW = INITIAL_VIEW;
