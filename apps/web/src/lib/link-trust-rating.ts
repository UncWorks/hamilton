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
// Engine-reachable components — used by the Storybook fixtures so every
// payload they render is one the real trust engine could emit.
// Assumes the fingerprint semantics of PR #1 (fix/fingerprint-trust-inversion).
// ---------------------------------------------------------------------------

/**
 * FR-04 fingerprint TRUST values the engine can emit (detectors/src/fingerprint.rs
 * `fingerprint_trust`, PR #1): 1 − match_strength, where match_strength is the
 * best library overlap k/6 and only counts at ≥ 0.5; no match → 1.0.
 */
export const ENGINE_FINGERPRINT_TRUST = [1, 1 / 2, 1 / 3, 1 / 6, 0] as const;

/**
 * FR-03 spatial TRUST. Mirrors the engine's trust-oriented spatial detector
 * (being changed on fix/fingerprint-trust-inversion, PR #1 follow-up):
 * 1.0 when the source is not degrading, 0.6 while degrading and localized,
 * 0.3 while degrading and blanket.
 */
export const ENGINE_SPATIAL_TRUST = { notDegrading: 1, localized: 0.6, blanket: 0.3 } as const;

export interface DiscreteComponents {
  spatial: number;
  fingerprint: number;
}

/**
 * Discrete (spatial, fingerprint) regimes in preference order. A score takes
 * the first regime whose reachable range contains it, so scores the engine can
 * only reach with a jammer match get fingerprint 0 (6/6, the Avdiivka jammer).
 */
export const FIXTURE_REGIMES: readonly DiscreteComponents[] = [
  { spatial: ENGINE_SPATIAL_TRUST.localized, fingerprint: 0 },
  { spatial: ENGINE_SPATIAL_TRUST.localized, fingerprint: 1 },
  { spatial: ENGINE_SPATIAL_TRUST.notDegrading, fingerprint: 1 },
  { spatial: ENGINE_SPATIAL_TRUST.blanket, fingerprint: 0 },
];

/**
 * Continuous detectors follow one degradation parameter p ≥ 0: temporal leads
 * (cadence breaks first), stability lags (CRC climbs late). Both are piecewise
 * linear in the engine (temporal.rs, stability.rs), so any value in [0,1] is reachable.
 */
const DECAY_PROFILE = { temporal: 1.5, stability: 0.1 } as const;
const P_MAX = 1 / Math.min(DECAY_PROFILE.temporal, DECAY_PROFILE.stability);

function componentsAt(p: number, r: DiscreteComponents): TrustComponentsLike {
  return {
    temporal: Math.max(0, 1 - p * DECAY_PROFILE.temporal),
    stability: Math.max(0, 1 - p * DECAY_PROFILE.stability),
    spatial: r.spatial,
    fingerprint: r.fingerprint,
  };
}

/** [floor, ceiling] of composite scores a regime can produce. */
export function regimeRange(r: DiscreteComponents): [number, number] {
  return [aggregateTrust(componentsAt(P_MAX, r)).score, aggregateTrust(componentsAt(0, r)).score];
}

export function regimeFor(score: number): DiscreteComponents {
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
 * bisection on p (the composite is monotone in p). Below the lowest reachable
 * score (~0.036) it returns the floor; callers that need exactness check
 * aggregateTrust(result).score.
 */
export function solveComponents(score: number, regime: DiscreteComponents = regimeFor(score)): TrustComponentsLike {
  if (score >= 0.999) return { temporal: 1, stability: 1, spatial: 1, fingerprint: 1 };
  let lo = 0;
  let hi = P_MAX;
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
