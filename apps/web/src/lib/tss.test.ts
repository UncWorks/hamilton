// Run with `pnpm --filter @hamilton/web test` (node --test, native TS type stripping).

import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { FireMission } from '@hamilton/contracts';
import * as T from './tss.ts';
import { AVDIIVKA_BEATS } from './link-trust-rating.ts';

const NOW = '2024-02-15T18:42:40.000Z';
const ago = (s: number) => new Date(Date.parse(NOW) - s * 1000).toISOString();
const later = (s: number) => new Date(Date.parse(NOW) + s * 1000).toISOString();

const AB1001: FireMission = {
  mission_id: 'AB1001',
  observer: { source_id: 'unit_b', label: 'OBS B (FO)' },
  target: { grid: '37U DP 08604 33757', lat: 48.1505, lon: 37.7712, description: 'Mortar section', class: 'hpt' },
  munition: { designation: 'M982', name: 'Excalibur', class: 'gps_guided' },
  firing_unit: { unit_id: 'unit_a', label: 'FU A' },
  dependencies: [
    { source_id: 'unit_b', role: 'observer_link' },
    { source_id: 'unit_b', role: 'target_location' },
    { source_id: 'unit_a', role: 'firing_unit_nav' },
  ],
  status: 'received',
  method_of_control: 'when_ready',
  received_at: ago(3),
};
const M795 = { designation: 'M795', name: 'HE', class: 'unguided' } as const;

const bAt = (clockS: number) => AVDIIVKA_BEATS.find((b) => b.clockS === clockS)!.units.unit_b.score;

const healthyA = { score: 1, last_update: ago(1) };
const run = (b: T.TssSourceInput | undefined, extra: Partial<T.TssEvaluateInput> = {}) =>
  T.evaluateTss({ mission: AB1001, sources: { unit_b: b, unit_a: healthyA }, table: T.DEFAULT_TSS_TABLE, now: NOW, ...extra });

test('default table: versioned, user-accepted thresholds', () => {
  const t = T.DEFAULT_TSS_TABLE;
  assert.ok(t.version && t.dtg && t.approver_role);
  const gps = T.tssRow(t, 'gps_guided');
  assert.equal(gps.min_reliability, 'C');
  assert.equal(gps.max_report_age_s, 10);
  assert.equal(T.minScoreForLetter('C'), 0.6);
  assert.equal(T.tssRow(t, 'laser_guided').max_report_age_s, 30);
  assert.equal(T.tssRow(t, 'unguided').gated, false);
  const hpt = T.tssRow(t, 'hpt_exception');
  assert.deepEqual([hpt.min_reliability, hpt.max_report_age_s, hpt.requires_risk_acceptance], ['D', 10, true]);
});

test('letter comparison', () => {
  assert.ok(T.meetsReliability('B', 'C'));
  assert.ok(T.meetsReliability('C', 'C'));
  assert.ok(!T.meetsReliability('D', 'C'));
  assert.ok(!T.meetsReliability('F', 'D'));
});

test('1:12 call for fire: B at C3 (0.65) passes', () => {
  const r = run({ score: bAt(65), last_update: ago(1) });
  assert.equal(r.verdict, 'PASS');
  assert.equal(r.recommended, null);
  assert.equal(r.lead.j, 'C3');
  assert.equal(r.headline, 'PASS — RELIABILITY C3 (min C) · AGE 1s OK');
});

test('1:15 B collapses to E5: FAIL, rec DO NOT LOAD, B is the failing source', () => {
  const r = run({ score: bAt(75), last_update: ago(1) });
  assert.equal(r.verdict, 'FAIL');
  assert.deepEqual(r.failingSources, ['unit_b']);
  assert.equal(r.recommended, 'DO NOT LOAD');
  assert.equal(r.checks.reliability, 'fail');
  assert.equal(r.checks.reportAge, 'pass');
  assert.deepEqual(r.checks.accuracy, { status: 'na', text: 'n/a — no TLE source' });
  assert.equal(r.headline, 'FAIL — RELIABILITY E5 (min C) · AGE 1s OK');
  assert.deepEqual(r.lead.roles, ['observer_link', 'target_location']);
});

test('the target row: D4 with a 3 s report age', () => {
  const r = run({ score: 0.45, last_update: ago(3) });
  assert.equal(r.headline, 'FAIL — RELIABILITY D4 (min C) · AGE 3s OK');
});

test('report age > max → STALE F6, both checks fail', () => {
  const r = run({ score: 0.9, last_update: ago(14) });
  assert.equal(r.verdict, 'FAIL');
  assert.equal(r.lead.j, 'F6');
  assert.equal(r.checks.reportAge, 'fail');
  assert.equal(r.checks.reliability, 'fail');
  assert.equal(r.headline, 'FAIL — RELIABILITY F6 (min C) · AGE 14s > 10s (STALE)');
});

test('no trust feed for a dependency: cannot be judged → F6 FAIL', () => {
  const r = run(undefined);
  assert.equal(r.verdict, 'FAIL');
  assert.ok(r.lead.noFeed);
  assert.match(r.headline, /AGE — NO FEED/);
});

test('unguided is never gated; trust is still shown', () => {
  const mission = { ...AB1001, munition: M795 };
  const r = T.evaluateTss({ mission, sources: { unit_b: { score: bAt(75), last_update: ago(14) }, unit_a: healthyA }, table: T.DEFAULT_TSS_TABLE, now: NOW });
  assert.equal(r.verdict, 'PASS');
  assert.equal(r.gated, false);
  assert.equal(r.recommended, null);
  assert.equal(r.checks.reliability, 'na');
  assert.equal(r.lead.j, 'F6');
  assert.match(r.headline, /^PASS — NOT GATED \(UNGUIDED HE\) · F6/);
});

test('laser-guided: 30 s max report age', () => {
  const mission = { ...AB1001, munition: { designation: 'M712', name: 'Copperhead', class: 'laser_guided' as const } };
  // 20 s is STALE for the symbol (> 10 s) → F6, so reliability fails even though age passes.
  const r = T.evaluateTss({ mission, sources: { unit_b: { score: 0.9, last_update: ago(20) }, unit_a: healthyA }, table: T.DEFAULT_TSS_TABLE, now: NOW });
  assert.equal(r.checks.reportAge, 'pass');
  assert.equal(r.checks.reliability, 'fail');
});

test('a degraded source with no dependency on it does not affect the mission', () => {
  const r = T.evaluateTss({
    mission: { ...AB1001, dependencies: [{ source_id: 'unit_a', role: 'observer_link' }] },
    sources: { unit_b: { score: 0.1, last_update: ago(1) }, unit_a: healthyA },
    table: T.DEFAULT_TSS_TABLE,
    now: NOW,
  });
  assert.equal(r.verdict, 'PASS');
});

test('hysteresis: fail at once, pass only after ≥ min for 5 s continuously', () => {
  const failed = run({ score: 0.2, last_update: ago(1) });
  assert.equal(failed.verdict, 'FAIL');

  const eval_ = (score: number, at: string, h: T.TssHysteresis) =>
    T.evaluateTss({ mission: AB1001, sources: { unit_b: { score, last_update: at }, unit_a: { score: 1, last_update: at } }, table: T.DEFAULT_TSS_TABLE, now: at, hysteresis: h });

  let r = eval_(0.7, later(0), failed.hysteresis);
  assert.equal(r.verdict, 'FAIL', 'just recovered: still FAIL');
  assert.equal(r.lead.recoveringS, 0);
  assert.match(r.headline, /RE-RATING 0\/5s/);
  r = eval_(0.7, later(3), r.hysteresis);
  assert.equal(r.verdict, 'FAIL');
  // Dips below the minimum: the recovery clock restarts.
  r = eval_(0.5, later(4), r.hysteresis);
  assert.equal(r.verdict, 'FAIL');
  assert.equal(r.lead.recoveringS, null);
  r = eval_(0.7, later(5), r.hysteresis);
  r = eval_(0.7, later(9), r.hysteresis);
  assert.equal(r.verdict, 'FAIL', '4 s held');
  r = eval_(0.7, later(10), r.hysteresis);
  assert.equal(r.verdict, 'PASS', '5 s held');
  r = eval_(0.7, later(11), r.hysteresis);
  assert.equal(r.verdict, 'PASS');
});

test('a source that never failed passes without the hold', () => {
  const r = run({ score: 0.7, last_update: ago(0) }, { hysteresis: {} });
  assert.equal(r.verdict, 'PASS');
});

test('confirmed via alternate means: credibility 1 clears reliability', () => {
  const r = run({ score: bAt(75), last_update: ago(1), corroboration: 'confirmed' });
  assert.equal(r.lead.j, 'E1');
  assert.equal(r.verdict, 'PASS');
  assert.equal(r.headline, 'PASS — RELIABILITY E1 CONFIRMED (alt means) · AGE 1s OK');
});

test('confirmation does not clear a stale report', () => {
  const r = run({ score: 0.7, last_update: ago(14), corroboration: 'confirmed' });
  assert.equal(r.lead.j, 'F6');
  assert.equal(r.verdict, 'FAIL');
});

test('AT MY COMMAND while failing; CHECK FIRING when firing', () => {
  assert.equal(run({ score: 0.2, last_update: ago(1) }, { atMyCommand: true }).recommended, 'AT MY COMMAND');
  const firing = T.evaluateTss({
    mission: { ...AB1001, status: 'firing' },
    sources: { unit_b: { score: 0.1, last_update: ago(1) }, unit_a: healthyA },
    table: T.DEFAULT_TSS_TABLE,
    now: NOW,
  });
  assert.equal(firing.recommended, 'CHECK FIRING / CEASE LOADING');
});

test('risk acceptance on an HPT: evaluated against the exception row (min D)', () => {
  const d4 = run({ score: 0.45, last_update: ago(1) }, { riskAccepted: true });
  assert.equal(d4.row.id, 'hpt_exception');
  assert.equal(d4.verdict, 'PASS');
  const e5 = run({ score: 0.2, last_update: ago(1) }, { riskAccepted: true });
  assert.equal(e5.verdict, 'FAIL');
  assert.equal(e5.headline, 'FAIL — RELIABILITY E5 (min D) · AGE 1s OK');
  // Not an HPT: no exception row applies.
  const std = T.evaluateTss({
    mission: { ...AB1001, target: { ...AB1001.target, class: 'standard' } },
    sources: { unit_b: { score: 0.45, last_update: ago(1) }, unit_a: healthyA },
    table: T.DEFAULT_TSS_TABLE,
    now: NOW,
    riskAccepted: true,
  });
  assert.equal(std.row.id, 'gps_guided');
  assert.equal(std.verdict, 'FAIL');
});

test('thresholds are configuration: a tightened table changes the verdict', () => {
  const tight: T.TssTable = {
    ...T.DEFAULT_TSS_TABLE,
    version: 'TSS-2',
    rows: T.DEFAULT_TSS_TABLE.rows.map((r) => (r.id === 'gps_guided' ? { ...r, min_reliability: 'B' } : r)),
  };
  const r = T.evaluateTss({ mission: AB1001, sources: { unit_b: { score: 0.7, last_update: ago(1) }, unit_a: healthyA }, table: tight, now: NOW });
  assert.equal(r.verdict, 'FAIL');
  assert.equal(r.tableVersion, 'TSS-2');
});
