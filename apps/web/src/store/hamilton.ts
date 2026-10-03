import { create } from 'zustand';
import type {
  Affiliation,
  FingerprintCandidate,
  ModalOption,
  SensorType,
  TrustComponents,
  TrustScorePayload,
} from '@hamilton/contracts';

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

export interface GateEvent {
  source_id: string;
  triggered_at: string;
  score_at_trigger: number;
  selected_option: ModalOption | null;
}

interface HamiltonState {
  tracks: Record<string, TrackState>;
  candidates: { source_id: string; items: FingerprintCandidate[] } | null;
  selectedSource: string | null;
  gateActive: boolean;
  gateHistory: GateEvent[];
  llmMode: LlmMode;
  llmStatus: LlmStatus;
  roeFloor: number;
  upsertTrack: (track: TrackState) => void;
  applyScore: (payload: TrustScorePayload) => void;
  setCandidates: (source_id: string, items: FingerprintCandidate[]) => void;
  setTraceBullets: (source_id: string, bullets: string[]) => void;
  selectSource: (source_id: string | null) => void;
  openGate: (source_id: string, score: number) => void;
  closeGate: (option: ModalOption) => void;
  setLlmMode: (mode: LlmMode) => void;
  setLlmStatus: (status: LlmStatus) => void;
}

const DEFAULT_ROE_FLOOR =
  typeof process !== 'undefined' &&
  typeof process.env?.NEXT_PUBLIC_ROE_FLOOR === 'string'
    ? Number(process.env.NEXT_PUBLIC_ROE_FLOOR)
    : 0.6;

export const useHamilton = create<HamiltonState>((set, get) => ({
  tracks: {},
  candidates: null,
  selectedSource: null,
  gateActive: false,
  gateHistory: [],
  llmMode: 'claude',
  llmStatus: 'pending',
  roeFloor: Number.isFinite(DEFAULT_ROE_FLOOR) ? DEFAULT_ROE_FLOOR : 0.6,

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
      const tracks = { ...state.tracks, [payload.source_id]: next };
      const shouldGate =
        payload.score < state.roeFloor &&
        prev.score >= state.roeFloor &&
        !state.gateActive;
      if (shouldGate) {
        return {
          tracks,
          gateActive: true,
          gateHistory: [
            ...state.gateHistory,
            {
              source_id: payload.source_id,
              triggered_at: payload.timestamp,
              score_at_trigger: payload.score,
              selected_option: null,
            },
          ],
        };
      }
      return { tracks };
    }),

  setCandidates: (source_id, items) =>
    set({ candidates: { source_id, items } }),

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

  openGate: (source_id, score) =>
    set((state) => ({
      gateActive: true,
      gateHistory: [
        ...state.gateHistory,
        {
          source_id,
          triggered_at: new Date().toISOString(),
          score_at_trigger: score,
          selected_option: null,
        },
      ],
    })),

  closeGate: (option) =>
    set((state) => {
      const last = state.gateHistory.at(-1);
      if (!last) return { gateActive: false };
      const updated = { ...last, selected_option: option };
      return {
        gateActive: false,
        gateHistory: [...state.gateHistory.slice(0, -1), updated],
      };
    }),

  setLlmMode: (mode) => set({ llmMode: mode }),
  setLlmStatus: (status) => set({ llmStatus: status }),
}));

/** Has a kill-chain event ever fired this session?
 * The brand-bar hairline rule binds to this — once on, stays on
 * (Branding §10.6 "Hamilton was on its feet"). */
export function useGateHasFired(): boolean {
  return useHamilton((s) => s.gateHistory.length > 0);
}
