// Track symbol geometry — FM 1-02 / MCRP 5-12A (21 Sep 2004) frames and unit
// icons, drawn in milsymbol 3.0.4's 200-unit box (frame centre 100,100) and
// checked against the manual's drawings. Shared by the production TrackSymbol
// (describe.ts) and the At-a-Glance bench evaluator, so every bench score is
// computed from exactly what the app draws.
//
// A symbol is a list of primitives (PPrim). The SVG renderer, the SVG-string /
// data-URL renderer and the canvas evaluator all draw from the same list.

import { trustBand } from '@/lib/trust-gradient';
import type { FrameKind, SymbolFunction } from '@/lib/track-sidc';

export type { FrameKind };

// ---------------------------------------------------------------------------
// Frames (Table 4-1, p 4-3; milsymbol Ground{Friend,Hostile,Neutral,Unknown})
// ---------------------------------------------------------------------------

export const FRAME_D: Readonly<Record<FrameKind, string>> = {
  friend: 'M25,50 L175,50 175,150 25,150 Z',
  hostile: 'M100,28 L172,100 100,172 28,100 Z',
  neutral: 'M45,45 L155,45 155,155 45,155 Z',
  unknown: 'M63,63 C63,20 137,20 137,63 C180,63 180,137 137,137 C137,180 63,180 63,137 C20,137 20,63 63,63 Z',
};

/** Frame bounding box [x0, y0, x1, y1], 200-units. */
export const FRAME_BOX_200: Readonly<Record<FrameKind, readonly [number, number, number, number]>> = {
  friend: [25, 50, 175, 150],
  hostile: [28, 28, 172, 172],
  neutral: [45, 45, 155, 155],
  unknown: [30.75, 30.75, 169.25, 169.25],
};

/**
 * Fills (decision 1 = research candidate A): the 2525C / Table 4-3 (p 4-4) hues
 * friend cyan, hostile red, neutral green, unknown yellow at dark-map luminance.
 */
export const DOCTRINAL_FILL: Readonly<Record<FrameKind, string>> = { friend: '#0091c0', hostile: '#f00000', neutral: '#00b000', unknown: '#dcd900' };
/** Icon colour on the fills (black icons, as the printed MCRP plates pp 5-6 – 5-18). Same value as --surface-base's sRGB. */
export const ICON_DARK = '#06090d';

// ---------------------------------------------------------------------------
// Icons (Table 5-3; refitted per frame as milsymbol iconparts/ground.js does)
// ---------------------------------------------------------------------------

/** Reconnaissance diagonal (p 5-13), refitted to each frame. */
export const RECON_PATH: Readonly<Record<FrameKind, string>> = {
  friend: 'M25,150L175,50',
  hostile: 'M60,130L140,70',
  neutral: 'M45,155L155,45',
  unknown: 'M50,135L150,65',
};
/** Air defense radar dome (p 5-6), refitted to each frame. */
export const AIRDEF_PATH: Readonly<Record<FrameKind, string>> = {
  friend: 'M25,150 C25,110 175,110 175,150',
  hostile: 'M70,140 C70,115 130,115 130,140',
  neutral: 'M45,150 C45,110 155,110 155,150',
  unknown: 'm 55,135 c 10,-20 80,-20 90,0',
};
/** Motorized (Table 5-4, p 5-28): vertical line across the frame interior. */
export const MOTORIZED_Y: Readonly<Record<FrameKind, readonly [number, number]>> = {
  friend: [50, 150],
  hostile: [28, 172],
  neutral: [45, 155],
  unknown: [30.75, 169.25],
};
/** "EW" (stroked letters, no font dependency) + jamming sawtooth (Table 5-3, p 5-18). */
export const EW_LETTERS_D = 'M86,72 H66 V100 H86 M66,86 H82 M92,72 L101,100 L113,78 L125,100 L134,72';
export const JAMMING_D = 'M64,126 l12,-12 12,12 12,-12 12,12 12,-12 12,12';

export const circ = (cx: number, cy: number, r: number) => `M${cx - r},${cy} a${r},${r} 0 1,0 ${2 * r},0 a${r},${r} 0 1,0 ${-2 * r},0 Z`;

/**
 * FA target acquisition radar (Table 5-3, p 5-13): dot + radar glyph. Doctrinal
 * size (scale 1) is milsymbol's: dot (70,110), radar `M72,95 l30,-25 0,25 30,-25
 * M70,70 c0,35 15,50 50,50`, glyph centre (95,96). `scale` enlarges both about
 * that centre; `at` moves the centre (default: unchanged).
 */
const RADAR_CENTRE: readonly [number, number] = [95, 96];
export function taRadarParts(scale: number, dotR: number, at: readonly [number, number] = RADAR_CENTRE): { dot: string; radar: string } {
  const [px, py] = RADAR_CENTRE;
  const [cx, cy] = at;
  const P = (x: number, y: number) => `${cx + (x - px) * scale},${cy + (y - py) * scale}`;
  const s = (v: number) => v * scale;
  return {
    dot: circ(cx + (70 - px) * scale, cy + (110 - py) * scale, dotR * scale),
    radar: `M${P(72, 95)} l${s(30)},${s(-25)} 0,${s(25)} ${s(30)},${s(-25)} M${P(70, 70)} c0,${s(35)} ${s(15)},${s(50)} ${s(50)},${s(50)}`,
  };
}

/**
 * Decision 5: the TA-radar glyph is enlarged within each frame (icon enlargement
 * is permitted: 2525D §5.3.1.2, inside the octagon main sector). Friend and
 * neutral frames have room; the glyph is re-centred vertically there so the
 * radar arm keeps clear of the frame line. The hostile diamond and unknown
 * quatrefoil limit it to ~1.15× at the doctrinal position.
 */
export const TA_RADAR_SCALE: Readonly<Record<FrameKind, number>> = { friend: 1.45, hostile: 1.12, neutral: 1.45, unknown: 1.15 };
export const TA_RADAR_AT: Readonly<Record<FrameKind, readonly [number, number]>> = { friend: [95, 100], hostile: RADAR_CENTRE, neutral: [95, 100], unknown: RADAR_CENTRE };
/** Radar strokes relative to the frame stroke (decision 5). */
export const TA_RADAR_STROKE = 1.5;

export type IconSet = 'ref' | 'A' | 'D-lod' | 'final';

/** Dot radii, 200-units. ref = milsymbol defaults; A = research §4 A; D-lod = research §4 D. */
export const DOT_R: Readonly<Record<IconSet, { fa: number; colt: number; ta: number }>> = {
  ref: { fa: 15, colt: 15, ta: 9 },
  A: { fa: 25, colt: 20, ta: 12 },
  'D-lod': { fa: 28, colt: 20, ta: 12 },
  final: { fa: 25, colt: 20, ta: 12 },
};

export type Layer = 'cue' | 'plate' | 'frame' | 'icon' | 'echelon' | 'select';

export interface PPrim {
  d: string;
  mode: 'fill' | 'stroke';
  /** CSS colour, may be var(--…). */
  color: string;
  layer: Layer;
  /** Stroke width, 200-units. */
  w?: number | undefined;
  dash?: number[] | undefined;
  cap?: 'round' | 'butt' | 'square' | undefined;
  opacity?: number | undefined;
  /** Uniform scale about the frame centre (100,100) — selection frames. */
  scale?: number | undefined;
  /** Bench only: 1 Hz single-rate blink (archived V3). */
  blink?: boolean | undefined;
  /** Bench only: drawn by an animated SVG element instead (archived V0 halo). */
  svgSkip?: boolean | undefined;
}

export interface IconOpts {
  /** Overrides TA_RADAR_SCALE (bench sweeps). */
  radarScale?: number | undefined;
  /** Overrides TA_RADAR_STROKE (bench sweeps). */
  radarStroke?: number | undefined;
}

/** Icon primitives for a function in a frame. `w` = icon stroke, 200-units. */
export function iconPrims(fn: SymbolFunction, frame: FrameKind, set: IconSet, w: number, color: string, o: IconOpts = {}): PPrim[] {
  const S = (d: string, mul = 1): PPrim => ({ d, mode: 'stroke', color, layer: 'icon', w: w * mul, cap: 'round' });
  const F = (d: string): PPrim => ({ d, mode: 'fill', color, layer: 'icon' });
  const r = DOT_R[set];
  const diag = set === 'D-lod' ? 1.5 : 1;
  switch (fn) {
    case 'fa': // FA cannonball, Table 5-3 p 5-11
      return [F(circ(100, 100, r.fa))];
    case 'recon-static': // Reconnaissance (COLT/FIST): diagonal + dot, p 5-13
      return [S(RECON_PATH[frame], diag), F(circ(100, 100, r.colt))];
    case 'recon-mobile': {
      // Reconnaissance bandoleer (p 5-13) + Motorized (Table 5-4 p 5-28)
      const [y0, y1] = MOTORIZED_Y[frame];
      return [S(RECON_PATH[frame], diag), S(`M100,${y0} L100,${y1}`)];
    }
    case 'ta-radar': {
      // FA target acquisition radar: dot + radar, p 5-13
      const final = set === 'final';
      const scale = o.radarScale ?? (final ? TA_RADAR_SCALE[frame] : 1);
      const { dot, radar } = taRadarParts(scale, r.ta, final ? TA_RADAR_AT[frame] : undefined);
      return [F(dot), S(radar, o.radarStroke ?? (final ? TA_RADAR_STROKE : 1))];
    }
    case 'air-defense': // Air defense radar dome, p 5-6
      return [S(AIRDEF_PATH[frame], diag)];
    case 'ew-jamming': // EW jamming: "EW" + sawtooth, p 5-18
      return [S(EW_LETTERS_D, 0.85), S(JAMMING_D)];
  }
}

// ---------------------------------------------------------------------------
// Strokes, text and trust colour
// ---------------------------------------------------------------------------

/** Frame (and icon) stroke, px: 1.25 / 1.5 / 2 / 2.5 at ≤16 / ≤24 / ≤32 / larger (research §4 A). */
export function frameStrokePx(box: number): number {
  return box <= 16 ? 1.25 : box <= 24 ? 1.5 : box <= 32 ? 2 : 2.5;
}

/** Amplifier font, px, for a box (research §4 text table). */
export function fontPx(box: number): number {
  return box >= 32 ? 11 : box >= 24 ? 10 : 9;
}

/** Decision 1 (V4 label behaviour): the T label never renders smaller than a 24 px symbol's. */
export const LABEL_MIN_BOX_PX = 24;
/** Decision 1 (V4 label behaviour): below this box only T is shown — no echelon, no other amplifiers. */
export const LOD_BELOW_PX = 28;

export function labelFontPx(sizePx: number): number {
  return fontPx(Math.max(LABEL_MIN_BOX_PX, sizePx));
}

/** Mono glyph advance as a fraction of the font size (JetBrains Mono ≈ 0.6; 0.62 leaves slack). */
export const CHAR_W = 0.62;

/** Trust colour for strokes / fills: failed uses the 5.1:1 stroke variant. */
export function trustStrokeVar(score: number): string {
  const band = trustBand(score);
  return band === 'failed' ? 'var(--trust-failed-stroke)' : `var(--trust-${band})`;
}
