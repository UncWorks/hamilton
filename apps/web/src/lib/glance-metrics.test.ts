// Run with `pnpm --filter @hamilton/web test` (node --test, native TS type
// stripping). See link-trust-rating.test.ts for the ts-ignore rationale.

import assert from 'node:assert/strict';
import { test } from 'node:test';
// @ts-ignore TS5097 — explicit .ts extension for Node's ESM loader
import * as G from './glance-metrics.ts';

const M: typeof import('./glance-metrics') = G;
const W = 8;

function rect(x0: number, y0: number, x1: number, y1: number): Float32Array {
  const a = new Float32Array(W * W);
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) a[y * W + x] = 1;
  return a;
}

test('IoU / Hamming on known masks', () => {
  const a = rect(0, 0, 4, 4); // 16 px
  const b = rect(2, 0, 6, 4); // 16 px, overlap 8
  assert.equal(M.binaryIoU(a, a), 1);
  assert.equal(M.binaryIoU(a, b), 8 / 24);
  assert.equal(M.softIoU(a, b), 8 / 24);
  assert.equal(M.hammingFraction(a, b), 16 / 64);
  assert.equal(M.binaryIoU(rect(0, 0, 2, 2), rect(4, 4, 6, 6)), 0);
  assert.equal(M.softIoU(new Float32Array(4), new Float32Array(4)), 1);
});

test('blur conserves mass away from the border and raises overlap of near shapes', () => {
  const k = M.gaussianKernel(1);
  assert.ok(Math.abs(k.reduce((s, v) => s + v, 0) - 1) < 1e-6);
  const a = rect(3, 3, 5, 5);
  const blurred = M.gaussianBlur(a, W, W, 1);
  const mass = (x: Float32Array) => x.reduce((s, v) => s + v, 0);
  assert.ok(Math.abs(mass(blurred) - mass(a)) < 0.05);
  const b = rect(4, 3, 6, 5);
  assert.ok(M.softIoU(M.gaussianBlur(a, W, W, 1), M.gaussianBlur(b, W, W, 1)) > M.binaryIoU(a, b));
});

test('similarity matrix is symmetric with a unit diagonal and flags identical pairs', () => {
  const masks = [rect(0, 0, 4, 4), rect(0, 0, 4, 4), rect(4, 4, 8, 8)];
  const r = M.similarityMatrix(masks, W, W);
  assert.equal(r.matrix[0]![0], 1);
  assert.equal(r.matrix[0]![1], 1);
  assert.equal(r.matrix[1]![2], r.matrix[2]![1]);
  assert.equal(r.indistinguishable, 1);
  assert.equal(r.maxPair?.verdict, 'indistinguishable');
  assert.equal(M.verdict(0.85), 'indistinguishable');
  assert.equal(M.verdict(0.8), 'confusable');
  assert.equal(M.verdict(0.79), 'distinct');
});

test('meanResult averages pair scores and re-derives verdicts', () => {
  const a = M.similarityMatrix([rect(0, 0, 4, 4), rect(0, 0, 4, 4)], W, W);
  const b = M.similarityMatrix([rect(0, 0, 4, 4), rect(4, 4, 8, 8)], W, W);
  const m = M.meanResult([a, b]);
  assert.ok(Math.abs(m.pairs[0]!.similarity - (a.pairs[0]!.similarity + b.pairs[0]!.similarity) / 2) < 1e-9);
  assert.equal(m.matrix[1]![0], m.pairs[0]!.similarity);
  assert.equal(m.pairs[0]!.verdict, M.verdict(m.pairs[0]!.similarity));
});

test('seeded odd-one-out position is deterministic and in range', () => {
  const a = M.oddOneOutIndex(42, 100);
  assert.equal(a, M.oddOneOutIndex(42, 100));
  const seen = new Set<number>();
  for (let s = 0; s < 200; s++) {
    const i = M.oddOneOutIndex(s, 100);
    assert.ok(i >= 0 && i < 100);
    seen.add(i);
  }
  assert.ok(seen.size > 50, 'positions should spread over the grid');
});

test('colour science: L*, Lab, ΔE76, WCAG contrast, Machado', () => {
  assert.ok(Math.abs(M.lstar(1) - 100) < 1e-9);
  assert.ok(Math.abs(M.lstar(0.18) - 49.5) < 0.1);
  const white = M.rgbToLab(255, 255, 255);
  assert.ok(Math.abs(white[0] - 100) < 0.01 && Math.abs(white[1]) < 0.01 && Math.abs(white[2]) < 0.01);
  assert.ok(Math.abs(M.contrastRatio([255, 255, 255], [0, 0, 0]) - 21) < 1e-9);
  assert.equal(M.deltaE76([50, 0, 0], [50, 3, 4]), 5);
  // Deuteranopia collapses red/green: their simulated ΔE is far below the normal-vision ΔE.
  const red: [number, number, number] = [220, 40, 40];
  const green: [number, number, number] = [40, 160, 40];
  const n = M.deltaE76(M.rgbToLab(...red), M.rgbToLab(...green));
  const d = M.deltaE76(M.rgbToLab(...M.simulateCvd(red, 'deuteranopia')), M.rgbToLab(...M.simulateCvd(green, 'deuteranopia')));
  assert.ok(d < n / 2, `deut ΔE ${d} vs normal ${n}`);
  // Greys are unchanged.
  assert.deepEqual(M.simulateCvd([128, 128, 128], 'protanopia'), [128, 128, 128]);
});

test('D, NCC, downsample, noise, salience, linear fit', () => {
  const a = rect(0, 0, 4, 4);
  assert.equal(M.appearanceDistance(a, a), 0);
  assert.equal(M.appearanceDistance(a, rect(4, 4, 8, 8)), 1);
  assert.ok(Math.abs(M.ncc(a, a) - 1) < 1e-9);
  assert.ok(M.ncc(a, rect(4, 4, 8, 8)) < 0);
  const ds = M.boxDownsample(a, W, W, 2);
  assert.equal(ds.length, 16);
  assert.equal(ds[0], 1);
  assert.equal(ds[15], 0);
  const noisy = M.addNoise(new Float32Array(10000), 0.02, 7);
  const sd = Math.sqrt(noisy.reduce((s, v) => s + v * v, 0) / noisy.length);
  assert.ok(Math.abs(sd - 0.02) < 0.002);
  assert.deepEqual(M.addNoise(a, 0.02, 3), M.addNoise(a, 0.02, 3));
  assert.equal(M.classifyNcc(rect(0, 0, 4, 4), [rect(4, 4, 8, 8), rect(0, 0, 4, 4)]), 1);
  const d1 = rect(0, 0, 4, 4);
  const d2 = rect(0, 0, 4, 5);
  assert.ok(M.salienceRatio([rect(4, 4, 8, 8)], [d1, d2]) > 2);
  assert.ok(M.salienceRatio([d2], [d1, d2]) < 2);
  const fit = M.linearFit([8, 16, 32], [500, 580, 740]);
  assert.ok(fit && Math.abs(fit.b - 10) < 1e-9 && Math.abs(fit.a - 420) < 1e-9);
});
