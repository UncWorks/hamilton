// Dense COP fixture for the camera-fit / declutter stories (CesiumSpine and
// MapSpine "Dense"). Positions are synthetic: A/B/C at their scenario
// positions plus three tight clusters that still overlap after the camera
// fit — a friendly pair on Unit B, a hostile/unknown knot on the jammer, and
// an unknown + friendly pair north-west — so the FM 1-02 ¶5-8 stack shows.

import type { TrackState } from '@/store/hamilton';

type Base = (id: 'unit_a' | 'unit_b' | 'unit_c', score: number, o?: Partial<TrackState>) => TrackState;

/** Build the dense set from the story fixtures' `track()` factory. */
export function denseTracks(track: Base): TrackState[] {
  const at = (
    source_id: string,
    affiliation: TrackState['affiliation'],
    sensor_type: TrackState['sensor_type'],
    lat: number,
    lon: number,
    score: number,
  ): TrackState => ({ ...track('unit_c', score), source_id, affiliation, sensor_type, lat, lon });
  return [
    track('unit_a', 1),
    track('unit_b', 0.7024),
    track('unit_c', 1),
    // ~15–25 m off Unit B — never separable at an AO-wide fit.
    at('fr_squad_2', 'friendly', 'recon_mobile', 48.14015, 37.74522, 0.95),
    at('fr_squad_3', 'friendly', 'detection', 48.13988, 37.74528, 0.88),
    // On the jammer (48.142, 37.762): hostile EW + AD, unknown emitter.
    at('hostile_ew_1', 'enemy', 'defense', 48.142, 37.762, 0.45),
    at('hostile_ad_2', 'enemy', 'defense', 48.14225, 37.76235, 0.62),
    at('unk_emitter_3', 'unknown', 'detection', 48.14178, 37.76195, 0.3),
    // North-west pair.
    at('unk_emitter_4', 'unknown', 'detection', 48.145, 37.735, 0.2),
    at('fr_obs_5', 'friendly', 'recon_static', 48.14518, 37.73528, 1),
    // Well separated singles.
    at('civ_relay', 'neutral', 'recon_mobile', 48.1355, 37.752, 0.7),
    at('fr_fdc_6', 'friendly', 'offense', 48.1335, 37.7405, 1),
  ];
}
