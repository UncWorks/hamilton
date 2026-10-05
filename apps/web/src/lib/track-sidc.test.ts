// Run with `pnpm --filter @hamilton/web test` (node --test, native TS type
// stripping). See link-trust-rating.test.ts for the ts-ignore rationale.

import assert from 'node:assert/strict';
import { test } from 'node:test';
// @ts-ignore TS5097 — explicit .ts extension for Node's ESM loader
import * as S from './track-sidc.ts';

const M: typeof import('./track-sidc') = S;

test('SIDC assembly (2525E, version 13) — codes verified against milsymbol 3.0.4', () => {
  assert.equal(M.buildSidc({ identity: '3', entity: '130300' }), '13031000001303000000');
  assert.equal(M.buildSidc({ identity: '6', entity: '121300', modifier2: '51' }), '13061000001213000051');
  assert.equal(M.buildSidc({ identity: '3', entity: '130302', modifier1: '50', echelon: '14' }), '13031000141303025000');
  assert.throws(() => M.buildSidc({ identity: '33', entity: '130300' }));
  assert.equal(M.formatSidc('13031000001303000000'), '13 0 3 10 0 0 00 130300 00 00');
  // 2525B letter codes, validated with milsymbol 3.0.4 (isValid) — echelon E = company/battery.
  assert.equal(M.buildLetterSidc({ affiliation: 'F', fn: 'UCF---' }), 'SFGPUCF--------');
  assert.equal(M.buildLetterSidc({ affiliation: 'H', fn: 'UCFTR-', echelon: 'E' }), 'SHGPUCFTR--E---');
  assert.equal(M.buildLetterSidc({ affiliation: 'U', fn: 'UCRVM-', status: 'A' }).length, 15);
  assert.throws(() => M.buildLetterSidc({ affiliation: 'F', fn: 'UCF' }));
});

test('Avdiivka units: stored 2525E, exported 2525C letter + CoT', () => {
  // A — FA observer team (COLT/FIST), B — FA battery, C — TA radar platoon.
  const a = { affiliation: 'friendly', sensorType: 'recon_static' } as const;
  const b = { affiliation: 'friendly', sensorType: 'offense' } as const;
  const c = { affiliation: 'friendly', sensorType: 'detection' } as const;
  assert.equal(M.toSidc2525E(a), '13031000111304000000');
  assert.equal(M.toSidc2525E(b), '13031000151303000000');
  // 130300 + sector-1 modifier 50 (radar); NOT the 2525D-only 130302.
  assert.equal(M.toSidc2525E(c), '13031000141303005000');
  assert.equal(M.toSidc2525C(a), 'SFGPUCFTCD-A---');
  assert.equal(M.toSidc2525C(b), 'SFGPUCF----E---');
  assert.equal(M.toSidc2525C(c), 'SFGPUCFTR--D---');
  assert.equal(M.toCotType(a), 'a-f-G-U-C-F-T-C-D');
  assert.equal(M.toCotType(b), 'a-f-G-U-C-F');
  assert.equal(M.toCotType(c), 'a-f-G-U-C-F-T-R');
});

test('jammer: EW override, status 1 candidates, no echelon', () => {
  const fix = { affiliation: 'enemy', sensorType: 'defense', fn: 'ew-jamming' } as const;
  assert.equal(M.symbolFunctionOf(fix), 'ew-jamming', 'fn wins over the fixture sensor_type');
  assert.equal(M.toSidc2525E(fix), '13061000001505040000');
  assert.equal(M.toSidc2525C(fix), 'SHGPUUMSEJ-----');
  assert.equal(M.toCotType(fix), 'a-h-G-U-U-M-S-E-J');
  const cand = { ...fix, status: 'anticipated' } as const;
  assert.equal(M.toSidc2525E(cand)[6], '1', 'status digit 1 = planned / anticipated');
  assert.equal(M.toSidc2525C(cand), 'SHGAUUMSEJ-----');
  assert.equal(M.toCotType(cand), M.toCotType(fix), 'CoT type carries no status');
});

test('affiliation identity digits and letters; explicit echelon overrides the default', () => {
  const base = { sensorType: 'offense' } as const;
  assert.equal(M.toSidc2525E({ ...base, affiliation: 'unknown' })[3], '1');
  assert.equal(M.toSidc2525E({ ...base, affiliation: 'friendly' })[3], '3');
  assert.equal(M.toSidc2525E({ ...base, affiliation: 'neutral' })[3], '4');
  assert.equal(M.toSidc2525E({ ...base, affiliation: 'enemy' })[3], '6');
  assert.equal(M.toSidc2525C({ ...base, affiliation: 'neutral' })[1], 'N');
  assert.equal(M.toSidc2525E({ ...base, affiliation: 'friendly', echelon: 'team' }).slice(8, 10), '11');
  assert.equal(M.toSidc2525E({ ...base, affiliation: 'friendly', echelon: null }).slice(8, 10), '00');
  assert.throws(() => M.symbolFunctionOf({}));
});
