// The C2-side view of the FR-04b emitter estimate (integrity/emitter/estimate,
// docs/plans/jammer-aoe.md W2 / W11 / W15 / W18): display state on the C2's
// own clock, the state-change log, and every operator-facing string (map
// label, card block, terminal line). Pure, so it runs under `node --test`
// with a fake clock — see emitter-estimate.test.ts.
//
// Clock rules (HS-25, FR-06a (3)):
// - an estimate is valid for (valid_until − computed_at) — 20 s, two missed
//   10 s heartbeats — after the C2 RECEIVED it; past that the C2 marks it
//   stale by itself, whatever the payload says;
// - when the payload's clock is within an hour of the C2's (live), age and
//   valid_until are also judged on the payload's own times; a recorded run or
//   a fixture (years old) is judged from its receipt only (cf. copNowMs);
// - retire = an EMPTY retained payload: the estimate is cleared and the
//   retirement logged.
//
// Wording rules (§0.5, HS-22, HS-25): a stale or retired estimate reads
// "Last est. HHMMZ" / "retired — evidence stopped", NEVER "clear", "GPS clear"
// or "window open"; unmodelled classes read "not assessed", never "denied".

import type { EmitterEstimatePayload, FireMission } from '@hamilton/contracts';
import { contourLevelAt, contourOf, layerOf, type ContourLevel } from './aoe.ts';
import { designationOf } from './cop-symbols.ts';
import { methodClassName, unitName } from './display-names.ts';

export interface EstimateEntry {
  payload: EmitterEstimatePayload;
  /** C2 wall-clock time the payload arrived (ms). */
  receivedAtMs: number;
}

export type AoeDisplayState = 'active' | 'stale' | 'unbounded';

/** Fallback validity if a payload's valid_until ≤ computed_at (contract: computed_at + 20 s). */
export const DEFAULT_VALIDITY_MS = 20_000;
/** Payload clock this far from the C2's = a replay / fixture: judge from receipt only. */
export const ESTIMATE_CLOCK_SKEW_MS = 60 * 60 * 1000;

export function validityMs(p: EmitterEstimatePayload): number {
  const v = Date.parse(p.valid_until) - Date.parse(p.computed_at);
  return Number.isFinite(v) && v > 0 ? v : DEFAULT_VALIDITY_MS;
}

/** Payload clock and C2 clock agree (live run). */
export function clocksAligned(p: EmitterEstimatePayload, nowMs: number): boolean {
  const t = Date.parse(p.computed_at);
  return Number.isFinite(t) && Math.abs(nowMs - t) <= ESTIMATE_CLOCK_SKEW_MS;
}

/** No refresh within the heartbeat window, on the C2's own clock. */
export function isC2Stale(e: EstimateEntry, nowMs: number): boolean {
  if (nowMs > e.receivedAtMs + validityMs(e.payload)) return true;
  return clocksAligned(e.payload, nowMs) && nowMs > Date.parse(e.payload.valid_until);
}

/** What the COP shows: null = nothing (no estimate, or retired). */
export function displayStateAt(e: EstimateEntry | null | undefined, nowMs: number): AoeDisplayState | null {
  if (!e) return null;
  const s = e.payload.state;
  if (s === 'retired') return null;
  if (s === 'stale' || isC2Stale(e, nowMs)) return 'stale';
  return s;
}

/** Estimate age (s) as the operator sees it. */
export function estimateAgeS(e: EstimateEntry, nowMs: number): number {
  const from = clocksAligned(e.payload, nowMs) ? Date.parse(e.payload.computed_at) : e.receivedAtMs;
  return Math.max(0, Math.floor((nowMs - from) / 1000));
}

/**
 * A C2 moment on the payload's clock, so web lines sort with the engine's log:
 * the wall clock when aligned, else computed_at + time since receipt.
 */
export function payloadClockIso(e: EstimateEntry, nowMs: number): string {
  if (clocksAligned(e.payload, nowMs)) return new Date(nowMs).toISOString();
  return new Date(Date.parse(e.payload.computed_at) + Math.max(0, nowMs - e.receivedAtMs)).toISOString();
}

/** "2024-02-15T18:42:36Z" → "1842Z" (the HS-25 "Last est. HHMMZ"). */
export function hhmmz(iso: string): string {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getUTCHours())}${p(d.getUTCMinutes())}Z`;
}

// ---------------------------------------------------------------------------
// State changes (store + terminal)
// ---------------------------------------------------------------------------

export type EstimateLogKind = 'opened' | 'unbounded' | 'stale' | 'retired';

/** One terminal line per state change; null when the state did not change. */
export function transitionKind(prev: AoeDisplayState | null, next: AoeDisplayState | null): EstimateLogKind | null {
  if (prev === next) return null;
  if (next === null) return prev === null ? null : 'retired';
  if (next === 'active') return 'opened';
  return next;
}

export interface EstimateSlice {
  entry: EstimateEntry | null;
  /** Last state logged (what the COP shows). */
  state: AoeDisplayState | null;
}

export interface EstimateStep extends EstimateSlice {
  /** A state change to log, with the entry it describes (the last one on retire). */
  log: { kind: EstimateLogKind; atMs: number; entry: EstimateEntry } | null;
}

export type EstimateAction =
  | { type: 'receive'; payload: EmitterEstimatePayload; nowMs: number }
  | { type: 'clear'; nowMs: number }
  | { type: 'tick'; nowMs: number };

/** The store's estimate reducer: receive / empty-payload clear / 1 Hz tick. */
export function reduceEstimate(prev: EstimateSlice, a: EstimateAction): EstimateStep {
  if (a.type === 'clear') {
    const kind = transitionKind(prev.state, null);
    return { entry: null, state: null, log: kind && prev.entry ? { kind, atMs: a.nowMs, entry: prev.entry } : null };
  }
  const entry = a.type === 'receive' ? { payload: a.payload, receivedAtMs: a.nowMs } : prev.entry;
  if (!entry) return { entry: null, state: null, log: null };
  const state = displayStateAt(entry, a.nowMs);
  if (state === null) {
    // A payload with state 'retired' (the contract retires by empty payload, but be safe).
    const kind = transitionKind(prev.state, null);
    return { entry: null, state: null, log: kind ? { kind, atMs: a.nowMs, entry } : null };
  }
  const kind = transitionKind(prev.state, state);
  return { entry, state, log: kind ? { kind, atMs: a.nowMs, entry } : null };
}

// ---------------------------------------------------------------------------
// Who is inside (HS-22)
// ---------------------------------------------------------------------------

export interface PointLike {
  source_id: string;
  lat: number;
  lon: number;
}

export interface InsideItem {
  source_id: string;
  /** "OBS B (AB1001 observer)", "FU A (AB1001 firing unit)", "Unit D". */
  label: string;
  /** "OBS B", "FU A", "Unit D" (terminal). */
  short: string;
  rx_class: 'gnss_civil' | 'gnss_mil';
  level: ContourLevel;
  /** A dependency of an open GPS-guided mission. */
  gpsDependent: boolean;
}

const stripParen = (label: string) => label.replace(/\s*\(.*\)\s*$/, '').trim();

/** Receiver class of a unit = the class its evidence carries (newest report); civil when it has none. */
export function rxClassOf(p: EmitterEstimatePayload, sourceId: string): 'gnss_civil' | 'gnss_mil' {
  const own = p.evidence.filter((e) => e.source_id === sourceId).sort((a, b) => a.age_s - b.age_s)[0];
  return own?.rx_class === 'gnss_mil' || own?.rx_class === 'gnss_mil_crpa' ? 'gnss_mil' : 'gnss_civil';
}

function missionLabel(sourceId: string, missions: readonly FireMission[]): { label: string; short: string } {
  for (const m of missions) {
    if (m.observer.source_id === sourceId) {
      const s = stripParen(m.observer.label);
      return { label: `${s} (${m.mission_id} observer)`, short: s };
    }
  }
  for (const m of missions) {
    if (m.firing_unit.unit_id === sourceId) {
      const s = stripParen(m.firing_unit.label);
      return { label: `${s} (${m.mission_id} firing unit)`, short: s };
    }
  }
  const s = unitName(sourceId);
  return { label: s, short: s };
}

/**
 * Units inside the estimate, per their receiver class: civil first, then
 * military (DAGR); within a class GPS-dependent (mission dependencies of a
 * GPS-guided round) first, then 90% before 50%, then by name.
 */
export function insideList(p: EmitterEstimatePayload, units: readonly PointLike[], missions: readonly FireMission[]): InsideItem[] {
  const gpsDeps = new Set(missions.filter((m) => m.munition.class === 'gps_guided').flatMap((m) => m.dependencies.map((d) => d.source_id)));
  const out: InsideItem[] = [];
  for (const u of units) {
    const rx = rxClassOf(p, u.source_id);
    const level = contourLevelAt(p, rx, u);
    if (!level) continue;
    out.push({ source_id: u.source_id, ...missionLabel(u.source_id, missions), rx_class: rx, level, gpsDependent: gpsDeps.has(u.source_id) });
  }
  const rank = (i: InsideItem) => [i.rx_class === 'gnss_civil' ? 0 : 1, i.gpsDependent ? 0 : 1, i.level === 0.9 ? 0 : 1] as const;
  return out.sort((a, b) => {
    const ra = rank(a);
    const rb = rank(b);
    for (let k = 0; k < 3; k++) if (ra[k] !== rb[k]) return ra[k]! - rb[k]!;
    return a.label.localeCompare(b.label);
  });
}

// ---------------------------------------------------------------------------
// Strings
// ---------------------------------------------------------------------------

const pct = (l: ContourLevel) => `${Math.round(l * 100)}%`;
const km2 = (v: number) => `~${Math.round(v)} km²`;

export function evidenceCounts(p: EmitterEstimatePayload): { degraded: number; healthy: number } {
  const degraded = p.evidence.filter((e) => e.state === 'degraded').length;
  return { degraded, healthy: p.evidence.length - degraded };
}

/** The civil layer has no geometry (every reporting unit degraded). */
export function edgeNotObserved(p: EmitterEstimatePayload): boolean {
  const civil = layerOf(p, 'gnss_civil');
  return p.state === 'unbounded' || !civil || (!contourOf(civil, 0.9) && !contourOf(civil, 0.5));
}

/**
 * Map label (HS-21): `Est. GPS denial · <method>-class · 90% · <age> · <n> degraded / <m> healthy`;
 * stale: `Last est. HHMMZ · GPS denial · <method>-class · outline only`. Null when nothing is drawn.
 */
export function mapLabel(e: EstimateEntry, state: AoeDisplayState, nowMs: number): string | null {
  const p = e.payload;
  const cls = methodClassName(p.method_id);
  if (state === 'unbounded' || edgeNotObserved(p)) return null;
  if (state === 'stale') return `Last est. ${hhmmz(p.computed_at)} · GPS denial · ${cls} · outline only`;
  const civil = layerOf(p, 'gnss_civil');
  const level = contourOf(civil, 0.9) ? '90%' : '50%';
  const { degraded, healthy } = evidenceCounts(p);
  return `Est. GPS denial · ${cls} · ${level} · ${estimateAgeS(e, nowMs)} s ago · ${degraded} degraded / ${healthy} healthy`;
}

export interface CardEvidence {
  key: string;
  designation: string;
  state: 'degraded' | 'healthy';
  age_s: number;
  /** "✕ B 4s" / "○ A 1s". */
  text: string;
}

export interface AoeCardModel {
  state: AoeDisplayState;
  title: string;
  evidence: CardEvidence[];
  /** Ordered lines, each with a stable key for tests. */
  lines: { key: 'civil' | 'mil' | 'inside' | 'inside-mil' | 'emitter' | 'uhf' | 'inflight'; text: string }[];
}

/** The "Area of effect" block of the top candidate card (plan W15). */
export function aoeCard(e: EstimateEntry, state: AoeDisplayState, nowMs: number, units: readonly PointLike[], missions: readonly FireMission[]): AoeCardModel {
  const p = e.payload;
  const unbounded = state === 'unbounded' || edgeNotObserved(p);
  const last = `Last est. ${hhmmz(p.computed_at)}`;
  const title =
    state === 'stale'
      ? `Area of effect · ${last}`
      : unbounded
        ? 'Area of effect · edge not observed'
        : `Area of effect · est. ${hhmmz(p.computed_at)} · ${estimateAgeS(e, nowMs)} s ago`;

  const evidence: CardEvidence[] = [...p.evidence]
    .sort((a, b) => (a.state === b.state ? designationOf(a.source_id).localeCompare(designationOf(b.source_id)) || a.age_s - b.age_s : a.state === 'degraded' ? -1 : 1))
    .map((x, i) => {
      const d = designationOf(x.source_id);
      const ageS = Math.round(x.age_s);
      return { key: `${x.source_id}-${i}`, designation: d, state: x.state, age_s: ageS, text: `${x.state === 'degraded' ? '✕' : '○'} ${d} ${ageS}s` };
    });

  const lines: AoeCardModel['lines'] = [];
  const layerLine = (rx: 'gnss_civil' | 'gnss_mil', name: string) => {
    const l = layerOf(p, rx);
    const c90 = contourOf(l, 0.9);
    const c50 = contourOf(l, 0.5);
    if (!c90 && !c50) return `${name}: edge not observed — every reporting unit degraded`;
    return `${name}: 90% ${c90 ? km2(c90.area_km2) : 'none'} · 50% ${c50 ? km2(c50.area_km2) : 'none'}`;
  };
  lines.push({ key: 'civil', text: layerLine('gnss_civil', 'Civil GPS') });
  lines.push({ key: 'mil', text: layerLine('gnss_mil', 'Military GPS (DAGR)') });

  if (!unbounded) {
    const inside = insideList(p, units, missions);
    const fmt = (xs: InsideItem[]) => xs.map((x) => `${x.label} — ${pct(x.level)}`).join(' · ');
    const civil = inside.filter((x) => x.rx_class === 'gnss_civil');
    const mil = inside.filter((x) => x.rx_class === 'gnss_mil');
    const head = state === 'stale' ? `Inside at last est. ${hhmmz(p.computed_at)}` : 'Inside';
    lines.push({ key: 'inside', text: civil.length ? `${head}: ${fmt(civil)}` : `${head}: no civil-GPS unit` });
    if (mil.length) lines.push({ key: 'inside-mil', text: `${head} (DAGR): ${fmt(mil)}` });
  }

  lines.push({
    key: 'emitter',
    text: p.emitter.area90_km2 > 0 && p.emitter.region90.coordinates.length > 0
      ? `Emitter not located (90% region ${km2(p.emitter.area90_km2)})`
      : 'Emitter not located (region unbounded)',
  });
  lines.push({ key: 'uhf', text: 'UHF links: not assessed — ground GNSS only' });
  const rounds = [...new Set(missions.filter((m) => m.munition.class === 'gps_guided').map((m) => m.munition.designation))];
  lines.push({
    key: 'inflight',
    text: rounds.length
      ? rounds.map((r) => `${r} in flight: not assessed — ground receivers only`).join(' · ')
      : 'GPS-guided rounds in flight: not assessed — ground receivers only',
  });

  return { state: unbounded && state !== 'stale' ? 'unbounded' : state, title, evidence, lines };
}

/** After-action terminal line (HS-24), one per state change. */
export function terminalLine(kind: EstimateLogKind, e: EstimateEntry, units: readonly PointLike[], missions: readonly FireMission[]): string {
  const p = e.payload;
  const cls = methodClassName(p.method_id);
  switch (kind) {
    case 'opened': {
      const first = insideList(p, units, missions).find((x) => x.rx_class === 'gnss_civil');
      return `Est. GPS denial opened · ${cls} · ${first ? `${first.short} inside (${pct(first.level)})` : 'no civil-GPS unit inside'}`;
    }
    case 'unbounded':
      return `Est. GPS denial · ${cls} · edge not observed — every reporting unit degraded`;
    case 'stale':
      return `Est. GPS denial · ${cls} · stale — last est. ${hhmmz(p.computed_at)}`;
    case 'retired':
      return `Est. GPS denial · ${cls} · retired — evidence stopped · last est. ${hhmmz(p.computed_at)}`;
  }
}
