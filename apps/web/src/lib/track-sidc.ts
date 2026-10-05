// Track symbol codes — ONE table from a Hamilton track to its symbol function,
// the MIL-STD-2525E numeric SIDC (stored), the 2525B/C letter SIDC and the
// Cursor-on-Target type (exported to ATAK).
//
// Decision (Storybook Decisions/Track Symbology, decision 4): draw to
// FM 1-02 / MCRP 5-12A (2004); store 2525E numeric SIDCs; export 2525B/C letter
// SIDCs plus CoT. Mapping: glance-symbology-research.md §2.1, every code checked
// with milsymbol 3.0.4 isValid() on the At-a-Glance bench.
//
// Deliberately dependency-free (type-only imports) so it runs under
// `node --test` with native type stripping.

import type { Affiliation, SensorType } from '@hamilton/contracts';

// ---------------------------------------------------------------------------
// SIDC assembly
// ---------------------------------------------------------------------------

export interface SidcParts {
  /** 10 = 2525D, 13 = 2525E (milsymbol numbersidc/metadata.js). */
  version?: string | undefined;
  /** Context: 0 reality, 1 exercise, 2 simulation. */
  context?: string | undefined;
  /** Standard identity 2: 1 unknown, 3 friend, 4 neutral, 6 hostile. */
  identity: string;
  /** Symbol set: 10 land unit. */
  symbolSet?: string | undefined;
  /** Status: 0 present, 1 planned/anticipated. */
  status?: string | undefined;
  hqTfDummy?: string | undefined;
  /** Echelon / mobility, 2 digits (11 team, 14 platoon, 15 battery). */
  echelon?: string | undefined;
  /** 6-digit entity / type / subtype. */
  entity: string;
  modifier1?: string | undefined;
  modifier2?: string | undefined;
}

/** MIL-STD-2525E 20-digit numeric SIDC (milsymbol: version 13 = edition E). */
export function buildSidc(p: SidcParts): string {
  const s =
    (p.version ?? '13') +
    (p.context ?? '0') +
    p.identity +
    (p.symbolSet ?? '10') +
    (p.status ?? '0') +
    (p.hqTfDummy ?? '0') +
    (p.echelon ?? '00') +
    p.entity +
    (p.modifier1 ?? '00') +
    (p.modifier2 ?? '00');
  if (!/^\d{20}$/.test(s)) throw new Error(`SIDC must be 20 digits, got "${s}" (${s.length})`);
  return s;
}

/** "13 0 3 10 0 0 00 130300 00 00" — field-separated for reading in tables. */
export function formatSidc(sidc: string): string {
  return [sidc.slice(0, 2), sidc[2], sidc[3], sidc.slice(4, 6), sidc[6], sidc[7], sidc.slice(8, 10), sidc.slice(10, 16), sidc.slice(16, 18), sidc.slice(18, 20)].join(' ');
}

/**
 * MIL-STD-2525B/C 15-character letter SIDC, the code set FM 1-02 / MCRP 5-12A
 * (2004) aligns with: S · affiliation (F/H/N/U) · dimension (G) · status
 * (P present / A anticipated) · 6-char function · HQ/TF/feint · echelon letter
 * (A team … D platoon, E company/battery) · 2-char country · order of battle.
 */
export function buildLetterSidc(p: { affiliation: 'F' | 'H' | 'N' | 'U'; fn: string; status?: 'P' | 'A'; echelon?: string }): string {
  const s = `S${p.affiliation}G${p.status ?? 'P'}${p.fn}-${p.echelon ?? '-'}---`;
  if (!/^S[FHNU]G[PA][A-Z-]{6}-[A-Z-]---$/.test(s)) throw new Error(`bad 2525B SIDC "${s}"`);
  return s;
}

// ---------------------------------------------------------------------------
// Symbol functions (research §2.1)
// ---------------------------------------------------------------------------

export type FrameKind = 'friend' | 'hostile' | 'neutral' | 'unknown';
export type Echelon = 'team' | 'platoon' | 'battery';
export type SymbolFunction = 'fa' | 'recon-static' | 'recon-mobile' | 'ta-radar' | 'air-defense' | 'ew-jamming';
export type SymbolStatus = 'present' | 'anticipated';

export const AFFILIATION_FRAME: Readonly<Record<Affiliation, FrameKind>> = {
  friendly: 'friend',
  enemy: 'hostile',
  neutral: 'neutral',
  unknown: 'unknown',
};

export const FRAME_AFFILIATION: Readonly<Record<FrameKind, Affiliation>> = {
  friend: 'friendly',
  hostile: 'enemy',
  neutral: 'neutral',
  unknown: 'unknown',
};

/** Contract sensor type → doctrinal function. EW has no SensorType; use `fn: 'ew-jamming'`. */
export const SENSOR_FUNCTION: Readonly<Record<SensorType, SymbolFunction>> = {
  offense: 'fa',
  recon_static: 'recon-static',
  recon_mobile: 'recon-mobile',
  detection: 'ta-radar',
  defense: 'air-defense',
};

export interface FunctionCode {
  name: string;
  /** FM 1-02 / MCRP 5-12A page. */
  cite: string;
  /** 2525E land-unit entity + sector modifiers. */
  e: { entity: string; m1?: string; m2?: string };
  eNote?: string;
  /** 2525B/C 6-character function code (positions 5–10). */
  b: string;
  /** Default echelon when the track does not carry one (fixture assumption). */
  echelon: Echelon | undefined;
}

export const SYMBOL_FUNCTIONS: Readonly<Record<SymbolFunction, FunctionCode>> = {
  fa: { name: 'Field artillery (cannonball)', cite: 'Table 5-3, p 5-11', e: { entity: '130300' }, b: 'UCF---', echelon: 'battery' },
  'recon-static': {
    name: 'Reconnaissance (COLT/FIST), dismounted',
    cite: 'Table 5-3, p 5-13',
    e: { entity: '130400' },
    eNote: '2525E 130400 = FA observer (different icon: triangle).',
    b: 'UCFTCD',
    echelon: 'team',
  },
  'recon-mobile': { name: 'Reconnaissance, motorized', cite: 'Table 5-3 p 5-13 + Table 5-4 p 5-28', e: { entity: '121303' }, b: 'UCRVM-', echelon: 'platoon' },
  'ta-radar': {
    name: 'FA target acquisition — radar',
    cite: 'Table 5-3, p 5-13',
    e: { entity: '130300', m1: '50' },
    eNote: 'Not 130302: that subtype is 2525D (JMSML) only, absent from the 2525E tables.',
    b: 'UCFTR-',
    echelon: 'platoon',
  },
  'air-defense': { name: 'Air defense (radar dome)', cite: 'Table 5-3, p 5-6', e: { entity: '130100' }, b: 'UCD---', echelon: 'battery' },
  'ew-jamming': {
    name: 'Electronic warfare — jamming',
    cite: 'Table 5-3, p 5-18',
    e: { entity: '150504' },
    eNote: '2525C has no jammer equipment code: UUMSEJ is the EW jamming UNIT (milsymbol lettersidc/ground.js).',
    b: 'UUMSEJ',
    echelon: undefined,
  },
};

export const ECHELON_2525E: Readonly<Record<Echelon, string>> = { team: '11', platoon: '14', battery: '15' };
export const ECHELON_2525B: Readonly<Record<Echelon, string>> = { team: 'A', platoon: 'D', battery: 'E' };
const IDENTITY_E: Readonly<Record<FrameKind, string>> = { friend: '3', hostile: '6', neutral: '4', unknown: '1' };
const AFF_B: Readonly<Record<FrameKind, 'F' | 'H' | 'N' | 'U'>> = { friend: 'F', hostile: 'H', neutral: 'N', unknown: 'U' };

// ---------------------------------------------------------------------------
// Track → codes
// ---------------------------------------------------------------------------

/** What a code needs from a track. `fn` wins over `sensorType` (e.g. the EW override). */
export interface SymbolCodeInput {
  affiliation: Affiliation;
  sensorType?: SensorType | undefined;
  fn?: SymbolFunction | undefined;
  /** Omitted → the function's default; null → no echelon field. */
  echelon?: Echelon | null | undefined;
  status?: SymbolStatus | undefined;
}

export function symbolFunctionOf(t: Pick<SymbolCodeInput, 'fn' | 'sensorType'>): SymbolFunction {
  if (t.fn) return t.fn;
  if (t.sensorType) return SENSOR_FUNCTION[t.sensorType];
  throw new Error('track needs fn or sensorType');
}

export function echelonOf(t: SymbolCodeInput): Echelon | undefined {
  if (t.echelon === null) return undefined;
  return t.echelon ?? SYMBOL_FUNCTIONS[symbolFunctionOf(t)].echelon;
}

/** Stored code: MIL-STD-2525E 20-digit numeric SIDC. */
export function toSidc2525E(t: SymbolCodeInput): string {
  const f = SYMBOL_FUNCTIONS[symbolFunctionOf(t)];
  const ech = echelonOf(t);
  return buildSidc({
    identity: IDENTITY_E[AFFILIATION_FRAME[t.affiliation]],
    status: t.status === 'anticipated' ? '1' : '0',
    echelon: ech ? ECHELON_2525E[ech] : '00',
    entity: f.e.entity,
    modifier1: f.e.m1,
    modifier2: f.e.m2,
  });
}

/** Export code: 2525B/C 15-character letter SIDC (same structure in both editions). */
export function toSidc2525C(t: SymbolCodeInput): string {
  const f = SYMBOL_FUNCTIONS[symbolFunctionOf(t)];
  const ech = echelonOf(t);
  return buildLetterSidc({
    affiliation: AFF_B[AFFILIATION_FRAME[t.affiliation]],
    fn: f.b,
    status: t.status === 'anticipated' ? 'A' : 'P',
    echelon: ech ? ECHELON_2525B[ech] : '-',
  });
}

/** ATAK Cursor-on-Target type: a-<affiliation>-G-<2525B function, hyphenated>. */
export function toCotType(t: SymbolCodeInput): string {
  const f = SYMBOL_FUNCTIONS[symbolFunctionOf(t)];
  return `a-${AFF_B[AFFILIATION_FRAME[t.affiliation]].toLowerCase()}-G-${f.b.replace(/-+$/, '').split('').join('-')}`;
}
