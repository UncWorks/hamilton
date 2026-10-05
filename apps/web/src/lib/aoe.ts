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
