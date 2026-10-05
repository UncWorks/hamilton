'use client';

// Store → production track symbol (src/components/symbol) for the live COP
// spines. ONE list of map symbols — tracks and the FR-04a candidate sites —
// that CesiumSpine and MapSpine draw, declutter and explain identically.
// There is no jammer symbol: the jammer's position is never presumed (HS-20);
// the emitter estimate is an area graphic drawn by each spine (FR-06a).

import { useEffect, useMemo, useRef, useState } from 'react';
import type { FingerprintCandidate } from '@hamilton/contracts';
import { SPATIAL_RADIUS_M, STALE_AFTER_S, rateLinkTrust, type Corroboration, type JOverride } from '@/lib/link-trust-rating';
import { haversineM } from '@/lib/camera-fit';
import { SYMBOL_FUNCTIONS, symbolFunctionOf } from '@/lib/track-sidc';
import { affiliationRank } from '@/lib/declutter';
import { copNowMs, designationOf, functionOverrideOf, isStaleAt } from '@/lib/cop-symbols';
import { describeTrackSymbol, type ExplanationProps, type SymbolTrack } from '@/components/symbol';
import { useHamilton, type TrackState } from '@/store/hamilton';
import { UNIT_ROLES, methodName, methodShortName } from '@/lib/display-names';

export interface CandidateSite {
  lat: number;
  lon: number;
  /** T amplifier, e.g. "C1". */
  label: string;
  method_id?: string | undefined;
  /** FR-04a match strength (k/6). */
  score?: number | undefined;
}

/** S2 evaluation inputs per source (decision 3, J split). Absent = uncorroborated, no override. */
export type Evaluations = Readonly<Record<string, { corroboration?: Corroboration | undefined; jOverride?: JOverride | undefined }>>;

export interface SpineSymbolInputs {
  /** Geolocated FR-04a candidate sites, drawn as anticipated (status 1, dashed). Omit when there are none. */
  candidateSites?: readonly CandidateSite[] | undefined;
  evaluations?: Evaluations | undefined;
}

export interface SpineSymbol {
  id: string;
  kind: 'track' | 'candidate';
  lat: number;
  lon: number;
  track: SymbolTrack;
  /** Listing order in a stack (hostile first). */
  rank: number;
  /** Rating breakdown for the tooltip, trust-scored tracks only. */
  explain?: ((nowIso: string) => ExplanationProps) | undefined;
  /** Accessible name (describeTrackSymbol label). */
  label: string;
}

function titleOf(t: TrackState, track: SymbolTrack): string {
  return `${track.designation} · ${UNIT_ROLES[t.source_id] ?? SYMBOL_FUNCTIONS[symbolFunctionOf(track)].name}`;
}

/** A live track as the production symbol needs it. */
export function trackToSymbol(t: TrackState, stale: boolean, evaluation?: Evaluations[string]): SymbolTrack {
  return {
    affiliation: t.affiliation,
    sensorType: t.sensor_type,
    fn: functionOverrideOf(t.source_id),
    designation: designationOf(t.source_id),
    score: t.score,
    components: t.components,
    stale,
    corroboration: evaluation?.corroboration,
    jOverride: evaluation?.jOverride,
  };
}

function labelOf(track: SymbolTrack): string {
  return describeTrackSymbol(track, { sizePx: 32 }).label;
}

export function buildSpineSymbols(
  tracks: readonly TrackState[],
  opts: SpineSymbolInputs & { nowMs: number; candidates?: { source_id: string; items: FingerprintCandidate[] } | null | undefined },
): SpineSymbol[] {
  const out: SpineSymbol[] = [];
  for (const t of tracks) {
    const evaluation = opts.evaluations?.[t.source_id];
    const stale = isStaleAt(t.last_update, opts.nowMs, STALE_AFTER_S);
    const track = trackToSymbol(t, stale, evaluation);
    // FR-03 neighbours: same-side units within the engine's spatial radius (500 m). With the
    // km-scale layout there are none, and the tooltip says so instead of naming far units.
    const neighbours = tracks
      .filter(
        (o) =>
          o.source_id !== t.source_id &&
          o.affiliation === t.affiliation &&
          haversineM({ lat: t.lat, lon: t.lon }, { lat: o.lat, lon: o.lon }) <= SPATIAL_RADIUS_M,
      )
      .slice(0, 2)
      .map((o) => designationOf(o.source_id));
    const top = opts.candidates?.source_id === t.source_id ? opts.candidates.items[0] : undefined;
    out.push({
      id: t.source_id,
      kind: 'track',
      lat: t.lat,
      lon: t.lon,
      track,
      rank: affiliationRank(t.affiliation),
      label: labelOf(track),
      explain: (nowIso) => ({
        title: titleOf(t, track),
        components: t.components,
        payloadScore: t.score,
        lastGoodIso: t.last_update,
        nowIso,
        neighbours: neighbours.length ? neighbours.join(', ') : undefined,
        topCandidate: top,
        corroboration: evaluation?.corroboration,
        jOverride: evaluation?.jOverride,
      }),
    });
  }
  (opts.candidateSites ?? []).forEach((c, i) => {
    const score = c.score !== undefined ? c.score.toFixed(2) : undefined;
    const info = [c.method_id ? methodShortName(c.method_id) : undefined, score].filter(Boolean).join(' ') || undefined;
    const track: SymbolTrack = { affiliation: 'enemy', fn: 'ew-jamming', status: 'anticipated', designation: c.label, info };
    const full = [c.method_id ? methodName(c.method_id) : undefined, score ? `match ${score}` : undefined].filter(Boolean).join(' ') || undefined;
    out.push({ id: `__candidate_${i}`, kind: 'candidate', lat: c.lat, lon: c.lon, track, rank: affiliationRank('enemy') + 0.5, label: labelOf({ ...track, info: full }) });
  });
  return out;
}

/** Re-evaluates STALE once a second without re-rendering when nothing crossed the threshold. */
export function useSpineSymbols(inputs: SpineSymbolInputs): { symbols: SpineSymbol[]; tracks: TrackState[]; nowIso: () => string } {
  const tracksRec = useHamilton((s) => s.tracks);
  const candidates = useHamilton((s) => s.candidates);
  const tracks = useMemo(() => Object.values(tracksRec), [tracksRec]);
  const tracksRef = useRef(tracks);
  tracksRef.current = tracks;
  const nowMs = () => copNowMs(tracksRef.current.map((t) => t.last_update), Date.now());
  const staleKeyOf = () => {
    const n = nowMs();
    return tracksRef.current
      .filter((t) => isStaleAt(t.last_update, n, STALE_AFTER_S))
      .map((t) => t.source_id)
      .sort()
      .join(',');
  };
  const [staleKey, setStaleKey] = useState('');
  useEffect(() => {
    setStaleKey(staleKeyOf());
    const id = window.setInterval(() => setStaleKey(staleKeyOf()), 1000);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const { candidateSites, evaluations } = inputs;
  const symbols = useMemo(
    () => buildSpineSymbols(tracks, { nowMs: nowMs(), candidates, candidateSites, evaluations }),
    // staleKey: rebuild when a track crosses STALE_AFTER_S with no new data.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tracks, candidates, candidateSites, evaluations, staleKey],
  );
  return { symbols, tracks, nowIso: () => new Date(nowMs()).toISOString() };
}

/** J after corroboration / override / STALE — part of the billboard key. */
export function jCodeOf(track: SymbolTrack): string | undefined {
  if (track.score === undefined) return undefined;
  return rateLinkTrust(track.score, { stale: track.stale, corroboration: track.corroboration, override: track.jOverride }).jCode;
}
