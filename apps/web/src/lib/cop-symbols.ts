// Pure helpers the live COP renderers (CesiumSpine, MapSpine) use to put the
// production track symbol (src/components/symbol) on the map: unit labels,
// the stale clock, the billboard cache key, the declutter box and stack side.
//
// Dependency-free (type-only imports) so it runs under `node --test` with
// native type stripping — see cop-symbols.test.ts.

import type { Affiliation } from '@hamilton/contracts';

/**
 * Live symbol box, px. 32 ≥ the 28 px level-of-detail threshold
 * (components/symbol LOD_BELOW_PX), so the COP shows the detail state:
 * T, echelon, the side gauge and J / AR / H (Decisions/Track Symbology,
 * decisions 1–2).
 */
export const LIVE_SYMBOL_PX = 32;

/** Overlap rule (decision 6): ≥ 3 symbols whose centres sit within 1.5·s. Mirrors components/symbol DECLUTTER_*. */
export const LIVE_DECLUTTER_RADIUS_S = 1.5;
export const LIVE_DECLUTTER_MIN_COUNT = 3;

/**
 * Declutter options for lib/declutter.ts from the production symbol's screen
 * box (sizePx square). tooClose() groups two boxes when their centres are
 * closer than (w₁ + w₂)/2 + sep on both axes, so sep = (1.5 − 1)·s puts the
 * threshold at 1.5·s.
 */
export function declutterBoxFor(sizePx: number): { width: number; height: number; minSeparationPx: number; minCount: number } {
  return {
    width: sizePx,
    height: sizePx,
    minSeparationPx: (LIVE_DECLUTTER_RADIUS_S - 1) * sizePx,
    minCount: LIVE_DECLUTTER_MIN_COUNT,
  };
}

// ---------------------------------------------------------------------------
// Unit labels (T amplifier)
// ---------------------------------------------------------------------------

const KNOWN_DESIGNATIONS: Readonly<Record<string, string>> = {
  unit_a: 'A',
  unit_b: 'B',
  unit_c: 'C',
};

/**
 * T amplifier for a source id: the scenario units are A / B / C (as on the
 * Decisions page); anything else gets the initials of its words plus its
 * number ("hostile_ew_1" → "HE1", "civ_relay" → "CR").
 */
export function designationOf(sourceId: string): string {
  const known = KNOWN_DESIGNATIONS[sourceId];
  if (known) return known;
  const parts = sourceId.split(/[_\-\s]+/).filter(Boolean);
  const out = parts.map((p) => (/^\d+$/.test(p) ? p : p[0]!.toUpperCase())).join('');
  return out.slice(0, 5) || sourceId.slice(0, 4).toUpperCase();
}

/**
 * Sources whose contract `sensor_type` cannot say what they are (SensorType
 * has no EW value). hostile_ew_1 is an EW jamming emitter (FM 1-02 / MCRP
 * 5-12A Table 5-3 p 5-18), not an air-defense dome.
 */
export function functionOverrideOf(sourceId: string): 'ew-jamming' | undefined {
  return /(^|_)ew(_|$)/.test(sourceId) ? 'ew-jamming' : undefined;
}

// ---------------------------------------------------------------------------
// Stale clock
// ---------------------------------------------------------------------------

/** Data more than this far from the wall clock is a replay / fixture, not live. */
export const REPLAY_SKEW_MS = 60 * 60 * 1000;

/**
 * "Now" for the STALE test (link-trust-rating STALE_AFTER_S). Live data is
 * judged against the wall clock. Data stamped more than an hour away from it
 * (a recorded scenario, a Storybook fixture) is judged against its own latest
 * timestamp, so a snapshot is not all-STALE just because it is old.
 */
export function copNowMs(lastUpdates: readonly string[], wallMs: number): number {
  let latest = -Infinity;
  for (const iso of lastUpdates) {
    const t = Date.parse(iso);
    if (Number.isFinite(t) && t > latest) latest = t;
  }
  if (!Number.isFinite(latest)) return wallMs;
  return Math.abs(wallMs - latest) > REPLAY_SKEW_MS ? latest : wallMs;
}

export function isStaleAt(lastUpdateIso: string, nowMs: number, staleAfterS: number): boolean {
  const t = Date.parse(lastUpdateIso);
  return Number.isFinite(t) && (nowMs - t) / 1000 > staleAfterS;
}

// ---------------------------------------------------------------------------
// Billboard cache key
// ---------------------------------------------------------------------------

/**
 * Gauge resolution for rasterised symbols. Floors to 0.05, which never moves a
 * score across a band or J edge (0.30 / 0.60 / 0.85 are multiples of 0.05) and
 * is ≤ 1.3 px of gauge at 32 px. Bounds the image count per symbol to 21.
 */
export const GAUGE_QUANTUM = 0.05;

export function quantizeScore(score: number): number {
  const q = Math.floor(score / GAUGE_QUANTUM + 1e-9) * GAUGE_QUANTUM;
  return Math.max(0, Math.min(1, Math.round(q * 100) / 100));
}

export interface SymbolKeyInput {
  affiliation: Affiliation;
  fn: string;
  status?: string | undefined;
  designation?: string | undefined;
  info?: string | undefined;
  /** Quantized score (quantizeScore); undefined = not trust-scored. */
  qScore?: number | undefined;
  stale?: boolean | undefined;
  /** Rated J (after corroboration / override). */
  jCode?: string | undefined;
  sizePx: number;
  selected?: boolean | undefined;
  active?: boolean | undefined;
  pixelRatio: number;
}

/**
 * One image per key: a billboard is re-rasterised only when its band / gauge
 * step, STALE, J, selection or hover state changes — never per tick.
 */
export function symbolImageKey(k: SymbolKeyInput): string {
  return [
    k.affiliation,
    k.fn,
    k.status ?? 'present',
    k.designation ?? '',
    k.info ?? '',
    k.qScore === undefined ? '-' : k.qScore.toFixed(2),
    k.stale ? 'S' : '',
    k.jCode ?? '',
    k.sizePx,
    k.selected ? 'sel' : '',
    k.active ? 'act' : '',
    k.pixelRatio,
  ].join('|');
}

// ---------------------------------------------------------------------------
// Stack placement
// ---------------------------------------------------------------------------

/**
 * Horizontal offset (px) from a stack's true location to its "[" bracket for
 * components/symbol stackGeometry(). Right of the location by default
 * (2.5·s, the production default); flipped to the left when the stack would
 * leave the viewport. `stackWidthPx` is the frame column plus its gauge and
 * J / H text.
 */
export function stackOffsetPx(anchorX: number, sizePx: number, viewportWidth: number, stackWidthPx = sizePx + 64, edgePx = 8): number {
  const right = 2.5 * sizePx;
  if (anchorX + right + 6 + stackWidthPx <= viewportWidth - edgePx) return right;
  return -(1.5 * sizePx + 6 + stackWidthPx);
}
