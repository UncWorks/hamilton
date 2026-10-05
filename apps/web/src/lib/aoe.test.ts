// Run with `pnpm --filter @hamilton/web test` (node --test, native TS type
// stripping). See link-trust-rating.test.ts for the ts-ignore rationale.
// Plan docs/plans/jammer-aoe.md §5.4: holes, multipolygons, level precedence
// (0.9 over 0.5), outside → none.

import assert from 'node:assert/strict';
import { test } from 'node:test';
// @ts-ignore TS5097 — explicit .ts extension for Node's ESM loader
import * as A from './aoe.ts';

const M: typeof import('./aoe') = A;

/** Axis-aligned square ring [lon, lat], closed. */
const sq = (lon0: number, lat0: number, lon1: number, lat1: number): number[][] => [
  [lon0, lat0],
  [lon1, lat0],
  [lon1, lat1],
  [lon0, lat1],
  [lon0, lat0],
];
const mp = (...polys: number[][][][]) => ({ type: 'MultiPolygon' as const, coordinates: polys });

// A 0..10 square with a 4..6 hole, and a second island at 20..22.
const DONUT = mp([sq(0, 0, 10, 10), sq(4, 4, 6, 6)], [sq(20, 20, 22, 22)]);

test('inMultiPolygon: inside the outer ring, outside a hole', () => {
  assert.equal(M.inMultiPolygon({ lon: 1, lat: 1 }, DONUT), true);
  assert.equal(M.inMultiPolygon({ lon: 9, lat: 5 }, DONUT), true);
});

test('inMultiPolygon: a point in a hole is outside', () => {
  assert.equal(M.inMultiPolygon({ lon: 5, lat: 5 }, DONUT), false);
  assert.equal(M.inMultiPolygon({ lon: 4.5, lat: 5.5 }, DONUT), false);
});

test('inMultiPolygon: second polygon of a MultiPolygon counts', () => {
  assert.equal(M.inMultiPolygon({ lon: 21, lat: 21 }, DONUT), true);
  assert.equal(M.inMultiPolygon({ lon: 15, lat: 15 }, DONUT), false);
});

test('inMultiPolygon: an island inside another polygon’s hole is inside (not even-odd across polygons)', () => {
  const nested = mp([sq(0, 0, 10, 10), sq(2, 2, 8, 8)], [sq(4, 4, 6, 6)]);
  assert.equal(M.inMultiPolygon({ lon: 5, lat: 5 }, nested), true);
  assert.equal(M.inMultiPolygon({ lon: 3, lat: 3 }, nested), false);
  assert.equal(M.inMultiPolygon({ lon: 1, lat: 1 }, nested), true);
});

test('inMultiPolygon: unclosed rings and empty geometry', () => {
  const open = mp([[[0, 0], [10, 0], [10, 10], [0, 10]]]);
  assert.equal(M.inMultiPolygon({ lon: 5, lat: 5 }, open), true);
  assert.equal(M.inMultiPolygon({ lon: 5, lat: 5 }, mp()), false);
});

test('inMultiPolygon: real lon/lat around Avdiivka', () => {
  const ring = sq(37.7, 48.1, 37.8, 48.2);
  assert.equal(M.inMultiPolygon({ lat: 48.14, lon: 37.745 }, mp([ring])), true);
  assert.equal(M.inMultiPolygon({ lat: 48.14, lon: 37.65 }, mp([ring])), false);
});

const estimate = {
  aoe: [
    {
      rx_class: 'gnss_civil',
      contours: [
        // 50% listed first: precedence must not depend on order.
        { p: 0.5, area_km2: 1660, polygon: mp([sq(0, 0, 10, 10)]) },
        { p: 0.9, area_km2: 365, polygon: mp([sq(2, 2, 8, 8), sq(4, 4, 5, 5)]) },
      ],
    },
    { rx_class: 'gnss_mil', contours: [{ p: 0.9, area_km2: 0, polygon: mp() }, { p: 0.5, area_km2: 10, polygon: mp([sq(3, 3, 7, 7)]) }] },
  ],
};

test('contourLevelAt: 0.9 takes precedence over 0.5', () => {
  assert.equal(M.contourLevelAt(estimate, 'gnss_civil', { lon: 3, lat: 3 }), 0.9);
});

test('contourLevelAt: inside 50% only → 0.5 (incl. inside a 90% hole)', () => {
  assert.equal(M.contourLevelAt(estimate, 'gnss_civil', { lon: 1, lat: 1 }), 0.5);
  assert.equal(M.contourLevelAt(estimate, 'gnss_civil', { lon: 4.5, lat: 4.5 }), 0.5);
});

test('contourLevelAt: outside → null; unknown class → null; no estimate → null', () => {
  assert.equal(M.contourLevelAt(estimate, 'gnss_civil', { lon: 11, lat: 11 }), null);
  assert.equal(M.contourLevelAt(estimate, 'uhf_comms', { lon: 3, lat: 3 }), null);
  assert.equal(M.contourLevelAt(null, 'gnss_civil', { lon: 3, lat: 3 }), null);
});

test('contourLevelAt: an empty 90% contour is skipped', () => {
  assert.equal(M.contourLevelAt(estimate, 'gnss_mil', { lon: 5, lat: 5 }), 0.5);
});

test('labelAnchor: northernmost vertex of the largest polygon; null when empty', () => {
  const a = M.labelAnchor(mp([sq(20, 20, 21, 21)], [sq(0, 0, 10, 10)]));
  assert.deepEqual(a, { lon: 10, lat: 10 });
  assert.equal(M.labelAnchor(mp()), null);
});

test('dashRing: a 4 km square ring cut 100 m on / 100 m off → ~20 dashes, each ~100 m', () => {
  const d = 4_000 / 4 / 111_320; // ~1 km side in degrees (lat ≈ 0)
  const ring = sq(0, 0, d, d);
  const dashes = M.dashRing(ring, 100, 100);
  assert.ok(dashes.length >= 19 && dashes.length <= 21, `${dashes.length} dashes`);
  const len = (p: number[][]) => p.slice(1).reduce((s, c, i) => s + Math.hypot((c[0]! - p[i]![0]!) * 111_320, (c[1]! - p[i]![1]!) * 110_574), 0);
  for (const x of dashes.slice(0, -1)) assert.ok(Math.abs(len(x) - 100) < 1, `dash ${len(x)} m`);
});

test('dashRing: degenerate input → no dashes; metersPerPixel halves per zoom', () => {
  assert.deepEqual(M.dashRing([[0, 0]], 10, 10), []);
  assert.ok(Math.abs(M.metersPerPixel(48.14, 11) / M.metersPerPixel(48.14, 12) - 2) < 1e-9);
});

test('screenLabelAnchor: highest on-screen vertex with headroom; null when none', () => {
  const vp = { width: 800, height: 600 };
  const pts = [{ x: 100, y: 20 }, { x: 300, y: 90 }, { x: 900, y: 70 }, { x: 400, y: 300 }];
  assert.deepEqual(M.screenLabelAnchor(pts, vp), { x: 300, y: 90 });
  assert.equal(M.screenLabelAnchor([{ x: -5, y: 100 }], vp), null);
  assert.ok(M.largestOuterRing(mp([sq(0, 0, 1, 1)], [sq(0, 0, 5, 5)]))!.some((c) => c[0] === 5));
});
