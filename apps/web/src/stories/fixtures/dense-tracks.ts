// Dense COP fixture for the camera-fit / declutter stories (CesiumSpine and
// MapSpine "Dense"). Positions are synthetic: A/B/C at their scenario
// positions plus clusters that still overlap after the camera fit, so the
// FM 1-02 ¶5-8 stack shows (Decisions/Track Symbology decision 6: three or
// more symbols within 1.5·s):
//  - B + two friendlies → a stack of 3;
//  - a hostile / unknown knot on the jammer + the jammer fix J1 → 3 frames + "+1";
//  - a north-west trio → a stack of 3;
//  - a north-east PAIR → stays two singles (below the 3-symbol rule).

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
    // North-west trio.
    at('unk_emitter_4', 'unknown', 'detection', 48.145, 37.735, 0.2),
    at('fr_obs_5', 'friendly', 'recon_static', 48.14518, 37.73528, 1),
    at('fr_obs_7', 'friendly', 'recon_static', 48.14488, 37.73545, 0.66),
    // North-east pair, ~1.2 symbol sizes apart at the fit: not stacked.
    at('civ_relay_8', 'neutral', 'recon_mobile', 48.1472, 37.7735, 0.9),
    at('unk_emitter_9', 'unknown', 'detection', 48.1472, 37.7752, 0.55),
    // Well separated singles.
    at('civ_relay', 'neutral', 'recon_mobile', 48.1355, 37.752, 0.7),
    at('fr_fdc_6', 'friendly', 'offense', 48.1335, 37.7405, 1),
  ];
}
