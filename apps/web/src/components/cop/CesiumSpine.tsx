'use client';

// CesiumJS primary spine. Cesium is loaded as a static <script> tag from
// /cesium/Cesium.js (see app/layout.tsx) — we never import the npm module,
// which keeps webpack out of Cesium's pre-bundled chunks. All worker / asset
// fetches stay on-origin via window.CESIUM_BASE_URL = '/cesium/' (NFR-01).
//
// Symbols: the production track symbol (src/components/symbol, Decisions/Track
// Symbology) as Cesium billboards — trackSymbolSvg rasterised to a PNG at the
// device pixel ratio (symbol-raster.ts), anchored on the frame centre, cached
// by symbolImageKey (band / gauge step, STALE, J, selection, hover). No
// circular halo, no pulse. Declutter stacks, hover / keyboard rating
// breakdowns and the fit control live in SpineOverlay (screen space).
//
// Imagery (System Design §6c "Basemap", lib/basemap.ts): offline, a 512 px
// PNG pyramid at /tiles/raster rendered from the SAME Protomaps extract and
// Hamilton dark style as the MapLibre spine (scripts/basemap/render-raster.mjs),
// via UrlTemplateImageryProvider — still no Cesium ion, no network. Online
// (dev only, not NFR-01): OSM raster tiles, dimmed with the imagery layer's
// brightness / saturation so the symbols keep the contrast.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type * as CesiumNs from 'cesium';
import { waitForCesium } from '@/lib/cesium-env';
import {
  basemapMode,
  CESIUM_IMAGERY_TUNING,
  isRasterMeta,
  ONLINE_ATTRIBUTION,
  ONLINE_RASTER_URL,
  RASTER_META_PATH,
  RASTER_PATH,
  type BasemapMode,
} from '@/lib/basemap';
import { BasemapAttribution } from './BasemapAttribution';
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion';
import { useHamilton } from '@/store/hamilton';
import {
  boundingCircle,
  cesiumFitRange,
  FIT_PITCH_DEG,
  isFitShortcut,
  needsRefit,
  type LatLon,
} from '@/lib/camera-fit';
import { declutter, DECLUTTER_THROTTLE_MS, throttle, type DeclutterItem, type DeclutterResult } from '@/lib/declutter';
import { LIVE_SYMBOL_PX, declutterBoxFor, quantizeScore, symbolImageKey } from '@/lib/cop-symbols';
import { symbolFunctionOf } from '@/lib/track-sidc';
import { SpineOverlay, placeSymbols } from './SpineOverlay';
import { jCodeOf, useSpineSymbols, type CandidateSite, type Evaluations } from './spine-symbols';
import { cachedRaster, rasterizeSymbol, symbolPixelRatio } from './symbol-raster';
import { contourOf, labelAnchor, largestOuterRing, layerOf, screenLabelAnchor } from '@/lib/aoe';
import { mapLabel, type EstimateEntry } from '@/lib/emitter-estimate';
import { AOE_EDGE50_PX, AOE_EDGE90_PX, AOE_FILL_ALPHA, AOE_RGB, AOE_STALE_EDGE_PX } from '@/lib/aoe-style';
import { useAoeFade, useEstimateView } from '@/hooks/useEmitterEstimate';
import { AoeScreen } from './AoeKey';

// Fallback view before anything is framed (Avdiivka AO). As soon as there are
// fit points the camera frames them instead (lib/camera-fit.ts). This used to
// be the ONLY view: a fixed camera 0.06° (~6.7 km) south of the AO at 4.5 km
// altitude, which put A/B/C ~27 px apart at the top of the frame (audit A26).
const AVDIIVKA = { lat: 48.14, lon: 37.745 };
/** Animated re-fit (s); 0 under prefers-reduced-motion and for the first fit. */
const REFIT_DURATION_S = 0.6;
/** Pointer travel (px) before a drag counts as navigation. */
const DRAG_THRESHOLD_PX = 4;
/** Screen-position key of the AoE label anchor in the declutter pass (not a symbol id). */
const AOE_LABEL_KEY = '__aoe_label';

type FitPoint = LatLon & { id: string };
type ScreenPos = Record<string, { x: number; y: number }>;

interface CesiumSpineProps {
  /**
   * FR-04b emitter estimate, drawn as the FR-06a area of effect (ground
   * polygons). No jammer point, ring or bearing line is ever drawn (HS-20).
   * The camera fit stays tracks-only (plan cut 5).
   */
  emitterEstimate?: EstimateEntry | null | undefined;
  /** Geolocated FR-04a candidate sites — drawn as anticipated (dashed) hostile EW symbols. */
  candidateSites?: readonly CandidateSite[];
  /** S2 evaluation inputs (corroboration / J override) per source. */
  evaluations?: Evaluations;
  /** Symbol box, px (default 32: the detail state, J / echelon shown). */
  symbolSizePx?: number;
  /**
   * Open at this camera range (m) around the fit centre instead of fitting,
   * as if the operator had zoomed out — auto-fit stays off until
   * "Fit to tracks" (button or F).
   */
  initialRangeM?: number;
  /** Basemap override (default: NEXT_PUBLIC_BASEMAP, see lib/basemap.ts). */
  basemap?: BasemapMode;
}

/** Build the imagery provider for a mode, or null (none / assets not provisioned). */
async function basemapProvider(C: typeof CesiumNs, mode: BasemapMode): Promise<CesiumNs.ImageryProvider | null> {
  if (mode === 'online') {
    return new C.UrlTemplateImageryProvider({
      url: ONLINE_RASTER_URL,
      maximumLevel: 19,
      credit: new C.Credit(ONLINE_ATTRIBUTION),
    });
  }
  if (mode !== 'offline') return null;
  // tiles.json doubles as the "assets provisioned" probe: without it no tile is requested (no 404 storm).
  const res = await fetch(RASTER_META_PATH).catch(() => null);
  if (!res?.ok) return null;
  const meta: unknown = await res.json().catch(() => null);
  if (!isRasterMeta(meta)) return null;
  const [w, s, e, n] = meta.bounds;
  return new C.UrlTemplateImageryProvider({
    url: RASTER_PATH,
    tilingScheme: new C.WebMercatorTilingScheme(),
    tileWidth: meta.tileSize,
    tileHeight: meta.tileSize,
    minimumLevel: meta.minzoom,
    maximumLevel: meta.maxzoom,
    rectangle: C.Rectangle.fromDegrees(w, s, e, n),
    credit: new C.Credit(meta.attribution),
  });
}

export function CesiumSpine(props: CesiumSpineProps) {
  const mode = props.basemap ?? basemapMode();
  const containerRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<CesiumNs.Viewer | null>(null);
  const cesiumRef = useRef<typeof CesiumNs | null>(null);
  const symbolEntitiesRef = useRef<Map<string, CesiumNs.Entity>>(new Map());
  /** Image key currently on each billboard. */
  const billboardKeyRef = useRef<Map<string, string>>(new Map());
  const overlayEntitiesRef = useRef<Set<CesiumNs.Entity>>(new Set());
  const [ready, setReady] = useState(false);
  /** Bumped when an async raster lands, so the reconcile pass picks it up. */
  const [rasterTick, setRasterTick] = useState(0);
  const reducedMotion = usePrefersReducedMotion();
  const reducedMotionRef = useRef(reducedMotion);
  reducedMotionRef.current = reducedMotion;
  const sizePx = props.symbolSizePx ?? LIVE_SYMBOL_PX;

  const selectSource = useHamilton((s) => s.selectSource);
  const selectedId = useHamilton((s) => s.selectedSource);
  const { symbols, nowIso } = useSpineSymbols({
    candidateSites: props.candidateSites,
    evaluations: props.evaluations,
  });
  const symbolsRef = useRef(symbols);
  symbolsRef.current = symbols;
  const [activeId, setActiveId] = useState<string | null>(null);

  // --- Camera fit ------------------------------------------------------------
  const { initialRangeM } = props;
  const fitPoints = useMemo<FitPoint[]>(
    () => symbols.filter((s) => s.kind === 'track').map((s) => ({ id: s.id, lat: s.lat, lon: s.lon })),
    [symbols],
  );
  const fitPointsRef = useRef(fitPoints);
  fitPointsRef.current = fitPoints;
  /** Ids framed by the last fit; null until the first one. */
  const fittedIdsRef = useRef<Set<string> | null>(null);
  /** Operator panned / zoomed — auto-fit suspended until "Fit to tracks". */
  const userMovedRef = useRef(initialRangeM !== undefined);
  const [manual, setManual] = useState(initialRangeM !== undefined);
  const initialRangeRef = useRef(initialRangeM);

  // --- Declutter -------------------------------------------------------------
  const [decl, setDecl] = useState<{ result: DeclutterResult; positions: ScreenPos; viewport: { width: number; height: number } }>({
    result: { singles: [], groups: [] },
    positions: {},
    viewport: { width: 0, height: 0 },
  });
  const declutterRef = useRef<{ call: () => void; cancel: () => void } | null>(null);
  /** Symbol set changed since the last pass (camera moves are detected directly). */
  const declDirtyRef = useRef(true);
  const runDeclutterRef = useRef<() => void>(() => {});

  // One-time viewer construction once the Cesium script tag has loaded.
  useEffect(() => {
    let cancelled = false;
    let viewer: CesiumNs.Viewer | null = null;
    waitForCesium()
      .then((C) => {
        if (cancelled || !containerRef.current) return;
        cesiumRef.current = C;
        C.Ion.defaultAccessToken = '';
        viewer = new C.Viewer(containerRef.current, {
          terrainProvider: new C.EllipsoidTerrainProvider(),
          baseLayer: false,
          baseLayerPicker: false,
          animation: false,
          timeline: false,
          fullscreenButton: false,
          geocoder: false,
          homeButton: false,
          infoBox: false,
          sceneModePicker: false,
          selectionIndicator: false,
          navigationHelpButton: false,
          navigationInstructionsInitiallyVisible: false,
          creditContainer: hiddenCredit(),
        });
        viewerRef.current = viewer;
        const dark = C.Color.fromCssColorString('#0a0d12');
        viewer.scene.globe.baseColor = dark;
        viewer.scene.backgroundColor = dark;
        if (viewer.scene.skyAtmosphere) viewer.scene.skyAtmosphere.show = false;
        if (viewer.scene.fog) viewer.scene.fog.enabled = false;
        viewer.scene.globe.showGroundAtmosphere = false;
        viewer.scene.skyBox?.destroy?.();
        viewer.scene.sun?.destroy?.();
        viewer.scene.moon?.destroy?.();
        // Fallback framing only — the fit effect replaces it as soon as there
        // is anything to frame. Same −55° pitch, centred on the AO.
        viewer.camera.flyToBoundingSphere(
          new C.BoundingSphere(C.Cartesian3.fromDegrees(AVDIIVKA.lon, AVDIIVKA.lat, 0), 0),
          {
            offset: new C.HeadingPitchRange(
              0,
              C.Math.toRadians(FIT_PITCH_DEG),
              initialRangeRef.current ?? cesiumFitRange({ radiusM: 0, aspect: 1 }),
            ),
            duration: 0,
          },
        );
        viewer.screenSpaceEventHandler.setInputAction(
          (m: { position: CesiumNs.Cartesian2 }) => {
            const picked = viewer!.scene.pick(m.position) as
              | { id?: { name?: string } }
              | undefined;
            const name = picked?.id?.name;
            if (name) selectSource(name);
          },
          C.ScreenSpaceEventType.LEFT_CLICK,
        );
        // Throttled declutter pass, driven by postRender whenever the camera
        // view matrix or canvas size changed (or the symbol set, via dirty).
        const pass = throttle(() => runDeclutterRef.current(), DECLUTTER_THROTTLE_MS);
        declutterRef.current = pass;
        const lastView = new C.Matrix4();
        let lastW = 0;
        let lastH = 0;
        viewer.scene.postRender.addEventListener(() => {
          const v = viewerRef.current;
          if (!v) return;
          const cv = v.scene.canvas;
          const moved =
            !C.Matrix4.equalsEpsilon(v.camera.viewMatrix, lastView, 1e-9) ||
            cv.clientWidth !== lastW ||
            cv.clientHeight !== lastH;
          if (!moved && !declDirtyRef.current) return;
          C.Matrix4.clone(v.camera.viewMatrix, lastView);
          lastW = cv.clientWidth;
          lastH = cv.clientHeight;
          declDirtyRef.current = false;
          pass.call();
        });
        setReady(true);
      })
      .catch(() => {
        // Cesium script unreachable — Spine.tsx will surface a "spine offline"
        // state via the loader. Demo can fall back to MapLibre via env var.
      });
    return () => {
      cancelled = true;
      declutterRef.current?.cancel();
      viewer?.destroy();
      viewerRef.current = null;
    };
  }, [selectSource]);

  /** Frame every fit point (tracks) at the −55° pitch. */
  const fit = useCallback((durationS: number, rangeOverrideM?: number) => {
    const C = cesiumRef.current;
    const viewer = viewerRef.current;
    const pts = fitPointsRef.current;
    if (!C || !viewer || pts.length === 0) return;
    const circle = boundingCircle(pts);
    const cv = viewer.scene.canvas;
    if (!circle || cv.clientWidth === 0 || cv.clientHeight === 0) return;
    const frustum = viewer.camera.frustum as CesiumNs.PerspectiveFrustum;
    const range = rangeOverrideM ?? cesiumFitRange({
      radiusM: circle.radiusM,
      aspect: cv.clientWidth / cv.clientHeight,
      ...(typeof frustum.fov === 'number' ? { fovRad: frustum.fov } : {}),
    });
    viewer.camera.cancelFlight();
    viewer.camera.flyToBoundingSphere(
      new C.BoundingSphere(C.Cartesian3.fromDegrees(circle.center.lon, circle.center.lat, 0), circle.radiusM),
      {
        offset: new C.HeadingPitchRange(0, C.Math.toRadians(FIT_PITCH_DEG), range),
        duration: durationS,
      },
    );
    fittedIdsRef.current = new Set(pts.map((p) => p.id));
  }, []);

  const fitToTracks = useCallback(() => {
    userMovedRef.current = false;
    setManual(false);
    fit(reducedMotionRef.current ? 0 : REFIT_DURATION_S);
  }, [fit]);

  // Auto re-fit — only on a material change (first fit, a new point, or a
  // point drifting out of frame), never on a plain tick and never after the
  // operator navigated.
  useEffect(() => {
    const C = cesiumRef.current;
    const viewer = viewerRef.current;
    if (!ready || !C || !viewer) return;
    if (initialRangeRef.current !== undefined && fittedIdsRef.current === null) {
      // Zoomed-out open: fit centre, caller's range, auto-fit stays off.
      if (fitPoints.length > 0) fit(0, initialRangeRef.current);
      return;
    }
    const cv = viewer.scene.canvas;
    const screen = fitPoints.map((p) =>
      C.SceneTransforms.worldToWindowCoordinates(viewer.scene, C.Cartesian3.fromDegrees(p.lon, p.lat, 0)),
    );
    const reason = needsRefit({
      fittedIds: fittedIdsRef.current,
      ids: fitPoints.map((p) => p.id),
      screen,
      width: cv.clientWidth,
      height: cv.clientHeight,
      userMoved: userMovedRef.current,
    });
    if (reason) fit(reason === 'initial' || reducedMotionRef.current ? 0 : REFIT_DURATION_S);
  }, [ready, fitPoints, fit]);

  // Operator navigation (wheel / drag on the globe) suspends auto-fit. A
  // click without travel (track selection) does not.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    let down: { x: number; y: number } | null = null;
    const markMoved = () => {
      if (userMovedRef.current) return;
      userMovedRef.current = true;
      setManual(true);
    };
    const onDown = (e: PointerEvent) => {
      down = { x: e.clientX, y: e.clientY };
    };
    const onMove = (e: PointerEvent) => {
      if (!down || e.buttons === 0) return;
      if (Math.hypot(e.clientX - down.x, e.clientY - down.y) > DRAG_THRESHOLD_PX) {
        markMoved();
        down = null;
      }
    };
    const onUp = () => {
      down = null;
    };
    el.addEventListener('pointerdown', onDown, true);
    el.addEventListener('pointermove', onMove, true);
    window.addEventListener('pointerup', onUp, true);
    el.addEventListener('wheel', markMoved, { capture: true, passive: true });
    return () => {
      el.removeEventListener('pointerdown', onDown, true);
      el.removeEventListener('pointermove', onMove, true);
      window.removeEventListener('pointerup', onUp, true);
      el.removeEventListener('wheel', markMoved, true);
    };
  }, []);

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

  // Declutter pass: project every symbol, group by screen-space proximity
  // with the production symbol's box (≥ 3 within 1.5·s), hide grouped
  // billboards (the overlay draws them as one DeclutterStack) and restore the
  // rest. Also refreshes the single symbols' screen positions for the
  // overlay's hover / keyboard hit targets.
  runDeclutterRef.current = () => {
    const C = cesiumRef.current;
    const viewer = viewerRef.current;
    if (!C || !viewer) return;
    const cv = viewer.scene.canvas;
    const positions: ScreenPos = {};
    const items: DeclutterItem[] = [];
    const box = declutterBoxFor(sizePx);
    for (const s of symbolsRef.current) {
      const wc = C.SceneTransforms.worldToWindowCoordinates(viewer.scene, C.Cartesian3.fromDegrees(s.lon, s.lat, 0));
      if (!wc) continue;
      positions[s.id] = { x: wc.x, y: wc.y };
      items.push({ id: s.id, x: wc.x, y: wc.y, width: box.width, height: box.height, rank: s.rank });
    }
    // AoE label anchor (not a symbol: never declutters).
    const la = aoeAnchorRef.current;
    if (la) {
      const proj = (lon: number, lat: number) => {
        const wc = C.SceneTransforms.worldToWindowCoordinates(viewer.scene, C.Cartesian3.fromDegrees(lon, lat, 0));
        return wc ? { x: wc.x, y: wc.y } : { x: NaN, y: NaN };
      };
      const vp = { width: cv.clientWidth, height: cv.clientHeight };
      const at = screenLabelAnchor(la.ring.map((c) => proj(c[0]!, c[1]!)), vp) ?? (la.fallback ? proj(la.fallback.lon, la.fallback.lat) : null);
      if (at && Number.isFinite(at.x)) positions[AOE_LABEL_KEY] = at;
    }
    const viewport = { width: cv.clientWidth, height: cv.clientHeight };
    const result = declutter(items, { viewport, minSeparationPx: box.minSeparationPx, minCount: box.minCount });
    const grouped = new Set(result.groups.flatMap((g) => g.ids));
    for (const [id, ent] of symbolEntitiesRef.current) {
      const show = !grouped.has(id) && billboardKeyRef.current.has(id);
      if (ent.show !== show) ent.show = show;
    }
    setDecl((prev) => (sameLayout(prev, result, positions, viewport) ? prev : { result, positions, viewport }));
  };

  // Reconcile symbol billboards from the symbol list. Re-rasterises only when
  // a billboard's image key changes (band / gauge step, STALE, J, selection,
  // hover) — a tick that keeps the key just moves the entity.
  useEffect(() => {
    const C = cesiumRef.current;
    const viewer = viewerRef.current;
    if (!ready || !C || !viewer) return;
    const ratio = symbolPixelRatio();
    const seen = new Set<string>();
    for (const s of symbols) {
      seen.add(s.id);
      const selected = s.kind === 'track' && selectedId === s.id;
      const active = activeId === s.id;
      const qScore = s.track.score === undefined ? undefined : quantizeScore(s.track.score);
      const key = symbolImageKey({
        affiliation: s.track.affiliation,
        fn: symbolFunctionOf(s.track),
        status: s.track.status,
        designation: s.track.designation,
        info: s.track.info,
        qScore,
        stale: s.track.stale,
        jCode: jCodeOf(s.track),
        sizePx,
        selected,
        active,
        pixelRatio: ratio,
      });
      const position = C.Cartesian3.fromDegrees(s.lon, s.lat, 0);
      let ent = symbolEntitiesRef.current.get(s.id);
      if (!ent) {
        ent = viewer.entities.add({
          id: `sym:${s.id}`,
          // Picking selects by entity name — tracks only.
          ...(s.kind === 'track' ? { name: s.id } : {}),
          show: false,
          position,
          billboard: {
            horizontalOrigin: C.HorizontalOrigin.LEFT,
            verticalOrigin: C.VerticalOrigin.TOP,
            // Never hidden by the globe at the −55° pitch.
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
          },
        });
        symbolEntitiesRef.current.set(s.id, ent);
      } else {
        ent.position = position as never;
      }
      if (billboardKeyRef.current.get(s.id) === key) continue;
      const raster = cachedRaster(key);
      if (!raster) {
        rasterizeSymbol(key, { ...s.track, score: qScore }, { sizePx, selected, active }, ratio)
          .then(() => setRasterTick((n) => n + 1))
          .catch(() => {});
        continue;
      }
      const bb = ent.billboard!;
      bb.image = raster.url as never;
      bb.width = raster.width as never;
      bb.height = raster.height as never;
      // Image top-left at (−anchor): the frame centre sits on the location.
      bb.pixelOffset = new C.Cartesian2(-raster.anchor[0], -raster.anchor[1]) as never;
      billboardKeyRef.current.set(s.id, key);
    }
    for (const [id, ent] of symbolEntitiesRef.current) {
      if (!seen.has(id)) {
        viewer.entities.remove(ent);
        symbolEntitiesRef.current.delete(id);
        billboardKeyRef.current.delete(id);
      }
    }
    declDirtyRef.current = true;
    declutterRef.current?.call();
  }, [ready, symbols, selectedId, activeId, sizePx, rasterTick]);

  // --- Area graphics: the FR-06a area of effect (civil GNSS, D6) -------------
  // Fills: Entity.polygon classified onto the terrain (classificationType
  // TERRAIN). Edges: clampToGround polylines — outlines are unsupported on
  // terrain-clamped polygons — solid 2 px for 90%, PolylineDash for 50%.
  // Stale: outlines only (HS-25). Unbounded: nothing. One ≤ 300 ms fade-in
  // through CallbackProperty colours; none under reduced motion.
  const est = useEstimateView(props.emitterEstimate);
  const aoeOpacity = useAoeFade(est.state && est.state !== 'unbounded' ? est.entry!.payload.estimate_id : null, reducedMotion);
  const fadeRef = useRef(1);
  fadeRef.current = aoeOpacity;
  const civil = est.entry && est.state && est.state !== 'unbounded' ? layerOf(est.entry.payload, 'gnss_civil') : undefined;
  const c90 = contourOf(civil, 0.9);
  const c50 = contourOf(civil, 0.5);
  const stale = est.state === 'stale';
  const [aoeDrawn, setAoeDrawn] = useState<string[]>([]);
  const aoeAnchorWorld = useMemo(() => {
    const poly = c90?.polygon ?? c50?.polygon;
    return poly ? { ring: largestOuterRing(poly) ?? [], fallback: labelAnchor(poly) } : null;
  }, [c90, c50]);
  const aoeAnchorRef = useRef(aoeAnchorWorld);
  aoeAnchorRef.current = aoeAnchorWorld;

  useEffect(() => {
    const C = cesiumRef.current;
    const viewer = viewerRef.current;
    if (!ready || !C || !viewer) return;
    for (const ent of overlayEntitiesRef.current) viewer.entities.remove(ent);
    overlayEntitiesRef.current = new Set();
    const [r, g, b] = AOE_RGB.gnss_civil;
    const base = new C.Color(r / 255, g / 255, b / 255, 1);
    const faded = (alpha: number) => new C.CallbackProperty(() => base.withAlpha(alpha * fadeRef.current), false);
    const ring = (coords: readonly (readonly number[])[]) => C.Cartesian3.fromDegreesArray(coords.flatMap((c) => [c[0]!, c[1]!]));
    const closed = (coords: readonly (readonly number[])[]) => {
      const f = coords[0];
      const l = coords[coords.length - 1];
      return f && l && (f[0] !== l[0] || f[1] !== l[1]) ? [...coords, f] : coords;
    };
    const add = (e: CesiumNs.Entity.ConstructorOptions) => overlayEntitiesRef.current.add(viewer.entities.add(e));
    const drawn: string[] = [];
    if (c90 && !stale) {
      c90.polygon.coordinates.forEach((poly, i) => {
        const [outer, ...holes] = poly;
        if (!outer) return;
        add({
          id: `aoe-fill90-gnss_civil-${i}`,
          polygon: {
            hierarchy: new C.PolygonHierarchy(ring(outer), holes.map((h) => new C.PolygonHierarchy(ring(h)))),
            material: new C.ColorMaterialProperty(faded(AOE_FILL_ALPHA)),
            classificationType: C.ClassificationType.TERRAIN,
          },
        });
      });
      drawn.push('fill90-gnss_civil');
    }
    if (c90) {
      c90.polygon.coordinates.flat().forEach((rg, i) => {
        add({
          id: `aoe-edge90-gnss_civil-${i}`,
          polyline: { positions: ring(closed(rg)), width: stale ? AOE_STALE_EDGE_PX : AOE_EDGE90_PX, clampToGround: true, material: new C.ColorMaterialProperty(faded(1)) },
        });
      });
      drawn.push('edge90-gnss_civil');
    }
    if (c50) {
      c50.polygon.coordinates.flat().forEach((rg, i) => {
        add({
          id: `aoe-edge50-gnss_civil-${i}`,
          polyline: {
            positions: ring(closed(rg)),
            width: AOE_EDGE50_PX,
            clampToGround: true,
            // 12 px period, half on / half off (~ the 7 / 5 px MapLibre dash).
            material: new C.PolylineDashMaterialProperty({ color: faded(0.95), dashLength: 12 }),
          },
        });
      });
      drawn.push('edge50-gnss_civil');
    }
    setAoeDrawn((p) => (p.join() === drawn.join() ? p : drawn));
    declDirtyRef.current = true;
    declutterRef.current?.call();
  }, [ready, c90, c50, stale]);


  // Basemap imagery layer (per mode; swapped in place when the mode changes).
  const [imageryOn, setImageryOn] = useState(false);
  useEffect(() => {
    const C = cesiumRef.current;
    const viewer = viewerRef.current;
    if (!ready || !C || !viewer) return;
    let cancelled = false;
    let layer: CesiumNs.ImageryLayer | null = null;
    basemapProvider(C, mode)
      .then((provider) => {
        if (cancelled || !provider || viewer.isDestroyed()) return;
        layer = viewer.imageryLayers.addImageryProvider(provider, 0);
        if (mode !== 'none') Object.assign(layer, CESIUM_IMAGERY_TUNING[mode]);
        setImageryOn(true);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      setImageryOn(false);
      if (layer && !viewer.isDestroyed()) viewer.imageryLayers.remove(layer, true);
    };
  }, [ready, mode]);

  const { singles, stacks } = useMemo(() => placeSymbols(symbols, decl.result, decl.positions), [symbols, decl]);

  return (
    <div
      data-basemap={imageryOn ? mode : 'none'}
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        background: 'var(--surface-base)',
      }}
    >
      <div ref={containerRef} style={{ position: 'absolute', inset: 0 }} />
      {/* Cesium's own credit container is hidden (ion branding); this carries the basemap credit. */}
      {imageryOn && <BasemapAttribution mode={mode} />}
      {ready && (
        <SpineOverlay
          singles={singles}
          stacks={stacks}
          drawSingles={false}
          sizePx={sizePx}
          viewport={decl.viewport}
          selectedId={selectedId}
          onSelect={selectSource}
          onActiveChange={setActiveId}
          onFit={fitToTracks}
          manual={manual}
          reducedMotion={reducedMotion}
          nowIso={nowIso}
          aoe={
            est.entry && est.state ? (
              <AoeScreen
                state={est.state}
                label={mapLabel(est.entry, est.state, est.nowMs)}
                anchor={decl.positions[AOE_LABEL_KEY] ?? null}
                viewport={decl.viewport}
                layers={est.state === 'unbounded' ? [] : aoeDrawn}
                opacity={aoeOpacity}
                reducedMotion={reducedMotion}
              />
            ) : null
          }
        />
      )}
    </div>
  );
}

/** Same grouping and every position within 0.5 px — skip the re-render. */
function sameLayout(
  prev: { result: DeclutterResult; positions: ScreenPos; viewport: { width: number; height: number } },
  result: DeclutterResult,
  positions: ScreenPos,
  viewport: { width: number; height: number },
): boolean {
  if (prev.viewport.width !== viewport.width || prev.viewport.height !== viewport.height) return false;
  if (prev.result.singles.join() !== result.singles.join()) return false;
  if (prev.result.groups.map((g) => g.ids.join()).join(';') !== result.groups.map((g) => g.ids.join()).join(';')) return false;
  const a = Object.keys(prev.positions);
  const b = Object.keys(positions);
  if (a.length !== b.length) return false;
  return b.every((id) => {
    const p = prev.positions[id];
    const q = positions[id]!;
    return !!p && Math.abs(p.x - q.x) < 0.5 && Math.abs(p.y - q.y) < 0.5;
  });
}

function hiddenCredit(): HTMLElement {
  if (typeof document === 'undefined') return undefined as unknown as HTMLElement;
  const div = document.createElement('div');
  div.style.display = 'none';
  return div;
}
