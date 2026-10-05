// At-a-Glance bench symbols (Archive/At-a-Glance Variants, Decisions/Evidence).
// NOT used by the app. V0–V4 + REF are the archived research candidates;
// FINAL is the decided production symbol, drawn by
// src/components/symbol/describe.ts — the bench evaluates exactly what the app
// renders.
//
// Reference: FM 1-02 / MCRP 5-12A "Operational Terms and Graphics" (21 Sep
// 2004, Change 1 copy) — page numbers are the manual's own labels. Design
// candidates, sizes, fills, cues and the evaluation protocol follow
// glance-symbology-research.md (research §4, §5): V1 = A (DECIDED base),
// V2 = B, V3 = C, V4 = D (label treatment DECIDED); E (declutter) is its own
// story. Geometry is shared with production (components/symbol/geometry.ts).
//
// cellPrims() is the single description of a cell: the SVG renderer and the
// canvas evaluator both draw from it, so every score is computed from exactly
// what is shown.

import type { CSSProperties, ReactNode } from 'react';
import type { SensorType } from '@hamilton/contracts';
import { trustBand } from '@/lib/trust-gradient';
import { haloOuterRadiusPx, shouldHaloPulse } from '@/stories/archive/halo';
import { FRAME_AFFILIATION, SENSOR_FUNCTION, toCotType, toSidc2525C, toSidc2525E, type Echelon, type FrameKind } from '@/lib/track-sidc';
import { rateLinkTrust } from '@/lib/link-trust-rating';
import {
  DOCTRINAL_FILL,
  FRAME_BOX_200,
  FRAME_D,
  ICON_DARK,
  circ,
  frameStrokePx as finalFrameStrokePx,
  iconPrims as sharedIconPrims,
  trustStrokeVar,
  type IconOpts,
  type IconSet,
  type PPrim,
} from '@/components/symbol/geometry';
import { describeTrackSymbol, isDetail } from '@/components/symbol/describe';
import { SymbolGroup } from '@/components/symbol/TrackSymbol';
import { Amplifier, EchelonMark, fontPx } from './MilSymbol';
import { HaloSvg, trackPolygonPoints } from './TrackGlyph';

export { DOCTRINAL_FILL, FRAME_BOX_200, FRAME_D, ICON_DARK, type PPrim };

export type GlanceVariant = 'V0' | 'V1' | 'V2' | 'V3' | 'V4';
/** REF = doctrinal reference at milsymbol-default icon sizes + 2525C light fills (calibration only). */
/** FINAL = the decided production symbol (components/symbol). */
export type AnyVariant = GlanceVariant | 'REF' | 'FINAL';
export const GLANCE_VARIANTS: GlanceVariant[] = ['V0', 'V1', 'V2', 'V3', 'V4'];
export const SENSOR_ROWS: SensorType[] = ['recon_static', 'recon_mobile', 'detection', 'offense', 'defense'];
export const FRAME_COLS: FrameKind[] = ['friend', 'hostile', 'neutral', 'unknown'];
export const RESEARCH_ID: Record<AnyVariant, string> = { V0: 'baseline', V1: 'A', V2: 'B', V3: 'C', V4: 'D', REF: 'ref', FINAL: 'decided' };

/** V4 (D): never smaller than this box, px (research §4 D). */
export const D_MIN_BOX_PX = 24;
/** V4 (D): below this box the level-of-detail (glance) state applies (research §4 D). */
export const D_LOD_BELOW_PX = 28;

/** milsymbol "Light" colour mode (2525C light fills) — REF only. */
export const REF_FILL: Record<FrameKind, string> = { friend: 'rgb(128,224,255)', hostile: 'rgb(255,128,128)', neutral: 'rgb(170,255,170)', unknown: 'rgb(255,255,128)' };

// ---------------------------------------------------------------------------
// Strokes and sizes (research §4 table)
// ---------------------------------------------------------------------------

export function renderBoxPx(v: AnyVariant, sizePx: number): number {
  return v === 'V4' ? Math.max(D_MIN_BOX_PX, sizePx) : sizePx;
}

/** Frame stroke, px. A/B/C(+REF, FINAL): 1.25 / 1.5 / 2 / 2.5 at 16/24/32/48; D: 1.5 / 2 / 2.75 / 3.5. V0 = TrackGlyph's 2. */
export function frameStrokePx(v: AnyVariant, box: number): number {
  if (v === 'V0') return 2;
  if (v !== 'V4') return finalFrameStrokePx(box);
  const steps = [1.5, 2, 2.75, 3.5];
  return box <= 16 ? steps[0]! : box <= 24 ? steps[1]! : box <= 32 ? steps[2]! : steps[3]!;
}

export function iconStrokePx(v: AnyVariant, box: number): number {
  const f = frameStrokePx(v, box);
  return v === 'V2' ? f * 1.25 : v === 'V4' ? f * 0.9 : f;
}

// ---------------------------------------------------------------------------
// Icons (shared with production: components/symbol/geometry.ts)
// ---------------------------------------------------------------------------

function iconPrims(sensor: SensorType, frame: FrameKind, set: IconSet, w: number, color: string): PPrim[] {
  return sharedIconPrims(SENSOR_FUNCTION[sensor], frame, set, w, color);
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
  FINAL: { gauge: true, j: true }, // decided: gauge + J (drawn by describe.ts)
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
  /** FINAL only: icon geometry overrides (radar sweep, decision 5). */
  icon?: IconOpts | undefined;
}

/** FINAL: the production description for a bench cell. */
export function finalDescription(sensor: SensorType, frame: FrameKind, score: number, sizePx: number, opts: CellOpts = {}) {
  return describeTrackSymbol(
    { affiliation: FRAME_AFFILIATION[frame], sensorType: sensor, score, designation: FUNCTIONS[sensor].designation },
    { sizePx, detail: opts.detail, overlay: opts.overlay, icon: opts.icon },
  );
}

export function v4Detail(sizePx: number, detail?: boolean): boolean {
  return detail ?? renderBoxPx('V4', sizePx) >= D_LOD_BELOW_PX;
}

export function cellPrims(v: AnyVariant, sensor: SensorType, frame: FrameKind, score: number, sizePx: number, opts: CellOpts = {}): PPrim[] {
  // Amplifiers (T, J, echelon) are text / marks outside the measured symbol for every variant (V4's are SVG-only too).
  if (v === 'FINAL') return finalDescription(sensor, frame, score, sizePx, opts).prims.filter((q) => q.layer !== 'echelon');
  const box = renderBoxPx(v, sizePx);
  const u = 200 / box;
  const fw = frameStrokePx(v, box) * u;
  const iw = iconStrokePx(v, box) * u;
  const cues = opts.overlay === false ? {} : (opts.cues ?? VARIANT_CUES[v]);
  const blinkOn = opts.blinkOn ?? true;
  if (v === 'V0') {
    const aff = FRAME_AFFILIATION[frame];
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

/** Bench row metadata (fixture assumptions). Codes come from lib/track-sidc.ts. */
export interface FunctionCode {
  name: string;
  cite: string;
  eNote?: string;
  echelon: Echelon;
  designation: string;
}

export const FUNCTIONS: Record<SensorType, FunctionCode> = {
  offense: { name: 'Field artillery (cannonball)', cite: 'Table 5-3, p 5-11', echelon: 'battery', designation: 'B' },
  recon_static: { name: 'Reconnaissance (COLT/FIST), dismounted', cite: 'Table 5-3, p 5-13', eNote: '2525E 130400 = FA observer (different icon: triangle).', echelon: 'team', designation: 'A' },
  recon_mobile: { name: 'Reconnaissance, motorized', cite: 'Table 5-3 p 5-13 + Table 5-4 p 5-28', echelon: 'platoon', designation: 'R2' },
  detection: {
    name: 'FA target acquisition — radar',
    cite: 'Table 5-3, p 5-13',
    eNote: 'Not 130302: per research that subtype is 2525D (JMSML) only, absent from the 2525E tables.',
    echelon: 'platoon',
    designation: 'C',
  },
  defense: { name: 'Air defense (radar dome)', cite: 'Table 5-3, p 5-6', echelon: 'battery', designation: 'AD' },
};

export interface CellCodes {
  e: string;
  b: string;
  cot: string;
}

export function cellCodes(v: AnyVariant, sensor: SensorType, frame: FrameKind, withEchelon = false): CellCodes | undefined {
  if (v === 'V0') return undefined;
  const t = { affiliation: FRAME_AFFILIATION[frame], sensorType: sensor, echelon: withEchelon ? FUNCTIONS[sensor].echelon : null };
  return { e: toSidc2525E(t), b: toSidc2525C(t), cot: toCotType(t) };
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
  if (v === 'FINAL') return <SymbolGroup d={finalDescription(sensor, frame, score, sizePx, p)} />;
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
  if (v === 'FINAL') {
    const pad = finalDescription('offense', 'friend', Math.min(score, 0.59), sizePx).layout.pad;
    return [Math.max(6, pad.left + 2), Math.max(6, pad.right + 2)];
  }
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
  const vpad = pad?.[2] ?? Math.max(6, p.variant === 'V0' ? cellPad('V0', p.sizePx, p.score)[0] : 6) + ((p.variant === 'V4' && v4Detail(p.sizePx, p.detail)) || (p.variant === 'FINAL' && isDetail(p.sizePx, p.detail)) ? 6 : 0);
  const w = box + l + r;
  const h = box + 2 * vpad;
  const codes = cellCodes(p.variant, p.sensor, p.frame, (p.variant === 'V4' && v4Detail(p.sizePx, p.detail)) || p.variant === 'FINAL');
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
