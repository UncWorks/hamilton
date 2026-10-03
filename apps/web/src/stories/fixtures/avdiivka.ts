// Avdiivka scenario fixtures for Storybook.
//
// Every payload here is parsed through the real @hamilton/contracts zod
// schemas at module load, so a contract change that breaks a fixture fails
// the story build instead of silently rendering stale shapes.
//
// Scores and components are what the FIXED trust engine emits — PR #1
// (fix/fingerprint-trust-inversion @ 6733817): the per-beat table
// AVDIIVKA_BEATS in src/lib/link-trust-rating.ts mirrors the Rust end-to-end
// test `avdiivka_beats_end_to_end` (services/trust-engine/crates/aggregator/src/lib.rs)
// on the comms-sim telemetry of scenarios/avdiivka.py, and
// link-trust-rating.test.ts pins it to that test's values. The stories assume
// PR #1 is merged.

import {
  DetectionEventSchema,
  FingerprintCandidatesPayloadSchema,
  TrustScorePayloadSchema,
  type DetectionEvent,
  type FingerprintCandidate,
  type FingerprintCandidatesPayload,
  type TrustComponents,
  type TrustScorePayload,
} from '@hamilton/contracts';
import type { GateEvent, TrackState } from '@/store/hamilton';
import {
  AVDIIVKA_BEATS,
  AVDIIVKA_POSITIONS,
  beatAt,
  solveComponents,
  type AvdiivkaUnit,
  type EngineBeat,
  type UnitTelemetry,
} from '@/lib/link-trust-rating';

export { AVDIIVKA_BEATS, beatAt };

/** Scenario epoch — the 1:20 gating beat lands at 18:42:41Z. */
export const T0 = '2024-02-15T18:42:00.000Z';
export const at = (seconds: number): string =>
  new Date(Date.parse(T0) + seconds * 1000).toISOString();

/** Scenario clock (s) − T0 offset: clock 1:20 (80 s) = T0 + 41 s. */
export const CLOCK_TO_T0_S = 39;
/** ISO time of a scenario-clock second, e.g. clockIso(75) = 1:15 = 18:42:36Z. */
export const clockIso = (clockS: number): string => at(clockS - CLOCK_TO_T0_S);

export const JAMMER_LOCATION = { lat: 48.142, lon: 37.762 } as const;

export const ROE_FLOOR = 0.6;

const beatOf = (clockS: number): EngineBeat => {
  const b = AVDIIVKA_BEATS.find((x) => x.clockS === clockS);
  if (!b) throw new Error(`no engine beat at ${clockS}s`);
  return b;
};
const bAt = (clockS: number) => beatOf(clockS).units.unit_b;

/**
 * Representative score per trust band (Branding §3.3). Real engine beats where
 * the demo timeline has one (Unit B, avdiivka_beats_end_to_end):
 * - nominal  1.00 — 0:00, every component 1.0.
 * - watching 0.70 — 0:45: cadence 1.0 s → 1.17 s (3.4σ) → temporal 0.52, spatial
 *   localized 0.6, stability and fingerprint 1.0 → 0.7024.
 * - failed   0.13 — 1:15: 6.1 s gap → temporal 0, CRC 14 % → stability 0.308,
 *   localized 0.6, jammer 6/6 → fingerprint 0 → 0.1274 (first crossing below 0.60).
 * - degraded 0.45 — SYNTHETIC. The demo timeline never sits in 0.30–0.60 (B goes
 *   0.65 → 0.13 in one beat). Engine-reachable: the 0:45 cadence (temporal 0.52),
 *   localized, no RF match, CRC climbed to ~15.4 % (stability 0.234). Solved by
 *   solveComponents; not an engine beat.
 */
export const BAND_SAMPLES = {
  nominal: bAt(0).score,
  watching: bAt(45).score,
  degraded: 0.45,
  failed: bAt(75).score,
} as const;

/** Where each band sample comes from — shown next to the rating stories. */
export const BAND_SAMPLE_SOURCE: Record<keyof typeof BAND_SAMPLES, string> = {
  nominal: 'engine beat 0:00 (Unit B)',
  watching: 'engine beat 0:45 (Unit B)',
  degraded: 'synthetic — not in the demo timeline',
  failed: 'engine beat 1:15 (Unit B)',
};

/** Band edges, inclusive at the top — used for edge-case stories. */
export const BAND_EDGES = [1.0, 0.85, 0.849, 0.6, 0.599, 0.3, 0.299, 0.0] as const;

const healthy: TrustComponents = { temporal: 1, stability: 1, spatial: 1, fingerprint: 1 };

/** Unit B's engine beat whose score is exactly `score`, if any. */
function bBeatFor(score: number): EngineBeat | undefined {
  return AVDIIVKA_BEATS.find((b) => Math.abs(b.units.unit_b.score - score) < 1e-12);
}

/**
 * Component decomposition that REPRODUCES `score` exactly through the real
 * aggregator formula (aggregator/src/lib.rs, mirrored by aggregateTrust).
 * For an engine beat score it returns that beat's components; otherwise it
 * solves along the engine's degradation path with engine-reachable values only
 * (fingerprint 1 − k/6, spatial Nominal 1 / Localized 0.6 / Blanket 0.3). See
 * solveComponents in src/lib/link-trust-rating.ts (unit-tested).
 */
export function componentsFor(score: number): TrustComponents {
  if (score >= 0.999) return healthy;
  const beat = bBeatFor(score);
  return beat ? { ...beat.units.unit_b.components } : solveComponents(score);
}

/** Raw comms-sim telemetry behind an engine-beat score (for exact evidence strings). */
export function telemetryFor(score: number): UnitTelemetry | undefined {
  return bBeatFor(score)?.telemetry.unit_b;
}

/** Verbatim trace bullets from Branding §10.1–§10.3 (0:45, 0:55, 1:05). */
export const TRACE_BULLETS = [
  'B-link cadence degraded 18s ago — investigating.',
  'B-link: 6% corrupted frames, cadence 1.17s.',
  "Degradation directional, vicinity B's flank corridor. Neighbors A, C unaffected.",
] as const;

const SENSOR: Record<AvdiivkaUnit, TrackState['sensor_type']> = {
  unit_a: 'recon_static',
  unit_b: 'offense',
  unit_c: 'detection',
};

export function track(
  source_id: AvdiivkaUnit,
  score: number,
  overrides: Partial<TrackState> = {},
): TrackState {
  return {
    source_id,
    affiliation: 'friendly',
    sensor_type: SENSOR[source_id],
    ...AVDIIVKA_POSITIONS[source_id],
    score,
    prev_score: overrides.prev_score ?? score,
    components: componentsFor(score),
    trace_bullets: [],
    last_update: at(0),
    ...overrides,
  };
}

/** A unit exactly as the engine scores it at a beat (components from the beat table). */
export function beatTrack(source_id: AvdiivkaUnit, clockS: number, overrides: Partial<TrackState> = {}): TrackState {
  const out = beatOf(clockS).units[source_id];
  return track(source_id, out.score, {
    components: { ...out.components },
    last_update: clockIso(clockS),
    ...overrides,
  });
}

export function tracksRecord(...list: TrackState[]): Record<string, TrackState> {
  return Object.fromEntries(list.map((t) => [t.source_id, t]));
}

const beatTracks = (clockS: number, prevClockS: number | null, bullets: readonly string[]) =>
  tracksRecord(
    beatTrack('unit_a', clockS),
    beatTrack('unit_b', clockS, {
      prev_score: prevClockS === null ? bAt(clockS).score : bAt(prevClockS).score,
      trace_bullets: [...bullets],
    }),
    beatTrack('unit_c', clockS),
  );

/**
 * Scenario phases — engine beats. Unit B ramps while A and C hold at 1.00.
 * Keys are scenario phases, not bands: `degraded` is the 1:15 crossing, where
 * the engine puts B straight into the failed band (0.13).
 */
export const PHASE_TRACKS = {
  /** 0:00 — three healthy units, all 1.00. */
  nominal: beatTracks(0, null, []),
  /** 0:45 — first signal; B WATCH 0.70 (cadence 1.17 s). */
  watching: beatTracks(45, 0, [TRACE_BULLETS[0]]),
  /** 1:05 — spatial discrimination; B WATCH 0.65 (CRC 6 %), localized, A and C 1.00. */
  localized: beatTracks(65, 45, TRACE_BULLETS),
  /** 1:15 — jammer at full power + candidate reveal; B 0.65 → 0.13, first crossing below the ROE floor. */
  degraded: beatTracks(75, 65, TRACE_BULLETS),
  /** 1:50 — recovery initiates; B 0.22, still gated. */
  failed: beatTracks(110, 75, TRACE_BULLETS),
  /** 2:15 — recovered; B 1.00. */
  recovered: tracksRecord(
    beatTrack('unit_a', 135),
    beatTrack('unit_b', 135, { prev_score: bAt(110).score, trace_bullets: ['B-link recovered — cadence 1.0s, CRC 0.2%.'] }),
    beatTrack('unit_c', 135),
  ),
} as const;

/**
 * Symbol-function overrides for fixture sources whose contract `sensor_type`
 * cannot express what they are. hostile_ew_1 is an EW jamming emitter
 * (FM 1-02 / MCRP 5-12A Table 5-3 p 5-18; 2525B SHGPUUMSEJ), but SensorType has
 * no EW value, so its "defense" would draw a hostile air-defense dome.
 * Symbology stories must consult this before mapping sensor_type to an icon.
 */
export const SYMBOL_FUNCTION_OVERRIDES: Record<string, 'ew-jamming'> = {
  hostile_ew_1: 'ew-jamming',
};

/** Mixed-affiliation track list for icon/halo coverage. */
export const AFFILIATION_TRACKS: TrackState[] = [
  track('unit_a', BAND_SAMPLES.nominal),
  { ...track('unit_b', BAND_SAMPLES.degraded), source_id: 'hostile_ew_1', affiliation: 'enemy', sensor_type: 'defense', lat: 48.142, lon: 37.762 },
  { ...track('unit_c', BAND_SAMPLES.watching), source_id: 'civ_relay', affiliation: 'neutral', sensor_type: 'recon_mobile', lat: 48.1355, lon: 37.752 },
  { ...track('unit_c', BAND_SAMPLES.failed), source_id: 'unk_emitter', affiliation: 'unknown', sensor_type: 'detection', lat: 48.145, lon: 37.735 },
];

// ---------------------------------------------------------------------------
// FR-04a fingerprint candidates — what the engine publishes for the Avdiivka
// jammer RF (100–2000 MHz, 50 kHz hop, L1+L2, barrage, 30 km). `score` on the
// candidates topic is MATCH STRENGTH k/6 (not trust). Entry fields are copied
// verbatim from assets/fingerprints/library.json.
// ---------------------------------------------------------------------------

export const CANDIDATES_PAYLOAD: FingerprintCandidatesPayload = FingerprintCandidatesPayloadSchema.parse({
  source_id: 'unit_b',
  timestamp: clockIso(75), // 1:15 — published with the jammer RF match
  candidates: [
    {
      method_id: 'ground_based_gps_uhf_barrage',
      named_systems: ['R-330Zh Zhitel', 'Pole-21'],
      score: 6 / 6, // 1.00
      munitions_affected: ['Excalibur', 'JDAM-ER', 'Switchblade 300', 'GMLRS-U'],
      source_citation: 'Bronk RUSI 2024',
    },
    {
      method_id: 'pulsed_uhf_wide',
      named_systems: ['Lorandit'],
      score: 3 / 6, // 0.50
      munitions_affected: ['FPV C2 link', 'Switchblade 300'],
      source_citation: 'JAPCC 2023',
    },
    {
      method_id: 'cellular_uhf_barrage',
      named_systems: ['R-934B Sinitsa'],
      score: 1 / 6, // 0.17
      munitions_affected: ['ATAK position-share', 'FPV C2 link'],
      source_citation: 'JAPCC 2023',
    },
  ],
} satisfies FingerprintCandidatesPayload);

export const CANDIDATES: FingerprintCandidate[] = CANDIDATES_PAYLOAD.candidates;

/**
 * Library entry with no munitions in inventory (library.json swept_uhf_low_power).
 * It scores 0/6 against the Avdiivka jammer, so the 3/6 here is a hypothetical
 * RF observation used only to exercise the "(none in current inventory)" path.
 */
export const CANDIDATE_NO_MUNITIONS: FingerprintCandidate = {
  method_id: 'swept_uhf_low_power',
  named_systems: ['Krasukha-2'],
  score: 3 / 6,
  munitions_affected: [],
  source_citation: 'WaPo 2024',
};

/** Only one meaningful match; trailing slots are the "no further match" filler. */
export const CANDIDATES_SINGLE_MATCH: FingerprintCandidate[] = [
  CANDIDATES[0]!,
  { method_id: '', named_systems: [], score: 0, munitions_affected: [], source_citation: '—' },
  { method_id: '', named_systems: [], score: 0, munitions_affected: [], source_citation: '—' },
];

/** Long strings — wrap / overflow stress test. */
export const CANDIDATES_LONG: FingerprintCandidate[] = [
  {
    method_id: 'ground_based_gps_uhf_barrage_with_meaconing_and_l2_overlap_variant',
    named_systems: ['R-330Zh Zhitel', 'Pole-21', 'Tirada-2', 'Krasukha-4', 'Murmansk-BN'],
    score: 5 / 6, // 0.83 — a reachable k/6 match strength
    munitions_affected: ['Excalibur', 'JDAM-ER', 'Switchblade 300', 'GMLRS', 'HIMARS M30A1', 'Phoenix Ghost'],
    source_citation:
      'Bronk, Watling & Reynolds — RUSI Special Report, "Stormbreak: Fighting Through Russian Defences in Ukraine\'s 2023 Offensive", Sept 2023, pp. 14–19',
  },
  CANDIDATES[1]!,
  CANDIDATES[2]!,
];

// ---------------------------------------------------------------------------
// Trust score payloads (engine beats)
// ---------------------------------------------------------------------------

/**
 * `integrity/trust/{source}` payload as PR #1 publishes it: the engine echoes
 * the telemetry position as optional `lat`/`lon`. This branch's
 * @hamilton/contracts does not have those fields yet (and its non-strict zod
 * object would strip them), so they are mirrored here and re-attached after
 * parsing. Drop this type once PR #1's contracts land.
 */
export type PositionedTrustScorePayload = TrustScorePayload & { lat?: number; lon?: number };

export function beatPayload(source_id: AvdiivkaUnit, clockS: number, timestamp = clockIso(clockS)): PositionedTrustScorePayload {
  const out = beatOf(clockS).units[source_id];
  const parsed = TrustScorePayloadSchema.parse({
    source_id,
    score: out.score,
    components: { ...out.components },
    timestamp,
  } satisfies TrustScorePayload);
  return { ...parsed, ...AVDIIVKA_POSITIONS[source_id] };
}

/** Unit B at every engine beat (0:00 … 2:15). */
export const B_BEAT_PAYLOADS: PositionedTrustScorePayload[] = AVDIIVKA_BEATS.map((b) => beatPayload('unit_b', b.clockS));

export interface CrescendoStep {
  clockS: number;
  payloads: PositionedTrustScorePayload[];
  /** Cumulative trace bullets narrated for B at this beat (Branding §10.1–§10.3). */
  bullets: number;
  /** FR-04a candidates published at this beat (the jammer RF match). */
  candidates: boolean;
}

/**
 * The 0:00 → 1:20 crescendo, one step per engine beat: A, B, C payloads, the
 * narration bullets due by then and the candidate reveal at 1:15. B is WATCH
 * from 0:45 to 1:05 and first crosses the ROE floor at 1:15 (0.65 → 0.13).
 */
export const CRESCENDO_STEPS: CrescendoStep[] = [
  { clockS: 0, bullets: 0 },
  { clockS: 45, bullets: 1 },
  { clockS: 55, bullets: 2 },
  { clockS: 65, bullets: 3 },
  { clockS: 75, bullets: 3 },
  { clockS: 80, bullets: 3 },
].map(({ clockS, bullets }) => ({
  clockS,
  bullets,
  candidates: clockS === 75,
  payloads: (['unit_a', 'unit_b', 'unit_c'] as const).map((u) => beatPayload(u, clockS)),
}));

// ---------------------------------------------------------------------------
// Event terminal — after-action log lines (chronological)
// ---------------------------------------------------------------------------

const f2 = (n: number) => n.toFixed(2);

/**
 * Illustrative log lines in the Branding §7.2 style, timed and valued from the
 * engine beats. (The engine itself emits no temporal_anomaly DetectionEvent —
 * docs/plans/fix-spatial-trust-and-gate-timing.md, known follow-ups.)
 */
const RAW_EVENTS: DetectionEvent[] = [
  { source_id: 'unit_b', kind: 'temporal_anomaly', message: 'cadence 1.0s → 1.17s (3.4σ)', timestamp: clockIso(45) },
  { source_id: 'unit_b', kind: 'stability', message: 'CRC 0.2% → 6%', timestamp: clockIso(55) },
  { source_id: 'unit_b', kind: 'spatial', message: 'localized · flank corridor · A, C unaffected', timestamp: clockIso(65) },
  { source_id: 'unit_b', kind: 'temporal_anomaly', message: 'cadence 1.17s → 6.1s', timestamp: clockIso(75) },
  { source_id: 'unit_b', kind: 'stability', message: 'CRC 6% → 14%', timestamp: clockIso(75) },
  { source_id: 'unit_b', kind: 'fingerprint', message: 'ground_based_gps_uhf_barrage 1.00 · pulsed_uhf_wide 0.50 · cellular_uhf_barrage 0.17', timestamp: clockIso(75) },
  { source_id: 'unit_b', kind: 'modal_gated', message: `trust ${f2(bAt(65).score)} → ${f2(bAt(80).score)} < ROE floor 0.60 (crossed 1:15) — kill-chain gated`, timestamp: clockIso(80) },
  { source_id: 'unit_b', kind: 'modal_selection', message: 'FDC · Adam selected shift_non_gps', timestamp: clockIso(110) },
  { source_id: 'unit_b', kind: 'recovery', message: `trust ${f2(bAt(110).score)} → ${f2(bAt(135).score)} · cadence 1.0s`, timestamp: clockIso(135) },
];

export const TERMINAL_EVENTS: DetectionEvent[] = RAW_EVENTS.map((e) => DetectionEventSchema.parse(e));

/** Engine returns newest-first; EventTerminal reverses for display. */
export const TERMINAL_EVENTS_API: DetectionEvent[] = [...TERMINAL_EVENTS].reverse();

/** Newest-first log as of a scenario clock (inclusive). */
export const terminalEventsUntil = (clockS: number): DetectionEvent[] =>
  TERMINAL_EVENTS_API.filter((e) => Date.parse(e.timestamp) <= Date.parse(clockIso(clockS)));

/**
 * Log rows for the crescendo replay `elapsedMs` into it, in step with the MQTT
 * mock (CRESCENDO_STEPS[i] is published at (i + 1) · tickMs).
 */
export function crescendoEventsAt(tickMs: number): (elapsedMs: number) => DetectionEvent[] {
  return (elapsedMs) => {
    const i = Math.floor(elapsedMs / tickMs) - 1;
    if (i < 0) return [];
    return terminalEventsUntil(CRESCENDO_STEPS[Math.min(i, CRESCENDO_STEPS.length - 1)]!.clockS);
  };
}

/** 80 rows (MAX_ROWS) of A/C heartbeat noise + B anomalies — scroll stress test. */
export const TERMINAL_EVENTS_FULL: DetectionEvent[] = Array.from({ length: 80 }, (_, i) => {
  const unit = (['unit_a', 'unit_b', 'unit_c'] as const)[i % 3]!;
  const kind = unit === 'unit_b' ? (['temporal_anomaly', 'stability', 'spatial', 'fingerprint'] as const)[i % 4]! : 'recovery';
  return DetectionEventSchema.parse({
    source_id: unit,
    kind,
    message: unit === 'unit_b' ? `cadence 1.0s → ${(1 + i * 0.07).toFixed(1)}s` : 'heartbeat nominal',
    timestamp: at(i),
  });
}).reverse();

// ---------------------------------------------------------------------------
// Kill-chain gate history
// ---------------------------------------------------------------------------

/** 1:20 — the modal beat. B first crossed the floor at 1:15 and is still 0.13. */
export const GATE_OPEN: GateEvent = {
  source_id: 'unit_b',
  triggered_at: clockIso(80),
  score_at_trigger: bAt(80).score,
  selected_option: null,
};

export const GATE_RESOLVED: GateEvent = { ...GATE_OPEN, selected_option: 'shift_non_gps' };
