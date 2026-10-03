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

test('stale overrides the label, becomes F6 (J split), sets AR=NRT', () => {
  const r = rating.rateLinkTrust(0.31, { stale: true });
  assert.equal(r.label, 'STALE');
  assert.equal(r.name, 'DEGRADED', 'the last band name is kept for the tooltip');
  assert.equal(r.jCode, 'F6');
  assert.equal(r.jCode, rating.STALE_J);
  assert.equal(r.visibleAtRest, true);
  const amp = rating.exportAmplifiers(r, '2024-02-15T18:42:41.000Z');
  assert.deepEqual(amp, { J: 'F6', W: '15184241ZFEB2024', AR: 'NRT' });
  assert.equal(rating.exportAmplifiers(rating.rateLinkTrust(0.9), '2024-02-15T18:42:41.000Z').AR, undefined);
  assert.equal(rating.rateLinkTrust(0.9).visibleAtRest, false);
  // Stale wins over corroboration: no basis to judge either axis.
  assert.equal(rating.rateLinkTrust(0.95, { stale: true, corroboration: 'confirmed' }).jCode, 'F6');
});

test('J split: score sets the letter, corroboration sets the digit', () => {
  const cases: [number, string, string][] = [
    [1.0, 'B2', 'B1'],
    [0.7, 'C3', 'C1'],
    [0.45, 'D4', 'D1'],
    [0.13, 'E5', 'E1'],
  ];
  for (const [score, uncorroborated, confirmed] of cases) {
    const u = rating.rateLinkTrust(score);
    const c = rating.rateLinkTrust(score, { corroboration: 'confirmed' });
    assert.equal(u.jCode, uncorroborated, `uncorroborated @ ${score} keeps today's digit`);
    assert.equal(u.corroboration, 'uncorroborated');
    assert.equal(c.jCode, confirmed, `confirmed @ ${score} → credibility 1`);
    assert.equal(c.reliability, u.reliability, 'corroboration never moves the letter');
    assert.equal(c.name, u.name, 'rating names are unchanged');
    assert.equal(c.roeGated, u.roeGated);
    assert.match(c.jMeaning, /· 1: Confirmed$/);
  }
});

test('an algorithm never emits reliability A', () => {
  for (let i = 0; i <= 100; i++) {
    for (const corroboration of ['confirmed', 'uncorroborated'] as const) {
      for (const stale of [false, true]) {
        const r = rating.rateLinkTrust(i / 100, { corroboration, stale });
        assert.notEqual(r.reliability, 'A', `score ${i / 100}`);
        assert.equal(r.autoJ, r.jCode, 'no override → shown J is the automatic J');
        assert.ok(rating.parseJ(r.jCode), `valid J ${r.jCode}`);
      }
    }
  }
});

test('S2 override: shown and exported, automatic value kept, invalid codes rejected', () => {
  const override = { j: 'C3', by: 'S2', reason: 'FM voice check with B confirms position', at: '2024-02-15T18:42:45.000Z' };
  const r = rating.rateLinkTrust(0.13, { override });
  assert.equal(r.jCode, 'C3');
  assert.equal(r.autoJ, 'E5');
  assert.equal(r.reliability, 'C');
  assert.equal(r.credibility, '3');
  assert.deepEqual(r.override, override);
  assert.equal(r.name, 'UNRELIABLE', 'the score band (and its name) is not rewritten');
  assert.equal(r.roeGated, true, 'the ROE floor stays score-based');
  assert.equal(r.visibleAtRest, true);
  assert.equal(rating.exportAmplifiers(r, '2024-02-15T18:42:41.000Z').J, 'C3');
  // Override also wins over STALE (the S2 owns J).
  assert.equal(rating.rateLinkTrust(0.9, { stale: true, override: { j: 'b2', by: 'S2', reason: 'r' } }).jCode, 'B2');
  assert.throws(() => rating.rateLinkTrust(0.5, { override: { j: 'G7', by: 'S2', reason: 'x' } }));
  assert.equal(rating.parseJ('A1')?.join(''), 'A1', 'a human may still rate A');
  assert.equal(rating.parseJ('A0'), undefined);
  assert.equal(rating.rateLinkTrust(0.5).override, undefined);
});

test('isStale uses STALE_AFTER_S', () => {
  assert.equal(rating.isStale('2024-02-15T18:42:00Z', '2024-02-15T18:42:10Z'), false);
  assert.equal(rating.isStale('2024-02-15T18:42:00Z', '2024-02-15T18:42:11Z'), true);
});

test('aggregateTrust mirrors aggregator/src/lib.rs', () => {
  // lib.rs test: all-healthy → 1.0
  assert.equal(rating.aggregateTrust({ temporal: 1, stability: 1, spatial: 1, fingerprint: 1 }).score, 1);
  // Engine output at Avdiivka B-1:15 after PR #1, components rounded to 2 dp
  // (docs/plans/fix-spatial-trust-and-gate-timing.md): jammer matched 6/6 →
  // fingerprint trust 0. 0.6·0.213 + 0.4·0 = 0.1278 (exact beat: 0.1274).
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

// ---------------------------------------------------------------------------
// Engine beats — SOURCE OF TRUTH: the Rust end-to-end test
// services/trust-engine/crates/aggregator/src/lib.rs `avdiivka_beats_end_to_end`
// on branch fix/fingerprint-trust-inversion (PR #1) @ 6733817. The constants
// below are copied from its `--nocapture` output
// (`cargo test -p trust-aggregator avdiivka_beats_end_to_end -- --nocapture`):
// score printed to 3 dp, components (temporal / stability / spatial /
// fingerprint) to 2 dp. If the engine or comms-sim scenarios/avdiivka.py
// changes, re-run that test and update these rows.
// ---------------------------------------------------------------------------

type Row = readonly [score: number, t: number, s: number, sp: number, fp: number];
const HEALTHY_ROW: Row = [1.0, 1.0, 1.0, 1.0, 1.0];
const RUST_BEATS: readonly { clockS: number; a: Row; b: Row; c: Row }[] = [
  { clockS: 0, a: HEALTHY_ROW, b: [1.0, 1.0, 1.0, 1.0, 1.0], c: HEALTHY_ROW }, // B-0:00
  { clockS: 45, a: HEALTHY_ROW, b: [0.702, 0.52, 1.0, 0.6, 1.0], c: HEALTHY_ROW }, // B-0:45
  { clockS: 55, a: HEALTHY_ROW, b: [0.652, 0.52, 0.72, 0.6, 1.0], c: HEALTHY_ROW }, // B-0:55
  { clockS: 65, a: HEALTHY_ROW, b: [0.652, 0.52, 0.72, 0.6, 1.0], c: HEALTHY_ROW }, // B-1:05
  { clockS: 75, a: HEALTHY_ROW, b: [0.127, 0.0, 0.31, 0.6, 0.0], c: HEALTHY_ROW }, // B-1:15
  { clockS: 80, a: HEALTHY_ROW, b: [0.127, 0.0, 0.31, 0.6, 0.0], c: HEALTHY_ROW }, // B-1:20
  { clockS: 110, a: HEALTHY_ROW, b: [0.22, 0.0, 0.82, 0.6, 0.0], c: HEALTHY_ROW }, // B-1:50
  { clockS: 135, a: HEALTHY_ROW, b: [1.0, 1.0, 1.0, 1.0, 1.0], c: HEALTHY_ROW }, // B-2:15
];

test('fixture beat table (AVDIIVKA_BEATS) equals the engine end-to-end beat values', () => {
  assert.deepEqual(
    rating.AVDIIVKA_BEATS.map((b) => b.clockS),
    RUST_BEATS.map((r) => r.clockS),
  );
  rating.AVDIIVKA_BEATS.forEach((beat, i) => {
    const want = RUST_BEATS[i]!;
    for (const [unit, row] of [['unit_a', want.a], ['unit_b', want.b], ['unit_c', want.c]] as const) {
      const got = beat.units[unit];
      const at = `${beat.label} ${unit}`;
      assert.ok(Math.abs(got.score - row[0]) <= 5e-4, `${at} score ${got.score} ≠ ${row[0]}`);
      const comps = [got.components.temporal, got.components.stability, got.components.spatial, got.components.fingerprint];
      comps.forEach((v, k) => assert.ok(Math.abs(v - row[k + 1]!) <= 5e-3, `${at} component ${k} ${v} ≠ ${row[k + 1]}`));
      // The payload score is exactly the aggregate of its components (tooltip mismatch stays silent).
      assert.equal(rating.aggregateTrust(got.components).score, got.score);
    }
  });
});

test('engine beats: exact values from the detector mappings + avdiivka.py telemetry', () => {
  const b = (clockS: number) => rating.beatAt(clockS).units.unit_b;
  const close = (x: number, y: number, msg: string) => assert.ok(Math.abs(x - y) < 1e-12, `${msg}: ${x} ≠ ${y}`);
  // 0:45 — 1.17 s = 3.4σ → temporal 1 − 2.4/5 = 0.52; localized 0.6. 0.6·0.824 + 0.4·0.52 = 0.7024.
  close(rating.cadenceSigma(1.17), 3.4, 'σ @ 1.17 s');
  close(b(45).components.temporal, 0.52, 'temporal 0:45');
  close(b(45).score, 0.7024, 'B 0:45');
  // 0:55 — CRC 6 % → stability 1 − 0.055/0.195.
  close(b(55).components.stability, 1 - 0.055 / 0.195, 'stability 0:55');
  // 1:15 — 6.1 s (102σ) → temporal 0; CRC 14 % → 1 − 0.135/0.195; jammer 6/6 → fingerprint 0.
  close(b(75).components.stability, 1 - 0.135 / 0.195, 'stability 1:15');
  close(b(75).score, 0.6 * (0.3 * (1 - 0.135 / 0.195) + 0.2 * 0.6), 'B 1:15');
  // Storyboard checks (System Design §2, Branding §10): WATCH from 0:45 to 1:05, first crossing at 1:15.
  for (const t of [45, 55, 65]) {
    assert.equal(rating.rateLinkTrust(b(t).score).name, 'WATCH', `B @ ${t}`);
    assert.equal(b(t).components.spatial, rating.ENGINE_SPATIAL_TRUST.localized);
  }
  assert.equal(rating.firstCrossingClock(), 75);
  assert.equal(rating.rateLinkTrust(b(75).score).name, 'UNRELIABLE');
  assert.ok(b(110).score > b(80).score && b(110).score < rating.ROE_FLOOR, '1:50 recovering but gated');
  // A and C never leave Nominal spatial: no false blanket.
  for (const beat of rating.AVDIIVKA_BEATS) {
    for (const u of ['unit_a', 'unit_c'] as const) assert.equal(beat.units[u].score, 1, `${beat.label} ${u}`);
  }
  // Positions: avdiivka.py SOURCE_POSITIONS, A and C inside B's 500 m radius.
  assert.deepEqual(rating.AVDIIVKA_POSITIONS.unit_b, { lat: 48.14, lon: 37.745 });
});

test('engineTick: all-degraded gives the blanket penalty (aggregator all_degraded_gives_blanket_penalty)', () => {
  const d = { cadenceS: 1.2, crc: 0.08, rfMatch: 0 };
  const out = rating.engineTick({ unit_a: d, unit_b: d, unit_c: d });
  for (const u of rating.AVDIIVKA_UNITS) assert.equal(out[u].components.spatial, rating.ENGINE_SPATIAL_TRUST.blanket);
});

test('ENGINE_SPATIAL_TRUST mirrors spatial.rs Nominal / Localized / Blanket', () => {
  assert.deepEqual(rating.ENGINE_SPATIAL_TRUST, { nominal: 1, localized: 0.6, blanket: 0.3 });
});

// Fixture BAND_SAMPLES (stories/fixtures/avdiivka.ts), copied: engine beats
// 0:00 / 0:45 / 1:15 for B, plus the synthetic DEGRADED sample.
const BAND_SAMPLES = { nominal: 1, watching: 0.7024, degraded: 0.45, failed: 0.6 * (0.3 * (1 - 0.135 / 0.195) + 0.12) } as const;

test('band samples: reachable, in their band, reproduced exactly by the solver', () => {
  const names = { nominal: 'NOMINAL', watching: 'WATCH', degraded: 'DEGRADED', failed: 'UNRELIABLE' } as const;
  for (const [k, score] of Object.entries(BAND_SAMPLES) as [keyof typeof BAND_SAMPLES, number][]) {
    assert.equal(rating.rateLinkTrust(score).name, names[k], k);
    const c = rating.solveComponents(score);
    assert.ok(Math.abs(rating.aggregateTrust(c).score - score) < 1e-9, `${k} reproduced`);
  }
  // Engine-beat samples solve back to the engine's own components.
  type Comps = import('./link-trust-rating').TrustComponentsLike;
  const near = (got: Comps, want: Comps, k: string) => {
    for (const f of ['temporal', 'stability', 'spatial', 'fingerprint'] as const) {
      assert.ok(Math.abs(got[f] - want[f]) < 1e-9, `${k}.${f} ${got[f]} ≠ ${want[f]}`);
    }
  };
  near(rating.solveComponents(BAND_SAMPLES.nominal), rating.beatAt(0).units.unit_b.components, 'nominal');
  near(rating.solveComponents(BAND_SAMPLES.watching), rating.beatAt(45).units.unit_b.components, 'watching');
  near(rating.solveComponents(BAND_SAMPLES.failed), rating.beatAt(75).units.unit_b.components, 'failed');
  assert.ok(Math.abs(rating.beatAt(75).units.unit_b.score - BAND_SAMPLES.failed) < 1e-12);
  // Synthetic DEGRADED: 0:45 cadence (temporal 0.52), localized, no RF match, CRC ~15.4 %.
  const degraded = rating.solveComponents(BAND_SAMPLES.degraded);
  assert.deepEqual([degraded.spatial, degraded.fingerprint], [0.6, 1]);
  assert.ok(Math.abs(degraded.temporal - 0.52) < 1e-9);
  assert.ok(Math.abs(rating.crcForStabilityTrust(degraded.stability) - 0.1544) < 1e-3);
  // No engine beat sits in the DEGRADED band.
  assert.ok(rating.AVDIIVKA_BEATS.every((b) => rating.rateLinkTrust(b.units.unit_b.score).name !== 'DEGRADED'));
});
