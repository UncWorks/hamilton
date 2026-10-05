// Area-of-effect geometry for the jammer AoE estimate (integrity/emitter/estimate,
// docs/plans/jammer-aoe.md §3.2, row W4). Pure: point-in-MultiPolygon with
// holes, the contour level at a point (HS-22 "Inside: … — 90%"), and the label
// anchor the map label sits on (HS-21).
//
// The types below are the GEOMETRY subset of EmitterEstimatePayload that this
// module reads. They are structural, so the frozen contract type (and the
// fixtures in packages/contracts/fixtures/aoe/) satisfy them as-is.
//
// Dependency-free (no imports) so it runs under `node --test` with native type
// stripping — see aoe.test.ts.

/** GeoJSON position, [lon, lat]. */
export type LonLat = readonly [number, number] | readonly number[];

/** GeoJSON MultiPolygon: polygons → rings (outer first, then holes) → [lon, lat]. */
export interface MultiPolygonLike {
  type: 'MultiPolygon';
  coordinates: readonly (readonly (readonly LonLat[])[])[];
}

export type ContourLevel = 0.5 | 0.9;

export interface AoeContourLike {
  p: number;
  polygon: MultiPolygonLike;
  area_km2: number;
}

export interface AoeLayerLike {
  rx_class: string;
  contours: readonly AoeContourLike[];
}

export interface AoeEstimateLike {
  aoe: readonly AoeLayerLike[];
}

export interface LatLonPoint {
  lat: number;
  lon: number;
}

/** Even-odd ray cast against one ring. A ring may be closed (last = first) or not. */
export function inRing(pt: LatLonPoint, ring: readonly LonLat[]): boolean {
  let inside = false;
  const n = ring.length;
  if (n < 3) return false;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = ring[i]![0]!;
    const yi = ring[i]![1]!;
    const xj = ring[j]![0]!;
    const yj = ring[j]![1]!;
    if (yi > pt.lat !== yj > pt.lat && pt.lon < ((xj - xi) * (pt.lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Inside one GeoJSON polygon: inside the outer ring and in no hole. */
export function inPolygon(pt: LatLonPoint, rings: readonly (readonly LonLat[])[]): boolean {
  const outer = rings[0];
  if (!outer || !inRing(pt, outer)) return false;
  for (let k = 1; k < rings.length; k++) if (inRing(pt, rings[k]!)) return false;
  return true;
}

/** Inside any polygon of the MultiPolygon (holes honoured). An empty MultiPolygon contains nothing. */
export function inMultiPolygon(pt: LatLonPoint, mp: MultiPolygonLike): boolean {
  return mp.coordinates.some((poly) => inPolygon(pt, poly));
}

/** The layer for a receiver class, if the estimate publishes one. */
export function layerOf(estimate: AoeEstimateLike | null | undefined, rxClass: string): AoeLayerLike | undefined {
  return estimate?.aoe.find((l) => l.rx_class === rxClass);
}

/** The p contour of a layer, only if it has geometry. */
export function contourOf(layer: AoeLayerLike | undefined, p: ContourLevel): AoeContourLike | undefined {
  const c = layer?.contours.find((x) => x.p === p);
  return c && c.polygon.coordinates.length > 0 ? c : undefined;
}

/**
 * Highest contour level containing the point for a receiver class: 0.9 takes
 * precedence over 0.5 (the 90% area is nested in the 50% one, but the answer
 * must not depend on that); outside both, or no layer → null.
 */
export function contourLevelAt(estimate: AoeEstimateLike | null | undefined, rxClass: string, pt: LatLonPoint): ContourLevel | null {
  const layer = layerOf(estimate, rxClass);
  if (!layer) return null;
  for (const p of [0.9, 0.5] as const) {
    const c = contourOf(layer, p);
    if (c && inMultiPolygon(pt, c.polygon)) return p;
  }
  return null;
}

/** Shoelace area of a ring in degrees² (sign = winding); only used to rank rings. */
function ringArea(ring: readonly LonLat[]): number {
  let a = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) a += (ring[j]![0]! + ring[i]![0]!) * (ring[j]![1]! - ring[i]![1]!);
  return Math.abs(a / 2);
}

/** Outer ring of the largest polygon (by area), or null. */
export function largestOuterRing(mp: MultiPolygonLike): readonly LonLat[] | null {
  let best: readonly LonLat[] | null = null;
  let bestArea = -1;
  for (const poly of mp.coordinates) {
    const outer = poly[0];
    if (!outer || outer.length < 3) continue;
    const a = ringArea(outer);
    if (a > bestArea) {
      bestArea = a;
      best = outer;
    }
  }
  return best;
}

/**
 * Label point on screen: the highest on-screen vertex of the contour that
 * leaves `headroomPx` above it for the label plate (so the label sits just
 * outside the area's north edge, inside the view). Null when no vertex is on
 * screen — the caller falls back to labelAnchor.
 */
export function screenLabelAnchor(
  pts: readonly { x: number; y: number }[],
  viewport: { width: number; height: number },
  headroomPx = 60,
): { x: number; y: number } | null {
  let best: { x: number; y: number } | null = null;
  for (const p of pts) {
    if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) continue;
    if (p.x < 0 || p.x > viewport.width || p.y < headroomPx || p.y > viewport.height - 40) continue;
    if (!best || p.y < best.y) best = p;
  }
  return best;
}

/**
 * Where the map label sits for a contour: the northernmost vertex of the
 * largest polygon's outer ring (the label plate is drawn just above it, so it
 * never covers the fill or a unit inside it). Null for an empty MultiPolygon.
 */
export function labelAnchor(mp: MultiPolygonLike): LatLonPoint | null {
  let best: readonly LonLat[] | null = null;
  let bestArea = -1;
  for (const poly of mp.coordinates) {
    const outer = poly[0];
    if (!outer || outer.length < 3) continue;
    const a = ringArea(outer);
    if (a > bestArea) {
      bestArea = a;
      best = outer;
    }
  }
  if (!best) return null;
  let top = best[0]!;
  for (const c of best) if (c[1]! > top[1]!) top = c;
  return { lon: top[0]!, lat: top[1]! };
}

// ---------------------------------------------------------------------------
// Dashes (MapSpine 50% outline)
// ---------------------------------------------------------------------------
// deck.gl 9.0's `deck.gl` meta package does not re-export PathStyleExtension
// (it lives only in @deck.gl/extensions, which is not a dependency of
// apps/web — NFR-07). The 50% outline is therefore dashed geometrically: each
// ring is cut into on / off pieces whose ground length is the pixel dash
// pattern at the current zoom, recomputed when the zoom changes.

/** Web-Mercator ground metres per CSS pixel (512 px tiles, deck.gl / MapLibre zoom). */
export function metersPerPixel(lat: number, zoom: number): number {
  return (40_075_016.686 * Math.cos((lat * Math.PI) / 180)) / (512 * 2 ** zoom);
}

/**
 * Cut a ring (closed or not; it is treated as closed) into dashes: `onM`
 * metres drawn, `offM` metres skipped, along the ring. Local equirectangular
 * metres — exact enough for ≤ 100 km rings at dash scale.
 */
export function dashRing(ring: readonly LonLat[], onM: number, offM: number): [number, number][][] {
  const n = ring.length;
  if (n < 2 || !(onM > 0) || !(offM >= 0)) return [];
  const pts = ring.map((c) => [c[0]!, c[1]!] as [number, number]);
  const first = pts[0]!;
  const last = pts[n - 1]!;
  if (first[0] !== last[0] || first[1] !== last[1]) pts.push([first[0], first[1]]);
  const kx = 111_320 * Math.cos((first[1] * Math.PI) / 180);
  const ky = 110_574;
  const out: [number, number][][] = [];
  let drawing = true;
  let left = onM;
  let cur: [number, number][] = [pts[0]!];
  for (let i = 1; i < pts.length; i++) {
    let a = pts[i - 1]!;
    const b = pts[i]!;
    let seg = Math.hypot((b[0] - a[0]) * kx, (b[1] - a[1]) * ky);
    while (seg > left) {
      const t = left / seg;
      const m: [number, number] = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
      if (drawing) {
        cur.push(m);
        out.push(cur);
      } else {
        cur = [m];
      }
      seg -= left;
      a = m;
      drawing = !drawing;
      left = drawing ? onM : offM;
      if (left === 0) {
        drawing = !drawing;
        left = drawing ? onM : offM;
      }
    }
    left -= seg;
    if (drawing) cur.push(b);
  }
  if (drawing && cur.length > 1) out.push(cur);
  return out;
}

// ---------------------------------------------------------------------------
// Label placement (keep the map label off unit symbols)
// ---------------------------------------------------------------------------

export interface ScreenRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

function overlaps(a: ScreenRect, b: ScreenRect): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

/**
 * Nudge the label plate `rect` vertically off the symbol boxes in `avoid`
 * (centre points, `boxPx` square plus `padPx`). It first moves the plate just
 * above the symbol it covers, then (if that leaves the view's `minY`) just
 * below it. When every candidate collides, the original position is kept —
 * the label still reads; a symbol is never hidden by declutter for it.
 */
export function nudgeLabelRect(
  rect: ScreenRect,
  avoid: readonly { x: number; y: number }[],
  boxPx: number,
  viewport: { width: number; height: number },
  minY = 48,
  padPx = 6,
): ScreenRect {
  const half = boxPx / 2 + padPx;
  const boxes = avoid
    .filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y))
    .map((p) => ({ x: p.x - half, y: p.y - half, w: 2 * half, h: 2 * half }));
  const maxY = viewport.height - rect.h - 8;
  const free = (r: ScreenRect) => r.y >= minY && r.y <= maxY && !boxes.some((b) => overlaps(r, b));
  if (!boxes.some((b) => overlaps(rect, b))) return rect;
  const tries: ScreenRect[] = [];
  for (const b of boxes) {
    if (!overlaps(rect, b)) continue;
    tries.push({ ...rect, y: b.y - rect.h - 2 }, { ...rect, y: b.y + b.h + 2 });
  }
  // Prefer the smallest move.
  tries.sort((a, b) => Math.abs(a.y - rect.y) - Math.abs(b.y - rect.y));
  return tries.find(free) ?? rect;
}
