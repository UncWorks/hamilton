// Run with `pnpm --filter @hamilton/web test` (node --test, native TS type stripping).

import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { DetectionEvent } from '@hamilton/contracts';
import { journalEchoes } from './branch-echo.ts';

const ev = (over: Partial<DetectionEvent> = {}): DetectionEvent => ({
  source_id: 'AB1001/unit_b',
  kind: 'mission_decision',
  message: 'operator selected (shift_non_gps) at score 0.13',
  values: { option: 'shift_non_gps', score: 0.13 },
  timestamp: '2026-10-05T04:18:06.400Z',
  ...over,
});
const journal = [{ kind: 'branch', mission_id: 'AB1001', branch: 'shift_munition', dtg: '2026-10-05T04:18:06.000Z' }];

test('the engine copy of a branch this console journaled is hidden', () => {
  assert.deepEqual([...journalEchoes([ev()], journal)], [0]);
});

test('rows with no matching journal line still show', () => {
  assert.equal(journalEchoes([ev()], []).size, 0);
  assert.equal(journalEchoes([ev({ source_id: 'AB1002/unit_c' })], journal).size, 0);
  assert.equal(journalEchoes([ev({ values: { option: 'delay_60s', score: 0.13 } })], journal).size, 0);
  assert.equal(journalEchoes([ev({ timestamp: '2026-10-05T04:19:06.000Z' })], journal).size, 0);
  assert.equal(journalEchoes([ev({ kind: 'temporal' as DetectionEvent['kind'] })], journal).size, 0);
});

test('two consoles press [1] on one engine: one journal line hides one row (the nearest)', () => {
  const engine = [ev({ timestamp: '2026-10-05T04:18:07.100Z' }), ev()];
  assert.deepEqual([...journalEchoes(engine, journal)], [1]);
});

test('accept_risk never reaches the engine, so it hides nothing', () => {
  assert.equal(journalEchoes([ev()], [{ ...journal[0]!, branch: 'accept_risk' }]).size, 0);
});
