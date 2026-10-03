// In-browser evaluator for Explorations/At-a-Glance Symbols — the research
// protocol T1–T7 (glance-symbology-research.md §5). Every image is drawn from
// GlanceSymbol.cellPrims(), i.e. exactly what the stories show. Story-only.
//
// Setup (§5.1): canvas 2s × 2s at DPR 1, symbol centred, composited on the map
// colour #06090d in linear RGB. Each image is rendered ONCE; vision channels
// are derived lazily from it:
//   alpha            silhouette (T1/T2, normal vision)
//   luma             Rec.709 relative luminance (T3/T4, normal vision)
//   lstar            CIE L*/100 (T5 grayscale)
//   deut / prot      luminance after Machado 2009 severity-1.0 simulation (T6)
//   L / A / B        CIE L*a*b* / 100 (T7 salience)
//
// Interpretations (documented on the bench):
//  - T3 measures the FUNCTION signal |L − L(frame only)|: the frame is common
//    to all five icons, so including it in Σmax would reward the n-gons, whose
//    whole silhouette is the function code.
//  - T4 templates are the mean of the 16 sub-pixel offsets (each rendered at
//    ≥ 128 px and box-downsampled), so the max-NCC classifier is not penalised
//    for the sub-pixel phase it is being tested on.
//  - T1 reruns under grayscale / CVD use the luminance contrast against the map
//    as the silhouette (alpha is vision-independent).

import type { SensorType } from '@hamilton/contracts';
import {
  MACHADO,
  T,
  addNoise,
  appearanceDistance,
  boxDownsample,
  contrastRatio,
  deltaE76,
  gaussianBlur,
  lstar,
  luma,
  mulberry32,
  rgbToLab,
  salienceRatio,
  simulateCvd,
  softIoU,
  srgbToLinear,
} from '@/lib/glance-metrics';
import type { FrameKind } from './MilSymbol';
import {
  DOCTRINAL_FILL,
  FRAME_COLS,
  ICON_DARK,
  REF_FILL,
  SENSOR_ROWS,
  cellPrims,
  renderBoxPx,
  type AnyVariant,
  type CellOpts,
  type PPrim,
} from './GlanceSymbol';

export const MAP_RGB: [number, number, number] = [6, 9, 13];
export type Vision = 'normal' | 'grayscale' | 'deuteranopia' | 'protanopia';
export const VISIONS: Vision[] = ['normal', 'grayscale', 'deuteranopia', 'protanopia'];

// ---------------------------------------------------------------------------
// Colour resolution
// ---------------------------------------------------------------------------

const varCache = new Map<string, string>();
function resolveCss(css: string): string {
  return css.replace(/var\((--[\w-]+)\)/g, (_, name: string) => {
    let v = varCache.get(name);
    if (v === undefined) {
      v = getComputedStyle(document.documentElement).getPropertyValue(name).trim() || '#ff00ff';
      varCache.set(name, v);
    }
    return v;
  });
}

let probe: CanvasRenderingContext2D | null = null;
/** CSS colour (incl. var(), oklch) → sRGB 0–255 + alpha 0–1, as the browser paints it. */
export function cssToRgb(css: string): [number, number, number, number] {
  if (!probe) {
    const c = document.createElement('canvas');
    c.width = 1;
    c.height = 1;
    probe = c.getContext('2d', { willReadFrequently: true });
  }
  const ctx = probe!;
  ctx.clearRect(0, 0, 1, 1);
  ctx.fillStyle = resolveCss(css);
  ctx.fillRect(0, 0, 1, 1);
  const d = ctx.getImageData(0, 0, 1, 1).data;
  return [d[0]!, d[1]!, d[2]!, d[3]! / 255];
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

let work: { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } | null = null;
function workCtx(px: number) {
  if (!work) {
    const canvas = document.createElement('canvas');
    work = { canvas, ctx: canvas.getContext('2d', { willReadFrequently: true })! };
  }
  if (work.canvas.width !== px) {
    work.canvas.width = px;
    work.canvas.height = px;
  }
  return work.ctx;
}

const lin = new Float32Array(256).map((_, i) => srgbToLinear(i / 255));
const MAP_LIN = MAP_RGB.map((c) => lin[c]!) as [number, number, number];

/** A rendered cell: linear RGB composited on the map + alpha, 2·box px square. */
export interface Raw {
  w: number;
  a: Float32Array;
  r: Float32Array;
  g: Float32Array;
  b: Float32Array;
  memo: Map<string, Float32Array>;
}

export interface RenderOpts {
  /** Integer supersample, box-downsampled back to 2·box. */
  k?: number;
  dx?: number;
  dy?: number;
  /** Map-tile grid line phase, px (T7). */
  tilePhase?: [number, number];
  /**
   * Average over these sub-pixel offsets (px, both axes) in the supersampled
   * image before downsampling — identical to rendering every offset and
   * averaging when offset·k is an integer (k is a multiple of 4).
   */
  shiftAverage?: readonly number[];
}

/** Separable mean over integer shifts (in px of a w × w plane), zero-filled. */
function shiftMean(img: Float32Array, w: number, shifts: number[]): Float32Array {
  const tmp = new Float32Array(img.length);
  const out = new Float32Array(img.length);
  const n = shifts.length;
  for (let y = 0; y < w; y++)
    for (let x = 0; x < w; x++) {
      let acc = 0;
      for (const s of shifts) acc += x - s >= 0 ? img[y * w + x - s]! : 0;
      tmp[y * w + x] = acc / n;
    }
  for (let y = 0; y < w; y++)
    for (let x = 0; x < w; x++) {
      let acc = 0;
      for (const s of shifts) acc += y - s >= 0 ? tmp[(y - s) * w + x]! : 0;
      out[y * w + x] = acc / n;
    }
  return out;
}

export function renderRaw(prims: PPrim[], box: number, opts: RenderOpts = {}): Raw {
  const k = opts.k ?? 1;
  const px = 2 * box * k;
  const ctx = workCtx(px);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, px, px);
  ctx.setTransform(k, 0, 0, k, 0, 0);
  ctx.translate(box / 2 + (opts.dx ?? 0), box / 2 + (opts.dy ?? 0));
  ctx.scale(box / 200, box / 200);
  ctx.lineJoin = 'round';
  for (const p of prims) {
    const path = new Path2D(p.d);
    ctx.globalAlpha = p.opacity ?? 1;
    if (p.mode === 'fill') {
      ctx.fillStyle = resolveCss(p.color);
      ctx.fill(path);
    } else {
      ctx.strokeStyle = resolveCss(p.color);
      ctx.lineWidth = p.w ?? 1;
      ctx.lineCap = p.cap ?? 'butt';
      ctx.setLineDash(p.dash ?? []);
      ctx.stroke(path);
    }
  }
  ctx.globalAlpha = 1;
  const data = ctx.getImageData(0, 0, px, px).data;
  const n = px * px;
  let a = new Float32Array(n);
  let r = new Float32Array(n);
  let g = new Float32Array(n);
  let b = new Float32Array(n);
  const tile = opts.tilePhase;
  const tileLin = tile ? (cssToRgb('var(--surface-elevated)').slice(0, 3).map((c) => lin[c]!) as [number, number, number]) : undefined;
  for (let i = 0; i < n; i++) {
    const al = data[i * 4 + 3]! / 255;
    let bg = MAP_LIN;
    if (tile && tileLin) {
      const x = (i % px) / k;
      const y = Math.floor(i / px) / k;
      if (Math.floor(x + tile[0]) % 48 === 0 || Math.floor(y + tile[1]) % 48 === 0) bg = tileLin;
    }
    a[i] = al;
    r[i] = lin[data[i * 4]!]! * al + bg[0] * (1 - al);
    g[i] = lin[data[i * 4 + 1]!]! * al + bg[1] * (1 - al);
    b[i] = lin[data[i * 4 + 2]!]! * al + bg[2] * (1 - al);
  }
  if (opts.shiftAverage && k % 4 === 0) {
    // Box-downsample to a ¼-px grid first (exact: downsampling commutes with
    // whole-cell shifts), shift-average there, then downsample by 4.
    const m = k / 4;
    const q = px / m;
    const down = (p: Float32Array) => (m > 1 ? boxDownsample(p, px, px, m) : p);
    const shifts = opts.shiftAverage.map((o) => Math.round(o * 4));
    const shifted = (p: Float32Array, bg: number) => {
      const d = down(p).map((x) => x - bg);
      return boxDownsample(shiftMean(d, q, shifts), q, q, 4).map((x) => x + bg);
    };
    a = shifted(a, 0);
    r = shifted(r, MAP_LIN[0]);
    g = shifted(g, MAP_LIN[1]);
    b = shifted(b, MAP_LIN[2]);
  } else if (k > 1) {
    a = boxDownsample(a, px, px, k);
    r = boxDownsample(r, px, px, k);
    g = boxDownsample(g, px, px, k);
    b = boxDownsample(b, px, px, k);
  }
  return { w: 2 * box, a, r, g, b, memo: new Map() };
}

type ChanName = 'alpha' | 'luma' | 'lstar' | 'deut' | 'prot' | 'L' | 'A' | 'B';

export function chan(raw: Raw, name: ChanName): Float32Array {
  const hit = raw.memo.get(name);
  if (hit) return hit;
  const n = raw.a.length;
  if (name === 'alpha') return raw.a;
  if (name === 'L' || name === 'A' || name === 'B') {
    const L = new Float32Array(n);
    const A = new Float32Array(n);
    const B = new Float32Array(n);
    const f = (t: number) => (t > 216 / 24389 ? Math.cbrt(t) : ((24389 / 27) * t + 16) / 116);
    for (let i = 0; i < n; i++) {
      const r = raw.r[i]!;
      const g = raw.g[i]!;
      const b = raw.b[i]!;
      const fx = f((0.4124564 * r + 0.3575761 * g + 0.1804375 * b) / 0.95047);
      const fy = f(0.2126729 * r + 0.7151522 * g + 0.072175 * b);
      const fz = f((0.0193339 * r + 0.119192 * g + 0.9503041 * b) / 1.08883);
      L[i] = (116 * fy - 16) / 100;
      A[i] = (500 * (fx - fy)) / 100;
      B[i] = (200 * (fy - fz)) / 100;
    }
    raw.memo.set('L', L);
    raw.memo.set('A', A);
    raw.memo.set('B', B);
    return raw.memo.get(name)!;
  }
  const out = new Float32Array(n);
  if (name === 'luma' || name === 'lstar') {
    for (let i = 0; i < n; i++) {
      const y = luma(raw.r[i]!, raw.g[i]!, raw.b[i]!);
      out[i] = name === 'luma' ? y : lstar(y) / 100;
    }
  } else {
    const M = MACHADO[name === 'deut' ? 'deuteranopia' : 'protanopia'];
    for (let i = 0; i < n; i++) {
      const r = raw.r[i]!;
      const g = raw.g[i]!;
      const b = raw.b[i]!;
      out[i] = luma(
        Math.max(0, M[0]![0]! * r + M[0]![1]! * g + M[0]![2]! * b),
        Math.max(0, M[1]![0]! * r + M[1]![1]! * g + M[1]![2]! * b),
        Math.max(0, M[2]![0]! * r + M[2]![1]! * g + M[2]![2]! * b),
      );
    }
  }
  raw.memo.set(name, out);
  return out;
}

const appearanceChan = (vision: Vision): ChanName => (vision === 'normal' ? 'luma' : vision === 'grayscale' ? 'lstar' : vision === 'deuteranopia' ? 'deut' : 'prot');
const MAP_VALUE: Record<ChanName, number> = { alpha: 0, luma: 0, lstar: 0, deut: 0, prot: 0, L: 0, A: 0, B: 0 };

/** Silhouette for T1: alpha (normal) or |V − V_map| normalised (other visions). */
function silhouette(raw: Raw, vision: Vision): Float32Array {
  if (vision === 'normal') return raw.a;
  const key = `sil-${vision}`;
  const hit = raw.memo.get(key);
  if (hit) return hit;
  const src = chan(raw, appearanceChan(vision));
  const bg = src[0] ?? MAP_VALUE.luma;
  const out = new Float32Array(src.length);
  let max = 1e-9;
  for (let i = 0; i < src.length; i++) {
    out[i] = Math.abs(src[i]! - bg);
    if (out[i]! > max) max = out[i]!;
  }
  for (let i = 0; i < out.length; i++) out[i] = out[i]! / max;
  raw.memo.set(key, out);
  return out;
}

/** |V − V(frame-only)|: the pixels that carry the function code (T3). */
function functionSignal(raw: Raw, base: Raw, vision: Vision): Float32Array {
  const a = chan(raw, appearanceChan(vision));
  const b = chan(base, appearanceChan(vision));
  const out = new Float32Array(a.length);
  for (let i = 0; i < a.length; i++) out[i] = Math.abs(a[i]! - b[i]!);
  return out;
}

/** Yield to the event loop. MessageChannel, not setTimeout: background tabs clamp timers to ≥ 1 s. */
const tick = () =>
  new Promise<void>((r) => {
    const ch = new MessageChannel();
    ch.port1.onmessage = () => r();
    ch.port2.postMessage(0);
  });

/** Seeded σ-0.02 noise fields, shared across visions and variants (same seed → same field). */
const noiseCache = new Map<string, Float32Array>();
function noiseField(len: number, seed: number): Float32Array {
  const key = `${len}:${seed}`;
  let z = noiseCache.get(key);
  if (!z) {
    z = addNoise(new Float32Array(len), T.t4.noise, seed);
    noiseCache.set(key, z);
  }
  return z;
}

/** Mean-centred template with its norm, for a fast max-NCC (same result as lib ncc/classifyNcc). */
function centred(t: Float32Array): { c: Float32Array; norm: number } {
  let m = 0;
  for (const x of t) m += x;
  m /= t.length;
  const c = t.map((x) => x - m);
  let ss = 0;
  for (const x of c) ss += x * x;
  return { c, norm: Math.sqrt(ss) };
}

function argmaxNcc(x: Float32Array, templates: { c: Float32Array; norm: number }[]): number {
  let m = 0;
  for (const v of x) m += v;
  m /= x.length;
  let ss = 0;
  for (const v of x) ss += (v - m) * (v - m);
  const nx = Math.sqrt(ss);
  let best = -Infinity;
  let idx = -1;
  templates.forEach((t, i) => {
    let dot = 0;
    for (let j = 0; j < x.length; j++) dot += (x[j]! - m) * t.c[j]!;
    const s = t.norm === 0 || nx === 0 ? 0 : dot / (t.norm * nx);
    if (s > best) {
      best = s;
      idx = i;
    }
  });
  return idx;
}

// ---------------------------------------------------------------------------
// Pair matrices
// ---------------------------------------------------------------------------

export interface PairMatrix {
  labels: string[];
  m: number[][];
}

function pairs(sets: Float32Array[][], metric: (a: Float32Array, b: Float32Array) => number, labels: string[], agg: 'max' | 'min'): PairMatrix {
  const n = labels.length;
  const m = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (i === j ? (agg === 'max' ? 1 : 0) : agg === 'max' ? -Infinity : Infinity)));
  for (const set of sets)
    for (let i = 0; i < n; i++)
      for (let j = i + 1; j < n; j++) {
        const s = metric(set[i]!, set[j]!);
        const next = agg === 'max' ? Math.max(m[i]![j]!, s) : Math.min(m[i]![j]!, s);
        m[i]![j] = next;
        m[j]![i] = next;
      }
  return { labels, m };
}

function extreme(pm: PairMatrix, agg: 'max' | 'min') {
  let value = agg === 'max' ? -Infinity : Infinity;
  let pair: [string, string] = ['', ''];
  pm.m.forEach((row, i) =>
    row.forEach((v, j) => {
      if (j > i && (agg === 'max' ? v > value : v < value)) {
        value = v;
        pair = [pm.labels[i]!, pm.labels[j]!];
      }
    }),
  );
  return { value, pair };
}

// ---------------------------------------------------------------------------
// T5 contrast / T6 ΔE
// ---------------------------------------------------------------------------

export interface ColourCheck {
  minContrast: { value: number; what: string };
  affiliationDeltaE: { value: number; pair: string };
  trustDeltaE: { value: number; pair: string };
  trustRedundant: boolean;
  affiliationRedundant: boolean;
}

const TRUST_TOKENS = ['var(--trust-watching)', 'var(--trust-degraded)', 'var(--trust-failed-stroke)'];

function fillsFor(v: AnyVariant): Record<FrameKind, string> {
  if (v === 'V0') return { friend: 'var(--affiliation-friendly)', hostile: 'var(--affiliation-enemy)', neutral: 'var(--affiliation-neutral)', unknown: 'var(--affiliation-unknown)' };
  if (v === 'V2') return { friend: 'var(--sym-ink)', hostile: 'var(--sym-ink)', neutral: 'var(--sym-ink)', unknown: 'var(--sym-ink)' };
  return v === 'REF' ? REF_FILL : DOCTRINAL_FILL;
}

export function colourCheck(v: AnyVariant, vision: Vision): ColourCheck {
  const sim = (rgb: [number, number, number]): [number, number, number] => {
    if (vision === 'deuteranopia' || vision === 'protanopia') return simulateCvd(rgb, vision);
    if (vision === 'grayscale') {
      const y = luma(lin[rgb[0]]!, lin[rgb[1]]!, lin[rgb[2]]!);
      const g = Math.round((y <= 0.0031308 ? 12.92 * y : 1.055 * y ** (1 / 2.4) - 0.055) * 255);
      return [g, g, g];
    }
    return rgb;
  };
  const rgb = (css: string) => sim(cssToRgb(css).slice(0, 3) as [number, number, number]);
  const fills = fillsFor(v);
  const map = sim(MAP_RGB);
  const checks: [string, number][] = [];
  for (const f of FRAME_COLS) {
    const fill = rgb(fills[f]);
    if (v === 'V0') checks.push([`${f} polygon vs map`, contrastRatio(fill, map)]);
    else if (v === 'V2') checks.push(['ink frame vs map', contrastRatio(rgb('var(--sym-ink)'), map)]);
    else {
      checks.push([`${f} fill vs map`, contrastRatio(fill, map)]);
      checks.push([`icon vs ${f} fill`, contrastRatio(rgb(v === 'REF' ? '#000000' : ICON_DARK), fill)]);
    }
  }
  if (v !== 'REF') for (const t of TRUST_TOKENS) checks.push([`${t.slice(6, -1)} vs map`, contrastRatio(rgb(t), map)]);
  const minC = checks.reduce((m, c) => (c[1] < m[1] ? c : m));
  const lab = (c: [number, number, number]) => rgbToLab(...c);
  let aff = { value: Infinity, pair: '' };
  FRAME_COLS.forEach((a, i) =>
    FRAME_COLS.slice(i + 1).forEach((b) => {
      const d = deltaE76(lab(rgb(fills[a])), lab(rgb(fills[b])));
      if (d < aff.value) aff = { value: d, pair: `${a}/${b}` };
    }),
  );
  let tr = { value: Infinity, pair: '—' };
  if (v !== 'REF')
    for (const t of TRUST_TOKENS)
      for (const f of [...FRAME_COLS, 'map'] as const) {
        const d = deltaE76(lab(rgb(t)), lab(f === 'map' ? map : rgb(fills[f])));
        if (d < tr.value) tr = { value: d, pair: `${t.slice(6, -1)}/${f}` };
      }
  return {
    minContrast: { value: minC[1], what: minC[0] },
    affiliationDeltaE: aff,
    trustDeltaE: tr,
    // V0: halo radius; A–D: gauge length / outline width / J text.
    trustRedundant: true,
    // V0: fill / outline / dash; doctrinal: frame shape.
    affiliationRedundant: true,
  };
}

// ---------------------------------------------------------------------------
// T7 — salience ratio R
// ---------------------------------------------------------------------------

export type SearchCondition = 'i' | 'ii' | 'iii' | 'iv';
export const SEARCH_CONDITIONS: Record<SearchCondition, string> = {
  i: 'hostile among friends',
  ii: 'friend among hostiles',
  iii: 'FA among TA radar (friend)',
  iv: '(i) with mixed trust overlays',
};

function t7(v: AnyVariant, cond: SearchCondition, n: number, seed = 7): number {
  const size = T.t1.sizePx;
  const box = renderBoxPx(v, size);
  const rnd = mulberry32(seed + n * 31 + cond.charCodeAt(0));
  const bands = [0.95, 0.7, 0.45, 0.2];
  const px = 2 * box;
  const item = (s: SensorType, f: FrameKind, score: number, overlay: boolean) => {
    const raw = renderRaw(cellPrims(v, s, f, score, size, { overlay, blinkOn: false }), box, {
      dx: Math.floor(rnd() * 4) / 4,
      dy: Math.floor(rnd() * 4) / 4,
      tilePhase: [Math.floor(rnd() * 48), Math.floor(rnd() * 48)],
    });
    const planes = (['L', 'A', 'B'] as const).map((c) => gaussianBlur(chan(raw, c), px, px, 1));
    const out = new Float32Array(3 * px * px);
    planes.forEach((p, ci) => out.set(p, ci * px * px));
    return out;
  };
  const spec: Record<SearchCondition, { t: [SensorType, FrameKind]; d: [SensorType, FrameKind]; mixed: boolean }> = {
    i: { t: ['offense', 'hostile'], d: ['offense', 'friend'], mixed: false },
    ii: { t: ['offense', 'friend'], d: ['offense', 'hostile'], mixed: false },
    iii: { t: ['offense', 'friend'], d: ['detection', 'friend'], mixed: false },
    iv: { t: ['offense', 'hostile'], d: ['offense', 'friend'], mixed: true },
  };
  const c = spec[cond];
  const pick = () => (c.mixed ? bands[Math.floor(rnd() * bands.length)]! : 0.95);
  const target = item(c.t[0], c.t[1], pick(), c.mixed);
  const distractors = Array.from({ length: n - 1 }, () => item(c.d[0], c.d[1], pick(), c.mixed));
  return salienceRatio([target], distractors);
}

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

export interface ClassifierResult {
  sizePx: number;
  affiliation: number;
  function: number;
}

export interface VisionResult {
  t1: { sigma1: { max: number; pair: [string, string]; friendHostile: number }; sigma2: { max: number; pair: [string, string] }; pass: boolean };
  t3: { minD: number; pair: [string, string] };
  t4: ClassifierResult[];
  t4pass: boolean;
  colour: ColourCheck;
}

export interface SuiteResult {
  /** Section timings, ms. */
  lap: Record<string, number>;
  variant: AnyVariant;
  t1Heat: PairMatrix;
  fnHeat: PairMatrix;
  t3Heat: PairMatrix;
  t2: { maxRise: number; pair: [string, string]; score: number; pass: boolean };
  visions: Record<Vision, VisionResult>;
  t7: Record<SearchCondition, Record<number, number>>;
  t7pass: boolean;
  ms: number;
}

export function t4Pass(v: AnyVariant, r: ClassifierResult[]): boolean {
  const at = (s: number) => r.find((x) => x.sizePx === s)!;
  const base = at(16).affiliation >= T.t4.affiliationAt16 && at(24).function >= T.t4.functionAt24 && at(32).function >= T.t4.functionAt32;
  return v === 'V4' ? base && at(16).function >= T.t4.functionAt16HighGlance : base;
}

const suiteCache = new Map<AnyVariant, Promise<SuiteResult>>();
const done = new Map<AnyVariant, SuiteResult>();
let chain: Promise<void> = Promise.resolve();

export function suiteIfDone(v: AnyVariant): SuiteResult | undefined {
  return done.get(v);
}

/** Runs T1–T7 for one variant (cached), yielding to the UI between steps. */
export function runSuite(v: AnyVariant): Promise<SuiteResult> {
  let p = suiteCache.get(v);
  if (!p) {
    // One suite at a time: honest timings, and the page stays responsive between steps.
    p = chain.then(() => computeSuite(v));
    chain = p.then(
      () => undefined,
      () => undefined,
    );
    suiteCache.set(v, p);
  }
  return p;
}

async function computeSuite(v: AnyVariant): Promise<SuiteResult> {
  const t0 = performance.now();
  const lap: Record<string, number> = {};
  let tl = t0;
  const mark = (k: string) => {
    const now = performance.now();
    lap[k] = Math.round(now - tl);
    tl = now;
  };
  const visions = {} as Record<Vision, VisionResult>;

  // --- T1 / T2: s 24, frames per sensor row --------------------------------
  const s1 = T.t1.sizePx;
  const b1 = renderBoxPx(v, s1);
  const t1Raws = (score: number, overlay: boolean) =>
    SENSOR_ROWS.map((s) => FRAME_COLS.map((f) => renderRaw(cellPrims(v, s, f, score, s1, { overlay, blinkOn: false }), b1)));
  const base = t1Raws(0.95, false);
  const blurSets = (raws: Raw[][], vision: Vision, sigma: number) => raws.map((row) => row.map((r) => gaussianBlur(silhouette(r, vision), 2 * b1, 2 * b1, sigma)));
  const t1Of = (vision: Vision) => {
    const m1 = pairs(blurSets(base, vision, 1), softIoU, [...FRAME_COLS], 'max');
    const m2 = pairs(blurSets(base, vision, 2), softIoU, [...FRAME_COLS], 'max');
    const o1 = extreme(m1, 'max');
    const o2 = extreme(m2, 'max');
    const fh = m1.m[0]![1]!;
    return {
      m1,
      r: {
        sigma1: { max: o1.value, pair: o1.pair, friendHostile: fh },
        sigma2: { max: o2.value, pair: o2.pair },
        pass: o1.value <= T.t1.sigma1Max && fh <= T.t1.friendHostileMax && o2.value <= T.t1.sigma2Max,
      },
    };
  };
  await tick();
  let t2 = { maxRise: -Infinity, pair: ['', ''] as [string, string], score: 0.45, pass: true };
  for (const score of [0.45, 0.2]) {
    const off = pairs(blurSets(t1Raws(score, false), 'normal', 1), softIoU, [...FRAME_COLS], 'max');
    const on = pairs(blurSets(t1Raws(score, true), 'normal', 1), softIoU, [...FRAME_COLS], 'max');
    on.m.forEach((row, i) =>
      row.forEach((val, j) => {
        if (j > i && val - off.m[i]![j]! > t2.maxRise) t2 = { maxRise: val - off.m[i]![j]!, pair: [FRAME_COLS[i]!, FRAME_COLS[j]!], score, pass: true };
      }),
    );
    await tick();
  }
  t2.pass = t2.maxRise <= T.t2.maxRise;
  mark('t1t2');

  // --- T3: s 32, function signal per frame ---------------------------------
  const s3 = T.t3.sizePx;
  const b3 = renderBoxPx(v, s3);
  const isBase = (p: PPrim) => (v === 'V0' ? false : p.layer !== 'icon' && p.layer !== 'cue');
  const t3Raws = FRAME_COLS.map((f) => ({
    base: renderRaw(cellPrims(v, 'offense', f, 0.95, s3, { overlay: false }).filter(isBase), b3),
    fns: SENSOR_ROWS.map((s) => renderRaw(cellPrims(v, s, f, 0.95, s3, { overlay: false, blinkOn: false }), b3)),
  }));
  const signals = (vision: Vision) => t3Raws.map(({ base: bse, fns }) => fns.map((r) => gaussianBlur(functionSignal(r, bse, vision), 2 * b3, 2 * b3, 1)));
  const fnHeat = pairs(
    signals('normal').map((row) =>
      row.map((sig) => {
        let max = 1e-9;
        for (const x of sig) if (x > max) max = x;
        return sig.map((x) => x / max);
      }),
    ),
    softIoU,
    [...SENSOR_ROWS],
    'max',
  );
  await tick();

  mark('t3');
  // --- T4: render once per size, evaluate every vision --------------------
  const offs = T.t4.offsets;
  const classify = (tmpl: Raw[][], tests: Raw[][][], vision: Vision) => {
    let hit = 0;
    let n = 0;
    let seed = 1;
    const c = appearanceChan(vision);
    tmpl.forEach((row, ri) => {
      const templates = row.map((r) => centred(chan(r, c)));
      tests[ri]!.forEach((cls, ci) =>
        cls.forEach((r) => {
          n++;
          const x = chan(r, c);
          const noisy = new Float32Array(x.length);
          const z = noiseField(x.length, seed++);
          for (let i = 0; i < x.length; i++) noisy[i] = x[i]! + z[i]!;
          if (argmaxNcc(noisy, templates) === ci) hit++;
        }),
      );
    });
    return hit / n;
  };

  const t4ByVision = new Map<Vision, ClassifierResult[]>(VISIONS.map((x) => [x, []]));
  for (const size of [16, 24, 32]) {
    const box = renderBoxPx(v, size);
    // k: multiple of 4 so every ¼-px offset is an integer shift at supersample.
    const k = 4 * Math.ceil(T.t4.templatePx / box / 4);
    const prim = (s: SensorType, f: FrameKind) => cellPrims(v, s, f, 0.95, size, { overlay: false });
    const tmpl = (s: SensorType, f: FrameKind) => renderRaw(prim(s, f), box, { k, shiftAverage: offs });
    const tests = (s: SensorType, f: FrameKind) => offs.flatMap((dx) => offs.map((dy) => renderRaw(prim(s, f), box, { dx, dy })));
    const tmplA = SENSOR_ROWS.map((s) => FRAME_COLS.map((f) => tmpl(s, f)));
    const testsA = SENSOR_ROWS.map((s) => FRAME_COLS.map((f) => tests(s, f)));
    await tick();
    const tmplF = FRAME_COLS.map((f) => SENSOR_ROWS.map((s) => tmpl(s, f)));
    const testsF = FRAME_COLS.map((f) => SENSOR_ROWS.map((s) => tests(s, f)));
    for (const vision of VISIONS) {
      t4ByVision.get(vision)!.push({ sizePx: size, affiliation: classify(tmplA, testsA, vision), function: classify(tmplF, testsF, vision) });
    }
    await tick();
  }
  mark('t4');
  // --- per vision ----------------------------------------------------------
  let t1Heat: PairMatrix | undefined;
  let t3Heat: PairMatrix | undefined;
  for (const vision of VISIONS) {
    const { m1, r } = t1Of(vision);
    const m3 = pairs(signals(vision), appearanceDistance, [...SENSOR_ROWS], 'min');
    if (vision === 'normal') {
      t1Heat = m1;
      t3Heat = m3;
    }
    const o3 = extreme(m3, 'min');
    const t4r = t4ByVision.get(vision)!;
    visions[vision] = { t1: r, t3: { minD: o3.value, pair: o3.pair }, t4: t4r, t4pass: t4Pass(v, t4r), colour: colourCheck(v, vision) };
    await tick();
  }

  mark('visions');
  // --- T7 -----------------------------------------------------------------
  const t7r = {} as Record<SearchCondition, Record<number, number>>;
  let t7pass = true;
  for (const cond of Object.keys(SEARCH_CONDITIONS) as SearchCondition[]) {
    t7r[cond] = {};
    for (const n of T.t7.sizes) {
      const r = t7(v, cond, n);
      t7r[cond][n] = r;
      if (r < T.t7.minR) t7pass = false;
    }
    await tick();
  }

  mark('t7');
  const res: SuiteResult = { lap, variant: v, t1Heat: t1Heat!, fnHeat, t3Heat: t3Heat!, t2, visions, t7: t7r, t7pass, ms: Math.round(performance.now() - t0) };
  done.set(v, res);
  if (typeof window !== 'undefined') {
    const w = window as unknown as { __glanceSuite?: Record<string, unknown> };
    w.__glanceSuite = { ...(w.__glanceSuite ?? {}), [v]: summarise(res) };
  }
  return res;
}

/** T3 thresholds are relative to REF and V0 (both must be done). */
export function t3Pass(v: AnyVariant, vision: Vision): { pass: boolean; ref: number; ngon: number } | undefined {
  const ref = done.get('REF');
  const ngon = done.get('V0');
  const mine = done.get(v);
  if (!ref || !ngon || !mine) return undefined;
  const R = ref.visions[vision].t3.minD;
  const N = ngon.visions[vision].t3.minD;
  const m = mine.visions[vision].t3.minD;
  return { pass: m >= R - 1e-9 && m >= T.t3.vsNgonFactor * N, ref: R, ngon: N };
}

const r3 = (x: number) => Math.round(x * 1000) / 1000;
export function summarise(r: SuiteResult) {
  const n = r.visions.normal;
  return {
    t1: { s1max: r3(n.t1.sigma1.max), s1pair: n.t1.sigma1.pair.join('/'), fh: r3(n.t1.sigma1.friendHostile), s2max: r3(n.t1.sigma2.max), pass: n.t1.pass },
    t2: { maxRise: r3(r.t2.maxRise), pair: r.t2.pair.join('/'), pass: r.t2.pass },
    t3: { minD: r3(n.t3.minD), pair: n.t3.pair.join('/') },
    t4: n.t4.map((x) => ({ s: x.sizePx, aff: r3(x.affiliation), fn: r3(x.function) })),
    t4pass: n.t4pass,
    t5: { t1pass: r.visions.grayscale.t1.pass, t4pass: r.visions.grayscale.t4pass, t3: r3(r.visions.grayscale.t3.minD), minContrast: r3(r.visions.grayscale.colour.minContrast.value), what: r.visions.grayscale.colour.minContrast.what },
    t6: {
      deutT1: r.visions.deuteranopia.t1.pass,
      protT1: r.visions.protanopia.t1.pass,
      deutT4: r.visions.deuteranopia.t4pass,
      protT4: r.visions.protanopia.t4pass,
      deutAffDE: r3(r.visions.deuteranopia.colour.affiliationDeltaE.value),
      deutTrustDE: r3(r.visions.deuteranopia.colour.trustDeltaE.value),
    },
    t7: Object.fromEntries(Object.entries(r.t7).map(([c, byN]) => [c, r3(Math.min(...Object.values(byN)))])),
    t7pass: r.t7pass,
    ms: r.ms,
    lap: r.lap,
  };
}
