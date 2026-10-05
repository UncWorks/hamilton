// Run with `pnpm --filter @hamilton/web test` (node --test, native TS type
// stripping). See link-trust-rating.test.ts for the ts-ignore rationale.

import assert from 'node:assert/strict';
import { test } from 'node:test';
// @ts-ignore TS5097 — explicit .ts extension for Node's ESM loader
import * as F from './camera-fit.ts';

const M: typeof import('./camera-fit') = F;

// Avdiivka fixture positions (link-trust-rating.ts AVDIIVKA_POSITIONS) + jammer.
const A = { lat: 48.1422, lon: 37.745 };
const B = { lat: 48.14, lon: 37.745 };
const C = { lat: 48.1378, lon: 37.745 };
const JAMMER = { lat: 48.142, lon: 37.762 };

const near = (a: number, b: number, eps: number, msg?: string) =>
  assert.ok(Math.abs(a - b) <= eps, `${msg ?? ''} ${a} !≈ ${b} (±${eps})`);

test('boundsOf / boundingCircle', () => {
  assert.equal(M.boundsOf([]), null);
  assert.deepEqual(M.boundsOf([A, B, C, JAMMER]), { west: 37.745, south: 48.1378, east: 37.762, north: 48.1422 });
  const c = M.boundingCircle([A, B, C])!;
  near(c.center.lat, 48.14, 1e-9);
  near(c.radiusM, 245, 2, 'A↔B ≈ 245 m');
  const single = M.boundingCircle([B])!;
  assert.equal(single.radiusM, 0);
});

test('haversine: 0.0022° lat ≈ 245 m, jammer ≈ 1.27 km east of B', () => {
  near(M.haversineM(A, B), 245, 2);
  near(M.haversineM(B, JAMMER), 1270, 15);
});

test('narrowFovRad: Cesium fov is the wider axis', () => {
  const fov = Math.PI / 3;
  near(M.narrowFovRad(fov, 1), fov, 1e-12);
  // 16:9 landscape → vertical is narrower; portrait symmetric.
  const v = M.narrowFovRad(fov, 16 / 9);
  assert.ok(v < fov);
  near(M.narrowFovRad(fov, 9 / 16), v, 1e-12);
});

test('cesiumFitRange: min range for one unit, grows with spread, clamps', () => {
  assert.equal(M.cesiumFitRange({ radiusM: 0, aspect: 1 }), M.FIT_MIN_RANGE_M);
  // A/B/C only: 245 m radius is inside the minimum.
  assert.equal(M.cesiumFitRange({ radiusM: 245, aspect: 1 }), M.FIT_MIN_RANGE_M);
  // A/B/C + jammer: ~640 m radius → r·1.25 / sin 30° = 1600 m.
  const r = M.boundingCircle([A, B, C, JAMMER])!.radiusM;
  near(M.cesiumFitRange({ radiusM: r, aspect: 1 }), r * 1.25 * 2, 1e-6);
  // Wide aspect narrows the vertical fov → further away.
  assert.ok(M.cesiumFitRange({ radiusM: 5000, aspect: 2 }) > M.cesiumFitRange({ radiusM: 5000, aspect: 1 }));
  assert.equal(M.cesiumFitRange({ radiusM: 1e9, aspect: 1 }), M.FIT_MAX_RANGE_M);
});

test('cesiumFitRange keeps A/B/C separated at the −55° pitch (A26)', () => {
  // 900 px tall square canvas, fov 60°: visible height at range R ≈ 2R·tan30°.
  const R = M.cesiumFitRange({ radiusM: M.boundingCircle([A, B, C])!.radiusM, aspect: 1 });
  const pxPerM = 900 / (2 * R * Math.tan(Math.PI / 6));
  const sepPx = 245 * Math.sin((55 * Math.PI) / 180) * pxPerM; // N–S foreshortened by the pitch
  assert.ok(sepPx > 30 + 6, `A–B ≈ ${sepPx.toFixed(0)} px must exceed a 30 px icon + 6 px gap`);
});

test('mercator round-trip', () => {
  const p = M.mercatorUnproject(M.mercatorXY(B));
  near(p.lat, B.lat, 1e-9);
  near(p.lon, B.lon, 1e-9);
});

test('fitMercator frames bounds with padding and centres them', () => {
  const bounds = M.boundsOf([A, B, C, JAMMER])!;
  const v = M.fitMercator({ bounds, width: 1200, height: 800, paddingPx: 64 });
  near(v.longitude, (37.745 + 37.762) / 2, 1e-9);
  near(v.latitude, 48.14, 1e-4);
  // Every point projects inside the padded frame.
  const scale = 2 ** v.zoom;
  const [cx, cy] = M.mercatorXY({ lat: v.latitude, lon: v.longitude });
  for (const p of [A, B, C, JAMMER]) {
    const [x, y] = M.mercatorXY(p);
    const sx = 600 + (x - cx) * scale;
    const sy = 400 + (y - cy) * scale;
    assert.ok(sx >= 63.9 && sx <= 1136.1 && sy >= 63.9 && sy <= 736.1, `${sx},${sy}`);
  }
});

test('fitMercator: single point honours min extent and max zoom', () => {
  const b = M.boundsOf([B])!;
  const v = M.fitMercator({ bounds: b, width: 800, height: 800, paddingPx: 0, minExtentM: 1500 });
  const groundPx = 1500 / M.metersPerWorldUnit(48.14) * 2 ** v.zoom;
  near(groundPx, 800, 1, '1.5 km fills the frame');
  const capped = M.fitMercator({ bounds: b, width: 800, height: 800, minExtentM: 1, maxZoom: 15 });
  assert.equal(capped.zoom, 15);
});

test('needsRefit policy', () => {
  const base = { width: 800, height: 600, screen: [{ x: 400, y: 300 }], userMoved: false };
  assert.equal(M.needsRefit({ ...base, fittedIds: null, ids: ['a'] }), 'initial');
  assert.equal(M.needsRefit({ ...base, fittedIds: null, ids: [] }), null);
  assert.equal(M.needsRefit({ ...base, fittedIds: new Set(['a']), ids: ['a'] }), null, 'tick: no refit');
  assert.equal(M.needsRefit({ ...base, fittedIds: new Set(['a', 'b']), ids: ['a'] }), null, 'removed: no refit');
  assert.equal(
    M.needsRefit({ ...base, fittedIds: new Set(['a']), ids: ['a', 'b'], screen: [{ x: 1, y: 1 }, { x: 400, y: 300 }] }),
    'new-point',
  );
  assert.equal(M.needsRefit({ ...base, fittedIds: new Set(['a']), ids: ['a'], screen: [{ x: 790, y: 300 }] }), 'out-of-view');
  assert.equal(M.needsRefit({ ...base, fittedIds: new Set(['a']), ids: ['a'], screen: [null] }), 'out-of-view');
  assert.equal(
    M.needsRefit({ ...base, fittedIds: new Set(['a']), ids: ['a', 'b'], screen: [null], userMoved: true }),
    null,
    'never after user navigation',
  );
});

test('isFitShortcut', () => {
  assert.equal(M.isFitShortcut({ key: 'f' }), true);
  assert.equal(M.isFitShortcut({ key: 'F' }), true);
  assert.equal(M.isFitShortcut({ key: 'f', metaKey: true }), false);
  assert.equal(M.isFitShortcut({ key: 'g' }), false);
  assert.equal(M.isFitShortcut({ key: 'f', target: { tagName: 'input' } }), false);
  assert.equal(M.isFitShortcut({ key: 'f', target: { tagName: 'DIV', isContentEditable: true } }), false);
});
