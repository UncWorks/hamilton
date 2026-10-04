// Operator-facing names for identifiers that travel on the wire in snake_case:
// source ids ("unit_b"), sensor types ("recon_static"), jammer method ids
// ("ground_based_gps_uhf_barrage") and the engine's after-action log kinds.
// The ids stay in the data (payloads, CoT export, the log store); only what is
// rendered goes through here.
//
// Dependency-free (type-only imports) so it runs under `node --test`.

import type { SensorType } from '@hamilton/contracts';

// ---------------------------------------------------------------------------
// Units
// ---------------------------------------------------------------------------

const UNIT_LETTERS: Readonly<Record<string, string>> = { unit_a: 'A', unit_b: 'B', unit_c: 'C' };

/** Role of each scenario unit, as the COP tooltip titles them. */
export const UNIT_ROLES: Readonly<Record<string, string>> = {
  unit_a: 'FA observer team (COLT/FIST)',
  unit_b: 'FA battery',
  unit_c: 'FA target-acq radar platoon',
};

const ACRONYMS = new Set(['ew', 'gps', 'uhf', 'fa', 'fo', 'fu', 'hpt', 'tgt', 'obs', 'colt', 'fist']);

/** "unit_b" → "B" style words: snake/kebab → "Title words", known acronyms upper-cased. */
export function humanize(id: string): string {
  return id
    .split(/[_\-\s]+/)
    .filter(Boolean)
    .map((w, i) => (ACRONYMS.has(w.toLowerCase()) ? w.toUpperCase() : i === 0 ? w[0]!.toUpperCase() + w.slice(1).toLowerCase() : w.toLowerCase()))
    .join(' ');
}

/** "unit_b" → "Unit B"; "hostile_ew_1" → "Hostile EW 1". */
export function unitName(sourceId: string): string {
  const letter = UNIT_LETTERS[sourceId.toLowerCase()];
  return letter ? `Unit ${letter}` : humanize(sourceId);
}

// ---------------------------------------------------------------------------
// Sensor types
// ---------------------------------------------------------------------------

export const SENSOR_TYPE_LABEL: Readonly<Record<SensorType, string>> = {
  offense: 'Field artillery',
  recon_static: 'Recon (static)',
  recon_mobile: 'Recon (mobile)',
  detection: 'Target acquisition radar',
  defense: 'Air defense',
};

export function sensorTypeLabel(t: string): string {
  return SENSOR_TYPE_LABEL[t as SensorType] ?? humanize(t);
}

// ---------------------------------------------------------------------------
// Jammer methods (assets/fingerprints/library.json method_id)
// ---------------------------------------------------------------------------

export const JAMMER_METHODS: Readonly<Record<string, { name: string; short: string }>> = {
  ground_based_gps_uhf_barrage: { name: 'Ground-based GPS/UHF barrage', short: 'GPS/UHF barrage' },
  cellular_uhf_barrage: { name: 'Cellular/UHF barrage', short: 'Cell/UHF barrage' },
  swept_uhf_low_power: { name: 'Swept UHF, low power', short: 'Swept UHF' },
  directional_gps_l1_spot: { name: 'Directional GPS L1 spot', short: 'GPS L1 spot' },
  pulsed_uhf_wide: { name: 'Pulsed wideband UHF', short: 'Pulsed UHF' },
};

/** "ground_based_gps_uhf_barrage" → "Ground-based GPS/UHF barrage". Unknown ids are humanized. */
export function methodName(methodId: string): string {
  return JAMMER_METHODS[methodId]?.name ?? humanize(methodId);
}

/** Compact form for the map H amplifier: "GPS/UHF barrage". */
export function methodShortName(methodId: string): string {
  return JAMMER_METHODS[methodId]?.short ?? humanize(methodId);
}

// ---------------------------------------------------------------------------
// After-action log (engine DetectionEvent → terminal line)
// ---------------------------------------------------------------------------

/** Display labels for the engine's log kinds (the wire enum is the engine's). */
export const ENGINE_KIND_LABEL: Readonly<Record<string, string>> = {
  temporal_anomaly: 'timing',
  stability: 'link errors',
  spatial: 'neighbours',
  fingerprint: 'jammer match',
  modal_gated: 'TSS fail',
  modal_selection: 'branch',
  recovery: 'recovery',
};

/** Engine branch options (POST /api/modal/selection) in FDC words. */
const ENGINE_OPTION_LABEL: Readonly<Record<string, string>> = {
  delay_60s: 'AT MY COMMAND (60 s re-rate)',
  shift_non_gps: 'shift to a non-GPS round',
  confirm_alt_channel: 'confirm via alt channel',
};

export interface EngineEventLike {
  source_id: string;
  kind: string;
  message: string;
}

/** "unit_b" → "Unit B", "AB1001/unit_b" → "FM AB1001 · Unit B". */
export function eventWho(sourceId: string): string {
  const [mission, unit] = sourceId.split('/');
  if (unit && mission) return `FM ${mission} · ${unitName(unit)}`;
  return unitName(sourceId);
}

/**
 * Engine log message in operator words: drops the redundant "unit_b: " prefix
 * (the line already names the unit), names jammer methods, unit ids and branch
 * options, and says "frame errors" for CRC.
 */
export function eventMessage(e: EngineEventLike): string {
  let m = e.message;
  const unit = e.source_id.split('/').pop() ?? e.source_id;
  if (m.startsWith(`${unit}: `)) m = m.slice(unit.length + 2);
  m = m.replace(/^operator selected \(([a-z0-9_]+)\) at score ([0-9.]+)$/, (_, opt: string, score: string) => `FDC chose: ${ENGINE_OPTION_LABEL[opt] ?? humanize(opt)} · link trust ${score}`);
  m = m.replace(/^candidate ([a-z0-9_]+) \(top match\)$/, (_, id: string) => `Top match: ${methodName(id)}`);
  m = m.replace(/\bCRC\b/g, 'frame errors');
  for (const id of Object.keys(JAMMER_METHODS)) m = m.split(id).join(methodName(id));
  m = m.replace(/\bunit_([a-z])\b/gi, (_, l: string) => `Unit ${l.toUpperCase()}`);
  return m.charAt(0).toUpperCase() + m.slice(1);
}

export function eventKind(kind: string): string {
  return ENGINE_KIND_LABEL[kind] ?? humanize(kind).toLowerCase();
}
