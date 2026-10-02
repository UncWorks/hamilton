// Link-trust rating scale — ONE typed source of truth for the semantic rating
// names, the MIL-STD-2525 J (evaluation rating) code each maps to, the ROE
// gate and the explanation maths. Story-adopted today (Explorations/Track
// Symbology → Option B′); exported so TrustPanel / the COP renderers can
// adopt it later.
//
// Deliberately dependency-free (no '@/…' imports) so it runs under
// `node --test` with native type stripping. Band edges mirror
// trust-gradient.ts trustBand(); link-trust-rating.test.ts asserts they agree.
//
// Names are chosen NOT to collide with existing 2525E / FM 1-02.2 meanings:
// identity (pending, unknown, assumed friend, friend, neutral, suspect,
// hostile), status (present, anticipated/planned), operational condition
// (damaged, destroyed, full to capacity) and K combat effectiveness
// (FO/SO/MO/NO). "NOMINAL" also matches the --trust-nominal token.

// ---------------------------------------------------------------------------
// Aggregation — mirrors services/trust-engine/crates/aggregator/src/lib.rs
// ---------------------------------------------------------------------------

export type TrustFactor = 'temporal' | 'stability' | 'spatial' | 'fingerprint';

export interface TrustComponentsLike {
  temporal: number;
  stability: number;
  spatial: number;
  fingerprint: number;
}

export const TRUST_FACTORS: readonly { key: TrustFactor; fr: string; label: string }[] = [
  { key: 'temporal', fr: 'FR-01', label: 'Temporal' },
  { key: 'stability', fr: 'FR-02', label: 'Stability' },
  { key: 'spatial', fr: 'FR-03', label: 'Spatial' },
  { key: 'fingerprint', fr: 'FR-04', label: 'Fingerprint' },
];

/** AggregatorWeights::default() — aggregator/src/lib.rs. Sum to 1.0. */
export const AGGREGATOR_WEIGHTS: Readonly<Record<TrustFactor, number>> = {
  temporal: 0.2,
  stability: 0.3,
  spatial: 0.2,
  fingerprint: 0.3,
};

/** composite = AVG_BLEND · weighted_avg + WORST_BLEND · worst_component (lib.rs `aggregate`). */
export const AVG_BLEND = 0.6;
export const WORST_BLEND = 0.4;

export interface FactorContribution {
  factor: TrustFactor;
  fr: string;
  label: string;
  /** Component value cᵢ in [0,1]. */
  value: number;
  /** Weight wᵢ. */
  weight: number;
  /** wᵢ · cᵢ — this factor's share of the weighted average. */
  contribution: number;
  /** True for the minimum component (ties → first in FR order). */
  weakest: boolean;
}

export interface TrustAggregation {
  score: number;
  weightedAvg: number;
  worst: number;
  worstFactor: TrustFactor;
  factors: FactorContribution[];
}

/** Recompute the composite exactly as aggregator/src/lib.rs does. */
export function aggregateTrust(
  c: TrustComponentsLike,
  w: Readonly<Record<TrustFactor, number>> = AGGREGATOR_WEIGHTS,
): TrustAggregation {
  let worstFactor: TrustFactor = 'temporal';
  for (const f of TRUST_FACTORS) if (c[f.key] < c[worstFactor]) worstFactor = f.key;
  const factors = TRUST_FACTORS.map((f) => ({
    factor: f.key,
    fr: f.fr,
    label: f.label,
    value: c[f.key],
    weight: w[f.key],
    contribution: c[f.key] * w[f.key],
    weakest: f.key === worstFactor,
  }));
  const weightedAvg = factors.reduce((s, f) => s + f.contribution, 0);
  const worst = c[worstFactor];
  const score = Math.min(1, Math.max(0, AVG_BLEND * weightedAvg + WORST_BLEND * worst));
  return { score, weightedAvg, worst, worstFactor, factors };
}

// ---------------------------------------------------------------------------
// Detector mirrors — the per-detector trust mappings of the fixed engine
// (PR #1, fix/fingerprint-trust-inversion @ 6733817). Used by the Storybook
// fixtures to turn comms-sim telemetry (scenarios/avdiivka.py) into the exact
// components the engine emits, and by the tooltip evidence strings.
// ---------------------------------------------------------------------------

/** Engine temporal baseline (services/trust-engine/src/state.rs): 1.0 s ± 0.05 s. */
export const TEMPORAL_BASELINE = { meanS: 1.0, stdS: 0.05 } as const;
/** temporal.rs: anomaly fires above 3σ; trust 1.0 at ≤ 1σ, 0.0 at ≥ 6σ, linear between. */
export const TEMPORAL_SIGMA = { anomaly: 3, full: 1, zero: 6 } as const;
/** stability.rs: degraded flag above 5 % CRC; trust 1.0 at ≤ 0.5 %, 0.0 at ≥ 20 %, linear between. */
export const STABILITY_CRC = { degraded: 0.05, full: 0.005, zero: 0.2 } as const;

/** σ above the engine baseline for an observed inter-arrival (temporal.rs detect_temporal). */
export function cadenceSigma(cadenceS: number): number {
  return (cadenceS - TEMPORAL_BASELINE.meanS) / TEMPORAL_BASELINE.stdS;
}

/** FR-01 temporal trust for an observed inter-arrival (temporal.rs compute_score). */
export function temporalTrust(cadenceS: number): number {
  const sigma = cadenceSigma(cadenceS);
  if (sigma <= TEMPORAL_SIGMA.full) return 1;
  if (sigma >= TEMPORAL_SIGMA.zero) return 0;
  return 1 - (sigma - TEMPORAL_SIGMA.full) / (TEMPORAL_SIGMA.zero - TEMPORAL_SIGMA.full);
}

/** FR-02 stability trust for a CRC error rate in [0,1] (stability.rs compute_score). */
export function stabilityTrust(crc: number): number {
  if (crc <= STABILITY_CRC.full) return 1;
  if (crc >= STABILITY_CRC.zero) return 0;
  return 1 - (crc - STABILITY_CRC.full) / (STABILITY_CRC.zero - STABILITY_CRC.full);
}

/** Inverse of temporalTrust on its linear segment (0 < c < 1); exact inside (1σ, 6σ). */
export function cadenceForTemporalTrust(c: number): number {
  const sigma = TEMPORAL_SIGMA.full + (1 - c) * (TEMPORAL_SIGMA.zero - TEMPORAL_SIGMA.full);
  return TEMPORAL_BASELINE.meanS + sigma * TEMPORAL_BASELINE.stdS;
}

/** Inverse of stabilityTrust on its linear segment (0 < c < 1). */
export function crcForStabilityTrust(c: number): number {
  return STABILITY_CRC.full + (1 - c) * (STABILITY_CRC.zero - STABILITY_CRC.full);
}

/**
 * spatial.rs `is_degrading`: MEASURED degradation (FR-01 > 3σ anomaly or FR-02
 * > 5 % CRC flag). Fingerprint does not count. Nothing is self-reported.
 */
export function isDegrading(cadenceS: number, crc: number): boolean {
  return cadenceSigma(cadenceS) > TEMPORAL_SIGMA.anomaly || crc > STABILITY_CRC.degraded;
}

// ---------------------------------------------------------------------------
// Engine-reachable components — used by the Storybook fixtures so every
// payload they render is one the real trust engine could emit.
// ---------------------------------------------------------------------------

/**
 * FR-04 fingerprint TRUST values the engine can emit (detectors/src/fingerprint.rs
 * `fingerprint_trust`, PR #1): 1 − match_strength, where match_strength is the
 * best library overlap k/6 and only counts at ≥ 0.5; no match → 1.0.
 */
export const ENGINE_FINGERPRINT_TRUST = [1, 1 / 2, 1 / 3, 1 / 6, 0] as const;

/**
 * FR-03 spatial TRUST — detectors/src/spatial.rs (PR #1 @ 6733817)
 * `SpatialClassification`: Nominal 1.0 (target not degrading, whatever the
 * neighbours do), Localized `LOCALIZED_TRUST` 0.6 (degrading, neighbours within
 * 500 m healthy), Blanket `BLANKET_TRUST` 0.3 (degrading, ≥ 1 neighbour degrading).
 */
export const ENGINE_SPATIAL_TRUST = { nominal: 1, localized: 0.6, blanket: 0.3 } as const;

export interface DiscreteComponents {
  spatial: number;
  fingerprint: number;
}

/** One (temporal, stability) knot on a regime's degradation path. */
export type PathKnot = readonly [temporal: number, stability: number];

/**
 * A discrete (spatial, fingerprint) regime plus the piecewise-linear path its
 * continuous detectors follow as the link degrades. Paths are built from the
 * engine's own beats so that solving a beat score returns the beat's components:
 *
 * - localized, no RF match: cadence breaks first (temporal 1 → 0.52, the 0:45
 *   1.17 s value), then CRC climbs (stability 1 → 0, through 0.72 = 6 % at 0:55).
 * - localized, jammer 6/6: temporal 1 → 0 first (cadence ≥ 1.30 s), then CRC
 *   climbs (stability 1 → 0, through 0.82 at 1:50 and 0.31 at 1:15).
 * - nominal, no RF match: only the sub-threshold range the engine still calls
 *   "not degrading" (≤ 3σ → temporal ≥ 0.6, CRC ≤ 5 % → stability ≥ 0.769).
 * - blanket, jammer 6/6: same order as localized-matched; fallback for scores
 *   below every localized path.
 */
export interface FixtureRegime extends DiscreteComponents {
  path: readonly PathKnot[];
}

/** temporalTrust(WATCH_CADENCE_S = 1.17 s) — comms-sim scenarios/avdiivka.py. */
const WATCH_TEMPORAL = temporalTrust(1.17);
const NOMINAL_FLOOR_TEMPORAL = 1 - (TEMPORAL_SIGMA.anomaly - TEMPORAL_SIGMA.full) / (TEMPORAL_SIGMA.zero - TEMPORAL_SIGMA.full);
const NOMINAL_FLOOR_STABILITY = stabilityTrust(STABILITY_CRC.degraded);

/**
 * Regimes in preference order: a score takes the first regime whose reachable
 * range contains it, so scores the engine only reaches with a jammer match get
 * fingerprint 0 (6/6, the Avdiivka jammer).
 */
export const FIXTURE_REGIMES: readonly FixtureRegime[] = [
  { spatial: ENGINE_SPATIAL_TRUST.localized, fingerprint: 0, path: [[1, 1], [0, 1], [0, 0]] },
  { spatial: ENGINE_SPATIAL_TRUST.localized, fingerprint: 1, path: [[1, 1], [WATCH_TEMPORAL, 1], [WATCH_TEMPORAL, 0], [0, 0]] },
  { spatial: ENGINE_SPATIAL_TRUST.nominal, fingerprint: 1, path: [[1, 1], [NOMINAL_FLOOR_TEMPORAL, 1], [NOMINAL_FLOOR_TEMPORAL, NOMINAL_FLOOR_STABILITY]] },
  { spatial: ENGINE_SPATIAL_TRUST.blanket, fingerprint: 0, path: [[1, 1], [0, 1], [0, 0]] },
];

/** Components at path parameter p ∈ [0, path.length − 1] (piecewise linear between knots). */
function componentsAt(p: number, r: FixtureRegime): TrustComponentsLike {
  const last = r.path.length - 1;
  const q = Math.min(Math.max(p, 0), last);
  const i = Math.min(Math.floor(q), last - 1);
  const f = q - i;
  const [t0, s0] = r.path[i]!;
  const [t1, s1] = r.path[i + 1]!;
  return { temporal: t0 + f * (t1 - t0), stability: s0 + f * (s1 - s0), spatial: r.spatial, fingerprint: r.fingerprint };
}

/** [floor, ceiling] of composite scores a regime can produce. */
export function regimeRange(r: FixtureRegime): [number, number] {
  return [aggregateTrust(componentsAt(r.path.length - 1, r)).score, aggregateTrust(componentsAt(0, r)).score];
}

export function regimeFor(score: number): FixtureRegime {
  return (
    FIXTURE_REGIMES.find((r) => {
      const [lo, hi] = regimeRange(r);
      return score >= lo && score <= hi;
    }) ?? FIXTURE_REGIMES[FIXTURE_REGIMES.length - 1]!
  );
}

/**
 * Components that reproduce `score` exactly through aggregateTrust, with
 * spatial and fingerprint restricted to engine-reachable values. Solved by
 * bisection along the regime path (the composite is monotone along it). For a
 * score the engine emits at an Avdiivka beat it returns that beat's components.
 * Below the lowest reachable score (0.036) it returns the floor; callers that
 * need exactness check aggregateTrust(result).score.
 */
export function solveComponents(score: number, regime: FixtureRegime = regimeFor(score)): TrustComponentsLike {
  if (score >= 0.999) return { temporal: 1, stability: 1, spatial: 1, fingerprint: 1 };
  let lo = 0;
  let hi = regime.path.length - 1;
  for (let i = 0; i < 100; i++) {
    const mid = (lo + hi) / 2;
    if (aggregateTrust(componentsAt(mid, regime)).score > score) lo = mid;
    else hi = mid;
  }
  return componentsAt((lo + hi) / 2, regime);
}

// ---------------------------------------------------------------------------
// Rating scale
// ---------------------------------------------------------------------------

/** Below this composite score GPS-guided fires are gated (Branding §3.3). */
export const ROE_FLOOR = 0.6;

/** Seconds without a good update before a track is STALE (AR = "NRT"). */
export const STALE_AFTER_S = 10;

export type TrustBandId = 'nominal' | 'watching' | 'degraded' | 'failed';
export type RatingId = 'nominal' | 'watch' | 'degraded' | 'unreliable';

/**
 * Source-reliability (A–F) and information-credibility (1–6) wording, FM 2-22.3
 * Human Intelligence Collector Operations, Appendix B "Source and Information
 * Reliability Matrix", Table B-1 / Table B-2 (same scale as STANAG 2511 /
 * AJP-2.1, and the 2525 J "Evaluation rating" amplifier format).
 */
export const RELIABILITY = {
  A: { label: 'Reliable', description: 'No doubt of authenticity, trustworthiness, or competency; has a history of complete reliability' },
  B: { label: 'Usually reliable', description: 'Minor doubt about authenticity, trustworthiness, or competency; has a history of valid information most of the time' },
  C: { label: 'Fairly reliable', description: 'Doubt of authenticity, trustworthiness, or competency but has provided valid information in the past' },
  D: { label: 'Not usually reliable', description: 'Significant doubt about authenticity, trustworthiness, or competency but has provided valid information in the past' },
  E: { label: 'Unreliable', description: 'Lacking in authenticity, trustworthiness, and competency; history of invalid information' },
  F: { label: 'Cannot be judged', description: 'No basis exists for evaluating the reliability of the source' },
} as const;

export const CREDIBILITY = {
  '1': { label: 'Confirmed', description: 'Confirmed by other independent sources; logical in itself; consistent with other information on the subject' },
  '2': { label: 'Probably true', description: 'Not confirmed; logical in itself; consistent with other information on the subject' },
  '3': { label: 'Possibly true', description: 'Not confirmed; reasonably logical in itself; agrees with some other information on the subject' },
  '4': { label: 'Doubtfully true', description: 'Not confirmed; possible but not logical; no other information on the subject' },
  '5': { label: 'Improbable', description: 'Not confirmed; not logical in itself; contradicted by other information on the subject' },
  '6': { label: 'Cannot be judged', description: 'No basis exists for evaluating the validity of the information' },
} as const;

export const J_CODE_CITATION = 'FM 2-22.3, App. B, Tables B-1/B-2 (A–F reliability × 1–6 credibility; = STANAG 2511)';

export type ReliabilityCode = keyof typeof RELIABILITY;
export type CredibilityCode = keyof typeof CREDIBILITY;

export interface RatingLevel {
  id: RatingId;
  /** Primary, human label shown next to the symbol. */
  name: string;
  /** Inclusive lower score bound. */
  min: number;
  band: TrustBandId;
  /** Trust token — the ONLY colour a rating may use. */
  bandToken: string;
  reliability: ReliabilityCode;
  credibility: CredibilityCode;
  /** 2525 J amplifier value — secondary on screen, the value used for export. */
  jCode: string;
  description: string;
}

/** Ordered high → low. */
export const LINK_TRUST_SCALE: readonly RatingLevel[] = [
  {
    id: 'nominal',
    name: 'NOMINAL',
    min: 0.85,
    band: 'nominal',
    bandToken: 'var(--trust-nominal)',
    reliability: 'B',
    credibility: '2',
    jCode: 'B2',
    description: 'Link behaving as baselined; all detectors within tolerance.',
  },
  {
    id: 'watch',
    name: 'WATCH',
    min: ROE_FLOOR,
    band: 'watching',
    bandToken: 'var(--trust-watching)',
    reliability: 'C',
    credibility: '3',
    jCode: 'C3',
    description: 'One or more detectors off baseline; still above the ROE floor.',
  },
  {
    id: 'degraded',
    name: 'DEGRADED',
    min: 0.3,
    band: 'degraded',
    bandToken: 'var(--trust-degraded)',
    reliability: 'D',
    credibility: '4',
    jCode: 'D4',
    description: 'Link evidence contradicts baseline; below the ROE floor — GPS-guided fires gated.',
  },
  {
    id: 'unreliable',
    name: 'UNRELIABLE',
    min: 0,
    band: 'failed',
    bandToken: 'var(--trust-failed-stroke)',
    reliability: 'E',
    credibility: '5',
    jCode: 'E5',
    description: 'Link data should not be used for targeting; GPS-guided fires gated.',
  },
];

export const STALE_NAME = 'STALE';
/** 2525 AR (special designator) value for non-real-time data. */
export const NRT = 'NRT';

export interface LinkTrustRating extends RatingLevel {
  score: number;
  /** True below ROE_FLOOR. */
  roeGated: boolean;
  stale: boolean;
  /** Visible label: STALE when stale, else the band name. */
  label: string;
  /** Token for the label: grey when stale. */
  labelToken: string;
  /** Rating text visible at rest (below the floor, or stale); otherwise hover only. */
  visibleAtRest: boolean;
  /** "D: Not usually reliable · 4: Doubtfully true". */
  jMeaning: string;
}

export function ratingLevel(score: number): RatingLevel {
  return LINK_TRUST_SCALE.find((l) => score >= l.min) ?? LINK_TRUST_SCALE[LINK_TRUST_SCALE.length - 1]!;
}

export function rateLinkTrust(score: number, opts: { stale?: boolean } = {}): LinkTrustRating {
  const level = ratingLevel(score);
  const stale = opts.stale ?? false;
  const roeGated = score < ROE_FLOOR;
  return {
    ...level,
    score,
    roeGated,
    stale,
    label: stale ? STALE_NAME : level.name,
    labelToken: stale ? 'var(--sym-ink-stale)' : level.bandToken,
    visibleAtRest: roeGated || stale,
    jMeaning: `${level.reliability}: ${RELIABILITY[level.reliability].label} · ${level.credibility}: ${CREDIBILITY[level.credibility].label}`,
  };
}

// ---------------------------------------------------------------------------
// Staleness + 2525 text amplifiers
// ---------------------------------------------------------------------------

export function secondsSince(lastGoodIso: string, nowIso: string): number {
  return (Date.parse(nowIso) - Date.parse(lastGoodIso)) / 1000;
}

export function isStale(lastGoodIso: string, nowIso: string, staleAfterS = STALE_AFTER_S): boolean {
  return secondsSince(lastGoodIso, nowIso) > staleAfterS;
}

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'] as const;

/** 2525 W amplifier DTG: DDHHMMSSZMONYYYY (UTC), e.g. "15184241ZFEB2024". */
export function formatDtg(iso: string): string {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getUTCDate())}${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}Z${MONTHS[d.getUTCMonth()]}${d.getUTCFullYear()}`;
}

export interface ExportAmplifiers {
  /** Evaluation rating, e.g. "D4". */
  J: string;
  /** DTG of the last good update. */
  W: string;
  /** "NRT" when stale. */
  AR?: string;
}

/** Standard 2525 amplifiers for export (TAK / CoT). The halo overlay is never exported. */
export function exportAmplifiers(rating: LinkTrustRating, lastGoodIso: string): ExportAmplifiers {
  return { J: rating.jCode, W: formatDtg(lastGoodIso), ...(rating.stale ? { AR: NRT } : {}) };
}

// ---------------------------------------------------------------------------
// Avdiivka engine beats — what the fixed engine (PR #1 @ 6733817) emits for the
// comms-sim scenario. Telemetry is copied from
// services/comms-sim/src/comms_sim/scenarios/avdiivka.py (jitter-free); the
// derivation mirrors the `avdiivka::tick` helper of the Rust end-to-end test
// services/trust-engine/crates/aggregator/src/lib.rs `avdiivka_beats_end_to_end`
// (measured degradation → spatial classification within 500 m → aggregate).
// link-trust-rating.test.ts pins the result to that test's printed values.
// ---------------------------------------------------------------------------

export type AvdiivkaUnit = 'unit_a' | 'unit_b' | 'unit_c';
export const AVDIIVKA_UNITS: readonly AvdiivkaUnit[] = ['unit_a', 'unit_b', 'unit_c'];

/** avdiivka.py SOURCE_POSITIONS (= apps/web/app/page.tsx SEED_TRACKS): A/C ~245 m N/S of B. */
export const AVDIIVKA_POSITIONS: Readonly<Record<AvdiivkaUnit, { lat: number; lon: number }>> = {
  unit_a: { lat: 48.14 + 0.0022, lon: 37.745 },
  unit_b: { lat: 48.14, lon: 37.745 },
  unit_c: { lat: 48.14 - 0.0022, lon: 37.745 },
};

/** spatial.rs DEFAULT_RADIUS_M (TRUST_ENGINE_SPATIAL_RADIUS_M). */
export const SPATIAL_RADIUS_M = 500;

export interface UnitTelemetry {
  /** inter_arrival_seconds. */
  cadenceS: number;
  /** crc_error_rate, fraction. */
  crc: number;
  /** Best fingerprint library match strength k/6 (0 = no RF observation / no match ≥ 0.5). */
  rfMatch: number;
}

/** avdiivka.py constants: SourceTelemetryState defaults and the B ramp. */
export const AVDIIVKA_TELEMETRY = {
  healthy: { cadenceS: 1.0, crc: 0.002, rfMatch: 0 },
  /** 0:45 WATCH_CADENCE_S 1.17 s (3.4σ). */
  watch: { cadenceS: 1.17, crc: 0.002, rfMatch: 0 },
  /** 0:55 + WATCH_CRC 6 %. */
  watchCrc: { cadenceS: 1.17, crc: 0.06, rfMatch: 0 },
  /** 1:15 JAMMED_CADENCE_S 6.1 s, JAMMED_CRC 14 %, JAMMER_RF (ground_based_gps_uhf_barrage 6/6). */
  jammed: { cadenceS: 6.1, crc: 0.14, rfMatch: 1 },
  /** 1:50 _start_unit_b_recovery: 1.8 s, 4 %, jammer still observed. */
  recovering: { cadenceS: 1.8, crc: 0.04, rfMatch: 1 },
} as const satisfies Record<string, UnitTelemetry>;

function distanceM(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  // spatial.rs haversine, R = 6 371 000 m.
  const R = 6_371_000;
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLon = (b.lon - a.lon) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export interface EngineUnitOutput {
  components: TrustComponentsLike;
  score: number;
}

/** One engine tick over A, B, C — mirrors `avdiivka::tick` in the Rust end-to-end test. */
export function engineTick(
  tel: Readonly<Record<AvdiivkaUnit, UnitTelemetry>>,
  positions: Readonly<Record<AvdiivkaUnit, { lat: number; lon: number }>> = AVDIIVKA_POSITIONS,
  radiusM = SPATIAL_RADIUS_M,
): Record<AvdiivkaUnit, EngineUnitOutput> {
  const degrading = Object.fromEntries(
    AVDIIVKA_UNITS.map((u) => [u, isDegrading(tel[u].cadenceS, tel[u].crc)]),
  ) as Record<AvdiivkaUnit, boolean>;
  const out = {} as Record<AvdiivkaUnit, EngineUnitOutput>;
  for (const u of AVDIIVKA_UNITS) {
    const blanket = AVDIIVKA_UNITS.some(
      (n) => n !== u && degrading[n] && distanceM(positions[u], positions[n]) <= radiusM,
    );
    const spatial = !degrading[u]
      ? ENGINE_SPATIAL_TRUST.nominal
      : blanket
        ? ENGINE_SPATIAL_TRUST.blanket
        : ENGINE_SPATIAL_TRUST.localized;
    const components: TrustComponentsLike = {
      temporal: temporalTrust(tel[u].cadenceS),
      stability: stabilityTrust(tel[u].crc),
      spatial,
      // fingerprint.rs fingerprint_trust: 1 − match strength; matches below 0.5 do not count.
      fingerprint: tel[u].rfMatch >= 0.5 ? 1 - tel[u].rfMatch : 1,
    };
    out[u] = { components, score: aggregateTrust(components).score };
  }
  return out;
}

export interface EngineBeat {
  /** Scenario clock, seconds (comms-sim beat tick_seconds; 1:20 is the modal beat). */
  clockS: number;
  label: string;
  telemetry: Readonly<Record<AvdiivkaUnit, UnitTelemetry>>;
  units: Readonly<Record<AvdiivkaUnit, EngineUnitOutput>>;
}

const T = AVDIIVKA_TELEMETRY;
const beat = (clockS: number, label: string, b: UnitTelemetry): EngineBeat => {
  const telemetry = { unit_a: T.healthy, unit_b: b, unit_c: T.healthy };
  return { clockS, label, telemetry, units: engineTick(telemetry) };
};

/** The beat table of `avdiivka_beats_end_to_end` (same beats, same order). */
export const AVDIIVKA_BEATS: readonly EngineBeat[] = [
  beat(0, '0:00 three healthy units', T.healthy),
  beat(45, '0:45 B cadence 1.0 s → 1.17 s (WATCH)', T.watch),
  beat(55, '0:55 B CRC 0.2 % → 6 % (WATCH)', T.watchCrc),
  beat(65, '1:05 spatial: localized, A and C unaffected', T.watchCrc),
  beat(75, '1:15 jammer at full power: 6.1 s gap, 14 % CRC, RF fingerprint 6/6', T.jammed),
  beat(80, '1:20 modal beat (telemetry unchanged)', T.jammed),
  beat(110, '1:50 B recovery initiates', T.recovering),
  beat(135, '2:15 B fully recovered', T.healthy),
];

/** Latest beat at or before `clockS` (the engine holds state between beats). */
export function beatAt(clockS: number): EngineBeat {
  let current = AVDIIVKA_BEATS[0]!;
  for (const b of AVDIIVKA_BEATS) if (b.clockS <= clockS) current = b;
  return current;
}

/** Scenario clock of B's first score below ROE_FLOOR (1:15). */
export function firstCrossingClock(): number | undefined {
  return AVDIIVKA_BEATS.find((b) => b.units.unit_b.score < ROE_FLOOR)?.clockS;
}
