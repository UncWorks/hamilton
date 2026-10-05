#!/usr/bin/env node
// contrast-check.mjs — at-a-glance T5 (grayscale WCAG contrast ≥ 3:1,
// glance-metrics.ts T.t5) for the COP symbol colours against the ACTUAL
// basemap pixels, not the flat --surface-base the symbology study used.
//
// Pixels: the rendered raster tiles over the AO (z14 + z15, the zooms the
// camera fit lands on). They are drawn by MapLibre Native from the same
// extract + style the MapLibre spine draws, so they stand in for both spines.
// Each colour is converted to grayscale luminance (as glance-eval.ts does) and
// compared with every basemap pixel. Translucent graphics (the AoE 90% fill)
// are alpha-blended over each pixel first.
//
// The jammer area of effect (FR-06a (4), docs/plans/jammer-aoe.md W20) is
// checked against a second, wider pixel set: the AoE spans the whole 8-unit
// layout (~10 × 11 km), so its pixels are z12 + z13 over the raster bounds
// (the zooms the track fit lands on at that spread). Its edges are GATED:
// every AoE edge must reach ≥ 3:1 against ≥ 99% of those pixels, else the
// script exits 1. The symbol rows stay report-only.
//
// Usage: node scripts/basemap/contrast-check.mjs <tool-cache-node-dir>

import { createRequire } from 'node:module';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');
const require = createRequire(path.join(path.resolve(process.argv[2] ?? '.'), 'package.json'));
const sharp = require('sharp');

// --- colour maths (CSS Color 4 OKLCH; WCAG relative luminance) ---------------
const lin = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
function oklchToRgb(l, c, hDeg) {
  const h = (hDeg * Math.PI) / 180;
  const a = c * Math.cos(h);
  const b = c * Math.sin(h);
  const l_ = l + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = l - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = l - 0.0894841775 * a - 1.291485548 * b;
  const [L, M, S] = [l_ ** 3, m_ ** 3, s_ ** 3];
  const linear = [
    4.0767416621 * L - 3.3077115913 * M + 0.2309699292 * S,
    -1.2684380046 * L + 2.6097574011 * M - 0.3413193965 * S,
    -0.0041960863 * L - 0.7034186147 * M + 1.707614701 * S,
  ];
  return linear.map((x) => {
    const v = x <= 0.0031308 ? 12.92 * x : 1.055 * x ** (1 / 2.4) - 0.055;
    return Math.round(Math.min(1, Math.max(0, v)) * 255);
  });
}
const Y = ([r, g, b]) => 0.2126 * lin(r / 255) + 0.7152 * lin(g / 255) + 0.0722 * lin(b / 255);
const ratio = (ya, yb) => (Math.max(ya, yb) + 0.05) / (Math.min(ya, yb) + 0.05);

// --- tokens -------------------------------------------------------------------
const css = readFileSync(path.join(root, 'apps/web/src/styles/tokens.css'), 'utf8');
function token(name) {
  const m = new RegExp(`--${name}:\\s*oklch\\(([\\d.]+)%\\s+([\\d.]+)\\s+([\\d.]+)`).exec(css);
  if (!m) throw new Error(`token ${name} not found`);
  return oklchToRgb(Number(m[1]) / 100, Number(m[2]), Number(m[3]));
}
const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));

// Production symbol colours (src/components/symbol): ink frame stroke over the
// doctrinal fill, trust gauge, and the deck.gl / Cesium area & line graphics.
const OPAQUE = {
  'ink frame stroke (--sym-ink)': token('sym-ink'),
  'stale ink (--sym-ink-stale)': token('sym-ink-stale'),
  'friend fill #0091c0': hex('#0091c0'),
  'hostile fill #f00000': hex('#f00000'),
  'neutral fill #00b000': hex('#00b000'),
  'unknown fill #dcd900': hex('#dcd900'),
  'gauge --trust-nominal': token('trust-nominal'),
  'gauge --trust-watching': token('trust-watching'),
  'gauge --trust-degraded': token('trust-degraded'),
  'gauge --trust-failed-stroke': token('trust-failed-stroke'),
};
const BLENDED = {};

// Jammer AoE (tokens.css --aoe-*). Edges are opaque strokes (gated); the 90%
// fill is the --aoe-fill-opacity tint over the map (reported: a tint is not an
// edge, and the edge is drawn on top of it).
const fillOpacity = Number(/--aoe-fill-opacity:\s*([\d.]+)/.exec(css)?.[1] ?? NaN);
if (!Number.isFinite(fillOpacity)) throw new Error('token aoe-fill-opacity not found');
const AOE_EDGES = {
  'AoE civil edge --aoe-gnss-civil': token('aoe-gnss-civil'),
  'AoE mil edge --aoe-gnss-mil': token('aoe-gnss-mil'),
};
const AOE_BLENDED = {
  [`AoE civil 90% fill α${fillOpacity}`]: [token('aoe-gnss-civil'), fillOpacity],
};

// --- basemap pixels -------------------------------------------------------------
const RASTER = path.join(root, 'apps/web/public/tiles/raster');
if (!existsSync(path.join(RASTER, 'tiles.json'))) {
  console.error('no raster tiles — run make fetch-tiles');
  process.exit(1);
}
// Tiles covering the units (48.14 N 37.745 E) and the jammer (48.142 N 37.762 E).
const AO = { w: 37.735, e: 37.77, s: 48.134, n: 48.146 };
const lon2x = (lon, z) => ((lon + 180) / 360) * 2 ** z;
const lat2y = (lat, z) => {
  const r = (lat * Math.PI) / 180;
  return ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 2 ** z;
};

/** Luminance-sorted distinct basemap pixels (with counts) over a bbox at some zooms. */
async function pixelSet(bbox, zooms) {
  const counts = new Map();
  for (const z of zooms) {
    for (let x = Math.floor(lon2x(bbox.w, z)); x <= Math.floor(lon2x(bbox.e, z)); x++) {
      for (let y = Math.floor(lat2y(bbox.n, z)); y <= Math.floor(lat2y(bbox.s, z)); y++) {
        const f = path.join(RASTER, String(z), String(x), `${y}.png`);
        if (!existsSync(f)) continue;
        const { data, info } = await sharp(f).removeAlpha().raw().toBuffer({ resolveWithObject: true });
        for (let i = 0; i < info.width * info.height; i++) {
          const k = `${data[3 * i]},${data[3 * i + 1]},${data[3 * i + 2]}`;
          counts.set(k, (counts.get(k) ?? 0) + 1);
        }
      }
    }
  }
  let total = 0;
  const px = [...counts].map(([k, n]) => {
    total += n;
    const rgb = k.split(',').map(Number);
    return { rgb, n, y: Y(rgb) };
  });
  px.sort((a, b) => a.y - b.y);
  const pct = (p) => {
    let acc = 0;
    for (const q of px) {
      acc += q.n;
      if (acc >= p * total) return q;
    }
    return px[px.length - 1];
  };
  return { px, total, P50: pct(0.5), P95: pct(0.95), P99: pct(0.99), MAX: px[px.length - 1] };
}

const surface = token('surface-base');

function report(title, set, opaque, blended) {
  const { px, total, P50, P95, P99, MAX } = set;
  console.log(`${title}: ${total} basemap pixels, ${px.length} distinct colours`);
  console.log(`  luminance  surface-base ${Y(surface).toFixed(4)} · p50 ${P50.y.toFixed(4)} rgb(${P50.rgb}) · p95 ${P95.y.toFixed(4)} rgb(${P95.rgb}) · p99 ${P99.y.toFixed(4)} rgb(${P99.rgb}) · max ${MAX.y.toFixed(4)} rgb(${MAX.rgb})`);
  const rows = [];
  const row = (name, f) => {
    let pass = 0;
    for (const q of px) if (f(q) >= 3) pass += q.n;
    rows.push({ name, flat: f({ rgb: surface, y: Y(surface) }), p50: f(P50), p95: f(P95), p99: f(P99), pass: (100 * pass) / total });
  };
  for (const [name, rgb] of Object.entries(opaque)) {
    const y = Y(rgb);
    row(name, (q) => ratio(y, q.y));
  }
  for (const [name, [rgb, a]] of Object.entries(blended)) {
    row(name, (q) => {
      const mix = rgb.map((c, i) => Math.round(a * c + (1 - a) * q.rgb[i]));
      return ratio(Y(mix), q.y);
    });
  }
  return rows;
}

const symbolRows = report('symbols (z14+z15 around B)', await pixelSet(AO, [14, 15]), OPAQUE, BLENDED);
const [rw, rs, re, rn] = JSON.parse(readFileSync(path.join(RASTER, 'tiles.json'), 'utf8')).bounds;
const aoeRows = report('\nAoE (z12+z13 over the raster bounds, the 8-unit layout)', await pixelSet({ w: rw, s: rs, e: re, n: rn }, [12, 13]), AOE_EDGES, AOE_BLENDED);

const f2 = (v) => v.toFixed(2).padStart(6);
const table = (rows) => {
  console.log('\nT5 grayscale contrast (≥ 3:1)        flat-map  p50-px  p95-px  p99-px  %px≥3');
  for (const r of rows) {
    console.log(`  ${r.name.padEnd(34)} ${f2(r.flat)}  ${f2(r.p50)}  ${f2(r.p95)}  ${f2(r.p99)}  ${r.pass.toFixed(1).padStart(5)}%`);
  }
};
table(symbolRows);
table(aoeRows);

// FR-06a (4): every AoE edge ≥ 3:1 against ≥ 99% of the AO basemap pixels.
const failing = aoeRows.filter((r) => r.name.includes('edge') && r.pass < 99);
if (failing.length) {
  console.error(`\nFAIL FR-06a (4): AoE edge below 3:1 on > 1% of pixels: ${failing.map((r) => r.name).join(', ')}`);
  process.exit(1);
}
console.log('\nPASS FR-06a (4): every AoE edge ≥ 3:1 against ≥ 99% of the AO basemap pixels');
