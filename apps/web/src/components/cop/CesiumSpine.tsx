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

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type * as CesiumNs from 'cesium';
import { waitForCesium } from '@/lib/cesium-env';
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

// Fallback view before anything is framed (Avdiivka AO). As soon as there are
// fit points the camera frames them instead (lib/camera-fit.ts). This used to
// be the ONLY view: a fixed camera 0.06° (~6.7 km) south of the AO at 4.5 km
// altitude, which put A/B/C ~27 px apart at the top of the frame (audit A26).
const AVDIIVKA = { lat: 48.14, lon: 37.745 };
/** Animated re-fit (s); 0 under prefers-reduced-motion and for the first fit. */
const REFIT_DURATION_S = 0.6;
/** Pointer travel (px) before a drag counts as navigation. */
const DRAG_THRESHOLD_PX = 4;
/** Jammer area of uncertainty (m) — an area graphic, unchanged by the symbol work. */
const JAMMER_RING_M = 120;

type FitPoint = LatLon & { id: string };
type ScreenPos = Record<string, { x: number; y: number }>;

interface CesiumSpineProps {
  jammerLocation?: { lat: number; lon: number; method_id: string };
  directionalFrom?: { lat: number; lon: number };
  directionalTo?: { lat: number; lon: number };
  /** Candidate NAI centre — framed by the camera fit when present. */
  candidateNai?: { lat: number; lon: number };
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
}

export function CesiumSpine(props: CesiumSpineProps) {
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
    jammerLocation: props.jammerLocation,
    candidateSites: props.candidateSites,
    evaluations: props.evaluations,
  });
  const symbolsRef = useRef(symbols);
  symbolsRef.current = symbols;
  const [activeId, setActiveId] = useState<string | null>(null);

  // --- Camera fit ------------------------------------------------------------
  const { jammerLocation, candidateNai, initialRangeM } = props;
  const fitPoints = useMemo<FitPoint[]>(() => {
    const pts: FitPoint[] = symbols.filter((s) => s.kind === 'track').map((s) => ({ id: s.id, lat: s.lat, lon: s.lon }));
    if (jammerLocation) pts.push({ id: '__jammer', lat: jammerLocation.lat, lon: jammerLocation.lon });
    if (candidateNai) pts.push({ id: '__nai', lat: candidateNai.lat, lon: candidateNai.lon });
    return pts;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbols, jammerLocation?.lat, jammerLocation?.lon, candidateNai?.lat, candidateNai?.lon]);
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

  /** Frame every fit point (tracks + jammer + NAI) at the −55° pitch. */
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

  // Jammer area ring + bearing line (area / line graphics, not symbols).
  useEffect(() => {
    const C = cesiumRef.current;
    const viewer = viewerRef.current;
    if (!ready || !C || !viewer) return;

    for (const ent of overlayEntitiesRef.current) {
      viewer.entities.remove(ent);
    }
    overlayEntitiesRef.current = new Set();

    if (props.jammerLocation) {
      const jl = props.jammerLocation;
      const ent = viewer.entities.add({
        id: 'jammer-overlay',
        position: C.Cartesian3.fromDegrees(jl.lon, jl.lat, 0),
        ellipse: {
          semiMajorAxis: JAMMER_RING_M,
          semiMinorAxis: JAMMER_RING_M,
          // Explicit height: outlines are unsupported on terrain-clamped ellipses.
          height: 0,
          material: new C.Color(0.86, 0.7, 0.35, 0.18),
          outline: true,
          outlineColor: new C.Color(0.86, 0.7, 0.35, 0.6),
        },
      });
      overlayEntitiesRef.current.add(ent);
    }

    if (props.directionalFrom && props.directionalTo) {
      const ent = viewer.entities.add({
        id: 'directional-overlay',
        polyline: {
          positions: C.Cartesian3.fromDegreesArray([
            props.directionalFrom.lon,
            props.directionalFrom.lat,
            props.directionalTo.lon,
            props.directionalTo.lat,
          ]),
          width: 2,
          material: new C.Color(0.86, 0.7, 0.35, 0.55),
          clampToGround: true,
        },
      });
      overlayEntitiesRef.current.add(ent);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    ready,
    props.jammerLocation?.lat,
    props.jammerLocation?.lon,
    props.directionalFrom?.lat,
    props.directionalFrom?.lon,
    props.directionalTo?.lat,
    props.directionalTo?.lon,
  ]);

  const { singles, stacks } = useMemo(() => placeSymbols(symbols, decl.result, decl.positions), [symbols, decl]);

  return (
    <div
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        background: 'var(--surface-base)',
      }}
    >
      <div ref={containerRef} style={{ position: 'absolute', inset: 0 }} />
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
