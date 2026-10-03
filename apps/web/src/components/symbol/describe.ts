// The decided track symbol (Storybook Decisions/Track Symbology), described as
// renderer-neutral primitives + text amplifiers in the 200-unit box:
//
//  1. Base = V1 / research A: doctrinal filled frames (Table 4-1 p 4-3) with
//     dark-tuned 2525C fills, frame line in --sym-ink, enlarged Table 5-3 icons
//     in ICON_DARK. Combined with V4's unit-label treatment: T left of the frame
//     (Fig 4-2 p 4-5), mono 400, never smaller than a 24 px symbol's label, and
//     below 28 px (level of detail) every amplifier except T — and the echelon —
//     is hidden. V4's frame / stroke changes are NOT taken.
//  2. Trust = H2 side gauge (fill height = score) + J text, both OUTSIDE the
//     frame. No circular halo, no frame outline, no blink.
//  3. J = evaluation rating (Table 4-4 p 4-6) from link-trust-rating.ts (J split:
//     score → letter, corroboration → digit, STALE → F6, S2 override).
//  5. TA-radar glyph enlarged within the frame (geometry.ts TA_RADAR_SCALE).
//
// React (TrackSymbol.tsx), the SVG string / data-URL renderer (svg-string.ts)
// and the bench evaluator all draw from describeTrackSymbol().

import type { Affiliation, SensorType } from '@hamilton/contracts';
import { rateLinkTrust, NRT, type Corroboration, type JOverride, type LinkTrustRating, type TrustComponentsLike } from '@/lib/link-trust-rating';
import {
  AFFILIATION_FRAME,
  SYMBOL_FUNCTIONS,
  echelonOf,
  symbolFunctionOf,
  toCotType,
  toSidc2525C,
  toSidc2525E,
  type Echelon,
  type FrameKind,
  type SymbolFunction,
  type SymbolStatus,
} from '@/lib/track-sidc';
import {
  CHAR_W,
  DOCTRINAL_FILL,
  FRAME_BOX_200,
  FRAME_D,
  ICON_DARK,
  LOD_BELOW_PX,
  frameStrokePx,
  iconPrims,
  labelFontPx,
  trustStrokeVar,
  type IconOpts,
  type PPrim,
} from './geometry';

/** A track as the symbol needs it. Shapes match TrackState / the contracts where they overlap. */
export interface SymbolTrack {
  affiliation: Affiliation;
  /** Contract sensor type → function (SENSOR_FUNCTION). */
  sensorType?: SensorType | undefined;
  /** Explicit function; wins over sensorType (e.g. 'ew-jamming' for hostile_ew_1). */
  fn?: SymbolFunction | undefined;
  /** Omitted → the function's default (fixture assumption); null → none. */
  echelon?: Echelon | null | undefined;
  /** T amplifier (unique designation). */
  designation?: string | undefined;
  /** Status 1 (anticipated / planned) dashes the frame — the ONLY reason a frame is dashed. */
  status?: SymbolStatus | undefined;
  /** Link-trust score. Omit for entities that are not trust-scored (jammer, candidates). */
  score?: number | undefined;
  /** Trust components, for the tooltip breakdown. */
  components?: TrustComponentsLike | undefined;
  /** Past STALE_AFTER_S: frame line greys, J = F6, AR = NRT. */
  stale?: boolean | undefined;
  /** Credibility axis of J (default uncorroborated). */
  corroboration?: Corroboration | undefined;
  /** S2 override of J. */
  jOverride?: JOverride | undefined;
  /** H amplifier (additional information), right. */
  info?: string | undefined;
}

export interface SymbolOptions {
  /** Symbol box, px (the frame's nominal size). */
  sizePx: number;
  /** Force the detail (true) or level-of-detail (false) state; default: box ≥ 28 px. */
  detail?: boolean | undefined;
  selected?: boolean | undefined;
  /** Hover / focus: reveals J at ≥ 0.60 too (detail state only). */
  active?: boolean | undefined;
  /** false = strip the Hamilton link-trust overlay (the gauge). J stays: it is a doctrinal field. */
  overlay?: boolean | undefined;
  /** Bench sweeps only. */
  icon?: IconOpts | undefined;
}

export interface SymbolText {
  x: number;
  y: number;
  anchor: 'start' | 'end';
  text: string;
  color: string;
  field: 'T' | 'J' | 'AR' | 'H';
}

export interface SymbolLayout {
  box: number;
  /** 200 / box: 200-units per px. */
  u: number;
  fontPx: number;
  /** Room around the 200-unit box, px — for standalone SVGs / billboards. */
  pad: { left: number; right: number; top: number; bottom: number };
}

export interface SymbolDescription {
  frame: FrameKind;
  fn: SymbolFunction;
  detail: boolean;
  rating: LinkTrustRating | undefined;
  prims: PPrim[];
  texts: SymbolText[];
  layout: SymbolLayout;
  codes: { sidc2525E: string; sidc2525C: string; cot: string };
  /** Accessible name. */
  label: string;
}

const GAUGE_W_PX = 3;
const GAP_PX = 3;
const SELECT_PX = [3, 5.5] as const;

export function isDetail(sizePx: number, detail?: boolean): boolean {
  return detail ?? sizePx >= LOD_BELOW_PX;
}

/** Gauge x offset from the frame's right edge, px: right next to the frame (clear of the selection frame); J / AR / H follow it. */
export function gaugeOffsetPx(selected = false): number {
  return GAP_PX + (selected ? SELECT_PX[1] + 1.5 : 0);
}

function echelonPrims(e: Echelon, y0: number, u: number, color: string): PPrim[] {
  // Table 5-6 p 5-33: team Ø, platoon •••, battery |. Base 2 px above the frame.
  const yb = y0 - 2 * u;
  if (e === 'battery') return [{ d: `M100,${yb - 31.25} L100,${yb}`, mode: 'stroke', color, layer: 'echelon', w: 1.5 * u }];
  if (e === 'team') {
    const r = 12.5;
    const cy = yb - r - 1.9;
    return [
      { d: `M${100 - r},${cy} a${r},${r} 0 1,0 ${2 * r},0 a${r},${r} 0 1,0 ${-2 * r},0 Z`, mode: 'stroke', color, layer: 'echelon', w: 1.25 * u },
      { d: `M${100 - 17.5},${yb + 3.75} L${100 + 17.5},${yb - 2 * r - 7.5}`, mode: 'stroke', color, layer: 'echelon', w: 1.25 * u },
    ];
  }
  const r = 8.1;
  return [75, 100, 125].map((x) => ({ d: `M${x - r},${yb - r} a${r},${r} 0 1,0 ${2 * r},0 a${r},${r} 0 1,0 ${-2 * r},0 Z`, mode: 'fill' as const, color, layer: 'echelon' as const }));
}

export function describeTrackSymbol(t: SymbolTrack, o: SymbolOptions): SymbolDescription {
  const box = o.sizePx;
  const u = 200 / box;
  const frame = AFFILIATION_FRAME[t.affiliation];
  const fn = symbolFunctionOf(t);
  const detail = isDetail(box, o.detail);
  const overlay = o.overlay !== false;
  const stale = t.stale ?? false;
  const scored = t.score !== undefined;
  const rating = scored ? rateLinkTrust(t.score!, { stale, corroboration: t.corroboration, override: t.jOverride }) : undefined;
  const [x0, y0, x1, y1] = FRAME_BOX_200[frame];
  const fw = frameStrokePx(box) * u;
  const ink = stale ? 'var(--sym-ink-stale)' : 'var(--sym-ink)';
  const font = labelFontPx(box);

  const prims: PPrim[] = [];
  // ---- trust gauge (Hamilton link-trust overlay, non-2525) ----------------
  const gx = x1 + gaugeOffsetPx(o.selected) * u;
  const gw = GAUGE_W_PX * u;
  if (rating && overlay) {
    const h = y1 - y0;
    const fill = Math.max(0, Math.min(1, rating.score)) * h;
    prims.push({ d: `M${gx},${y1 - fill} h${gw} v${fill} h${-gw} Z`, mode: 'fill', color: stale ? 'var(--sym-ink-stale)' : trustStrokeVar(rating.score), layer: 'cue' });
    prims.push({ d: `M${gx},${y0} h${gw} v${h} h${-gw} Z`, mode: 'stroke', color: ink, layer: 'cue', w: 0.75 * u });
  }
  // ---- frame, fill, icon ----------------------------------------------------
  prims.push({ d: FRAME_D[frame], mode: 'fill', color: DOCTRINAL_FILL[frame], layer: 'frame' });
  prims.push({
    d: FRAME_D[frame],
    mode: 'stroke',
    color: ink,
    layer: 'frame',
    w: fw,
    dash: t.status === 'anticipated' ? [4 * u, 3 * u] : undefined,
  });
  prims.push(...iconPrims(fn, frame, 'final', fw, ICON_DARK, o.icon));
  // ---- echelon (detail only) -----------------------------------------------
  const ech = echelonOf(t);
  if (detail && ech) prims.push(...echelonPrims(ech, y0, u, ink));
  // ---- selection: solid double frame --------------------------------------
  if (o.selected) {
    const half = Math.max(x1 - x0, y1 - y0) / 2;
    for (const px of SELECT_PX) {
      const f = 1 + (px * u) / half;
      prims.push({ d: FRAME_D[frame], mode: 'stroke', color: 'var(--sym-select)', layer: 'select', w: (1.25 * u) / f, scale: f });
    }
  }

  // ---- text amplifiers -----------------------------------------------------
  const texts: SymbolText[] = [];
  const selGap = o.selected ? SELECT_PX[1] + 1.5 : 0;
  if (t.designation) texts.push({ x: x0 - (GAP_PX + selGap) * u, y: 100, anchor: 'end', text: t.designation, color: 'var(--sym-ink)', field: 'T' });
  const right: Omit<SymbolText, 'x' | 'y' | 'anchor'>[] = [];
  if (detail) {
    if (rating && (rating.visibleAtRest || o.active)) right.push({ text: rating.jCode, color: ink, field: 'J' });
    if (rating?.stale) right.push({ text: NRT, color: 'var(--sym-ink)', field: 'AR' });
    if (t.info) right.push({ text: t.info, color: 'var(--text-secondary)', field: 'H' });
  }
  const lh = font * 1.2 * u;
  // J / AR / H column right of the gauge, so no field moves when J appears.
  const gaugeOn = !!rating && overlay;
  const rightStartPx = gaugeOffsetPx(o.selected) + (gaugeOn ? GAUGE_W_PX + GAP_PX : 0);
  const rx = x1 + rightStartPx * u;
  right.forEach((r, i) => texts.push({ ...r, x: rx, y: 100 + (i - (right.length - 1) / 2) * lh, anchor: 'start' }));

  // ---- layout (px beyond the box square on each side) ---------------------
  const textW = (s: string) => s.length * CHAR_W * font;
  const leftText = t.designation ? GAP_PX + selGap + textW(t.designation) + 2 : 0;
  const rightText = right.length ? rightStartPx + Math.max(...right.map((r) => textW(r.text))) + 2 : 0;
  const rightGauge = gaugeOn ? gaugeOffsetPx(o.selected) + GAUGE_W_PX + 2 : 0;
  const sel = o.selected ? SELECT_PX[1] + 1 : 0;
  const echPx = detail && ech ? 2 + 33 / u : 0;
  const half = box / 2;
  const pad = {
    left: Math.max(0, (100 - x0) / u + Math.max(leftText, sel) - half) + 1,
    right: Math.max(0, (x1 - 100) / u + Math.max(rightText, rightGauge, sel) - half) + 1,
    top: Math.max(0, (100 - y0) / u + Math.max(echPx, sel) - half) + 1,
    bottom: Math.max(0, (y1 - 100) / u + sel - half) + 1,
  };

  const codes = { sidc2525E: toSidc2525E(t), sidc2525C: toSidc2525C(t), cot: toCotType(t) };
  const label = [
    t.designation,
    `${frame} ${SYMBOL_FUNCTIONS[fn].name}`,
    t.status === 'anticipated' ? 'anticipated' : undefined,
    rating ? `link trust ${rating.label} ${rating.score.toFixed(2)}, J ${rating.jCode}${rating.override ? ` (${rating.override.by} override, auto ${rating.autoJ})` : ''}` : undefined,
    t.info,
  ]
    .filter(Boolean)
    .join(' · ');
  return { frame, fn, detail, rating, prims, texts, layout: { box, u, fontPx: font, pad }, codes, label };
}
