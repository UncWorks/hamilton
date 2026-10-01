// Avdiivka scenario fixtures for Storybook.
//
// Every payload here is parsed through the real @hamilton/contracts zod
// schemas at module load, so a contract change that breaks a fixture fails
// the story build instead of silently rendering stale shapes.

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

/** Scenario epoch — the 1:20 gating beat lands at 18:42:41Z. */
export const T0 = '2024-02-15T18:42:00.000Z';
export const at = (seconds: number): string =>
  new Date(Date.parse(T0) + seconds * 1000).toISOString();

export const JAMMER_LOCATION = { lat: 48.142, lon: 37.762 } as const;

export const ROE_FLOOR = 0.6;

/** Representative score per trust band (Branding §3.3). */
export const BAND_SAMPLES = {
  nominal: 0.97,
  watching: 0.72,
  degraded: 0.42,
  failed: 0.18,
} as const;

/** Band edges, inclusive at the top — used for edge-case stories. */
export const BAND_EDGES = [1.0, 0.85, 0.849, 0.6, 0.599, 0.3, 0.299, 0.0] as const;

const healthy: TrustComponents = { temporal: 1, stability: 1, spatial: 1, fingerprint: 1 };

function componentsFor(score: number): TrustComponents {
  // Plausible decomposition — temporal + stability lead the decay.
  return {
    temporal: Math.max(0, Math.min(1, score - 0.08)),
    stability: Math.max(0, Math.min(1, score - 0.04)),
    spatial: Math.max(0, Math.min(1, score + 0.06)),
    fingerprint: Math.max(0, Math.min(1, score + 0.02)),
  };
}

/** Verbatim trace bullets from Branding §10.1–§10.3. */
export const TRACE_BULLETS = [
  'B-link cadence degraded 18s ago — investigating.',
  'B-link: 14% corrupted frames, 6.2s gap.',
  "Degradation directional, vicinity B's flank corridor. Neighbors A, C unaffected.",
] as const;

export function track(
  source_id: 'unit_a' | 'unit_b' | 'unit_c',
  score: number,
  overrides: Partial<TrackState> = {},
): TrackState {
  const base: Record<typeof source_id, Pick<TrackState, 'sensor_type' | 'lat' | 'lon'>> = {
    unit_a: { sensor_type: 'recon_static', lat: 48.1422, lon: 37.745 },
    unit_b: { sensor_type: 'offense', lat: 48.14, lon: 37.745 },
    unit_c: { sensor_type: 'detection', lat: 48.1378, lon: 37.745 },
  };
  return {
    source_id,
    affiliation: 'friendly',
    ...base[source_id],
    score,
    prev_score: overrides.prev_score ?? score,
    components: score >= 0.999 ? healthy : componentsFor(score),
    trace_bullets: [],
    last_update: at(0),
    ...overrides,
  };
}

export function tracksRecord(...list: TrackState[]): Record<string, TrackState> {
  return Object.fromEntries(list.map((t) => [t.source_id, t]));
}

/** Scenario phases — Unit B decays while A and C hold. */
export const PHASE_TRACKS = {
  /** 0:00 — three healthy units. */
  nominal: tracksRecord(track('unit_a', 1.0), track('unit_b', 1.0), track('unit_c', 1.0)),
  /** 0:45 — first signal; B enters `watching`. */
  watching: tracksRecord(
    track('unit_a', 0.98),
    track('unit_b', 0.72, { prev_score: 0.86, trace_bullets: [TRACE_BULLETS[0]], last_update: at(14) }),
    track('unit_c', 0.97),
  ),
  /** 1:15 — candidate reveal; B below ROE floor. */
  degraded: tracksRecord(
    track('unit_a', 0.96),
    track('unit_b', 0.42, { prev_score: 0.61, trace_bullets: [...TRACE_BULLETS], last_update: at(39) }),
    track('unit_c', 0.95),
  ),
  /** 1:50 — B failed; icon at ~30% opacity. */
  failed: tracksRecord(
    track('unit_a', 0.96),
    track('unit_b', 0.18, { prev_score: 0.42, trace_bullets: [...TRACE_BULLETS], last_update: at(68) }),
    track('unit_c', 0.95),
  ),
  /** 2:15 — recovered. */
  recovered: tracksRecord(
    track('unit_a', 1.0),
    track('unit_b', 1.0, { prev_score: 0.18, trace_bullets: ['B-link recovered — cadence 1.0s, CRC 0.1%.'], last_update: at(95) }),
    track('unit_c', 1.0),
  ),
} as const;

/** Mixed-affiliation track list for icon/halo coverage. */
export const AFFILIATION_TRACKS: TrackState[] = [
  track('unit_a', 0.97),
  { ...track('unit_b', 0.42), source_id: 'hostile_ew_1', affiliation: 'enemy', sensor_type: 'defense', lat: 48.142, lon: 37.762 },
  { ...track('unit_c', 0.72), source_id: 'civ_relay', affiliation: 'neutral', sensor_type: 'recon_mobile', lat: 48.1355, lon: 37.752 },
  { ...track('unit_c', 0.18), source_id: 'unk_emitter', affiliation: 'unknown', sensor_type: 'detection', lat: 48.145, lon: 37.735 },
];

// ---------------------------------------------------------------------------
// FR-04a fingerprint candidates (Branding §10.4 verbatim)
// ---------------------------------------------------------------------------

export const CANDIDATES_PAYLOAD: FingerprintCandidatesPayload = FingerprintCandidatesPayloadSchema.parse({
  source_id: 'unit_b',
  timestamp: at(34),
  candidates: [
    {
      method_id: 'ground_based_gps_uhf_barrage',
      named_systems: ['R-330Zh Zhitel', 'Pole-21'],
      score: 0.81,
      munitions_affected: ['Excalibur', 'JDAM-ER', 'Switchblade 300'],
      source_citation: 'Bronk, Watling & Reynolds — RUSI, "Stormbreak", 2024',
    },
    {
      method_id: 'cellular_uhf_barrage',
      named_systems: ['Leer-3', 'RB-341V'],
      score: 0.42,
      munitions_affected: ['ATAK position-share', 'FPV C2 link'],
      source_citation: 'JAPCC, "Electronic Warfare in Ukraine", 2023',
    },
    {
      method_id: 'swept_uhf_low_power',
      named_systems: ['Shipovnik-Aero'],
      score: 0.18,
      munitions_affected: [],
      source_citation: 'Washington Post, "Russian jamming blunts U.S. weapons", 2024',
    },
  ],
} satisfies FingerprintCandidatesPayload);

export const CANDIDATES: FingerprintCandidate[] = CANDIDATES_PAYLOAD.candidates;

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
    score: 0.88,
    munitions_affected: ['Excalibur', 'JDAM-ER', 'Switchblade 300', 'GMLRS', 'HIMARS M30A1', 'Phoenix Ghost'],
    source_citation:
      'Bronk, Watling & Reynolds — RUSI Special Report, "Stormbreak: Fighting Through Russian Defences in Ukraine\'s 2023 Offensive", Sept 2023, pp. 14–19',
  },
  CANDIDATES[1]!,
  CANDIDATES[2]!,
];

// ---------------------------------------------------------------------------
// Trust score payloads (B decay timeline)
// ---------------------------------------------------------------------------

export const B_DECAY_SCORES = [1.0, 0.97, 0.91, 0.86, 0.79, 0.72, 0.66, 0.61, 0.55, 0.48, 0.42, 0.33, 0.26, 0.18] as const;

export const B_DECAY_PAYLOADS: TrustScorePayload[] = B_DECAY_SCORES.map((score, i) =>
  TrustScorePayloadSchema.parse({
    source_id: 'unit_b',
    score,
    components: score >= 0.999 ? healthy : componentsFor(score),
    timestamp: at(i * 3),
  } satisfies TrustScorePayload),
);

// ---------------------------------------------------------------------------
// Event terminal — after-action log lines (chronological)
// ---------------------------------------------------------------------------

const RAW_EVENTS: DetectionEvent[] = [
  { source_id: 'unit_b', kind: 'temporal_anomaly', message: 'cadence 1.0s → 6.1s', timestamp: '2024-02-15T18:42:14.000Z' },
  { source_id: 'unit_b', kind: 'stability', message: 'CRC 0.2% → 14%', timestamp: '2024-02-15T18:42:22.000Z' },
  { source_id: 'unit_b', kind: 'spatial', message: 'directional · flank corridor · A, C unaffected', timestamp: '2024-02-15T18:42:30.000Z' },
  { source_id: 'unit_b', kind: 'fingerprint', message: 'ground_based_gps_uhf_barrage 0.81 · cellular_uhf_barrage 0.42 · swept_uhf_low_power 0.18', timestamp: '2024-02-15T18:42:36.000Z' },
  { source_id: 'unit_b', kind: 'modal_gated', message: 'trust 0.42 < ROE floor 0.60 — kill-chain gated', timestamp: '2024-02-15T18:42:41.000Z' },
  { source_id: 'unit_b', kind: 'modal_selection', message: 'FDC · Adam selected shift_non_gps', timestamp: '2024-02-15T18:43:10.000Z' },
  { source_id: 'unit_b', kind: 'recovery', message: 'trust 0.18 → 1.00 · cadence 1.0s', timestamp: '2024-02-15T18:43:35.000Z' },
];

export const TERMINAL_EVENTS: DetectionEvent[] = RAW_EVENTS.map((e) => DetectionEventSchema.parse(e));

/** Engine returns newest-first; EventTerminal reverses for display. */
export const TERMINAL_EVENTS_API: DetectionEvent[] = [...TERMINAL_EVENTS].reverse();

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

export const GATE_OPEN: GateEvent = {
  source_id: 'unit_b',
  triggered_at: at(41),
  score_at_trigger: 0.42,
  selected_option: null,
};

export const GATE_RESOLVED: GateEvent = { ...GATE_OPEN, selected_option: 'shift_non_gps' };
