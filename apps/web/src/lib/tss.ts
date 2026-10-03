// Target selection standards (TSS) evaluation for a fire mission — the
// non-modal replacement for the old "kill-chain gate" (decision-workflow
// assessment §3 Alternative A + B; docs/plans/tss-mission-row.md).
//
// TSS test accuracy (max TLE), report age and observer reliability before a
// target may be attacked (FM 3-09.12 Ch 1). Hamilton supplies the RELIABILITY
// term live (trust score → J reliability letter, lib/link-trust-rating.ts) and
// the REPORT-AGE term live (time since the source's last good update). It has
// no TLE source, so accuracy is reported as "n/a".
//
// Pure and dependency-free at runtime (only ./link-trust-rating.ts) so it runs
// under `node --test`. It never issues a fire command: the output is a verdict
// plus a RECOMMENDED method of control for the FDC.

import type {
  DependencyRole,
  FireMission,
  MunitionClass,
} from '@hamilton/contracts';
import {
  LINK_TRUST_SCALE,
  STALE_AFTER_S,
  rateLinkTrust,
  type Corroboration,
  type JOverride,
  type ReliabilityCode,
} from './link-trust-rating.ts';

// ---------------------------------------------------------------------------
// TSS / attack-guidance threshold table (Alternative B) — versioned config
// ---------------------------------------------------------------------------

export type TssRowId = MunitionClass | 'hpt_exception';

export interface TssRow {
  id: TssRowId;
  /** Display label, e.g. "GPS-guided". */
  label: string;
  /** Munitions in this class, for the "TSS in force" strip. */
  examples: string;
  /** False = trust is shown but never gates (unguided). */
  gated: boolean;
  /** Minimum J reliability letter (inclusive). null when not gated. */
  min_reliability: ReliabilityCode | null;
  /** Maximum report age, seconds (inclusive). null when not gated. */
  max_report_age_s: number | null;
  /** Row only applies after an explicit, logged risk acceptance (FSO / CDR). */
  requires_risk_acceptance: boolean;
  /** A report confirmed via alternate means (credibility 1) satisfies the reliability check. */
  alt_confirmation_clears: boolean;
  notes: string;
}

export interface TssTable {
  /** Monotonic version, e.g. "TSS-1". */
  version: string;
  /** When this version came into force (ISO 8601 UTC). */
  dtg: string;
  /** Who approved it — the commander, via the FSO (AGM/TSS approval). */
  approver_role: string;
  rows: TssRow[];
}

/**
 * User-accepted defaults (PR "TSS mission row"). Configuration, not constants:
 * the store holds a TssTable and every evaluation takes one as input.
 */
export const DEFAULT_TSS_TABLE: TssTable = {
  version: 'TSS-1',
  dtg: '2024-02-15T06:00:00.000Z',
  approver_role: 'CDR (via FSO)',
  rows: [
    {
      id: 'gps_guided',
      label: 'GPS-guided',
      examples: 'M982 Excalibur, GMLRS-U',
      gated: true,
      min_reliability: 'C',
      max_report_age_s: 10,
      requires_risk_acceptance: false,
      alt_confirmation_clears: true,
      notes: 'Tighten to B inside an RFA or near an NFA.',
    },
    {
      id: 'laser_guided',
      label: 'Laser-guided',
      examples: 'M712 Copperhead, Hellfire',
      gated: true,
      min_reliability: 'C',
      max_report_age_s: 30,
      requires_risk_acceptance: false,
      alt_confirmation_clears: true,
      notes: 'Not GPS-gated; the designator link may be.',
    },
    {
      id: 'unguided',
      label: 'Unguided HE',
      examples: 'M795 HE',
      gated: false,
      min_reliability: null,
      max_report_age_s: null,
      requires_risk_acceptance: false,
      alt_confirmation_clears: false,
      notes: 'Trust shown, never gated.',
    },
    {
      id: 'hpt_exception',
      label: 'HPT — commander-approved exception',
      examples: 'Any gated munition on an HPT',
      gated: true,
      min_reliability: 'D',
      max_report_age_s: 10,
      requires_risk_acceptance: true,
      alt_confirmation_clears: true,
      notes: 'Explicit risk acceptance (FSO / CDR), logged.',
    },
  ],
};

/** Continuous seconds at or above the minimum before a failing source passes again. */
export const TSS_RECOVERY_HOLD_S = 5;

const LETTERS: readonly ReliabilityCode[] = ['A', 'B', 'C', 'D', 'E', 'F'];

/** True when `letter` is at least as reliable as `min` (A best … F cannot be judged). */
export function meetsReliability(letter: ReliabilityCode, min: ReliabilityCode): boolean {
  return LETTERS.indexOf(letter) <= LETTERS.indexOf(min);
}

/** Lowest trust score that still rates `letter` (C → 0.60). Display only; the check compares letters. */
export function minScoreForLetter(letter: ReliabilityCode): number | undefined {
  return LINK_TRUST_SCALE.find((l) => l.reliability === letter)?.min;
}

export function tssRow(table: TssTable, id: TssRowId): TssRow {
  const row = table.rows.find((r) => r.id === id);
  if (!row) throw new Error(`TSS table ${table.version} has no "${id}" row`);
  return row;
}

/** Row a mission is evaluated against. The HPT exception applies only to an HPT with risk accepted. */
export function rowFor(mission: FireMission, table: TssTable, riskAccepted = false): TssRow {
  const base = tssRow(table, mission.munition.class);
  if (riskAccepted && base.gated && mission.target.class === 'hpt') {
    const exception = table.rows.find((r) => r.id === 'hpt_exception');
    if (exception) return exception;
  }
  return base;
}

// ---------------------------------------------------------------------------
// Evaluation
// ---------------------------------------------------------------------------

/** Current trust for one source (from `integrity/trust/{source_id}`). */
export interface TssSourceInput {
  score: number;
  /** Timestamp of the source's last good update (ISO). */
  last_update: string;
  corroboration?: Corroboration | undefined;
  override?: JOverride | undefined;
}

/** Hysteresis memory per source, carried between evaluations. */
export interface TssSourceMemory {
  failing: boolean;
  /** When the source first met the minimum again while still failing. */
  passing_since: string | null;
}
export type TssHysteresis = Record<string, TssSourceMemory>;

export interface TssEvaluateInput {
  mission: FireMission;
  sources: Readonly<Record<string, TssSourceInput | undefined>>;
  table: TssTable;
  /** Evaluation time (ISO). */
  now: string;
  hysteresis?: TssHysteresis | undefined;
  /** FSO / CDR accepted risk on this mission (branch [4]). */
  riskAccepted?: boolean | undefined;
  /** Branch [3] in force: method of control AT MY COMMAND while the re-rate timer runs. */
  atMyCommand?: boolean | undefined;
  /** Seconds a recovering source must hold the minimum. Default TSS_RECOVERY_HOLD_S. */
  recoveryHoldS?: number | undefined;
}

export type CheckStatus = 'pass' | 'fail' | 'na';

export interface TssSourceResult {
  source_id: string;
  roles: DependencyRole[];
  /** No trust payload for this source: it cannot be judged (F6). */
  noFeed: boolean;
  score: number | null;
  /** Evaluation rating, e.g. "D4"; "F6" when stale or without a feed. */
  j: string;
  reliability: ReliabilityCode;
  stale: boolean;
  confirmed: boolean;
  /** Seconds since the last good update (null without a feed). */
  reportAgeS: number | null;
  reliabilityCheck: CheckStatus;
  reportAgeCheck: CheckStatus;
  /** Both checks pass right now, before hysteresis. */
  rawPass: boolean;
  /** Failing after hysteresis. */
  failing: boolean;
  /** Seconds a recovering source has held the minimum (while still failing), else null. */
  recoveringS: number | null;
}

export type Verdict = 'PASS' | 'FAIL';

/** Recommendation to the FDC. Never a command, never HOLD FIRE / CEASE FIRE. */
export type RecommendedControl = 'DO NOT LOAD' | 'AT MY COMMAND' | 'CHECK FIRING / CEASE LOADING';

export interface TssResult {
  mission_id: string;
  tableVersion: string;
  row: TssRow;
  gated: boolean;
  verdict: Verdict;
  checks: {
    reliability: CheckStatus;
    reportAge: CheckStatus;
    accuracy: { status: 'na'; text: string };
  };
  sources: TssSourceResult[];
  failingSources: string[];
  /** The source the row headline describes: first failing, else the least trusted. */
  lead: TssSourceResult;
  recommended: RecommendedControl | null;
  /** One-line headline, e.g. "FAIL — RELIABILITY D4 (min C) · AGE 3s OK". */
  headline: string;
  hysteresis: TssHysteresis;
}

export const ACCURACY_NA = 'n/a — no TLE source';

function uniqueDependencies(mission: FireMission): Map<string, DependencyRole[]> {
  const out = new Map<string, DependencyRole[]>();
  for (const d of mission.dependencies) out.set(d.source_id, [...(out.get(d.source_id) ?? []), d.role]);
  return out;
}

const secondsBetween = (fromIso: string, toIso: string) => (Date.parse(toIso) - Date.parse(fromIso)) / 1000;

export function evaluateTss(input: TssEvaluateInput): TssResult {
  const { mission, sources, table, now } = input;
  const hold = input.recoveryHoldS ?? TSS_RECOVERY_HOLD_S;
  const row = rowFor(mission, table, input.riskAccepted);
  const prevMemory = input.hysteresis ?? {};
  const hysteresis: TssHysteresis = {};

  const results: TssSourceResult[] = [];
  for (const [source_id, roles] of uniqueDependencies(mission)) {
    const src = sources[source_id];
    let reliability: ReliabilityCode = 'F';
    let j = 'F6';
    let stale = true;
    let confirmed = false;
    let reportAgeS: number | null = null;
    if (src) {
      reportAgeS = Math.max(0, secondsBetween(src.last_update, now));
      // STALE is the report-age term: the same 10 s the symbol uses (AR = NRT).
      stale = reportAgeS > STALE_AFTER_S;
      const rating = rateLinkTrust(src.score, { stale, corroboration: src.corroboration, override: src.override });
      reliability = rating.reliability;
      j = rating.jCode;
      confirmed = !stale && rating.credibility === '1' && src.corroboration === 'confirmed';
    }

    let reliabilityCheck: CheckStatus = 'na';
    let reportAgeCheck: CheckStatus = 'na';
    if (row.gated && row.min_reliability) {
      reliabilityCheck =
        meetsReliability(reliability, row.min_reliability) || (confirmed && row.alt_confirmation_clears) ? 'pass' : 'fail';
    }
    if (row.gated && row.max_report_age_s !== null) {
      reportAgeCheck = reportAgeS !== null && reportAgeS <= row.max_report_age_s ? 'pass' : 'fail';
    }
    const rawPass = reliabilityCheck !== 'fail' && reportAgeCheck !== 'fail';

    // Hysteresis: fail at once; pass again only after `hold` s continuously at/above the minimum.
    const prev = prevMemory[source_id];
    let failing = !rawPass;
    let passing_since: string | null = null;
    let recoveringS: number | null = null;
    if (rawPass && prev?.failing) {
      passing_since = prev.passing_since ?? now;
      const held = secondsBetween(passing_since, now);
      failing = held < hold;
      if (failing) recoveringS = Math.max(0, held);
      else passing_since = null;
    }
    hysteresis[source_id] = { failing, passing_since };

    results.push({
      source_id,
      roles,
      noFeed: !src,
      score: src ? src.score : null,
      j,
      reliability,
      stale,
      confirmed,
      reportAgeS,
      reliabilityCheck,
      reportAgeCheck,
      rawPass,
      failing,
      recoveringS,
    });
  }

  const failingSources = results.filter((r) => r.failing).map((r) => r.source_id);
  const verdict: Verdict = row.gated && failingSources.length > 0 ? 'FAIL' : 'PASS';
  const lead =
    results.find((r) => r.failing) ??
    [...results].sort((a, b) => (a.score ?? -1) - (b.score ?? -1))[0]!;

  const worst = (pick: (r: TssSourceResult) => CheckStatus): CheckStatus =>
    results.some((r) => pick(r) === 'fail')
      ? 'fail'
      : results.every((r) => pick(r) === 'na')
        ? 'na'
        : 'pass';

  let recommended: RecommendedControl | null = null;
  if (verdict === 'FAIL') {
    if (mission.status === 'firing') recommended = 'CHECK FIRING / CEASE LOADING';
    else if (input.atMyCommand) recommended = 'AT MY COMMAND';
    else recommended = 'DO NOT LOAD';
  }

  return {
    mission_id: mission.mission_id,
    tableVersion: table.version,
    row,
    gated: row.gated,
    verdict,
    checks: {
      reliability: worst((r) => r.reliabilityCheck),
      reportAge: worst((r) => r.reportAgeCheck),
      accuracy: { status: 'na', text: ACCURACY_NA },
    },
    sources: results,
    failingSources,
    lead,
    recommended,
    headline: headlineFor(verdict, row, lead, hold),
    hysteresis,
  };
}

function ageText(row: TssRow, s: TssSourceResult): string {
  if (s.reportAgeS === null) return 'AGE — NO FEED';
  const age = `${Math.round(s.reportAgeS)}s`;
  if (row.max_report_age_s === null) return `AGE ${age}`;
  return s.reportAgeCheck === 'fail'
    ? `AGE ${age} > ${row.max_report_age_s}s${s.stale ? ' (STALE)' : ''}`
    : `AGE ${age} OK`;
}

/** "FAIL — RELIABILITY D4 (min C) · AGE 3s OK" (the row prefixes "TSS: "). */
export function headlineFor(verdict: Verdict, row: TssRow, lead: TssSourceResult, hold = TSS_RECOVERY_HOLD_S): string {
  if (!row.gated) {
    return `PASS — NOT GATED (${row.label.toUpperCase()}) · ${lead.j} · ${ageText(row, lead)}`;
  }
  const rel = lead.confirmed && row.alt_confirmation_clears
    ? `RELIABILITY ${lead.j} CONFIRMED (alt means)`
    : `RELIABILITY ${lead.j} (min ${row.min_reliability})`;
  const recovering = lead.recoveringS !== null ? ` · RE-RATING ${Math.floor(lead.recoveringS)}/${hold}s` : '';
  return `${verdict} — ${rel} · ${ageText(row, lead)}${recovering}`;
}
