// Fire-mission fixtures for Storybook — the same two calls for fire comms-sim
// publishes (services/comms-sim/src/comms_sim/missions.py), parsed through the
// real FireMissionSchema so contract drift fails the story build.

import { FireMissionSchema, type FireMission } from '@hamilton/contracts';
import type { MissionBranches, MissionState, TrackState } from '@/store/hamilton';
import { AVDIIVKA_BEATS, track, tracksRecord } from './avdiivka';

const bAt = (clockS: number) => AVDIIVKA_BEATS.find((b) => b.clockS === clockS)!.units.unit_b.score;

/** AB1001 — OBS B (FO) calls for M982 Excalibur at 1:12 (three seconds before B collapses). */
export const AB1001_AT_CLOCK_S = 72;
/** AB1002 — OBS C (RADAR), M795 HE at 0:30; never gated. */
export const AB1002_AT_CLOCK_S = 30;

export function ab1001(received_at = new Date().toISOString(), over: Partial<FireMission> = {}): FireMission {
  return FireMissionSchema.parse({
    mission_id: 'AB1001',
    observer: { source_id: 'unit_b', label: 'OBS B (FO)' },
    target: { grid: '37U DP 08604 33757', lat: 48.1505, lon: 37.7712, description: 'Mortar section in the open', class: 'hpt' },
    munition: { designation: 'M982', name: 'Excalibur', class: 'gps_guided' },
    firing_unit: { unit_id: 'unit_a', label: 'FU A' },
    dependencies: [
      { source_id: 'unit_b', role: 'observer_link' },
      { source_id: 'unit_b', role: 'target_location' },
      { source_id: 'unit_a', role: 'firing_unit_nav' },
    ],
    status: 'received',
    method_of_control: 'when_ready',
    received_at,
    ...over,
  } satisfies FireMission);
}

export function ab1002(received_at = new Date().toISOString(), over: Partial<FireMission> = {}): FireMission {
  return FireMissionSchema.parse({
    mission_id: 'AB1002',
    observer: { source_id: 'unit_c', label: 'OBS C (RADAR)' },
    target: { grid: '37U DP 08409 31815', lat: 48.133, lon: 37.769, description: 'Infantry in trenchline', class: 'standard' },
    munition: { designation: 'M795', name: 'HE', class: 'unguided' },
    firing_unit: { unit_id: 'unit_a', label: 'FU A' },
    dependencies: [
      { source_id: 'unit_c', role: 'observer_link' },
      { source_id: 'unit_c', role: 'target_location' },
      { source_id: 'unit_a', role: 'firing_unit_nav' },
    ],
    status: 'received',
    method_of_control: 'when_ready',
    received_at,
    ...over,
  } satisfies FireMission);
}

/** A third, laser-guided mission for the multi-mission story. */
export function ab1003(received_at = new Date().toISOString()): FireMission {
  return ab1001(received_at, {
    mission_id: 'AB1003',
    observer: { source_id: 'unit_a', label: 'OBS A (COLT)' },
    munition: { designation: 'M712', name: 'Copperhead', class: 'laser_guided' },
    target: { grid: '37U DP 07905 32824', lat: 48.142, lon: 37.762, description: 'Jammer site (NAI 3)', class: 'standard' },
    dependencies: [
      { source_id: 'unit_a', role: 'observer_link' },
      { source_id: 'unit_a', role: 'target_location' },
      { source_id: 'unit_c', role: 'firing_unit_nav' },
    ],
  });
}

/** Store entry for a mission; TSS is computed by the store on its first 1 Hz tick. */
export function missionState(mission: FireMission, branches: MissionBranches = {}): MissionState {
  return { mission, received: mission, branches, tss: null, hysteresis: {} };
}

export function missionsRecord(...list: MissionState[]): Record<string, MissionState> {
  return Object.fromEntries(list.map((m) => [m.mission.mission_id, m]));
}

/** Engine-beat scores for B (see AVDIIVKA_BEATS): C3 at 1:05, E5 at 1:15, plus a synthetic D4. */
export const B_SCORES = { c3: bAt(65), d4: 0.45, e5: bAt(75), b2: 1 } as const;

/** A, B, C stamped "now" (fresh reports). `ageS` back-dates individual sources. */
export function liveTracks(bScore: number, ageS: Partial<Record<'unit_a' | 'unit_b' | 'unit_c', number>> = {}): Record<string, TrackState> {
  const t = (s: number) => new Date(Date.now() - s * 1000).toISOString();
  return tracksRecord(
    track('unit_a', 1, { last_update: t(ageS.unit_a ?? 0) }),
    track('unit_b', bScore, { last_update: t(ageS.unit_b ?? 0) }),
    track('unit_c', 1, { last_update: t(ageS.unit_c ?? 0) }),
  );
}
