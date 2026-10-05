// Run with `pnpm --filter @hamilton/web test` (node --test, native TS type stripping).

import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as D from './display-names.ts';
import { TRUST_FACTORS } from './link-trust-rating.ts';

test('unit names: scenario units read "Unit X", others are humanized', () => {
  assert.equal(D.unitName('unit_b'), 'Unit B');
  assert.equal(D.unitName('UNIT_A'), 'Unit A');
  assert.equal(D.unitName('hostile_ew_1'), 'Hostile EW 1');
});

test('sensor types and jammer methods have operator names', () => {
  assert.equal(D.sensorTypeLabel('recon_static'), 'Recon (static)');
  assert.equal(D.methodName('ground_based_gps_uhf_barrage'), 'Ground-based GPS/UHF barrage');
  assert.equal(D.methodShortName('ground_based_gps_uhf_barrage'), 'GPS/UHF barrage');
  assert.equal(D.methodName('new_vhf_sweep'), 'New vhf sweep');
});

test('engine log lines are relabelled without snake_case ids', () => {
  const lines = [
    { source_id: 'unit_b', kind: 'stability', message: 'unit_b: CRC 0.2% → 5.7%' },
    { source_id: 'unit_b', kind: 'fingerprint', message: 'unit_b: candidate ground_based_gps_uhf_barrage (top match)' },
    { source_id: 'AB1001/unit_b', kind: 'modal_selection', message: 'operator selected (shift_non_gps) at score 0.11' },
  ];
  const out = lines.map((e) => ({ who: D.eventWho(e.source_id), kind: D.eventKind(e.kind), message: D.eventMessage(e) }));
  assert.deepEqual(out, [
    { who: 'Unit B', kind: 'link errors', message: 'Frame errors 0.2% → 5.7%' },
    { who: 'Unit B', kind: 'jammer match', message: 'Top match: Ground-based GPS/UHF barrage' },
    { who: 'FM AB1001 · Unit B', kind: 'branch', message: 'FDC chose: shift to a non-GPS round · link trust 0.11' },
  ]);
  for (const k of ['temporal_anomaly', 'spatial', 'modal_gated', 'recovery']) assert.doesNotMatch(D.eventKind(k), /_/);
});

test('rating breakdown factor labels carry no requirement ids', () => {
  assert.deepEqual(TRUST_FACTORS.map((f) => f.label), ['Message timing', 'Link errors', 'Neighbours', 'Jammer match']);
});

test('the 8-unit layout: units D–H read "Unit X"; A is the FU, B the FO (jammer-aoe.md §0.4)', () => {
  for (const l of 'abcdefgh') assert.equal(D.unitName(`unit_${l}`), `Unit ${l.toUpperCase()}`);
  assert.match(D.UNIT_ROLES.unit_a!, /FU A/);
  assert.match(D.UNIT_ROLES.unit_b!, /OBS B/);
  for (const l of 'defgh') assert.ok(D.UNIT_ROLES[`unit_${l}`], `role for unit_${l}`);
});
