// Story-only symbols for Explorations/At-a-Glance Symbols. NOT used by the live
// renderers (CesiumSpine / MapSpine are untouched).
//
// Reference: FM 1-02 / MCRP 5-12A "Operational Terms and Graphics" (21 Sep
// 2004, Change 1 copy) — page numbers are the manual's own labels. Design
// candidates, sizes, fills, cues and the evaluation protocol follow
// glance-symbology-research.md (research §4, §5): V1 = A, V2 = B, V3 = C
// (recommended), V4 = D; E (declutter) is its own story. Geometry is
// milsymbol 3.0.4's 200-unit box (frame centre 100,100), checked against the
// manual's drawings.
//
// cellPrims() is the single description of a cell: the SVG renderer and the
// canvas evaluator both draw from it, so every score is computed from exactly
// what is shown.

import type { CSSProperties, ReactNode } from 'react';
import type { SensorType } from '@hamilton/contracts';
import { haloOuterRadiusPx, shouldHaloPulse, trustBand } from '@/lib/trust-gradient';
import { buildLetterSidc, buildSidc } from '@/lib/glance-metrics';
import { rateLinkTrust } from '@/lib/link-trust-rating';
import { AIRDEF_PATH, Amplifier, EchelonMark, FRAME_TO_AFFILIATION, RECON_PATH, fontPx, trustStrokeVar, type Echelon, type FrameKind } from './MilSymbol';
import { HaloSvg, trackPolygonPoints } from './TrackGlyph';

export type GlanceVariant = 'V0' | 'V1' | 'V2' | 'V3' | 'V4';
/** REF = doctrinal reference at milsymbol-default icon sizes + 2525C light fills (calibration only). */
export type AnyVariant = GlanceVariant | 'REF';
export const GLANCE_VARIANTS: GlanceVariant[] = ['V0', 'V1', 'V2', 'V3', 'V4'];
export const SENSOR_ROWS: SensorType[] = ['recon_static', 'recon_mobile', 'detection', 'offense', 'defense'];
export const FRAME_COLS: FrameKind[] = ['friend', 'hostile', 'neutral', 'unknown'];
export const RESEARCH_ID: Record<AnyVariant, string> = { V0: 'baseline', V1: 'A', V2: 'B', V3: 'C', V4: 'D', REF: 'ref' };

/** V4 (D): never smaller than this box, px (research §4 D). */
export const D_MIN_BOX_PX = 24;
/** V4 (D): below this box the level-of-detail (glance) state applies (research §4 D). */
export const D_LOD_BELOW_PX = 28;

// ---------------------------------------------------------------------------
// Geometry (200-unit space)
// ---------------------------------------------------------------------------

/** Land-unit frames, Table 4-1 p 4-3 (milsymbol Ground{Friend,Hostile,Neutral,Unknown}). */
export const FRAME_D: Record<FrameKind, string> = {
  friend: 'M25,50 L175,50 175,150 25,150 Z',
  hostile: 'M100,28 L172,100 100,172 28,100 Z',
  neutral: 'M45,45 L155,45 155,155 45,155 Z',
  unknown: 'M63,63 C63,20 137,20 137,63 C180,63 180,137 137,137 C137,180 63,180 63,137 C20,137 20,63 63,63 Z',
};
export const FRAME_BOX_200: Record<FrameKind, [number, number, number, number]> = {
  friend: [25, 50, 175, 150],
  hostile: [28, 28, 172, 172],
  neutral: [45, 45, 155, 155],
  unknown: [30.75, 30.75, 169.25, 169.25],
};
/** Radar, Table 5-3 p 5-13 (milsymbol GR.IC.RADAR, drawn by 2525B UCFTR-). */
const RADAR_D = 'M72,95 l30,-25 0,25 30,-25 M70,70 c0,35 15,50 50,50';
const circ = (cx: number, cy: number, r: number) => `M${cx - r},${cy} a${r},${r} 0 1,0 ${2 * r},0 a${r},${r} 0 1,0 ${-2 * r},0 Z`;

/** Fills (research §4 A): 2525C hues at dark-map luminance. */
export const DOCTRINAL_FILL: Record<FrameKind, string> = { friend: '#0091c0', hostile: '#f00000', neutral: '#00b000', unknown: '#dcd900' };
/** milsymbol "Light" colour mode (2525C light fills) — REF only. */
export const REF_FILL: Record<FrameKind, string> = { friend: 'rgb(128,224,255)', hostile: 'rgb(255,128,128)', neutral: 'rgb(170,255,170)', unknown: 'rgb(255,255,128)' };
export const ICON_DARK = '#06090d';

export type Layer = 'cue' | 'plate' | 'frame' | 'icon';
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
  /** C: 1 Hz single-rate blink (H5) — static in the evaluator. */
  blink?: boolean | undefined;
  /** Drawn by HaloSvg in the SVG (animated live halo); prims are its static canvas equivalent. */
  svgSkip?: boolean | undefined;
}

// ---------------------------------------------------------------------------
// Strokes and sizes (research §4 table)
// ---------------------------------------------------------------------------

export function renderBoxPx(v: AnyVariant, sizePx: number): number {
  return v === 'V4' ? Math.max(D_MIN_BOX_PX, sizePx) : sizePx;
}

/** Frame stroke, px. A/B/C(+REF): 1.25 / 1.5 / 2 / 2.5 at 16/24/32/48; D: 1.5 / 2 / 2.75 / 3.5. V0 = TrackGlyph's 2. */
export function frameStrokePx(v: AnyVariant, box: number): number {
  if (v === 'V0') return 2;
  const steps = v === 'V4' ? [1.5, 2, 2.75, 3.5] : [1.25, 1.5, 2, 2.5];
  return box <= 16 ? steps[0]! : box <= 24 ? steps[1]! : box <= 32 ? steps[2]! : steps[3]!;
}

export function iconStrokePx(v: AnyVariant, box: number): number {
  const f = frameStrokePx(v, box);
  return v === 'V2' ? f * 1.25 : v === 'V4' ? f * 0.9 : f;
}

// ---------------------------------------------------------------------------
// Icons
// ---------------------------------------------------------------------------

type IconSet = 'ref' | 'A' | 'D-lod';

const DOT_R: Record<IconSet, { fa: number; colt: number; ta: number }> = {
  ref: { fa: 15, colt: 15, ta: 9 }, // milsymbol defaults
  A: { fa: 25, colt: 20, ta: 12 }, // research §4 A
  'D-lod': { fa: 28, colt: 20, ta: 12 }, // research §4 D
};

const MOTORIZED_Y: Record<FrameKind, [number, number]> = {
  friend: [50, 150],
  hostile: [28, 172],
  neutral: [45, 155],
  unknown: [30.75, 169.25],
};

function iconPrims(sensor: SensorType, frame: FrameKind, set: IconSet, w: number, color: string): PPrim[] {
  const S = (d: string, mul = 1): PPrim => ({ d, mode: 'stroke', color, layer: 'icon', w: w * mul, cap: 'round' });
  const F = (d: string): PPrim => ({ d, mode: 'fill', color, layer: 'icon' });
  const r = DOT_R[set];
  const diag = set === 'D-lod' ? 1.5 : 1;
  switch (sensor) {
    case 'offense': // FA cannonball, Table 5-3 p 5-11
      return [F(circ(100, 100, r.fa))];
    case 'recon_static': // Reconnaissance (COLT/FIST): diagonal + dot, p 5-13
      return [S(RECON_PATH[frame], diag), F(circ(100, 100, r.colt))];
    case 'recon_mobile': {
      // Reconnaissance bandoleer (p 5-13) + Motorized (Table 5-4 p 5-28)
      const [y0, y1] = MOTORIZED_Y[frame];
      return [S(RECON_PATH[frame], diag), S(`M100,${y0} L100,${y1}`)];
    }
    case 'detection': // FA target acquisition radar: dot + radar, p 5-13
      return [F(circ(70, 110, r.ta)), S(RADAR_D)];
    case 'defense': // Air defense radar dome, p 5-6
      return [S(AIRDEF_PATH[frame], diag)];
  }
}

// ---------------------------------------------------------------------------
// Trust cues — Hamilton link-trust overlay (non-doctrinal). Research §3.
// ---------------------------------------------------------------------------

export interface CueSet {
  /** The current circular halo (V0 / non-conformant comparison). */
  circle?: boolean;
  /** H1 frame-following outline: 'steps' 0/1.5/2.5/4 px by band; 'lod' suppresses watching (D). */
  outline?: 'steps' | 'lod' | false;
  /** H2 side gauge: fill height = score. */
  gauge?: boolean;
  /** H3 corner brackets (only with H1). */
  brackets?: boolean;
  /** J evaluation-rating text (Table 4-4 p 4-6), shown below 0.60. Doctrinal field, not overlay. */
  j?: boolean;
  /** H5 single-rate 1 Hz blink of H1, below 0.30 only. */
  blink?: boolean;
}

export const VARIANT_CUES: Record<AnyVariant, CueSet> = {
  V0: { circle: true },
  V1: { gauge: true, j: true }, // A
  V2: { outline: 'steps', gauge: true }, // B
  V3: { outline: 'steps', gauge: true, j: true, blink: true }, // C (recommended)
  V4: { outline: 'lod', gauge: true }, // D
  REF: {},
};

export type HaloCandidate = 'outline' | 'gauge' | 'brackets+outline' | 'circle' | 'none';
export const HALO_CANDIDATES: { id: HaloCandidate; cues: CueSet; label: string }[] = [
  { id: 'outline', cues: { outline: 'steps' }, label: 'H1 frame-following outline (RECOMMENDED)' },
  { id: 'gauge', cues: { gauge: true }, label: 'H2 side gauge (length = score)' },
  { id: 'brackets+outline', cues: { outline: 'steps', brackets: true }, label: 'H3 corner brackets + H1 outline' },
  {
    id: 'circle',
    cues: { circle: true },
    label: 'Current circle — NON-CONFORMANT: a circle is the friendly equipment frame (MCRP Table 4-1, p 4-3); the variable-rate pulse violates MIL-STD-1472H §5.17.27',
  },
  { id: 'none', cues: {}, label: 'None (symbol only)' },
];

/** H1 width by band, px. */
export function outlineWidthPx(score: number, mode: 'steps' | 'lod'): number {
  const band = trustBand(score);
  if (band === 'nominal') return 0;
  if (band === 'watching') return mode === 'lod' ? 0 : 1.5;
  return band === 'degraded' ? 2.5 : 4;
}

const OUTLINE_GAP_PX = 1;

/** Room the H1 outline can take right of the frame (max width 4 px + 1 px gap), reserved at every band so fields don't move. */
function outlineReservePx(cues: CueSet): number {
  return cues.outline ? OUTLINE_GAP_PX + 4 : 0;
}

/** J text x offset from the frame's right edge, px (right column, Fig 4-2 p 4-5). */
export function jOffsetPx(cues: CueSet): number {
  return 3 + outlineReservePx(cues);
}

/** Gauge x offset from the frame's right edge, px: after the J column when J is on (research H2). */
function gaugeOffsetPx(box: number, cues: CueSet): number {
  return cues.j ? jOffsetPx(cues) + 2 * 0.62 * fontPx(box) + 4 : 3 + outlineReservePx(cues);
}

function cuePrims(cues: CueSet, frame: FrameKind, score: number, box: number, iconRadiusPx: number, frameLineU: number, opts: { blinkOn: boolean }): PPrim[] {
  const u = 200 / box;
  const out: PPrim[] = [];
  const [x0, y0, x1, y1] = FRAME_BOX_200[frame];
  const color = trustStrokeVar(score);
  if (cues.circle && shouldHaloPulse(score)) {
    const outer = haloOuterRadiusPx(score, iconRadiusPx) * u;
    const band = `var(--trust-${trustBand(score)})`;
    out.push({ d: circ(100, 100, outer), mode: 'fill', color: band, layer: 'cue', opacity: 0.28, svgSkip: true });
    out.push({ d: circ(100, 100, outer - u), mode: 'stroke', color: band, layer: 'cue', w: 2 * u, opacity: 0.9, svgSkip: true });
  }
  if (cues.outline) {
    const w = outlineWidthPx(score, cues.outline);
    if (w > 0) {
      const blink = !!cues.blink && opts.blinkOn && trustBand(score) === 'failed';
      out.push({ d: FRAME_D[frame], mode: 'stroke', color, layer: 'cue', w: frameLineU + 2 * (OUTLINE_GAP_PX + w) * u, blink });
      out.push({ d: FRAME_D[frame], mode: 'stroke', color: 'var(--surface-base)', layer: 'cue', w: frameLineU + 2 * OUTLINE_GAP_PX * u });
    }
  }
  if (cues.brackets && shouldHaloPulse(score)) {
    const o = 3 * u;
    const len = 4 * u;
    for (const [x, y, dx, dy] of [
      [x0 - o, y0 - o, 1, 1],
      [x1 + o, y0 - o, -1, 1],
      [x0 - o, y1 + o, 1, -1],
      [x1 + o, y1 + o, -1, -1],
    ] as const) {
      out.push({ d: `M${x + dx * len},${y} L${x},${y} L${x},${y + dy * len}`, mode: 'stroke', color, layer: 'cue', w: 1.5 * u, cap: 'square' });
    }
  }
  if (cues.gauge) {
    const gx = x1 + gaugeOffsetPx(box, cues) * u;
    const gw = 3 * u;
    const h = y1 - y0;
    const fill = Math.max(0, Math.min(1, score)) * h;
    out.push({ d: `M${gx},${y1 - fill} h${gw} v${fill} h${-gw} Z`, mode: 'fill', color, layer: 'cue' });
    out.push({ d: `M${gx},${y0} h${gw} v${h} h${-gw} Z`, mode: 'stroke', color: 'var(--sym-ink)', layer: 'cue', w: 0.75 * u });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Cell description
// ---------------------------------------------------------------------------

export interface CellOpts {
  /** Override the variant's cue set (Halo variants story). */
  cues?: CueSet | undefined;
  /** false = strip every overlay cue (T2 "overlay off"). */
  overlay?: boolean | undefined;
  /** V4 only: force the detail (true) or LOD (false) state; default = box ≥ 28 px. */
  detail?: boolean | undefined;
  /** C blink enabled (false once acknowledged / reduced motion). */
  blinkOn?: boolean | undefined;
}

export function v4Detail(sizePx: number, detail?: boolean): boolean {
  return detail ?? renderBoxPx('V4', sizePx) >= D_LOD_BELOW_PX;
}

export function cellPrims(v: AnyVariant, sensor: SensorType, frame: FrameKind, score: number, sizePx: number, opts: CellOpts = {}): PPrim[] {
  const box = renderBoxPx(v, sizePx);
  const u = 200 / box;
  const fw = frameStrokePx(v, box) * u;
  const iw = iconStrokePx(v, box) * u;
  const cues = opts.overlay === false ? {} : (opts.cues ?? VARIANT_CUES[v]);
  const blinkOn = opts.blinkOn ?? true;
  if (v === 'V0') {
    const aff = FRAME_TO_AFFILIATION[frame];
    const pts = trackPolygonPoints(aff, sensor, 80, 100, 100);
    const d = `M${pts.replace(/ /g, ' L')} Z`;
    const col = `var(--affiliation-${aff})`;
    const op = Math.max(0.3, score);
    const glyph: PPrim[] =
      frame === 'neutral' || frame === 'unknown'
        ? [{ d, mode: 'stroke', color: col, layer: 'frame', w: fw, dash: frame === 'unknown' ? [4 * u, 3 * u] : undefined, opacity: op }]
        : [
            { d, mode: 'fill', color: col, layer: 'frame', opacity: op },
            { d, mode: 'stroke', color: `var(--trust-${trustBand(score)})`, layer: 'frame', w: fw, opacity: op },
          ];
    return [...cuePrims(cues, frame, score, box, 0.4 * box, fw, { blinkOn }), ...glyph];
  }
  const filled = v !== 'V2';
  const fill = v === 'REF' ? REF_FILL[frame] : DOCTRINAL_FILL[frame];
  const line = v === 'REF' ? '#000000' : 'var(--sym-ink)';
  const iconColor = v === 'V2' ? 'var(--sym-ink)' : v === 'REF' ? '#000000' : ICON_DARK;
  const set: IconSet = v === 'REF' ? 'ref' : v === 'V4' && !v4Detail(sizePx, opts.detail) ? 'D-lod' : 'A';
  return [
    ...cuePrims(cues, frame, score, box, 0.375 * box, fw, { blinkOn }),
    filled
      ? { d: FRAME_D[frame], mode: 'fill', color: fill, layer: 'frame' }
      : { d: FRAME_D[frame], mode: 'fill', color: 'var(--sym-plate)', layer: 'plate' },
    { d: FRAME_D[frame], mode: 'stroke', color: line, layer: 'frame', w: fw },
    ...iconPrims(sensor, frame, set, iw, iconColor),
  ];
}

// ---------------------------------------------------------------------------
// Codes (research §2.1 table; validated with milsymbol 3.0.4 isValid())
// ---------------------------------------------------------------------------

export interface FunctionCode {
  name: string;
  cite: string;
  e: { entity: string; m1?: string; m2?: string };
  eNote?: string;
  b: string;
  echelon: Echelon;
  echelonE: string;
  echelonB: string;
  designation: string;
}

export const FUNCTIONS: Record<SensorType, FunctionCode> = {
  offense: { name: 'Field artillery (cannonball)', cite: 'Table 5-3, p 5-11', e: { entity: '130300' }, b: 'UCF---', echelon: 'battery', echelonE: '15', echelonB: 'E', designation: 'B' },
  recon_static: {
    name: 'Reconnaissance (COLT/FIST), dismounted',
    cite: 'Table 5-3, p 5-13',
    e: { entity: '130400' },
    eNote: '2525E 130400 = FA observer (different icon: triangle).',
    b: 'UCFTCD',
    echelon: 'team',
    echelonE: '11',
    echelonB: 'A',
    designation: 'A',
  },
  recon_mobile: { name: 'Reconnaissance, motorized', cite: 'Table 5-3 p 5-13 + Table 5-4 p 5-28', e: { entity: '121303' }, b: 'UCRVM-', echelon: 'platoon', echelonE: '14', echelonB: 'D', designation: 'R2' },
  detection: {
    name: 'FA target acquisition — radar',
    cite: 'Table 5-3, p 5-13',
    e: { entity: '130300', m1: '50' },
    eNote: 'Not 130302: per research that subtype is 2525D (JMSML) only, absent from the 2525E tables.',
    b: 'UCFTR-',
    echelon: 'platoon',
    echelonE: '14',
    echelonB: 'D',
    designation: 'C',
  },
  defense: { name: 'Air defense (radar dome)', cite: 'Table 5-3, p 5-6', e: { entity: '130100' }, b: 'UCD---', echelon: 'battery', echelonE: '15', echelonB: 'E', designation: 'AD' },
};

const IDENTITY_E: Record<FrameKind, string> = { friend: '3', hostile: '6', neutral: '4', unknown: '1' };
const AFF_B: Record<FrameKind, 'F' | 'H' | 'N' | 'U'> = { friend: 'F', hostile: 'H', neutral: 'N', unknown: 'U' };

export interface CellCodes {
  e: string;
  b: string;
  cot: string;
}

export function cellCodes(v: AnyVariant, sensor: SensorType, frame: FrameKind, withEchelon = false): CellCodes | undefined {
  if (v === 'V0') return undefined;
  const f = FUNCTIONS[sensor];
  return {
    e: buildSidc({ identity: IDENTITY_E[frame], entity: f.e.entity, modifier1: f.e.m1, modifier2: f.e.m2, echelon: withEchelon ? f.echelonE : '00' }),
    b: buildLetterSidc({ affiliation: AFF_B[frame], fn: f.b, echelon: withEchelon ? f.echelonB : '-' }),
    cot: `a-${AFF_B[frame].toLowerCase()}-G-${f.b.replace(/-+$/, '').split('').join('-')}`,
  };
}

// ---------------------------------------------------------------------------
// SVG rendering
// ---------------------------------------------------------------------------

export const GLANCE_CSS = `
@keyframes glance-blink { 0%, 49.9% { opacity: 1; } 50%, 100% { opacity: 0; } }
.glance-blink { animation: glance-blink 1000ms steps(1, end) infinite; }
@media (prefers-reduced-motion: reduce) { .glance-blink { animation: none; } }
`;

export function GlanceStyles() {
  return <style>{GLANCE_CSS}</style>;
}

/** Globally synchronised 1 Hz phase (research H5): every blinking cue shares the epoch clock. */
const blinkDelay = () => `-${Date.now() % 1000}ms`;

export function PrimSvg({ prims }: { prims: PPrim[] }) {
  return (
    <>
      {prims
        .filter((p) => !p.svgSkip)
        .map((p, i) => {
          const common = {
            opacity: p.opacity,
            className: p.blink ? 'glance-blink' : undefined,
            style: p.blink ? ({ animationDelay: blinkDelay() } as CSSProperties) : undefined,
            'data-layer': p.layer,
          };
          return p.mode === 'fill' ? (
            <path key={i} d={p.d} fill={p.color} {...common} />
          ) : (
            <path
              key={i}
              d={p.d}
              fill="none"
              stroke={p.color}
              strokeWidth={p.w}
              strokeDasharray={p.dash?.join(' ')}
              strokeLinecap={p.cap ?? 'butt'}
              strokeLinejoin="round"
              {...common}
            />
          );
        })}
    </>
  );
}

export interface GlanceCellProps extends CellOpts {
  variant: AnyVariant;
  sensor: SensorType;
  frame: FrameKind;
  score: number;
  sizePx: number;
  reducedMotion?: boolean | undefined;
  /** Padding, px: [left, right, vertical]. */
  pad?: [number, number, number] | undefined;
}

export function GlanceSymbol(p: Omit<GlanceCellProps, 'pad'>) {
  const { variant: v, sensor, frame, score, sizePx, reducedMotion = false } = p;
  const box = renderBoxPx(v, sizePx);
  const u = 200 / box;
  const k = 32 / box;
  const cues = p.overlay === false ? {} : (p.cues ?? VARIANT_CUES[v]);
  const prims = cellPrims(v, sensor, frame, score, sizePx, { ...p, blinkOn: p.blinkOn !== false && !reducedMotion });
  const [x0, y0, x1] = FRAME_BOX_200[frame];
  const f = FUNCTIONS[sensor];
  const detail = v === 'V4' && v4Detail(sizePx, p.detail);
  const showT = v === 'V4';
  const rating = rateLinkTrust(score);
  const showJ = !!cues.j && shouldHaloPulse(score);
  const nonDoctrinal = prims.some((q) => q.layer === 'cue') || !!cues.circle;
  return (
    <g data-non-2525-overlay={nonDoctrinal ? '' : undefined}>
      {cues.circle && shouldHaloPulse(score) && (
        <g data-overlay="hamilton-link-trust" transform={`translate(100 100) scale(${u})`}>
          <HaloSvg score={score} iconRadius={(v === 'V0' ? 0.4 : 0.375) * box} reducedMotion={reducedMotion} />
        </g>
      )}
      <PrimSvg prims={prims} />
      {(showT || showJ || detail) && (
        // Amplifiers in MilSymbol's 32-unit space (scale 200/32). Field positions: Fig 4-2 p 4-5.
        <g transform="scale(6.25)">
          {detail && <EchelonMark echelon={f.echelon} y={y0 / 6.25 - 2} k={k} color="var(--sym-ink)" />}
          {showT && (
            <Amplifier x={x0 / 6.25 - 3 * k} y={16} anchor="end" color="var(--sym-ink)" k={k} sizePx={box}>
              {f.designation}
            </Amplifier>
          )}
          {showJ && (
            <Amplifier x={x1 / 6.25 + jOffsetPx(cues) * k} y={16} anchor="start" color="var(--sym-ink)" k={k} sizePx={box}>
              {rating.jCode}
            </Amplifier>
          )}
        </g>
      )}
    </g>
  );
}

/** Horizontal room a variant needs for cues + amplifiers, px [left, right]. */
export function cellPad(v: AnyVariant, sizePx: number, score: number): [number, number] {
  const box = renderBoxPx(v, sizePx);
  const cues = VARIANT_CUES[v];
  const circle = cues.circle ? Math.max(0, haloOuterRadiusPx(Math.min(score, 0.59), 0.4 * box) - box / 2) : 0;
  const right = Math.max(circle, cues.gauge ? gaugeOffsetPx(box, cues) + 5 : cues.j ? jOffsetPx(cues) + 15 : 0, 6);
  const left = Math.max(circle, v === 'V4' ? 18 : 6);
  return [left, right];
}

/** Standalone SVG, frame centred vertically. */
export function GlanceCell({ pad, ...p }: GlanceCellProps) {
  const box = renderBoxPx(p.variant, p.sizePx);
  const [l, r] = pad ?? [...cellPad(p.variant, p.sizePx, p.score), 0];
  const vpad = pad?.[2] ?? Math.max(6, p.variant === 'V0' ? cellPad('V0', p.sizePx, p.score)[0] : 6) + (p.variant === 'V4' && v4Detail(p.sizePx, p.detail) ? 6 : 0);
  const w = box + l + r;
  const h = box + 2 * vpad;
  const codes = cellCodes(p.variant, p.sensor, p.frame, p.variant === 'V4' && v4Detail(p.sizePx, p.detail));
  const label = `${p.variant} ${p.sensor} ${p.frame} trust ${p.score.toFixed(2)}${codes ? ` · 2525E ${codes.e} · 2525B ${codes.b} · CoT ${codes.cot}` : ' · bespoke (no SIDC)'}`;
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} overflow="visible" role="img" aria-label={label} style={{ display: 'block' }}>
      <title>{label}</title>
      <g transform={`translate(${l} ${vpad}) scale(${box / 200})`}>
        <GlanceSymbol {...p} />
      </g>
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Matrix
// ---------------------------------------------------------------------------

export const mapSurface: CSSProperties = {
  background: 'var(--surface-base)',
  backgroundImage:
    'linear-gradient(var(--surface-elevated) 1px, transparent 1px), linear-gradient(90deg, var(--surface-elevated) 1px, transparent 1px)',
  backgroundSize: '48px 48px',
};

const thS: CSSProperties = { fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-tertiary)', fontWeight: 400, padding: '2px 6px' };

export function GlanceMatrix({
  variant,
  sizePx,
  score,
  caption,
  ...opts
}: { variant: AnyVariant; sizePx: number; score: number; caption?: ReactNode; reducedMotion?: boolean | undefined } & CellOpts) {
  return (
    <table style={{ borderCollapse: 'collapse', ...mapSurface }} data-testid={`matrix-${variant}-${sizePx}-${score}`}>
      {caption && <caption style={{ ...thS, textAlign: 'left', captionSide: 'top', padding: '4px 0', color: 'var(--text-secondary)' }}>{caption}</caption>}
      <thead>
        <tr>
          <th />
          {FRAME_COLS.map((f) => (
            <th key={f} style={thS}>
              {f}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {SENSOR_ROWS.map((s) => (
          <tr key={s}>
            <th style={{ ...thS, textAlign: 'right', whiteSpace: 'nowrap' }}>{s}</th>
            {FRAME_COLS.map((f) => (
              <td key={f} style={{ padding: 0 }}>
                <GlanceCell variant={variant} sensor={s} frame={f} score={score} sizePx={sizePx} {...opts} />
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
