'use client';

// CesiumJS primary spine. Cesium is loaded as a static <script> tag from
// /cesium/Cesium.js (see app/layout.tsx) — we never import the npm module,
// which keeps webpack out of Cesium's pre-bundled chunks. All worker / asset
// fetches stay on-origin via window.CESIUM_BASE_URL = '/cesium/' (NFR-01).

import { useEffect, useMemo, useRef, useState } from 'react';
import type * as CesiumNs from 'cesium';
import { waitForCesium } from '@/lib/cesium-env';
import {
  haloRadiusPx,
  shouldHaloPulse,
  trustRgb,
} from '@/lib/trust-gradient';
import { affiliationRgb } from './track-symbol';
import { useHamilton, type TrackState } from '@/store/hamilton';

const AVDIIVKA_LON = 37.745;
const AVDIIVKA_LAT = 48.14;
const CAMERA_ALT_M = 4500;

interface CesiumSpineProps {
  jammerLocation?: { lat: number; lon: number; method_id: string };
  directionalFrom?: { lat: number; lon: number };
  directionalTo?: { lat: number; lon: number };
}

export function CesiumSpine(props: CesiumSpineProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<CesiumNs.Viewer | null>(null);
  const cesiumRef = useRef<typeof CesiumNs | null>(null);
  const trackEntitiesRef = useRef<Map<string, CesiumNs.Entity>>(new Map());
  const overlayEntitiesRef = useRef<Set<CesiumNs.Entity>>(new Set());
  const [ready, setReady] = useState(false);

  const tracks = useHamilton((s) => s.tracks);
  const selectSource = useHamilton((s) => s.selectSource);
  const trackList = useMemo(() => Object.values(tracks), [tracks]);

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
        viewer.camera.flyTo({
          destination: C.Cartesian3.fromDegrees(
            AVDIIVKA_LON,
            AVDIIVKA_LAT - 0.06,
            CAMERA_ALT_M,
          ),
          orientation: {
            heading: C.Math.toRadians(0),
            pitch: C.Math.toRadians(-55),
            roll: 0,
          },
          duration: 0,
        });
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
        setReady(true);
      })
      .catch(() => {
        // Cesium script unreachable — Spine.tsx will surface a "spine offline"
        // state via the loader. Demo can fall back to MapLibre via env var.
      });
    return () => {
      cancelled = true;
      viewer?.destroy();
      viewerRef.current = null;
    };
  }, [selectSource]);

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
            pixelSize: 26,
            color: fillColor,
            outlineColor,
            outlineWidth: 2,
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

      // Halo as separate ellipse entity, refreshed each tick when score < 0.6.
      const haloId = `${t.source_id}-halo`;
      const existingHalo = viewer.entities.getById(haloId);
      if (existingHalo) viewer.entities.remove(existingHalo);
      if (shouldHaloPulse(t.score)) {
        const haloRgba = trustRgb(t.score);
        viewer.entities.add({
          id: haloId,
          position: C.Cartesian3.fromDegrees(t.lon, t.lat, 0),
          ellipse: {
            semiMajorAxis: haloRadiusPx(t.score) * 30,
            semiMinorAxis: haloRadiusPx(t.score) * 30,
            material: new C.Color(
              haloRgba[0] / 255,
              haloRgba[1] / 255,
              haloRgba[2] / 255,
              0.18,
            ),
            outline: false,
            height: 0,
          },
        });
      }
    }

    for (const [id, ent] of trackEntitiesRef.current) {
      if (!seen.has(id)) {
        viewer.entities.remove(ent);
        trackEntitiesRef.current.delete(id);
        const halo = viewer.entities.getById(`${id}-halo`);
        if (halo) viewer.entities.remove(halo);
      }
    }
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

  return (
    <div
      ref={containerRef}
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        background: 'var(--surface-base)',
      }}
    />
  );
}

function hiddenCredit(): HTMLElement {
  if (typeof document === 'undefined') return undefined as unknown as HTMLElement;
  const div = document.createElement('div');
  div.style.display = 'none';
  return div;
}
