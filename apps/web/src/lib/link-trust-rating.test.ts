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
    [0.42, 'DEGRADED', 'D4', true],
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
  const r = rating.rateLinkTrust(0.42, { stale: true });
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
  // Research-doc demo values: 0.6·0.436 + 0.4·0.19 = 0.3376 (NOT the 0.42 the doc claims).
  const demo = rating.aggregateTrust({ temporal: 0.65, stability: 0.31, spatial: 0.78, fingerprint: 0.19 });
  assert.ok(Math.abs(demo.weightedAvg - 0.436) < 1e-9);
  assert.ok(Math.abs(demo.score - 0.3376) < 1e-9);
  assert.equal(demo.worstFactor, 'fingerprint');
  assert.equal(demo.factors.filter((f) => f.weakest).length, 1);
  const wsum = Object.values(rating.AGGREGATOR_WEIGHTS).reduce((a, b) => a + b, 0);
  assert.ok(Math.abs(wsum - 1) < 1e-12);
});
