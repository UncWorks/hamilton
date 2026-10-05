// AoE palette checks for the colour-vision stories (COP/CesiumSpine and
// COP/MapSpine › AoE colour vision). AOE_OKLCH mirrors the --aoe-* tokens in
// src/styles/tokens.css (docs/plans/jammer-aoe.md, decision "palette").
//
// Rules (design §3.2):
// - Never the trust amber / red: those mean "track trust" and "gating".
// - GNSS = violet family, comms = teal family, FPV = magenta, each also
//   carried by line pattern (solid / dashed / hatch) so hue is never alone.
// - The 90% contour is carried by fill + line weight, the 50% contour by a
//   dashed outline: P is readable in grayscale.
//
// Values are OKLCH (the tokens.css convention) converted here to sRGB so the
// CVD and contrast checks run on the same numbers the SVG draws.
//
// Dependency-free except lib/glance-metrics (itself dependency-free).

import { contrastRatio, deltaE76, rgbToLab, simulateCvd } from '@/lib/glance-metrics';

export type Rgb = [number, number, number];

/** OKLCH (L 0–1, C, h°) → sRGB 0–255, clamped (CSS Color 4). */
export function oklchToRgb(l: number, c: number, hDeg: number): Rgb {
  const h = (hDeg * Math.PI) / 180;
  const a = c * Math.cos(h);
  const b = c * Math.sin(h);
  const l_ = l + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = l - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = l - 0.0894841775 * a - 1.291485548 * b;
  const [L, M, S] = [l_ ** 3, m_ ** 3, s_ ** 3];
  const lin = [
    4.0767416621 * L - 3.3077115913 * M + 0.2309699292 * S,
    -1.2684380046 * L + 2.6097574011 * M - 0.3413193965 * S,
    -0.0041960863 * L - 0.7034186147 * M + 1.707614701 * S,
  ];
  return lin.map((x) => {
    const v = Math.max(0, Math.min(1, x));
    const s = v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055;
    return Math.round(s * 255);
  }) as Rgb;
}

/** AoE palette (OKLCH source values in comments). */
export const AOE_OKLCH = {
  /** Civil GNSS denial — violet. */
  gnssCivil: [0.78, 0.13, 315],
  /** Military GNSS (DAGR-class) — deeper violet, used with a denser hatch. */
  gnssMil: [0.62, 0.19, 300],
  /** UHF/VHF comms — teal, diagonal hatch, no fill. */
  uhfComms: [0.74, 0.11, 185],
  /** FPV C2 / video link — magenta, cross-hatch. */
  fpvLink: [0.6, 0.17, 345],
} as const;

export type AoeHue = keyof typeof AOE_OKLCH;

export const AOE_RGB: Record<AoeHue, Rgb> = Object.fromEntries(
  Object.entries(AOE_OKLCH).map(([k, v]) => [k, oklchToRgb(v[0], v[1], v[2])]),
) as Record<AoeHue, Rgb>;

/**
 * Existing tokens the AoE must stay distinguishable from (tokens.css values).
 * `role` sets the threshold: trust / gating / enemy colours must never be
 * confused with an AoE ("required", ΔE ≥ 30); friendly affiliation and symbol
 * ink only share the map with it ("advisory", ΔE ≥ 10, reported not gated).
 */
export const EXISTING_OKLCH = {
  'trust-nominal': { v: [0.85, 0.18, 145], role: 'required' },
  'trust-watching': { v: [0.8, 0.17, 117], role: 'required' },
  'trust-degraded': { v: [0.72, 0.18, 75], role: 'required' },
  'trust-failed': { v: [0.54, 0.16, 47], role: 'required' },
  'gating-primary': { v: [0.72, 0.2, 75], role: 'required' },
  'affiliation-enemy': { v: [0.58, 0.18, 25], role: 'required' },
  'affiliation-friendly': { v: [0.7, 0.13, 230], role: 'advisory' },
  'sym-ink': { v: [0.9, 0.01, 90], role: 'advisory' },
} as const;

export const SURFACE_BASE: Rgb = oklchToRgb(0.14, 0.01, 250);

export type Vision = 'normal' | 'deuteranopia' | 'protanopia';
export const VISIONS: readonly Vision[] = ['normal', 'deuteranopia', 'protanopia'];
const view = (c: Rgb, v: Vision): Rgb => (v === 'normal' ? c : simulateCvd(c, v));

/** AoE hue vs AoE hue: they also differ by pattern (solid / dashed / hatch). */
export const DELTA_E_AOE_MIN = 15;
/** AoE hue vs trust / gating / enemy: must never read as trust. */
export const DELTA_E_REQUIRED_MIN = 30;
/** AoE hue vs friendly / ink: reported only. */
export const DELTA_E_ADVISORY_MIN = 10;
/** Edge contrast against --surface-base (WCAG non-text). */
export const EDGE_CONTRAST_MIN = 3;

export interface PaletteCheck {
  a: AoeHue;
  b: string;
  kind: 'aoe' | 'required' | 'advisory';
  /** Minimum ΔE76 over normal, deuteranopia and protanopia (Machado 2009, severity 1.0). */
  deltaE: number;
  worstVision: Vision;
  min: number;
  pass: boolean;
}

export function paletteChecks(): { pairs: PaletteCheck[]; contrast: { hue: AoeHue; ratio: number; pass: boolean }[] } {
  const hues = Object.keys(AOE_RGB) as AoeHue[];
  const pairs: PaletteCheck[] = [];
  const worst = (x: Rgb, y: Rgb) =>
    VISIONS.map((v) => ({ v, d: deltaE76(rgbToLab(...view(x, v)), rgbToLab(...view(y, v))) })).reduce((m, c) => (c.d < m.d ? c : m));
  hues.forEach((a, i) => {
    for (const b of hues.slice(i + 1)) {
      const w = worst(AOE_RGB[a], AOE_RGB[b]);
      pairs.push({ a, b, kind: 'aoe', deltaE: w.d, worstVision: w.v, min: DELTA_E_AOE_MIN, pass: w.d >= DELTA_E_AOE_MIN });
    }
    for (const [name, { v, role }] of Object.entries(EXISTING_OKLCH)) {
      const w = worst(AOE_RGB[a], oklchToRgb(v[0], v[1], v[2]));
      const min = role === 'required' ? DELTA_E_REQUIRED_MIN : DELTA_E_ADVISORY_MIN;
      pairs.push({ a, b: name, kind: role, deltaE: w.d, worstVision: w.v, min, pass: w.d >= min });
    }
  });
  const contrast = hues.map((hue) => {
    const ratio = contrastRatio(AOE_RGB[hue], SURFACE_BASE);
    return { hue, ratio, pass: ratio >= EDGE_CONTRAST_MIN };
  });
  return { pairs, contrast };
}
