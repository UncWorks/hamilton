// Run with `pnpm --filter @hamilton/web test` (node --test, native TS type
// stripping — Node >= 22.18). No test framework dependency.
//
// The explicit `.ts` extensions are what Node's ESM loader needs; tsc (which
// also type-checks this file) rejects them without allowImportingTsExtensions,
// hence the ts-ignore on those two imports only.

import assert from 'node:assert/strict';
import { test } from 'node:test';
// @ts-ignore TS5097 — see header
import * as R from './link-trust-rating.ts';
// @ts-ignore TS5097 — see header
import { trustBand } from './trust-gradient.ts';

const rating: typeof import('./link-trust-rating') = R;
const band: typeof import('./trust-gradient').trustBand = trustBand;

test('scale names, J codes and edges', () => {
  const cases: [number, string, string, boolean][] = [
    [1.0, 'NOMINAL', 'B2', false],
    [0.85, 'NOMINAL', 'B2', false],
    [0.849, 'WATCH', 'C3', false],
    [0.6, 'WATCH', 'C3', false],
    [0.599, 'DEGRADED', 'D4', true],
    [0.31, 'DEGRADED', 'D4', true],
    [0.3, 'DEGRADED', 'D4', true],
    [0.299, 'UNRELIABLE', 'E5', true],
    [0.0, 'UNRELIABLE', 'E5', true],
  ];
  for (const [score, name, j, gated] of cases) {
    const r = rating.rateLinkTrust(score);
    assert.equal(r.name, name, `name @ ${score}`);
    assert.equal(r.jCode, j, `J @ ${score}`);
    assert.equal(r.roeGated, gated, `roeGated @ ${score}`);
    assert.equal(r.jCode, `${r.reliability}${r.credibility}`);
  }
});

test('bands agree with trust-gradient.ts trustBand at every edge', () => {
  for (let i = 0; i <= 1000; i++) {
    const s = i / 1000;
    assert.equal(rating.rateLinkTrust(s).band, band(s), `band @ ${s}`);
  }
});

test('names avoid reserved 2525 / FM 1-02.2 terms', () => {
  const reserved = ['SUSPECT', 'ASSUMED', 'PENDING', 'UNKNOWN', 'HOSTILE', 'DAMAGED', 'DESTROYED', 'ANTICIPATED', 'PLANNED', 'FO', 'SO', 'MO', 'NO'];
  for (const l of rating.LINK_TRUST_SCALE) assert.ok(!reserved.includes(l.name), l.name);
  assert.ok(!reserved.includes(rating.STALE_NAME));
});

test('stale overrides the label, keeps the J code, sets AR=NRT', () => {
  const r = rating.rateLinkTrust(0.31, { stale: true });
  assert.equal(r.label, 'STALE');
  assert.equal(r.jCode, 'D4');
  assert.equal(r.visibleAtRest, true);
  const amp = rating.exportAmplifiers(r, '2024-02-15T18:42:41.000Z');
  assert.deepEqual(amp, { J: 'D4', W: '15184241ZFEB2024', AR: 'NRT' });
  assert.equal(rating.exportAmplifiers(rating.rateLinkTrust(0.9), '2024-02-15T18:42:41.000Z').AR, undefined);
  assert.equal(rating.rateLinkTrust(0.9).visibleAtRest, false);
});

test('isStale uses STALE_AFTER_S', () => {
  assert.equal(rating.isStale('2024-02-15T18:42:00Z', '2024-02-15T18:42:10Z'), false);
  assert.equal(rating.isStale('2024-02-15T18:42:00Z', '2024-02-15T18:42:11Z'), true);
});

test('aggregateTrust mirrors aggregator/src/lib.rs', () => {
  // lib.rs test: all-healthy → 1.0
  assert.equal(rating.aggregateTrust({ temporal: 1, stability: 1, spatial: 1, fingerprint: 1 }).score, 1);
  // Engine output at Avdiivka B-1:15 after PR #1 (docs/plans/fix-fingerprint-trust-inversion.md §3):
  // jammer matched 6/6 → fingerprint trust 0. 0.6·0.213 + 0.4·0 = 0.1278.
  const demo = rating.aggregateTrust({ temporal: 0, stability: 0.31, spatial: 0.6, fingerprint: 0 });
  assert.ok(Math.abs(demo.weightedAvg - 0.213) < 1e-9);
  assert.ok(Math.abs(demo.score - 0.1278) < 1e-9);
  // Tie at 0 → first in FR order.
  assert.equal(demo.worstFactor, 'temporal');
  assert.equal(demo.factors.filter((f) => f.weakest).length, 1);
  // Localized jammer match with the other detectors healthy tops out below the ROE floor.
  const matched = rating.aggregateTrust({ temporal: 1, stability: 1, spatial: 0.6, fingerprint: 0 });
  assert.ok(Math.abs(matched.score - 0.372) < 1e-9);
  assert.equal(matched.worstFactor, 'fingerprint');
  const wsum = Object.values(rating.AGGREGATOR_WEIGHTS).reduce((a, b) => a + b, 0);
  assert.ok(Math.abs(wsum - 1) < 1e-12);
});

test('solveComponents: engine-reachable components reproduce every 2-dp fixture score exactly', () => {
  const fp = new Set<number>(rating.ENGINE_FINGERPRINT_TRUST);
  const sp = new Set<number>(Object.values(rating.ENGINE_SPATIAL_TRUST));
  for (let i = 4; i <= 100; i++) {
    const score = i / 100;
    const c = rating.solveComponents(score);
    assert.ok(fp.has(c.fingerprint), `fingerprint ${c.fingerprint} @ ${score}`);
    assert.ok(sp.has(c.spatial), `spatial ${c.spatial} @ ${score}`);
    for (const v of [c.temporal, c.stability]) assert.ok(v >= 0 && v <= 1, `range @ ${score}`);
    // Tighter than the B′ tooltip's 0.005 mismatch threshold.
    assert.ok(Math.abs(rating.aggregateTrust(c).score - score) < 1e-9, `score @ ${score}`);
  }
});

test('solveComponents: band samples sit in the expected regimes', () => {
  // Fixture BAND_SAMPLES (stories/fixtures/avdiivka.ts).
  const nominal = rating.solveComponents(0.97);
  assert.deepEqual([nominal.spatial, nominal.fingerprint], [1, 1]);
  const watching = rating.solveComponents(0.72);
  assert.deepEqual([watching.spatial, watching.fingerprint], [0.6, 1]);
  const degraded = rating.solveComponents(0.31);
  assert.deepEqual([degraded.spatial, degraded.fingerprint], [0.6, 0]);
  // Same link one beat later: temporal/stability do not improve across the jammer match.
  assert.ok(degraded.temporal <= watching.temporal && degraded.stability <= watching.stability);
  const failed = rating.solveComponents(0.13);
  assert.deepEqual([failed.temporal, failed.spatial, failed.fingerprint], [0, 0.6, 0]);
  assert.ok(Math.abs(failed.stability - 0.3222) < 1e-3);
});
