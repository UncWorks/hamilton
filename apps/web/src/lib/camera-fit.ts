// Camera-fit math for the COP spines (audit A26). Pure functions only — no
// Cesium / deck.gl imports — so both renderers share one policy and it can be
// unit-tested under `node --test`.
//
// Cesium: frame a bounding circle with a HeadingPitchRange at the spine's
// fixed −55° pitch (cesiumFitRange).
// deck.gl: Web-Mercator bounds fit with pixel padding (fitMercator).
// Both: re-fit only on a material change (needsRefit).

export interface LatLon {
  lat: number;
  lon: number;
}

export interface GeoBounds {
  west: number;
  south: number;
  east: number;
  north: number;
}

/** WGS84 semi-major axis (m) — matches Cesium's ellipsoid and web-mercator. */
export const EARTH_RADIUS_M = 6378137;

/** Spine camera pitch (deg) — the COP's oblique look-down, kept on every fit. */
export const FIT_PITCH_DEG = -55;
/** Closest a fit will come (m): a lone unit frames ~1.7 km of ground, not a street. */
export const FIT_MIN_RANGE_M = 1500;
/** Furthest a fit will go (m). */
export const FIT_MAX_RANGE_M = 400_000;
/** Extra margin around the bounding circle (fraction of its radius). */
export const FIT_PADDING_FRAC = 0.25;
/** deck.gl: pixel padding around the fitted bounds. */
export const FIT_PADDING_PX = 64;
/** deck.gl: minimum framed ground extent (m) — mirrors FIT_MIN_RANGE_M. */
export const FIT_MIN_EXTENT_M = 1500;
/** deck.gl: never zoom in past this. */
export const FIT_MAX_ZOOM = 17;
/** A fit point closer than this (px) to the frame edge counts as out of view. */
export const REFIT_EDGE_MARGIN_PX = 24;

const toRad = (d: number) => (d * Math.PI) / 180;
const toDeg = (r: number) => (r * 180) / Math.PI;

function finite(p: LatLon): boolean {
  return Number.isFinite(p.lat) && Number.isFinite(p.lon);
}

/** Bounding box of the points, or null when there are none. */
export function boundsOf(points: readonly LatLon[]): GeoBounds | null {
  let west = Infinity;
  let south = Infinity;
  let east = -Infinity;
  let north = -Infinity;
  for (const p of points) {
    if (!finite(p)) continue;
    west = Math.min(west, p.lon);
    east = Math.max(east, p.lon);
    south = Math.min(south, p.lat);
    north = Math.max(north, p.lat);
  }
  return Number.isFinite(west) ? { west, south, east, north } : null;
}

/** Great-circle distance (m). */
export function haversineM(a: LatLon, b: LatLon): number {
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Ground circle enclosing every point: centred on the bbox centre, radius the
 * farthest point. Not the minimal circle, but within √2 of it and stable
 * (the centre only moves when an extreme point moves).
 */
export function boundingCircle(points: readonly LatLon[]): { center: LatLon; radiusM: number } | null {
  const b = boundsOf(points);
  if (!b) return null;
  const center = { lat: (b.south + b.north) / 2, lon: (b.west + b.east) / 2 };
  let radiusM = 0;
  for (const p of points) if (finite(p)) radiusM = Math.max(radiusM, haversineM(center, p));
  return { center, radiusM };
}

/**
 * The narrower of the two frustum angles. Cesium's PerspectiveFrustum `fov`
 * is the horizontal angle when width > height, else the vertical one.
 */
export function narrowFovRad(fovRad: number, aspect: number): number {
  const a = aspect > 0 && Number.isFinite(aspect) ? aspect : 1;
  return 2 * Math.atan(Math.tan(fovRad / 2) * Math.min(a, 1 / a));
}

export interface CesiumFitOptions {
  radiusM: number;
  /** PerspectiveFrustum.fov (rad). Cesium default 60°. */
  fovRad?: number;
  /** canvas width / height. */
  aspect: number;
  paddingFrac?: number;
  minRangeM?: number;
  maxRangeM?: number;
}

/**
 * Camera-to-centre range (m) so a sphere of `radiusM` (padded) fits the
 * narrower frustum angle: r / sin(fov/2). Clamped to [minRangeM, maxRangeM].
 */
export function cesiumFitRange(o: CesiumFitOptions): number {
  const fov = narrowFovRad(o.fovRad ?? toRad(60), o.aspect);
  const r = Math.max(0, o.radiusM) * (1 + (o.paddingFrac ?? FIT_PADDING_FRAC));
  const range = r / Math.sin(fov / 2);
  const lo = o.minRangeM ?? FIT_MIN_RANGE_M;
  const hi = o.maxRangeM ?? FIT_MAX_RANGE_M;
  return Math.min(hi, Math.max(lo, range));
}

// --- Web Mercator (deck.gl MapView, 512-px tiles) ---------------------------

const TILE = 512;

/** lon/lat → world units at zoom 0 (0..512, y down). */
export function mercatorXY(p: LatLon): [number, number] {
  const x = ((p.lon + 180) / 360) * TILE;
  const lat = Math.max(-85.051129, Math.min(85.051129, p.lat));
  const y = (TILE / 2) * (1 - Math.log(Math.tan(Math.PI / 4 + toRad(lat) / 2)) / Math.PI);
  return [x, y];
}

export function mercatorUnproject([x, y]: [number, number]): LatLon {
  const lon = (x / TILE) * 360 - 180;
  const lat = toDeg(2 * Math.atan(Math.exp(Math.PI * (1 - (2 * y) / TILE))) - Math.PI / 2);
  return { lat, lon };
}

/** Ground metres per zoom-0 world unit at `lat`. */
export function metersPerWorldUnit(lat: number): number {
  return (2 * Math.PI * EARTH_RADIUS_M * Math.cos(toRad(lat))) / TILE;
}

export interface MercatorFitOptions {
  bounds: GeoBounds;
  width: number;
  height: number;
  paddingPx?: number;
  minExtentM?: number;
  maxZoom?: number;
  minZoom?: number;
}

/** Centre + zoom framing `bounds` in a width × height viewport (pitch 0). */
export function fitMercator(o: MercatorFitOptions): { longitude: number; latitude: number; zoom: number } {
  const [x0, y0] = mercatorXY({ lat: o.bounds.north, lon: o.bounds.west });
  const [x1, y1] = mercatorXY({ lat: o.bounds.south, lon: o.bounds.east });
  const cx = (x0 + x1) / 2;
  const cy = (y0 + y1) / 2;
  const centre = mercatorUnproject([cx, cy]);
  const minExtent = (o.minExtentM ?? FIT_MIN_EXTENT_M) / metersPerWorldUnit(centre.lat);
  const dx = Math.max(Math.abs(x1 - x0), minExtent);
  const dy = Math.max(Math.abs(y1 - y0), minExtent);
  const pad = o.paddingPx ?? FIT_PADDING_PX;
  const innerW = Math.max(1, o.width - 2 * pad);
  const innerH = Math.max(1, o.height - 2 * pad);
  const zoom = Math.log2(Math.min(innerW / dx, innerH / dy));
  const clamped = Math.min(o.maxZoom ?? FIT_MAX_ZOOM, Math.max(o.minZoom ?? 0, zoom));
  return { longitude: centre.lon, latitude: centre.lat, zoom: clamped };
}

// --- Re-fit policy ------------------------------------------------------------

export type RefitReason = 'initial' | 'new-point' | 'out-of-view';

export interface RefitInput {
  /** Point ids framed by the last fit (null = never fitted). */
  fittedIds: ReadonlySet<string> | null;
  /** Current fit point ids (tracks + overlays). */
  ids: readonly string[];
  /** Current screen positions; null/undefined = not on screen (behind globe). */
  screen: ReadonlyArray<{ x: number; y: number } | null | undefined>;
  width: number;
  height: number;
  /** User panned/zoomed since the last fit — auto-fit is suspended. */
  userMoved: boolean;
  marginPx?: number;
}

/**
 * Whether to auto re-fit. Never after user navigation; otherwise on the first
 * fit, when a point id appears that the last fit did not frame, or when a
 * point has drifted within `marginPx` of the frame edge. A track merely
 * ticking (same ids, still in view) or disappearing does not re-fit.
 */
export function needsRefit(i: RefitInput): RefitReason | null {
  if (i.userMoved) return null;
  if (i.ids.length === 0) return null;
  if (!i.fittedIds) return 'initial';
  if (i.ids.some((id) => !i.fittedIds!.has(id))) return 'new-point';
  const m = i.marginPx ?? REFIT_EDGE_MARGIN_PX;
  for (const p of i.screen) {
    if (!p || p.x < m || p.y < m || p.x > i.width - m || p.y > i.height - m) return 'out-of-view';
  }
  return null;
}

/** True when a key event should trigger "Fit to tracks" (bare `f`, not typing). */
export function isFitShortcut(e: {
  key: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
  altKey?: boolean;
  target?: unknown;
}): boolean {
  if (e.key !== 'f' && e.key !== 'F') return false;
  if (e.ctrlKey || e.metaKey || e.altKey) return false;
  const t = e.target as { tagName?: string; isContentEditable?: boolean } | null | undefined;
  const tag = t?.tagName?.toUpperCase();
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || t?.isContentEditable) return false;
  return true;
}

export const FIT_SHORTCUT_LABEL = 'F';
