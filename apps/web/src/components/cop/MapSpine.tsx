'use client';

// MapLibre 2D fallback spine (NEXT_PUBLIC_RENDERER=maplibre).
//
// Basemap: a maplibre-gl Map with the offline Protomaps vector extract
// (/tiles/avdiivka.pmtiles via the `pmtiles` protocol, Hamilton dark style,
// self-hosted glyphs — lib/basemap.ts, System Design §6c "Basemap"). Area
// graphics (the FR-06a emitter-estimate area of effect) are deck.gl layers
// drawn on the map through @deck.gl/mapbox MapboxOverlay (overlaid: deck's
// canvas rides on the map and re-renders in the map's own render pass, so it
// never drifts from the basemap). No jammer point, ring or bearing line is
// ever drawn (HS-20).
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
import { WebMercatorViewport, type MapViewState } from '@deck.gl/core';
import { PathLayer, PolygonLayer } from '@deck.gl/layers';
import { basemapMode, maplibreStyle, type BasemapMode } from '@/lib/basemap';
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion';
import { useHamilton } from '@/store/hamilton';
import { boundsOf, fitMercator, isFitShortcut, needsRefit, type LatLon } from '@/lib/camera-fit';
import { declutter, DECLUTTER_THROTTLE_MS, throttle, type DeclutterItem, type DeclutterResult } from '@/lib/declutter';
import { LIVE_SYMBOL_PX, declutterBoxFor } from '@/lib/cop-symbols';
import { SpineOverlay, placeSymbols } from './SpineOverlay';
import { useSpineSymbols, type CandidateSite, type Evaluations } from './spine-symbols';
import { contourOf, dashRing, labelAnchor, largestOuterRing, layerOf, metersPerPixel, screenLabelAnchor } from '@/lib/aoe';
import { mapLabel, type EstimateEntry } from '@/lib/emitter-estimate';
import { AOE_DASH_PX, AOE_EDGE50_PX, AOE_EDGE90_PX, AOE_FILL_ALPHA, AOE_RGB, AOE_STALE_EDGE_PX } from '@/lib/aoe-style';
import { useAoeFade, useEstimateView } from '@/hooks/useEmitterEstimate';
import { AoeScreen } from './AoeKey';
import { BasemapAttribution } from './BasemapAttribution';
import { useDemoVisible } from '@/store/demo-view';

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

type FitPoint = LatLon & { id: string };

interface MapSpineProps {
  /** FR-04b emitter estimate, drawn as the FR-06a area of effect. The camera fit stays tracks-only (plan cut 5). */
  emitterEstimate?: EstimateEntry | null | undefined;
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

export function MapSpine({ emitterEstimate, candidateSites, evaluations, symbolSizePx, initialZoom, basemap }: MapSpineProps) {
  const mode = basemap ?? basemapMode();
  const selectSource = useHamilton((s) => s.selectSource);
  const selectedId = useHamilton((s) => s.selectedSource);
  const { symbols, nowIso } = useSpineSymbols({ candidateSites, evaluations });
  const sizePx = symbolSizePx ?? LIVE_SYMBOL_PX;
  const reducedMotion = usePrefersReducedMotion();
  const reducedMotionRef = useRef(reducedMotion);
  reducedMotionRef.current = reducedMotion;
  const containerRef = useRef<HTMLDivElement>(null);
  // Admin · Demo simulation view filter (docs/plans/admin-demo-menu.md D8).
  // Tracks are the SVG overlay (showTracks); the AoE layers take deck `visible`.
  const tracksVisible = useDemoVisible('map.tracks');
  const aoeAreaVisible = useDemoVisible('map.aoeArea');
  const aoeLabelVisible = useDemoVisible('map.aoeLabel');
  const aoeKeyVisible = useDemoVisible('map.aoeKey');
  const fitButtonVisible = useDemoVisible('map.fitButton');

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
    return symbols.filter((s) => s.kind === 'track').map((s) => ({ id: s.id, lat: s.lat, lon: s.lon }));
  }, [symbols]);
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

  // --- Area graphics (deck.gl): the FR-06a area of effect --------------------
  // Civil GNSS only (D6). Active: 90% tint + 2 px edge, 50% dashed outline.
  // Stale: both outlines, no fill (HS-25). Unbounded: nothing drawn.
  const est = useEstimateView(emitterEstimate);
  const aoeOpacity = useAoeFade(est.state && est.state !== 'unbounded' ? est.entry!.payload.estimate_id : null, reducedMotion);
  const civil = est.entry && est.state && est.state !== 'unbounded' ? layerOf(est.entry.payload, 'gnss_civil') : undefined;
  const c90 = contourOf(civil, 0.9);
  const c50 = contourOf(civil, 0.5);
  const stale = est.state === 'stale';
  // Dash geometry depends on the zoom (pixel pattern → ground metres); quarter-zoom steps.
  const dashZoom = Math.round(viewState.zoom * 4) / 4;
  const aoe = useMemo(() => {
    const rgb = [...AOE_RGB.gnss_civil] as [number, number, number];
    const layers: unknown[] = [];
    const drawn: string[] = [];
    if (c90 && !stale) {
      layers.push(
        new PolygonLayer({
          id: 'aoe-fill90-gnss_civil',
          visible: aoeAreaVisible,
          data: c90.polygon.coordinates,
          getPolygon: (rings: unknown) => rings as [number, number][][],
          filled: true,
          stroked: false,
          getFillColor: [...rgb, Math.round(AOE_FILL_ALPHA * 255)],
          opacity: aoeOpacity,
          updateTriggers: { getFillColor: [rgb.join()] },
        }),
      );
      drawn.push('fill90-gnss_civil');
    }
    if (c90) {
      layers.push(
        new PathLayer({
          id: 'aoe-edge90-gnss_civil',
          visible: aoeAreaVisible,
          data: c90.polygon.coordinates.flat(),
          getPath: (ring: unknown) => ring as [number, number][],
          getColor: [...rgb, 255],
          getWidth: stale ? AOE_STALE_EDGE_PX : AOE_EDGE90_PX,
          widthUnits: 'pixels',
          jointRounded: true,
          opacity: aoeOpacity,
          updateTriggers: { getWidth: [stale] },
        }),
      );
      drawn.push('edge90-gnss_civil');
    }
    if (c50) {
      const lat = c50.polygon.coordinates[0]?.[0]?.[0]?.[1] ?? 48.14;
      const mpp = metersPerPixel(lat, dashZoom);
      const dashes = c50.polygon.coordinates.flat().flatMap((ring) => dashRing(ring, AOE_DASH_PX[0] * mpp, AOE_DASH_PX[1] * mpp));
      layers.push(
        new PathLayer({
          id: 'aoe-edge50-gnss_civil',
          visible: aoeAreaVisible,
          data: dashes,
          getPath: (d: unknown) => d as [number, number][],
          getColor: [...rgb, 242],
          getWidth: AOE_EDGE50_PX,
          widthUnits: 'pixels',
          capRounded: false,
          opacity: aoeOpacity,
        }),
      );
      drawn.push('edge50-gnss_civil');
    }
    return { layers, drawn };
  }, [c90, c50, stale, dashZoom, aoeOpacity, aoeAreaVisible]);

  useEffect(() => {
    overlayRef.current?.setProps({ layers: aoe.layers as never });
  }, [aoe]);

  const aoeAnchor = useMemo(() => {
    const poly = c90?.polygon ?? c50?.polygon;
    if (!poly || !size) return null;
    const vp = new WebMercatorViewport({ ...viewState, ...size });
    const proj = (c: readonly number[]) => {
      const [x, y] = vp.project([c[0]!, c[1]!]);
      return { x: x!, y: y! };
    };
    const onScreen = screenLabelAnchor((largestOuterRing(poly) ?? []).map(proj), size);
    if (onScreen) return onScreen;
    const a = labelAnchor(poly);
    return a ? proj([a.lon, a.lat]) : null;
  }, [c90, c50, viewState, size]);

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
          showTracks={tracksVisible}
          showFit={fitButtonVisible}
          aoe={
            est.entry && est.state ? (
              <AoeScreen
                state={est.state}
                label={mapLabel(est.entry, est.state, est.nowMs)}
                anchor={aoeAnchor}
                viewport={size}
                layers={aoe.drawn}
                opacity={aoeOpacity}
                reducedMotion={reducedMotion}
                avoid={tracksVisible ? [...singles, ...stacks.map((st) => st.anchor)] : []}
                avoidPx={sizePx}
                showLabel={aoeLabelVisible}
                showKey={aoeKeyVisible}
                showArea={aoeAreaVisible}
              />
            ) : null
          }
        />
      )}
    </div>
  );
}

function sameGrouping(a: DeclutterResult, b: DeclutterResult): boolean {
  return a.singles.join() === b.singles.join() && a.groups.map((g) => g.ids.join()).join(';') === b.groups.map((g) => g.ids.join()).join(';');
}

export const MAP_INITIAL_VIEW = INITIAL_VIEW;
