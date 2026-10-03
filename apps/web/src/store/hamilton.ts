import { create } from 'zustand';
import type {
  Affiliation,
  FingerprintCandidate,
  FireMission,
  ModalOption,
  Munition,
  SensorType,
  TrustComponents,
  TrustScorePayload,
} from '@hamilton/contracts';
import {
  DEFAULT_TSS_TABLE,
  evaluateTss,
  type TssHysteresis,
  type TssResult,
  type TssSourceInput,
  type TssTable,
} from '@/lib/tss';
import { engineUrl } from '@/lib/engine-api';

export type LlmMode = 'claude' | 'local' | 'off';
export type LlmStatus = 'pending' | 'active' | 'fallback' | 'unreachable';

export interface TrackState {
  source_id: string;
  affiliation: Affiliation;
  sensor_type: SensorType;
  lat: number;
  lon: number;
  score: number;
  prev_score: number;
  components: TrustComponents;
  trace_bullets: string[];
  last_update: string;
}

// ---------------------------------------------------------------------------
// Fire missions + TSS (docs/plans/tss-mission-row.md). Replaces the old
// kill-chain modal: nothing here opens a dialog or moves focus.
// ---------------------------------------------------------------------------

/** Pre-planned branches (FM 1-02 p. 1-24), keys 1–4 on a focused mission row. */
export type TssBranchId = 'shift_munition' | 'confirm_alt' | 'at_my_command' | 'accept_risk';
export const BRANCH_KEYS: Record<TssBranchId, '1' | '2' | '3' | '4'> = {
  shift_munition: '1',
  confirm_alt: '2',
  at_my_command: '3',
  accept_risk: '4',
};

export type DeciderRole = 'FDC' | 'FSO' | 'CDR' | 'S6';

export interface Decider {
  role: DeciderRole;
  initials: string;
}

/** Substitute round for branch [1] — unguided, so not GPS-gated. */
export const SHIFT_MUNITION: Munition = { designation: 'M795', name: 'HE', class: 'unguided' };

/** Seconds before an AT MY COMMAND re-rate. */
export const AT_MY_COMMAND_S = 60;

export interface MissionBranches {
  shifted?: { from: Munition; at: string; by: Decider };
  confirmation?: { status: 'awaiting' | 'confirmed'; requested_at: string; confirmed_at?: string; via?: string };
  atMyCommand?: { started_at: string; until: string };
  riskAccepted?: { at: string; by: Decider; reason: string };
}

export interface MissionState {
  /** Mission as currently planned (after a branch [1] re-plan). */
  mission: FireMission;
  /** Mission as received in the call for fire. */
  received: FireMission;
  branches: MissionBranches;
  tss: TssResult | null;
  hysteresis: TssHysteresis;
}

export type DecisionKind = 'received' | 'tss' | 'branch' | 're_rate' | 'confirmation';

/** One FDC journal line — every branch choice, TSS verdict change and re-rate. */
export interface DecisionLogEntry {
  id: string;
  dtg: string;
  kind: DecisionKind;
  mission_id: string;
  branch?: TssBranchId;
  verdict: TssResult['verdict'] | null;
  /** Lead source J at the time, e.g. "E5". */
  j: string | null;
  report_age_s: number | null;
  role?: DeciderRole;
  initials?: string;
  reason?: string;
  message: string;
}

/** The operator at this seat (brand bar "FDC · ADAM"). */
export const OPERATOR: Decider = { role: 'FDC', initials: 'ADAM' };

interface HamiltonState {
  tracks: Record<string, TrackState>;
  candidates: { source_id: string; items: FingerprintCandidate[] } | null;
  selectedSource: string | null;
  llmMode: LlmMode;
  llmStatus: LlmStatus;
  tssTable: TssTable;
  missions: Record<string, MissionState>;
  selectedMission: string | null;
  decisionLog: DecisionLogEntry[];
  /** Any mission failed TSS this session — the brand-bar hairline (Branding §10.6). */
  tssFailedThisSession: boolean;
  upsertTrack: (track: TrackState) => void;
  applyScore: (payload: TrustScorePayload) => void;
  setCandidates: (source_id: string, items: FingerprintCandidate[]) => void;
  setTraceBullets: (source_id: string, bullets: string[]) => void;
  selectSource: (source_id: string | null) => void;
  setLlmMode: (mode: LlmMode) => void;
  setLlmStatus: (status: LlmStatus) => void;
  setTssTable: (table: TssTable) => void;
  upsertMission: (mission: FireMission) => void;
  removeMission: (mission_id: string) => void;
  selectMission: (mission_id: string | null) => void;
  /** Re-run TSS on every open mission (1 Hz ticker + after every change). */
  evaluateMissions: (now?: string) => void;
  chooseBranch: (
    mission_id: string,
    branch: TssBranchId,
    opts?: { by?: Decider; reason?: string },
  ) => DecisionLogEntry | null;
  /** S6 / observer confirmed the report via alternate means (credibility → 1). */
  receiveConfirmation: (mission_id: string, via: string) => void;
}

let logSeq = 0;
const nowIso = () => new Date().toISOString();

function logEntry(
  kind: DecisionKind,
  ms: MissionState,
  message: string,
  extra: Partial<DecisionLogEntry> = {},
  dtg = nowIso(),
): DecisionLogEntry {
  logSeq += 1;
  return {
    id: `${ms.mission.mission_id}-${dtg}-${logSeq}`,
    dtg,
    kind,
    mission_id: ms.mission.mission_id,
    verdict: ms.tss?.verdict ?? null,
    j: ms.tss?.lead.j ?? null,
    report_age_s: ms.tss?.lead.reportAgeS !== undefined && ms.tss.lead.reportAgeS !== null ? Math.round(ms.tss.lead.reportAgeS) : null,
    message,
    ...extra,
  };
}

/** Sources a confirmation via alternate means corroborates: the observer + target-location reports. */
function confirmedSources(ms: MissionState): Set<string> {
  if (ms.branches.confirmation?.status !== 'confirmed') return new Set();
  return new Set(
    ms.mission.dependencies.filter((d) => d.role !== 'firing_unit_nav').map((d) => d.source_id),
  );
}

function sourcesFor(tracks: Record<string, TrackState>, ms: MissionState): Record<string, TssSourceInput | undefined> {
  const confirmed = confirmedSources(ms);
  const out: Record<string, TssSourceInput | undefined> = {};
  for (const d of ms.mission.dependencies) {
    const t = tracks[d.source_id];
    out[d.source_id] = t
      ? { score: t.score, last_update: t.last_update, corroboration: confirmed.has(d.source_id) ? 'confirmed' : undefined }
      : undefined;
  }
  return out;
}

function evaluateOne(ms: MissionState, tracks: Record<string, TrackState>, table: TssTable, now: string): MissionState {
  const tss = evaluateTss({
    mission: ms.mission,
    sources: sourcesFor(tracks, ms),
    table,
    now,
    hysteresis: ms.hysteresis,
    riskAccepted: !!ms.branches.riskAccepted,
    atMyCommand: !!ms.branches.atMyCommand,
  });
  return { ...ms, tss, hysteresis: tss.hysteresis };
}

const ENGINE_OPTION: Partial<Record<TssBranchId, ModalOption>> = {
  shift_munition: 'shift_non_gps',
  confirm_alt: 'confirm_alt_channel',
  at_my_command: 'delay_60s',
};


/**
 * Persist a branch choice in the engine's after-action log. The engine's
 * existing POST /api/modal/selection takes {source_id, option, score} and
 * ignores extra fields, so the mission id rides in source_id
 * ("AB1001/unit_b"). Accept-risk has no engine option and stays web-side.
 * The full record (TSS result, J, report age, role/initials, DTG) is the web
 * journal entry; docs/plans/tss-mission-row.md lists the engine change.
 */
function postToEngine(entry: DecisionLogEntry, ms: MissionState): void {
  const option = entry.branch ? ENGINE_OPTION[entry.branch] : undefined;
  if (!option || typeof fetch === 'undefined') return;
  const lead = ms.tss?.lead;
  void fetch(engineUrl('modal/selection'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      source_id: `${entry.mission_id}/${lead?.source_id ?? ms.mission.observer.source_id}`,
      option,
      trust_score_at_selection: Math.min(1, Math.max(0, lead?.score ?? 0)),
      // Ignored by today's engine; kept for the planned /api/missions/{id}/decision.
      mission_id: entry.mission_id,
      tss_verdict: entry.verdict,
      j: entry.j,
      report_age_s: entry.report_age_s,
      role: entry.role,
      initials: entry.initials,
      dtg: entry.dtg,
    }),
  }).catch(() => {
    /* engine unreachable — the web journal still has the record */
  });
}

const tssLine = (tss: TssResult) =>
  `TSS ${tss.headline}${tss.recommended ? ` · rec. ${tss.recommended}` : ''}`;

export const useHamilton = create<HamiltonState>((set, get) => ({
  tracks: {},
  candidates: null,
  selectedSource: null,
  llmMode: 'claude',
  llmStatus: 'pending',
  tssTable: DEFAULT_TSS_TABLE,
  missions: {},
  selectedMission: null,
  decisionLog: [],
  tssFailedThisSession: false,

  upsertTrack: (track) =>
    set((state) => ({ tracks: { ...state.tracks, [track.source_id]: track } })),

  applyScore: (payload) =>
    set((state) => {
      const prev = state.tracks[payload.source_id];
      if (!prev) return state;
      const next: TrackState = {
        ...prev,
        prev_score: prev.score,
        score: payload.score,
        components: payload.components,
        // Engine echoes telemetry positions; seeds are only the fallback.
        lat: payload.lat ?? prev.lat,
        lon: payload.lon ?? prev.lon,
        last_update: payload.timestamp,
      };
      return { tracks: { ...state.tracks, [payload.source_id]: next } };
    }),

  setCandidates: (source_id, items) => set({ candidates: { source_id, items } }),

  setTraceBullets: (source_id, bullets) =>
    set((state) => {
      const prev = state.tracks[source_id];
      if (!prev) return state;
      return {
        tracks: {
          ...state.tracks,
          [source_id]: { ...prev, trace_bullets: bullets.slice(0, 3) },
        },
      };
    }),

  selectSource: (source_id) => set({ selectedSource: source_id }),
  setLlmMode: (mode) => set({ llmMode: mode }),
  setLlmStatus: (status) => set({ llmStatus: status }),

  setTssTable: (table) => {
    set({ tssTable: table });
    get().evaluateMissions();
  },

  upsertMission: (mission) => {
    const state = get();
    const prev = state.missions[mission.mission_id];
    const now = nowIso();
    let ms: MissionState;
    let fresh = false;
    if (!prev || prev.received.received_at !== mission.received_at) {
      ms = { mission, received: mission, branches: {}, tss: null, hysteresis: {} };
      fresh = true;
    } else {
      // Status update from the fires system: keep a branch [1] re-plan.
      ms = {
        ...prev,
        received: mission,
        mission: { ...mission, munition: prev.branches.shifted ? prev.mission.munition : mission.munition },
      };
    }
    ms = evaluateOne(ms, state.tracks, state.tssTable, now);
    const log: DecisionLogEntry[] = [];
    if (fresh && ms.tss) {
      log.push(
        logEntry(
          'received',
          ms,
          `${mission.observer.label} · ${mission.munition.designation} ${mission.munition.name} · ${mission.target.grid} · ${tssLine(ms.tss)}`,
          {},
          now,
        ),
      );
    }
    set((s) => ({
      missions: { ...s.missions, [mission.mission_id]: ms },
      decisionLog: [...s.decisionLog, ...log],
      tssFailedThisSession: s.tssFailedThisSession || ms.tss?.verdict === 'FAIL',
    }));
  },

  removeMission: (mission_id) =>
    set((s) => {
      if (!s.missions[mission_id]) return s;
      const { [mission_id]: _gone, ...rest } = s.missions;
      return { missions: rest, selectedMission: s.selectedMission === mission_id ? null : s.selectedMission };
    }),

  selectMission: (mission_id) => set({ selectedMission: mission_id }),

  evaluateMissions: (now = nowIso()) => {
    const state = get();
    if (!Object.keys(state.missions).length) return;
    const missions: Record<string, MissionState> = {};
    const log: DecisionLogEntry[] = [];
    let anyFail = false;
    for (const [id, prev] of Object.entries(state.missions)) {
      let ms = prev;
      // AT MY COMMAND timer ran out: re-rate, then fall back to the TSS recommendation.
      const amc = ms.branches.atMyCommand;
      let reRated = false;
      if (amc && Date.parse(amc.until) <= Date.parse(now)) {
        const { atMyCommand: _done, ...rest } = ms.branches;
        ms = { ...ms, branches: rest };
        reRated = true;
      }
      ms = evaluateOne(ms, state.tracks, state.tssTable, now);
      if (reRated && ms.tss) {
        log.push(logEntry('re_rate', ms, `AT MY COMMAND re-rate · ${tssLine(ms.tss)}`, {}, now));
      } else if (ms.tss && prev.tss && ms.tss.verdict !== prev.tss.verdict) {
        log.push(logEntry('tss', ms, `${prev.tss.verdict} → ${tssLine(ms.tss)}`, {}, now));
      }
      if (ms.tss?.verdict === 'FAIL') anyFail = true;
      missions[id] = ms;
    }
    set((s) => ({
      missions,
      decisionLog: log.length ? [...s.decisionLog, ...log] : s.decisionLog,
      tssFailedThisSession: s.tssFailedThisSession || anyFail,
    }));
  },

  chooseBranch: (mission_id, branch, opts = {}) => {
    const state = get();
    const ms = state.missions[mission_id];
    if (!ms?.tss) return null;
    const by = opts.by ?? OPERATOR;
    const now = nowIso();
    const branches: MissionBranches = { ...ms.branches };
    let mission = ms.mission;
    let text: string;
    switch (branch) {
      case 'shift_munition': {
        if (!ms.tss.gated) return null;
        branches.shifted = { from: ms.mission.munition, at: now, by };
        delete branches.atMyCommand;
        mission = { ...ms.mission, munition: SHIFT_MUNITION };
        text = `[1] shift ${ms.mission.munition.designation} → ${SHIFT_MUNITION.designation} ${SHIFT_MUNITION.name}, adjust fire`;
        break;
      }
      case 'confirm_alt':
        branches.confirmation = { status: 'awaiting', requested_at: now };
        text = '[2] confirm via alternate means requested (S6 / observer)';
        break;
      case 'at_my_command':
        branches.atMyCommand = {
          started_at: now,
          until: new Date(Date.parse(now) + AT_MY_COMMAND_S * 1000).toISOString(),
        };
        text = `[3] AT MY COMMAND — re-rate in ${AT_MY_COMMAND_S} s; guns may lay`;
        break;
      case 'accept_risk':
        if ((by.role !== 'FSO' && by.role !== 'CDR') || !by.initials.trim() || !opts.reason?.trim()) return null;
        if (ms.mission.target.class !== 'hpt') return null;
        branches.riskAccepted = { at: now, by, reason: opts.reason.trim() };
        text = `[4] risk accepted (HPT exception) — "${opts.reason.trim()}"`;
        break;
    }
    // Log against the TSS result the decider saw.
    const entry = logEntry('branch', ms, `${text} · at TSS ${ms.tss.verdict} ${ms.tss.lead.j}`, {
      branch,
      role: by.role,
      initials: by.initials.trim().toUpperCase(),
      ...(branch === 'accept_risk' && opts.reason ? { reason: opts.reason.trim() } : {}),
    }, now);
    const next = evaluateOne({ ...ms, mission, branches }, state.tracks, state.tssTable, now);
    set((s) => ({
      missions: { ...s.missions, [mission_id]: next },
      decisionLog: [...s.decisionLog, entry],
      selectedMission: mission_id,
    }));
    postToEngine(entry, ms);
    return entry;
  },

  receiveConfirmation: (mission_id, via) => {
    const state = get();
    const ms = state.missions[mission_id];
    if (!ms || ms.branches.confirmation?.status !== 'awaiting') return;
    const now = nowIso();
    const branches: MissionBranches = {
      ...ms.branches,
      confirmation: { ...ms.branches.confirmation, status: 'confirmed', confirmed_at: now, via },
    };
    const next = evaluateOne({ ...ms, branches }, state.tracks, state.tssTable, now);
    const entry = logEntry(
      'confirmation',
      next,
      `confirmed via ${via} · credibility → 1 · ${next.tss ? tssLine(next.tss) : ''}`,
      { role: 'S6', initials: 'S6' },
      now,
    );
    set((s) => ({
      missions: { ...s.missions, [mission_id]: next },
      decisionLog: [...s.decisionLog, entry],
    }));
  },
}));

/** Has any mission failed TSS this session? The brand-bar hairline binds to
 * this — once on, stays on (Branding §10.6 "Hamilton was on its feet"). */
export function useTssFailedThisSession(): boolean {
  return useHamilton((s) => s.tssFailedThisSession);
}

/** Open missions, oldest call for fire first. */
export function sortMissions(missions: Record<string, MissionState>): MissionState[] {
  return Object.values(missions).sort(
    (a, b) => Date.parse(a.received.received_at) - Date.parse(b.received.received_at),
  );
}
