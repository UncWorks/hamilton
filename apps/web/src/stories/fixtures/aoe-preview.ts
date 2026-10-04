// Jammer AoE PREVIEW fixtures — Previews/Jammer AoE (docs/plans/jammer-aoe.md).
//
// Geometry is generated, not drawn: aoe-preview.json is written by
// scripts/aoe-preview/gen_fixtures.py — the jammer-AoE design worked example
// (two-ray + horizon link budget, 3 × 3 EIRP × mast hypotheses, 0.25 km grid,
// σ 6 dB, seeded shadowing, 8 spread units, hidden emitter 9.6 km east of B)
// re-parameterised with the VERIFIED Pole-21E envelope (ua-jamming-verification
// §4.1: EIRP 300–1000 W per module, single-frequency mode; ≥125° sector; mast
// up to 60 m; nominal C/A −125 dBm; civil loss-of-fix J/S ≥ 36 dB) and extended
// to emit 50% / 90% contours. The hidden emitter is a 300 W / 10 m / 125°
// west-facing module. Re-run the script to regenerate; do not edit the JSON.
//
// The estimate objects below are shaped like the PROPOSED contract
// `integrity/emitter/estimate` (EmitterEstimatePayload, plan §3), so the
// preview exercises the shape the engine will publish. Nothing here parses
// through @hamilton/contracts: the contract does not exist yet.
//
// HIDDEN TRUTH (`AOE_TRUTH`) is for the Evaluation story only. Operator-view
// stories never import it (the preview no-leak rule, mirrored from the
// planned comms-sim no-leak test).
//
// Unit ids: B, A, C keep the scenario ids (unit_b / unit_a / unit_c) so the
// production mission fixtures (AB1001: OBS B, FU A) still resolve. The five
// new units use single-letter ids (d … h) so the production designationOf()
// prints D … H without touching lib/cop-symbols.ts; the plan renames them
// unit_d … unit_h and extends KNOWN_DESIGNATIONS / UNIT_ROLES.

import type { FingerprintCandidate, SensorType } from '@hamilton/contracts';
import type { TrackState } from '@/store/hamilton';
import { AVDIIVKA_BEATS, BAND_SAMPLES, clockIso, componentsFor } from './avdiivka';
import raw from './aoe-preview.json';

// ---------------------------------------------------------------------------
// Proposed contract shape (plan §3) — preview copy
// ---------------------------------------------------------------------------

export type LonLat = [number, number];
export interface MultiPolygon {
  type: 'MultiPolygon';
  /** GeoJSON order: polygons → rings (outer first, then holes) → [lon, lat]. */
  coordinates: LonLat[][][];
}
export type RxClass = 'gnss_civil' | 'gnss_mil' | 'uhf_comms' | 'fpv_link';
export const RX_CLASSES: readonly RxClass[] = ['gnss_civil', 'gnss_mil', 'uhf_comms', 'fpv_link'];
export const RX_LABEL: Record<RxClass, string> = {
  gnss_civil: 'Civil GPS',
  gnss_mil: 'Military GPS',
  uhf_comms: 'UHF comms',
  fpv_link: 'FPV link',
};

export interface AoeContour {
  p: 0.5 | 0.9;
  polygon: MultiPolygon;
  area_km2: number;
}
export interface AoeLayer {
  rx_class: RxClass;
  ref_link_km?: number;
  contours: AoeContour[];
  radius_km_range: [number, number];
  /** Preview: cells farther than this from every reporting unit are "extrapolated" (outline only). */
  footprint_radius_km: number;
  /** Preview: layer NOT produced by the matched method (shown only to preview its style). */
  illustrative?: boolean;
}
export interface EvidenceItem {
  source_id: string;
  /** Designation shown on the map (B, D, …). */
  designation: string;
  state: 'degraded' | 'healthy';
  rx_class: 'gnss_civil' | 'gnss_mil';
  metric: string;
  value: number;
  age_s: number;
  lat: number;
  lon: number;
  /** Preview: an earlier report at a position the unit has left (1:50). */
  superseded?: boolean;
}
export interface Bearing {
  source_id: string;
  designation: string;
  lat: number;
  lon: number;
  bearing_deg: number;
  sigma_deg: number;
}
export interface EmitterEstimate {
  schema: 'emitter-estimate/1';
  estimate_id: string;
  state: 'active' | 'stale' | 'unbounded' | 'retired';
  method_id: string;
  method_match: number;
  method_ambiguous: boolean;
  model: { kind: 'set' | 'grid' | 'grid+aoa'; propagation: 'two_ray' | 'itm'; grid_m: number; hypotheses: { erp_dbm: number[]; mast_m: number[] }; sigma_db: number };
  aoe: AoeLayer[];
  emitter: {
    region90: MultiPolygon;
    area90_km2: number;
    /** Present only when gated in: 90% region ≤ 25 km² or ≥ 2 bearings. */
    mode?: { lat: number; lon: number; ce90_m: number };
    erp_dbm_range: [number, number];
  };
  evidence: EvidenceItem[];
  bearings_used: number;
  computed_at: string;
  valid_until: string;
}

// ---------------------------------------------------------------------------
// Raw generated data
// ---------------------------------------------------------------------------

type RawMp = number[][][][];
interface RawContour { p: number; area_km2: number; polygons: RawMp }
interface RawAoe { contours: RawContour[]; radius_km_range: number[]; radius_km_median: number; footprint_radius_km: number; eval: { iou50: number; iou50_footprint: number; true_radius_km: number } }
interface RawEvidence { state: string; js_db: number; cn0_drop_db: number; rx_class: string; lat: number; lon: number }
interface RawBeat {
  aoe: Record<string, RawAoe>;
  emitter: { region90: RawMp; area90_km2: number; area50_km2: number; mode: { lat: number; lon: number; ce90_m: number }; mode_shown: boolean; erp_posterior: Record<string, number> };
  evidence: Record<string, RawEvidence>;
  probes: Record<string, { units: Record<string, number>; target: number }>;
  bearings: { unit: string; lat: number; lon: number; bearing_deg: number; sigma_deg: number }[];
  eval: { mode_error_km: number; truth_in_region90: boolean };
}
interface RawData {
  units: { key: string; source_id: string; role: string; sensor_type: string; rx_class: string; enu_km: number[]; lat: number; lon: number }[];
  b_moved: { lat: number; lon: number };
  truth: { lat: number; lon: number; erp_dbm: number; mast_m: number; sector_az_deg: number; sector_width_deg: number; radius_km: Record<string, number>; aoe: Record<string, RawMp> };
  flot: number[][];
  beats: Record<'b115' | 'b135' | 'b150', RawBeat>;
  illustrative: Record<'uhf_comms' | 'fpv_link', { contours: RawContour[] }>;
  model: { grid_m: number; sigma_db: number; hypotheses: { erp_dbm: number[]; mast_m: number[] }; thresholds_db: Record<string, number> };
}
const RAW = raw as unknown as RawData;

const mp = (coords: RawMp): MultiPolygon => ({ type: 'MultiPolygon', coordinates: coords as LonLat[][][] });
const contours = (cs: RawContour[]): AoeContour[] => cs.map((c) => ({ p: c.p as 0.5 | 0.9, area_km2: c.area_km2, polygon: mp(c.polygons) }));

// ---------------------------------------------------------------------------
// Units (design §5 table) and tracks per beat
// ---------------------------------------------------------------------------

export interface AoeUnit {
  key: string;
  source_id: string;
  designation: string;
  role: string;
  sensor_type: SensorType;
  rx_class: 'gnss_civil' | 'gnss_mil';
  lat: number;
  lon: number;
}
export const AOE_UNITS: AoeUnit[] = RAW.units.map((u) => ({
  key: u.key,
  source_id: u.source_id,
  designation: u.key,
  role: u.role,
  sensor_type: u.sensor_type as SensorType,
  rx_class: u.rx_class === 'gnss_mil' ? 'gnss_mil' : 'gnss_civil',
  lat: u.lat,
  lon: u.lon,
}));
export const UNIT_BY_KEY = Object.fromEntries(AOE_UNITS.map((u) => [u.key, u])) as Record<string, AoeUnit>;
/** B displaces 5 km west at 1:50 (design §5 said 3 km; with the verified 300 W truth B is still denied 3 km west). */
export const B_MOVED = RAW.b_moved;
/** AB1001 target (fixtures/missions.ts). */
export const AB1001_TARGET = { lat: 48.1505, lon: 37.7712 };
/** Prior FLOT (x = +1 km east of B) as [lon, lat] endpoints — Evaluation story only. */
export const FLOT_PRIOR = RAW.flot as LonLat[];

export type BeatId = 'b115' | 'b135' | 'b150' | 'b215';
export const BEAT_CLOCK_S: Record<BeatId, number> = { b115: 75, b135: 95, b150: 110, b215: 135 };
export const BEAT_LABEL: Record<BeatId, string> = { b115: '1:15', b135: '1:35', b150: '1:50', b215: '2:15' };

const bScore = (clockS: number) => (AVDIIVKA_BEATS.find((b) => b.clockS === clockS) ?? AVDIIVKA_BEATS.find((b) => b.clockS === 80)!).units.unit_b.score;

/**
 * Link trust per unit and beat. B follows the engine beats (0.13 at 1:15, 0.22
 * at 1:50, 1.00 at 2:15; 1:35 has no engine beat → the 1:20 value). D and H —
 * new units, no engine beat yet — take the SYNTHETIC degraded sample 0.45
 * while jammed. Everyone else 1.00.
 */
function scoreOf(key: string, beat: BeatId): number {
  if (beat === 'b215') return 1;
  if (key === 'B') return bScore(beat === 'b135' ? 80 : BEAT_CLOCK_S[beat]);
  if (key === 'D' || key === 'H') return BAND_SAMPLES.degraded;
  return 1;
}

export function aoeTracks(beat: BeatId): Record<string, TrackState> {
  const ts = clockIso(BEAT_CLOCK_S[beat]);
  return Object.fromEntries(
    AOE_UNITS.map((u) => {
      const moved = u.key === 'B' && (beat === 'b150' || beat === 'b215');
      const score = scoreOf(u.key, beat);
      const t: TrackState = {
        source_id: u.source_id,
        affiliation: 'friendly',
        sensor_type: u.sensor_type,
        lat: moved ? B_MOVED.lat : u.lat,
        lon: moved ? B_MOVED.lon : u.lon,
        score,
        prev_score: score,
        components: componentsFor(score),
        trace_bullets: [],
        last_update: ts,
      };
      return [u.source_id, t];
    }),
  );
}

// ---------------------------------------------------------------------------
// Estimates per beat
// ---------------------------------------------------------------------------

/** Pole-21-class: the closest existing library id is directional_gps_l1_spot (verification §5: Pole-21 merges into it). */
export const PREVIEW_METHOD_ID = 'directional_gps_l1_spot';
export const PREVIEW_METHOD_LABEL = 'Pole-21-class';

/** Evidence ages (s) at the moment of each estimate — illustrative, unit reports are ~1 Hz. */
const AGE_S: Record<string, number> = { B: 4, D: 3, H: 6, A: 1, C: 2, E: 1, F: 2, G: 1, 'B@moved': 2 };

function evidenceOf(b: RawBeat): EvidenceItem[] {
  return Object.entries(b.evidence).map(([key, e]) => {
    const u = UNIT_BY_KEY[key.split('@')[0]!]!;
    const moved = key.endsWith('@moved');
    const supersededOld = key === 'B' && 'B@moved' in b.evidence;
    return {
      source_id: u.source_id,
      designation: u.designation,
      state: e.state as 'degraded' | 'healthy',
      rx_class: u.rx_class,
      metric: 'gnss_cn0_drop_db',
      value: -e.cn0_drop_db,
      age_s: supersededOld ? 39 : (AGE_S[moved ? 'B@moved' : key] ?? 1),
      lat: e.lat,
      lon: e.lon,
      ...(supersededOld ? { superseded: true } : {}),
    };
  });
}

function estimateOf(beat: Exclude<BeatId, 'b215'>, rawBeat: RawBeat, extra: Partial<EmitterEstimate> = {}): EmitterEstimate {
  const computed = clockIso(BEAT_CLOCK_S[beat]);
  const gnss: AoeLayer[] = (['gnss_civil', 'gnss_mil'] as const).map((rc) => {
    const a = rawBeat.aoe[rc]!;
    return {
      rx_class: rc,
      contours: contours(a.contours),
      radius_km_range: [a.radius_km_range[0]!, a.radius_km_range[1]!],
      footprint_radius_km: a.footprint_radius_km,
    };
  });
  const erp = RAW.model.hypotheses.erp_dbm.filter((_, i) => (Object.values(rawBeat.emitter.erp_posterior)[i] ?? 0) >= 0.1);
  const bearings = rawBeat.bearings;
  return {
    schema: 'emitter-estimate/1',
    estimate_id: 'J1-20240215T184236Z',
    state: 'active',
    method_id: PREVIEW_METHOD_ID,
    method_match: 6 / 6,
    method_ambiguous: false,
    model: {
      kind: bearings.length ? 'grid+aoa' : 'set',
      propagation: 'two_ray',
      grid_m: RAW.model.grid_m,
      hypotheses: RAW.model.hypotheses,
      sigma_db: RAW.model.sigma_db,
    },
    aoe: gnss,
    emitter: {
      region90: mp(rawBeat.emitter.region90),
      area90_km2: rawBeat.emitter.area90_km2,
      ...(rawBeat.emitter.mode_shown ? { mode: rawBeat.emitter.mode } : {}),
      erp_dbm_range: [Math.min(...erp), Math.max(...erp)],
    },
    evidence: evidenceOf(rawBeat),
    bearings_used: bearings.length,
    computed_at: computed,
    valid_until: new Date(Date.parse(computed) + 120_000).toISOString(),
    ...extra,
  };
}

export const ESTIMATES: Record<BeatId, EmitterEstimate> = (() => {
  const b150 = estimateOf('b150', RAW.beats.b150);
  return {
    b115: estimateOf('b115', RAW.beats.b115),
    b135: estimateOf('b135', RAW.beats.b135),
    b150,
    // 2:15 — jammer off, trigger dropped, held 10 s, now STALE: the 1:50 geometry, outline only.
    b215: { ...b150, state: 'stale' },
  };
})();

/** Bearings for the 1:35 (v3, optional) beat: KrakenSDR-class DF at B and H, σ 5°. */
export const BEARINGS: Bearing[] = RAW.beats.b135.bearings.map((b) => ({
  source_id: UNIT_BY_KEY[b.unit]!.source_id,
  designation: b.unit,
  lat: b.lat,
  lon: b.lon,
  bearing_deg: b.bearing_deg,
  sigma_deg: b.sigma_deg,
}));

/** Estimate age as the operator sees it (s) — heartbeat ≤ 10 s while active. */
/** dBm → W, rounded for labels. */
export const dbmToW = (dbm: number) => Math.round(10 ** (dbm / 10) / 1000 / 10) * 10;

export const ESTIMATE_AGE_S: Record<BeatId, number> = { b115: 3, b135: 2, b150: 4, b215: 25 };

/**
 * Illustrative UHF / FPV layers on the 1:35 (DF-located) emitter-location posterior. A
 * Pole-21-class method (1176–1602 MHz) does NOT cover UHF (225–400 MHz) or FPV
 * links (700–1100 / 2400 / 5800 MHz), so the real estimate has no such layer;
 * these exist only to preview the layer style (hypothetical multi-band
 * jammer: UHF 50 W–1 kW on 5 km FHSS links; FPV 10–200 W on 3 km links).
 */
export const ILLUSTRATIVE_LAYERS: AoeLayer[] = [
  { rx_class: 'uhf_comms', ref_link_km: 5, contours: contours(RAW.illustrative.uhf_comms.contours), radius_km_range: [0, 0], footprint_radius_km: 15, illustrative: true },
  { rx_class: 'fpv_link', ref_link_km: 3, contours: contours(RAW.illustrative.fpv_link.contours), radius_km_range: [0, 0], footprint_radius_km: 15, illustrative: true },
];

/** P(denied) the generator sampled at units and the AB1001 target, per beat and class. */
export const PROBES = {
  b115: RAW.beats.b115.probes,
  b135: RAW.beats.b135.probes,
  b150: RAW.beats.b150.probes,
  b215: RAW.beats.b150.probes,
} as Record<BeatId, Record<string, { units: Record<string, number>; target: number }>>;

/** Fingerprint candidate card for the preview (Pole-21-class top match; inventory figures pending verification). */
export const AOE_CANDIDATES: FingerprintCandidate[] = [
  {
    method_id: PREVIEW_METHOD_ID,
    named_systems: ['Pole-21 / R-340RP'],
    score: 6 / 6,
    munitions_affected: ['ATAK PLI', 'OBS B GNSS fix', 'FPV GNSS hold'],
    source_citation: 'NTC REB Pole-21E page (archived 15 Jan 2018) — EIRP 300–1000 W, ≥125° sector [verified manufacturer claim]',
  },
  {
    method_id: 'ground_based_gps_uhf_barrage',
    named_systems: ['R-330Zh Zhitel'],
    score: 3 / 6,
    munitions_affected: ['Excalibur', 'GMLRS-U'],
    source_citation: 'PROTEK APFAR page (archived 26 Jun 2015) — ≥2 kW EIRP per 90–120° sector [verified manufacturer claim]',
  },
];

// ---------------------------------------------------------------------------
// HIDDEN TRUTH — Evaluation story only
// ---------------------------------------------------------------------------

export const AOE_TRUTH = {
  lat: RAW.truth.lat,
  lon: RAW.truth.lon,
  erp_dbm: RAW.truth.erp_dbm,
  mast_m: RAW.truth.mast_m,
  sector_az_deg: RAW.truth.sector_az_deg,
  sector_width_deg: RAW.truth.sector_width_deg,
  /** True denial radius per receiver class inside the sector (no shadowing), km. */
  radius_km: RAW.truth.radius_km,
  /** True denial area (sectoral pattern, no shadowing) per class. */
  aoe: { gnss_civil: mp(RAW.truth.aoe.gnss_civil!), gnss_mil: mp(RAW.truth.aoe.gnss_mil!) },
} as const;

export const AOE_EVAL: Record<Exclude<BeatId, 'b215'>, { modeErrorKm: number; truthIn90: boolean; area90: number; iouCivil: number; iouCivilFootprint: number }> = {
  b115: evalOf(RAW.beats.b115),
  b135: evalOf(RAW.beats.b135),
  b150: evalOf(RAW.beats.b150),
};
function evalOf(b: RawBeat) {
  return {
    modeErrorKm: b.eval.mode_error_km,
    truthIn90: b.eval.truth_in_region90,
    area90: b.emitter.area90_km2,
    iouCivil: b.aoe.gnss_civil!.eval.iou50,
    iouCivilFootprint: b.aoe.gnss_civil!.eval.iou50_footprint,
  };
}

// ---------------------------------------------------------------------------
// Small geometry helpers (preview-only; the plan puts the real ones in lib/aoe.ts)
// ---------------------------------------------------------------------------

/** Ray-casting point-in-polygon on a GeoJSON MultiPolygon (even-odd, holes honoured). */
export function inMultiPolygon(pt: { lat: number; lon: number }, m: MultiPolygon): boolean {
  let inside = false;
  for (const poly of m.coordinates) {
    for (const ring of poly) {
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const [xi, yi] = ring[i]!;
        const [xj, yj] = ring[j]!;
        if (yi > pt.lat !== yj > pt.lat && pt.lon < ((xj - xi) * (pt.lat - yi)) / (yj - yi) + xi) inside = !inside;
      }
    }
  }
  return inside;
}

/** Highest contour level (0.9 > 0.5) containing the point, or null. */
export function contourLevelAt(pt: { lat: number; lon: number }, layer: AoeLayer): 0.5 | 0.9 | null {
  const sorted = [...layer.contours].sort((a, b) => b.p - a.p);
  for (const c of sorted) if (c.polygon.coordinates.length && inMultiPolygon(pt, c.polygon)) return c.p;
  return null;
}

export type FitScope = 'evidence' | 'all';

/**
 * Extra fit points for the plan's camera fit (lib/camera-fit.ts change):
 * - 'evidence': the 90% AoE of the class (what the operator acts on);
 * - 'all': every AoE contour + the NAI (the whole estimate).
 * Tracks are added by the caller.
 */
export function estimateExtent(e: EmitterEstimate, rx: RxClass = 'gnss_civil', scope: FitScope = 'evidence'): { lat: number; lon: number }[] {
  const pts: { lat: number; lon: number }[] = [];
  const add = (m: MultiPolygon) => m.coordinates.forEach((p) => p[0]!.forEach(([lon, lat]) => pts.push({ lat, lon })));
  const layer = e.aoe.find((l) => l.rx_class === rx);
  layer?.contours.filter((c) => scope === 'all' || c.p === 0.9).forEach((c) => add(c.polygon));
  if (scope === 'all') add(e.emitter.region90);
  return pts;
}
