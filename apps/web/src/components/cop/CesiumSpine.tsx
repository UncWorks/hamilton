'use client';

// CesiumJS primary spine. Cesium is loaded as a static <script> tag from
// /cesium/Cesium.js (see app/layout.tsx) — we never import the npm module,
// which keeps webpack out of Cesium's pre-bundled chunks. All worker / asset
// fetches stay on-origin via window.CESIUM_BASE_URL = '/cesium/' (NFR-01).

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type * as CesiumNs from 'cesium';
import { waitForCesium } from '@/lib/cesium-env';
import {
  haloFrameAt,
  shouldHaloPulse,
  trustRgb,
} from '@/lib/trust-gradient';
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion';
import { affiliationRgb } from './track-symbol';
import { useHamilton, type TrackState } from '@/store/hamilton';
import {
  boundingCircle,
  cesiumFitRange,
  FIT_PITCH_DEG,
  isFitShortcut,
  needsRefit,
  type LatLon,
} from '@/lib/camera-fit';
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

// Fallback view before anything is framed (Avdiivka AO). As soon as there are
// fit points the camera frames them instead (lib/camera-fit.ts). This used to
// be the ONLY view: a fixed camera 0.06° (~6.7 km) south of the AO at 4.5 km
// altitude, which put A/B/C ~27 px apart at the top of the frame (audit A26).
const AVDIIVKA = { lat: 48.14, lon: 37.745 };
/** Animated re-fit (s); 0 under prefers-reduced-motion and for the first fit. */
const REFIT_DURATION_S = 0.6;
/** Pointer travel (px) before a drag counts as navigation. */
const DRAG_THRESHOLD_PX = 4;

// Icon point: pixelSize 26 + outlineWidth 2 on both sides → 15px outer radius
// (PointPrimitiveCollectionVS: totalSize = pixelSize + 2 * outlineWidth).
const ICON_PIXEL_SIZE = 26;
const ICON_OUTLINE_PX = 2;
const ICON_RADIUS_PX = ICON_PIXEL_SIZE / 2 + ICON_OUTLINE_PX;
const HALO_RING_PX = 2;
/** Declutter box: the icon's outer diameter (halo excluded). */
const ICON_BOX_PX = 2 * ICON_RADIUS_PX;

type FitPoint = LatLon & { id: string };
type ScreenPos = Record<string, { x: number; y: number }>;

interface CesiumSpineProps {
  jammerLocation?: { lat: number; lon: number; method_id: string };
  directionalFrom?: { lat: number; lon: number };
  directionalTo?: { lat: number; lon: number };
  /** Candidate NAI centre — framed by the camera fit when present. */
  candidateNai?: { lat: number; lon: number };
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
  const trackEntitiesRef = useRef<Map<string, CesiumNs.Entity>>(new Map());
  const overlayEntitiesRef = useRef<Set<CesiumNs.Entity>>(new Set());
  const [ready, setReady] = useState(false);
  // Latest score per halo'd track, read by the halo CallbackProperties each
  // frame so the halo entity is created once instead of re-added per tick.
  const haloScoresRef = useRef<Map<string, number>>(new Map());
  const reducedMotion = usePrefersReducedMotion();
  const reducedMotionRef = useRef(reducedMotion);
  reducedMotionRef.current = reducedMotion;

  const tracks = useHamilton((s) => s.tracks);
  const selectSource = useHamilton((s) => s.selectSource);
  const trackList = useMemo(() => Object.values(tracks), [tracks]);
  const trackListRef = useRef(trackList);
  trackListRef.current = trackList;

  // --- Camera fit ------------------------------------------------------------
  const { jammerLocation, candidateNai, initialRangeM } = props;
  const fitPoints = useMemo<FitPoint[]>(() => {
    const pts: FitPoint[] = trackList.map((t) => ({ id: t.source_id, lat: t.lat, lon: t.lon }));
    if (jammerLocation) pts.push({ id: '__jammer', lat: jammerLocation.lat, lon: jammerLocation.lon });
    if (candidateNai) pts.push({ id: '__nai', lat: candidateNai.lat, lon: candidateNai.lon });
    return pts;
  }, [trackList, jammerLocation, candidateNai]);
  const fitPointsRef = useRef(fitPoints);
  fitPointsRef.current = fitPoints;
  /** Ids framed by the last fit; null until the first one. */
  const fittedIdsRef = useRef<Set<string> | null>(null);
  /** Operator panned / zoomed — auto-fit suspended until "Fit to tracks". */
  const userMovedRef = useRef(initialRangeM !== undefined);
  const [manual, setManual] = useState(initialRangeM !== undefined);
  const initialRangeRef = useRef(initialRangeM);

  // --- Declutter -------------------------------------------------------------
  const [decl, setDecl] = useState<{ result: DeclutterResult; positions: ScreenPos }>({
    result: { singles: [], groups: [] },
    positions: {},
  });
  const declutterRef = useRef<{ call: () => void; cancel: () => void } | null>(null);
  /** Track set changed since the last pass (camera moves are detected directly). */
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
        // view matrix or canvas size changed (or the track set, via dirty).
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

  // Declutter pass: project tracks, group by screen-space proximity, hide
  // grouped tracks at their true position (the overlay draws them as one
  // bracketed stack with an offset locator line) and restore the rest.
  runDeclutterRef.current = () => {
    const C = cesiumRef.current;
    const viewer = viewerRef.current;
    if (!C || !viewer) return;
    const cv = viewer.scene.canvas;
    const positions: ScreenPos = {};
    const items: DeclutterItem[] = [];
    for (const t of trackListRef.current) {
      const wc = C.SceneTransforms.worldToWindowCoordinates(viewer.scene, C.Cartesian3.fromDegrees(t.lon, t.lat, 0));
      if (!wc) continue;
      positions[t.source_id] = { x: wc.x, y: wc.y };
      items.push({
        id: t.source_id,
        x: wc.x,
        y: wc.y,
        width: ICON_BOX_PX,
        height: ICON_BOX_PX,
        rank: affiliationRank(t.affiliation),
      });
    }
    const result = declutter(items, { viewport: { width: cv.clientWidth, height: cv.clientHeight } });
    const grouped = new Set(result.groups.flatMap((g) => g.ids));
    for (const [id, ent] of trackEntitiesRef.current) {
      const show = !grouped.has(id);
      if (ent.show !== show) ent.show = show;
      const halo = viewer.entities.getById(`${id}-halo`);
      if (halo && halo.show !== show) halo.show = show;
    }
    setDecl((prev) => (sameDeclutter(prev.result, result) ? prev : { result, positions }));
  };

  // Reconcile track entities from the store on every render.
  useEffect(() => {
    const C = cesiumRef.current;
    const viewer = viewerRef.current;
    if (!ready || !C || !viewer) return;

    const seen = new Set<string>();
    for (const t of trackList) {
      seen.add(t.source_id);
      let ent = trackEntitiesRef.current.get(t.source_id);
      const aff = affiliationRgb(t.affiliation);
      const fillColor = new C.Color(
        aff[0] / 255,
        aff[1] / 255,
        aff[2] / 255,
        Math.max(0.25, t.score),
      );
      const outline = trustRgb(t.score);
      const outlineColor = new C.Color(
        outline[0] / 255,
        outline[1] / 255,
        outline[2] / 255,
        0.95,
      );
      const label = `${t.source_id.toUpperCase()}  ${t.score.toFixed(2)}`;

      if (!ent) {
        ent = viewer.entities.add({
          name: t.source_id,
          position: C.Cartesian3.fromDegrees(t.lon, t.lat, 0),
          point: {
            pixelSize: ICON_PIXEL_SIZE,
            color: fillColor,
            outlineColor,
            outlineWidth: ICON_OUTLINE_PX,
            heightReference: C.HeightReference.CLAMP_TO_GROUND,
          },
          label: {
            text: label,
            font: '500 12px JetBrainsMono, ui-monospace, monospace',
            fillColor: C.Color.fromCssColorString('#f5f0e6'),
            outlineColor: C.Color.fromCssColorString('#0a0d12'),
            outlineWidth: 2,
            style: C.LabelStyle.FILL_AND_OUTLINE,
            horizontalOrigin: C.HorizontalOrigin.LEFT,
            verticalOrigin: C.VerticalOrigin.BOTTOM,
            pixelOffset: new C.Cartesian2(18, -10),
            heightReference: C.HeightReference.CLAMP_TO_GROUND,
          },
        });
        trackEntitiesRef.current.set(t.source_id, ent);
      } else {
        ent.position = C.Cartesian3.fromDegrees(t.lon, t.lat, 0) as never;
        if (ent.point) {
          ent.point.color = fillColor as never;
          ent.point.outlineColor = outlineColor as never;
        }
        if (ent.label) {
          ent.label.text = label as never;
        }
      }

      // Halo — Branding §5.2, Option 1 (Explorations/Halo Options). A
      // screen-space `point` at the icon's exact position + heightReference,
      // so it is concentric with the icon point by construction. (Previously a
      // ground ellipse sized in metres: at the -55° camera pitch it projected
      // as a foreshortened oval around a round screen-space icon, never
      // pulsed, and was removed + re-added on every tick.)
      const haloId = `${t.source_id}-halo`;
      if (shouldHaloPulse(t.score)) {
        haloScoresRef.current.set(t.source_id, t.score);
        const existingHalo = viewer.entities.getById(haloId);
        if (existingHalo) {
          existingHalo.position = C.Cartesian3.fromDegrees(t.lon, t.lat, 0) as never;
        } else {
          const sid = t.source_id;
          const frame = () =>
            haloFrameAt(
              haloScoresRef.current.get(sid) ?? 0,
              ICON_RADIUS_PX,
              performance.now(),
              reducedMotionRef.current,
            );
          const rgb = () => trustRgb(haloScoresRef.current.get(sid) ?? 0);
          viewer.entities.add({
            id: haloId,
            // Born hidden if its track is currently in a declutter stack.
            show: trackEntitiesRef.current.get(sid)?.show ?? true,
            position: C.Cartesian3.fromDegrees(t.lon, t.lat, 0),
            point: {
              // Outer diameter = pixelSize + 2 * outlineWidth.
              pixelSize: new C.CallbackProperty(
                () => Math.max(0, 2 * (frame().radiusPx - HALO_RING_PX)),
                false,
              ) as never,
              color: new C.CallbackProperty(() => {
                const [r, g, b] = rgb();
                const f = frame();
                const a = reducedMotionRef.current ? 0.12 : 0.28 * f.intensity;
                return new C.Color(r / 255, g / 255, b / 255, a);
              }, false) as never,
              outlineColor: new C.CallbackProperty(() => {
                const [r, g, b] = rgb();
                return new C.Color(r / 255, g / 255, b / 255, 0.9 * frame().intensity);
              }, false) as never,
              outlineWidth: HALO_RING_PX,
              heightReference: C.HeightReference.CLAMP_TO_GROUND,
            },
          });
        }
      } else {
        haloScoresRef.current.delete(t.source_id);
        const existingHalo = viewer.entities.getById(haloId);
        if (existingHalo) viewer.entities.remove(existingHalo);
      }
    }

    for (const [id, ent] of trackEntitiesRef.current) {
      if (!seen.has(id)) {
        viewer.entities.remove(ent);
        trackEntitiesRef.current.delete(id);
        const halo = viewer.entities.getById(`${id}-halo`);
        if (halo) viewer.entities.remove(halo);
        haloScoresRef.current.delete(id);
      }
    }
    declDirtyRef.current = true;
    declutterRef.current?.call();
  }, [ready, trackList]);

  // Reconcile jammer + directional vector overlays.
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
          semiMajorAxis: 120,
          semiMinorAxis: 120,
          material: new C.Color(0.86, 0.7, 0.35, 0.18),
          outline: true,
          outlineColor: new C.Color(0.86, 0.7, 0.35, 0.6),
        },
        label: {
          text: jl.method_id,
          font: '500 11px JetBrainsMono, ui-monospace, monospace',
          fillColor: C.Color.fromCssColorString('#dbb25a'),
          outlineColor: C.Color.fromCssColorString('#0a0d12'),
          outlineWidth: 2,
          style: C.LabelStyle.FILL_AND_OUTLINE,
          horizontalOrigin: C.HorizontalOrigin.CENTER,
          verticalOrigin: C.VerticalOrigin.BOTTOM,
          pixelOffset: new C.Cartesian2(0, -22),
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
  }, [ready, props.jammerLocation, props.directionalFrom, props.directionalTo]);

  const members = useMemo(() => stackMembers(trackList), [trackList]);

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

function stackMembers(list: readonly TrackState[]): Record<string, StackMember> {
  const out: Record<string, StackMember> = {};
  for (const t of list) {
    out[t.source_id] = {
      id: t.source_id,
      score: t.score,
      affiliation: t.affiliation,
      fill: affiliationRgb(t.affiliation),
      outline: trustRgb(t.score),
    };
  }
  return out;
}

function hiddenCredit(): HTMLElement {
  if (typeof document === 'undefined') return undefined as unknown as HTMLElement;
  const div = document.createElement('div');
  div.style.display = 'none';
  return div;
}
