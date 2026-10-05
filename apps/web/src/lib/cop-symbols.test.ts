// Run with `pnpm --filter @hamilton/web test` (node --test, native TS type
// stripping). See link-trust-rating.test.ts for the ts-ignore rationale.

import assert from 'node:assert/strict';
import { test } from 'node:test';
// @ts-ignore TS5097 — explicit .ts extension for Node's ESM loader
import * as S from './cop-symbols.ts';
// @ts-ignore TS5097
import * as D from './declutter.ts';

const M: typeof import('./cop-symbols') = S;
const DM: typeof import('./declutter') = D;

test('designationOf: scenario units are A/B/C; others get initials + number', () => {
  assert.equal(M.designationOf('unit_a'), 'A');
  assert.equal(M.designationOf('unit_c'), 'C');
  assert.equal(M.designationOf('hostile_ew_1'), 'HE1');
  assert.equal(M.designationOf('civ_relay'), 'CR');
  assert.equal(M.designationOf('fr_squad_2'), 'FS2');
});

test('functionOverrideOf: EW sources draw as EW jamming', () => {
  assert.equal(M.functionOverrideOf('hostile_ew_1'), 'ew-jamming');
  assert.equal(M.functionOverrideOf('unit_b'), undefined);
  assert.equal(M.functionOverrideOf('crew_1'), undefined);
});

test('copNowMs: live data uses the wall clock; old fixtures use their latest stamp', () => {
  const wall = Date.parse('2026-10-03T12:00:00Z');
  assert.equal(M.copNowMs(['2026-10-03T11:59:50Z'], wall), wall);
  const fixture = ['2024-02-15T18:42:00Z', '2024-02-15T18:42:41Z'];
  assert.equal(M.copNowMs(fixture, wall), Date.parse('2024-02-15T18:42:41Z'));
  assert.equal(M.copNowMs([], wall), wall);
});

test('isStaleAt: strictly older than the threshold', () => {
  const now = Date.parse('2026-10-03T12:00:20Z');
  assert.equal(M.isStaleAt('2026-10-03T12:00:10Z', now, 10), false);
  assert.equal(M.isStaleAt('2026-10-03T12:00:09Z', now, 10), true);
});

test('quantizeScore never crosses a band / J edge', () => {
  for (const edge of [0.3, 0.6, 0.85]) {
    assert.ok(M.quantizeScore(edge) >= edge - 1e-9, `${edge} stays in its band`);
    assert.ok(M.quantizeScore(edge - 0.001) < edge, `${edge - 0.001} stays below`);
  }
  assert.equal(M.quantizeScore(1), 1);
  assert.equal(M.quantizeScore(0.1274), 0.1);
  assert.equal(M.quantizeScore(0.7024), 0.7);
});

test('symbolImageKey: same inputs → same key; a tick inside a gauge step does not change it', () => {
  const base = { affiliation: 'friendly', fn: 'fa', designation: 'B', qScore: M.quantizeScore(0.7024), jCode: 'C3', sizePx: 32, pixelRatio: 2 } as const;
  assert.equal(M.symbolImageKey(base), M.symbolImageKey({ ...base, qScore: M.quantizeScore(0.71) }));
  assert.notEqual(M.symbolImageKey(base), M.symbolImageKey({ ...base, stale: true }));
  assert.notEqual(M.symbolImageKey(base), M.symbolImageKey({ ...base, selected: true }));
  assert.notEqual(M.symbolImageKey(base), M.symbolImageKey({ ...base, jCode: 'D3' }));
});

test('declutterBoxFor: 3 symbols within 1.5·s stack; 2 do not; 1.6·s apart do not', () => {
  const s = 32;
  const o = M.declutterBoxFor(s);
  const at = (id: string, x: number) => ({ id, x, y: 100, width: o.width, height: o.height });
  const trio = [at('a', 100), at('b', 100 + 1.4 * s), at('c', 100 + 2.8 * s)];
  assert.equal(DM.declutter(trio, o).groups.length, 1);
  assert.equal(DM.declutter(trio.slice(0, 2), o).groups.length, 0);
  const apart = [at('a', 100), at('b', 100 + 1.6 * s), at('c', 100 + 3.2 * s)];
  assert.equal(DM.declutter(apart, o).groups.length, 0);
});

test('stackOffsetPx: right by default, flipped left near the right edge', () => {
  assert.equal(M.stackOffsetPx(100, 32, 1000), 80);
  assert.ok(M.stackOffsetPx(950, 32, 1000) < 0);
});

test('designationOf: the 8-unit layout unit_a … unit_h prints A … H', () => {
  for (const l of 'abcdefgh') assert.equal(M.designationOf(`unit_${l}`), l.toUpperCase());
});
