// At-a-glance symbol metrics: silhouette similarity, colour science and a
// seeded RNG for the odd-one-out search task. Used by the At-a-Glance bench
// (Decisions/Evidence, Archive/At-a-Glance Variants) — story tooling, not
// imported by the app. SIDC assembly lives in track-sidc.ts.
//
// Deliberately dependency-free (no '@/…' imports, no DOM) so it runs under
// `node --test` with native type stripping. Rasterisation happens in the
// browser (canvas + Path2D); everything here works on plain Float32Arrays of
// coverage in [0, 1], row-major, w × h.

// ---------------------------------------------------------------------------
// Protocol constants (documented on the bench; replace when a validated
// protocol is adopted)
// ---------------------------------------------------------------------------

/** Raster size (symbol box) for the heatmaps, px. Canvas = 2s × 2s (research §5.1). */
export const RASTER_PX = 24;
/** Glance blur, px (research §5.3 T1: σ 1 and 2). */
export const GLANCE_SIGMA_PX = 1;
/** Coverage threshold for the binary IoU / Hamming metrics. */
export const BINARY_THRESHOLD = 0.5;
/** T1: any pair at or above this soft IoU fails ("indistinguishable"). */
export const INDISTINGUISHABLE_AT = 0.85;
/** The original brief's 0.8 flag, kept as "confusable". */
export const CONFUSABLE_AT = 0.8;

/** Research protocol thresholds (glance-symbology-research.md §5.3). */
export const T = {
  t1: { sigma1Max: 0.85, friendHostileMax: 0.7, sigma2Max: 0.92, sizePx: 24 },
  t2: { maxRise: 0.05 },
  t3: { sizePx: 32, vsNgonFactor: 1.5 },
  t4: { offsets: [0, 0.25, 0.5, 0.75], noise: 0.02, templatePx: 128, affiliationAt16: 1, functionAt24: 0.95, functionAt32: 1, functionAt16HighGlance: 0.95 },
  t5: { minContrast: 3 },
  t6: { minDeltaE: 20 },
  t7: { minR: 2, sizes: [8, 16, 32] },
  t8: { maxSlopeMsPerItem: 10, vsNgonFactor: 0.5 },
} as const;

export type Verdict = 'indistinguishable' | 'confusable' | 'distinct';

export function verdict(similarity: number): Verdict {
  if (similarity >= INDISTINGUISHABLE_AT) return 'indistinguishable';
  if (similarity >= CONFUSABLE_AT) return 'confusable';
  return 'distinct';
}

// ---------------------------------------------------------------------------
// Image maths
// ---------------------------------------------------------------------------

/** Normalised 1-D Gaussian kernel, radius ceil(3σ). */
export function gaussianKernel(sigma: number): Float32Array {
  const r = Math.max(1, Math.ceil(3 * sigma));
  const k = new Float32Array(2 * r + 1);
  let sum = 0;
  for (let i = -r; i <= r; i++) {
    const v = Math.exp(-(i * i) / (2 * sigma * sigma));
    k[i + r] = v;
    sum += v;
  }
  for (let i = 0; i < k.length; i++) k[i] = (k[i] ?? 0) / sum;
  return k;
}

/** Separable Gaussian blur with zero padding (the map is dark beyond the raster). */
export function gaussianBlur(img: Float32Array, w: number, h: number, sigma: number): Float32Array {
  if (sigma <= 0) return Float32Array.from(img);
  const k = gaussianKernel(sigma);
  const r = (k.length - 1) / 2;
  const tmp = new Float32Array(w * h);
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let acc = 0;
      for (let i = -r; i <= r; i++) {
        const xx = x + i;
        if (xx >= 0 && xx < w) acc += (img[y * w + xx] ?? 0) * (k[i + r] ?? 0);
      }
      tmp[y * w + x] = acc;
    }
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let acc = 0;
      for (let i = -r; i <= r; i++) {
        const yy = y + i;
        if (yy >= 0 && yy < h) acc += (tmp[yy * w + x] ?? 0) * (k[i + r] ?? 0);
      }
      out[y * w + x] = acc;
    }
  }
  return out;
}

/** Soft (Ruzicka / weighted Jaccard) IoU: Σ min(a, b) / Σ max(a, b). 1 = identical. Both empty → 1. */
export function softIoU(a: Float32Array, b: Float32Array): number {
  let num = 0;
  let den = 0;
  for (let i = 0; i < a.length; i++) {
    const x = a[i] ?? 0;
    const y = b[i] ?? 0;
    num += Math.min(x, y);
    den += Math.max(x, y);
  }
  return den === 0 ? 1 : num / den;
}

/** Binary IoU of the masks at `threshold`. Both empty → 1. */
export function binaryIoU(a: Float32Array, b: Float32Array, threshold = BINARY_THRESHOLD): number {
  let inter = 0;
  let union = 0;
  for (let i = 0; i < a.length; i++) {
    const x = (a[i] ?? 0) >= threshold;
    const y = (b[i] ?? 0) >= threshold;
    if (x && y) inter++;
    if (x || y) union++;
  }
  return union === 0 ? 1 : inter / union;
}

/** Hamming distance of the binary masks, as a fraction of all pixels (0 = identical). */
export function hammingFraction(a: Float32Array, b: Float32Array, threshold = BINARY_THRESHOLD): number {
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    if (((a[i] ?? 0) >= threshold) !== ((b[i] ?? 0) >= threshold)) diff++;
  }
  return a.length === 0 ? 0 : diff / a.length;
}

export interface PairScore {
  i: number;
  j: number;
  /** Primary: soft IoU after the glance blur. */
  similarity: number;
  /** Binary IoU at BINARY_THRESHOLD, unblurred. */
  iou: number;
  /** Hamming fraction, unblurred. */
  hamming: number;
  verdict: Verdict;
}

export interface SimilarityResult {
  /** n × n primary similarity (soft IoU after blur). Diagonal = 1. */
  matrix: number[][];
  /** Off-diagonal pairs, i < j. */
  pairs: PairScore[];
  maxPair: PairScore | undefined;
  /** Mean off-diagonal similarity. */
  mean: number;
  indistinguishable: number;
  confusable: number;
}

export function similarityMatrix(
  masks: Float32Array[],
  w: number,
  h: number,
  sigma = GLANCE_SIGMA_PX,
): SimilarityResult {
  const blurred = masks.map((m) => gaussianBlur(m, w, h, sigma));
  const n = masks.length;
  const matrix = Array.from({ length: n }, () => new Array<number>(n).fill(1));
  const pairs: PairScore[] = [];
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const bi = blurred[i]!;
      const bj = blurred[j]!;
      const s = softIoU(bi, bj);
      matrix[i]![j] = s;
      matrix[j]![i] = s;
      pairs.push({
        i,
        j,
        similarity: s,
        iou: binaryIoU(masks[i]!, masks[j]!),
        hamming: hammingFraction(masks[i]!, masks[j]!),
        verdict: verdict(s),
      });
    }
  }
  const maxPair = pairs.reduce<PairScore | undefined>((m, p) => (!m || p.similarity > m.similarity ? p : m), undefined);
  return {
    matrix,
    pairs,
    maxPair,
    mean: pairs.length ? pairs.reduce((a, p) => a + p.similarity, 0) / pairs.length : 0,
    indistinguishable: pairs.filter((p) => p.verdict === 'indistinguishable').length,
    confusable: pairs.filter((p) => p.verdict === 'confusable').length,
  };
}

/** Pair-wise mean of several results over the same n items (V0 affiliation scores over every sensor row). */
export function meanResult(results: SimilarityResult[]): SimilarityResult {
  const first = results[0];
  if (!first) throw new Error('meanResult: no results');
  const n = first.matrix.length;
  const avg = (f: (r: SimilarityResult, k: number) => number, k: number) => results.reduce((a, r) => a + f(r, k), 0) / results.length;
  const pairs: PairScore[] = first.pairs.map((p, k) => {
    const similarity = avg((r, kk) => r.pairs[kk]!.similarity, k);
    return { i: p.i, j: p.j, similarity, iou: avg((r, kk) => r.pairs[kk]!.iou, k), hamming: avg((r, kk) => r.pairs[kk]!.hamming, k), verdict: verdict(similarity) };
  });
  const matrix = Array.from({ length: n }, () => new Array<number>(n).fill(1));
  for (const p of pairs) {
    matrix[p.i]![p.j] = p.similarity;
    matrix[p.j]![p.i] = p.similarity;
  }
  return {
    matrix,
    pairs,
    maxPair: pairs.reduce<PairScore | undefined>((m, p) => (!m || p.similarity > m.similarity ? p : m), undefined),
    mean: pairs.length ? pairs.reduce((a, p) => a + p.similarity, 0) / pairs.length : 0,
    indistinguishable: pairs.filter((p) => p.verdict === 'indistinguishable').length,
    confusable: pairs.filter((p) => p.verdict === 'confusable').length,
  };
}

/** Element-wise mean of several n × n matrices (e.g. V0 affiliation scores over every sensor row). */
export function meanMatrix(ms: number[][][]): number[][] {
  const n = ms[0]?.length ?? 0;
  return Array.from({ length: n }, (_, i) =>
    Array.from({ length: n }, (_, j) => ms.reduce((a, m) => a + (m[i]?.[j] ?? 0), 0) / ms.length),
  );
}

// ---------------------------------------------------------------------------
// Seeded RNG (odd-one-out task)
// ---------------------------------------------------------------------------

/** mulberry32 — tiny deterministic PRNG in [0, 1). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Target cell index in an n-cell grid for a seed. */
export function oddOneOutIndex(seed: number, cells: number): number {
  return Math.floor(mulberry32(seed)() * cells);
}

// ---------------------------------------------------------------------------
// Colour science (sRGB, CIE L*a*b*, Machado CVD, WCAG contrast)
// ---------------------------------------------------------------------------

export const srgbToLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
export const linearToSrgb = (c: number) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);

/** Rec.709 / sRGB relative luminance from LINEAR rgb. */
export const luma = (r: number, g: number, b: number) => 0.2126 * r + 0.7152 * g + 0.0722 * b;

/** CIE L* (0–100) from relative luminance Y (white = 1). */
export function lstar(y: number): number {
  return y > 216 / 24389 ? 116 * Math.cbrt(y) - 16 : (24389 / 27) * y;
}

/** sRGB 0–255 → CIE L*a*b* (D65). */
export function rgbToLab(r255: number, g255: number, b255: number): [number, number, number] {
  const r = srgbToLinear(r255 / 255);
  const g = srgbToLinear(g255 / 255);
  const b = srgbToLinear(b255 / 255);
  const x = (0.4124564 * r + 0.3575761 * g + 0.1804375 * b) / 0.95047;
  const y = 0.2126729 * r + 0.7151522 * g + 0.072175 * b;
  const z = (0.0193339 * r + 0.119192 * g + 0.9503041 * b) / 1.08883;
  const f = (t: number) => (t > 216 / 24389 ? Math.cbrt(t) : ((24389 / 27) * t + 16) / 116);
  return [116 * f(y) - 16, 500 * (f(x) - f(y)), 200 * (f(y) - f(z))];
}

export const deltaE76 = (a: [number, number, number], b: [number, number, number]) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

/** Machado, Oliveira & Fernandes 2009, severity 1.0, applied to LINEAR rgb. */
export const MACHADO: Record<'deuteranopia' | 'protanopia', number[][]> = {
  deuteranopia: [
    [0.367322, 0.860646, -0.227968],
    [0.280085, 0.672501, 0.047413],
    [-0.01182, 0.04294, 0.968881],
  ],
  protanopia: [
    [0.152286, 1.052583, -0.204868],
    [0.114503, 0.786281, 0.099216],
    [-0.003882, -0.048116, 1.051998],
  ],
};

/** Simulate CVD on an sRGB 0–255 colour; returns sRGB 0–255 (clamped). */
export function simulateCvd(rgb: [number, number, number], kind: keyof typeof MACHADO): [number, number, number] {
  const m = MACHADO[kind];
  const lin = rgb.map((c) => srgbToLinear(c / 255));
  return m.map((row) => {
    const v = row[0]! * lin[0]! + row[1]! * lin[1]! + row[2]! * lin[2]!;
    return Math.round(linearToSrgb(Math.max(0, Math.min(1, v))) * 255);
  }) as [number, number, number];
}

/** WCAG 2 contrast ratio between two sRGB 0–255 colours. */
export function contrastRatio(a: [number, number, number], b: [number, number, number]): number {
  const L = (c: [number, number, number]) => luma(srgbToLinear(c[0] / 255), srgbToLinear(c[1] / 255), srgbToLinear(c[2] / 255));
  const [hi, lo] = [L(a), L(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

// ---------------------------------------------------------------------------
// Image metrics (research §5.2)
// ---------------------------------------------------------------------------

/** Appearance distance D(a,b) = Σ|a − b| / Σ max(a, b) on a non-negative channel. 0 = identical. */
export function appearanceDistance(a: Float32Array, b: Float32Array): number {
  let num = 0;
  let den = 0;
  for (let i = 0; i < a.length; i++) {
    const x = a[i] ?? 0;
    const y = b[i] ?? 0;
    num += Math.abs(x - y);
    den += Math.max(x, y);
  }
  return den === 0 ? 0 : num / den;
}

/** Normalised cross-correlation in [-1, 1]. Constant images → 0. */
export function ncc(a: Float32Array, b: Float32Array): number {
  const n = a.length;
  let ma = 0;
  let mb = 0;
  for (let i = 0; i < n; i++) {
    ma += a[i] ?? 0;
    mb += b[i] ?? 0;
  }
  ma /= n;
  mb /= n;
  let sab = 0;
  let saa = 0;
  let sbb = 0;
  for (let i = 0; i < n; i++) {
    const x = (a[i] ?? 0) - ma;
    const y = (b[i] ?? 0) - mb;
    sab += x * y;
    saa += x * x;
    sbb += y * y;
  }
  return saa === 0 || sbb === 0 ? 0 : sab / Math.sqrt(saa * sbb);
}

/** Box-downsample a w × h image by an integer factor k. */
export function boxDownsample(img: Float32Array, w: number, h: number, k: number): Float32Array {
  const ow = Math.floor(w / k);
  const oh = Math.floor(h / k);
  const out = new Float32Array(ow * oh);
  for (let y = 0; y < oh; y++) {
    for (let x = 0; x < ow; x++) {
      let acc = 0;
      for (let j = 0; j < k; j++) for (let i = 0; i < k; i++) acc += img[(y * k + j) * w + x * k + i] ?? 0;
      out[y * ow + x] = acc / (k * k);
    }
  }
  return out;
}

/** Adds seeded Gaussian noise (Box–Muller over mulberry32). */
export function addNoise(img: Float32Array, sigma: number, seed: number): Float32Array {
  const rnd = mulberry32(seed);
  const out = new Float32Array(img.length);
  for (let i = 0; i < img.length; i++) {
    const u = Math.max(1e-12, rnd());
    const v = rnd();
    out[i] = (img[i] ?? 0) + sigma * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }
  return out;
}

/** argmax over templates by NCC. */
export function classifyNcc(img: Float32Array, templates: Float32Array[]): number {
  let best = -Infinity;
  let idx = -1;
  templates.forEach((t, i) => {
    const s = ncc(img, t);
    if (s > best) {
      best = s;
      idx = i;
    }
  });
  return idx;
}

const l2 = (a: Float32Array, b: Float32Array) => {
  let s = 0;
  for (let i = 0; i < a.length; i++) {
    const d = (a[i] ?? 0) - (b[i] ?? 0);
    s += d * d;
  }
  return Math.sqrt(s);
};

/**
 * Salience ratio R = min_t ‖V_T − V̄_D‖ / max_i ‖V_Di − V̄_D‖ (research §5.2).
 * Feature vectors are flattened, blurred [L*, a*, b*] images. R ≥ 2 passes T7.
 */
export function salienceRatio(targets: Float32Array[], distractors: Float32Array[]): number {
  const first = distractors[0];
  if (!first) return Infinity;
  const mean = new Float32Array(first.length);
  for (const d of distractors) for (let i = 0; i < mean.length; i++) mean[i] = (mean[i] ?? 0) + (d[i] ?? 0) / distractors.length;
  const spread = Math.max(...distractors.map((d) => l2(d, mean)));
  const sep = Math.min(...targets.map((t) => l2(t, mean)));
  return spread === 0 ? Infinity : sep / spread;
}

/** Ordinary least squares y = a + b·x. */
export function linearFit(xs: number[], ys: number[]): { a: number; b: number } | undefined {
  const n = xs.length;
  if (n < 2) return undefined;
  const mx = xs.reduce((s, x) => s + x, 0) / n;
  const my = ys.reduce((s, y) => s + y, 0) / n;
  let sxy = 0;
  let sxx = 0;
  for (let i = 0; i < n; i++) {
    sxy += (xs[i]! - mx) * (ys[i]! - my);
    sxx += (xs[i]! - mx) ** 2;
  }
  if (sxx === 0) return undefined;
  const b = sxy / sxx;
  return { a: my - b * mx, b };
}
