// Run with `pnpm --filter @hamilton/web test` (node --test, native TS type
// stripping). Fake clock: every function takes nowMs; nothing reads Date.now().
// Fixtures: the frozen CP1 set, packages/contracts/fixtures/aoe (read, not copied).
// Plan docs/plans/jammer-aoe.md §5.4: stale on the C2's own clock after
// valid_until; an empty payload clears; the W15 card strings; never "clear".

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import type { EmitterEstimatePayload, FireMission } from '@hamilton/contracts';
// @ts-ignore TS5097 — explicit .ts extension for Node's ESM loader
import * as E from './emitter-estimate.ts';

const M: typeof import('./emitter-estimate') = E;

const fixture = (name: string): EmitterEstimatePayload =>
  JSON.parse(readFileSync(new URL(`../../../../packages/contracts/fixtures/aoe/emitter-estimate.${name}.json`, import.meta.url), 'utf8'));

const B115 = fixture('b115');
const B150 = fixture('b150');
const B215 = fixture('b215-stale');
const UNB = fixture('unbounded');

/** The fixtures' own clock: 1:15 = 2024-02-15T18:42:36Z (aligned with the payload). */
const T115 = Date.parse(B115.computed_at);
/** A C2 two years later (replay / Storybook): judged from receipt only. */
const LATER = Date.parse('2026-10-04T12:00:00Z');

// 8-unit layout (plan §6). B at 1:50 is 5 km west.
const UNITS = [
  { source_id: 'unit_a', lat: 48.14449, lon: 37.65077 },
  { source_id: 'unit_b', lat: 48.14, lon: 37.745 },
  { source_id: 'unit_c', lat: 48.12653, lon: 37.70462 },
  { source_id: 'unit_d', lat: 48.17593, lon: 37.75173 },
  { source_id: 'unit_e', lat: 48.10407, lon: 37.74904 },
  { source_id: 'unit_f', lat: 48.09508, lon: 37.66423 },
  { source_id: 'unit_g', lat: 48.16695, lon: 37.62385 },
  { source_id: 'unit_h', lat: 48.1939, lon: 37.72481 },
];
const B_MOVED = B150.evidence.find((e) => e.source_id === 'unit_b' && e.state === 'healthy')!;
const UNITS_150 = UNITS.map((u) => (u.source_id === 'unit_b' ? { ...u, lat: B_MOVED.lat, lon: B_MOVED.lon } : u));

const AB1001 = {
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
  received_at: '2024-02-15T18:42:33Z',
} as unknown as FireMission;

const EMPTY: E.EstimateSlice = { entry: null, state: null };
const NEVER = /clear|window open/i;

// ---------------------------------------------------------------------------
// Clock
// ---------------------------------------------------------------------------

test('validity window = valid_until − computed_at (20 s)', () => {
  assert.equal(M.validityMs(B115), 20_000);
});

test('fake clock: active until 2 missed heartbeats after receipt, then stale on the C2 clock', () => {
  let s = M.reduceEstimate(EMPTY, { type: 'receive', payload: B115, nowMs: LATER });
  assert.equal(s.state, 'active');
  assert.equal(s.log?.kind, 'opened');
  s = M.reduceEstimate(s, { type: 'tick', nowMs: LATER + 19_000 });
  assert.equal(s.state, 'active');
  assert.equal(s.log, null, 'no line without a state change');
  s = M.reduceEstimate(s, { type: 'tick', nowMs: LATER + 20_001 });
  assert.equal(s.state, 'stale');
  assert.equal(s.log?.kind, 'stale');
  s = M.reduceEstimate(s, { type: 'tick', nowMs: LATER + 30_000 });
  assert.equal(s.log, null, 'stale is logged once');
  // A refresh re-opens it.
  s = M.reduceEstimate(s, { type: 'receive', payload: B150, nowMs: LATER + 31_000 });
  assert.equal(s.state, 'active');
  assert.equal(s.log?.kind, 'opened');
});

test('live clock: past valid_until is stale even if it arrived late', () => {
  const s = M.reduceEstimate(EMPTY, { type: 'receive', payload: B115, nowMs: T115 + 25_000 });
  assert.equal(s.state, 'stale');
  assert.equal(M.displayStateAt({ payload: B115, receivedAtMs: T115 + 1_000 }, T115 + 3_000), 'active');
});

test('payload state stale → stale at once; unbounded → unbounded', () => {
  assert.equal(M.reduceEstimate(EMPTY, { type: 'receive', payload: B215, nowMs: LATER }).state, 'stale');
  const u = M.reduceEstimate(EMPTY, { type: 'receive', payload: UNB, nowMs: LATER });
  assert.equal(u.state, 'unbounded');
  assert.equal(u.log?.kind, 'unbounded');
});

test('an empty retained payload clears the estimate and logs the retirement once', () => {
  let s = M.reduceEstimate(EMPTY, { type: 'receive', payload: B215, nowMs: LATER });
  s = M.reduceEstimate(s, { type: 'clear', nowMs: LATER + 110_000 });
  assert.equal(s.entry, null);
  assert.equal(s.state, null);
  assert.equal(s.log?.kind, 'retired');
  assert.equal(s.log?.entry.payload, B215);
  assert.equal(M.reduceEstimate(s, { type: 'clear', nowMs: LATER + 111_000 }).log, null);
});

test('age: payload clock when aligned, receipt otherwise', () => {
  assert.equal(M.estimateAgeS({ payload: B115, receivedAtMs: T115 }, T115 + 3_400), 3);
  assert.equal(M.estimateAgeS({ payload: B115, receivedAtMs: LATER - 3_000 }, LATER), 3);
});

// ---------------------------------------------------------------------------
// Strings
// ---------------------------------------------------------------------------

test('map label at 1:15 (HS-21)', () => {
  const e = { payload: B115, receivedAtMs: LATER - 3_000 };
  assert.equal(M.mapLabel(e, 'active', LATER), 'Est. GPS denial · Pole-21-class · 90% · 3 s ago · 4 degraded / 4 healthy');
});

test('map label stale: "Last est. HHMMZ", outline only, never clear', () => {
  const t = M.mapLabel({ payload: B215, receivedAtMs: LATER }, 'stale', LATER)!;
  assert.equal(t, 'Last est. 1843Z · GPS denial · Pole-21-class · outline only');
  assert.doesNotMatch(t, NEVER);
});

test('card at 1:15: the W15 strings', () => {
  const c = M.aoeCard({ payload: B115, receivedAtMs: LATER - 3_000 }, 'active', LATER, UNITS, [AB1001]);
  const text = (k: string) => c.lines.find((l) => l.key === k)?.text ?? '';
  assert.match(text('inside'), /^Inside: OBS B \(AB1001 observer\) — 90%/, 'GPS-dependent first');
  assert.equal(text('emitter'), 'Emitter not located (90% region ~906 km²)');
  assert.equal(text('uhf'), 'UHF links: not assessed — ground GNSS only');
  assert.equal(text('inflight'), 'M982 in flight: not assessed — ground receivers only');
  assert.match(text('civil'), /Civil GPS: 90% ~365 km² · 50% ~1657 km²/);
  const ev = c.evidence.map((x) => x.text);
  assert.ok(ev.includes('✕ B 4s'));
  assert.ok(ev.includes('○ C 2s'));
  assert.equal(c.evidence.findIndex((x) => x.state === 'healthy'), 4, 'degraded first');
});

test('card at 1:50: B healthy at its new position is no longer inside; B listed once with its earlier report', () => {
  const c = M.aoeCard({ payload: B150, receivedAtMs: LATER - 4_000 }, 'active', LATER, UNITS_150, [AB1001]);
  const inside = c.lines.find((l) => l.key === 'inside')!.text;
  assert.doesNotMatch(inside, /OBS B/);
  const b = c.evidence.filter((x) => x.designation === 'B').map((x) => x.text);
  assert.deepEqual(b, ['○ B 2s · was ✕ 39s']);
  assert.equal(new Set(c.evidence.map((x) => x.key)).size, c.evidence.length, 'one entry per unit');
});

test('map label at 1:50 counts units, not reports (8 units → 3 degraded / 5 healthy)', () => {
  assert.equal(B150.evidence.length, 9, 'fixture keeps both B reports');
  assert.deepEqual(M.evidenceCounts(B150), { degraded: 3, healthy: 5 });
  assert.match(M.mapLabel({ payload: B150, receivedAtMs: LATER - 4_000 }, 'active', LATER)!, / 3 degraded \/ 5 healthy$/);
});

test('card stale: "Last est. HHMMZ", never "clear" / "window open"', () => {
  const c = M.aoeCard({ payload: B215, receivedAtMs: LATER }, 'stale', LATER, UNITS_150, [AB1001]);
  assert.equal(c.title, 'Area of effect · Last est. 1843Z');
  for (const t of [c.title, ...c.lines.map((l) => l.text)]) assert.doesNotMatch(t, NEVER);
});

test('card unbounded: "edge not observed", no map label, no inside list', () => {
  const e = { payload: UNB, receivedAtMs: LATER };
  const c = M.aoeCard(e, 'unbounded', LATER, UNITS, [AB1001]);
  assert.equal(c.state, 'unbounded');
  assert.match(c.title, /edge not observed/);
  assert.match(c.lines.find((l) => l.key === 'civil')!.text, /edge not observed/);
  assert.equal(c.lines.find((l) => l.key === 'inside'), undefined);
  assert.equal(M.mapLabel(e, 'unbounded', LATER), null);
});

test('in-flight line without an open GPS-guided mission stays "not assessed"', () => {
  const c = M.aoeCard({ payload: B115, receivedAtMs: LATER }, 'active', LATER, UNITS, []);
  assert.equal(c.lines.find((l) => l.key === 'inflight')!.text, 'GPS-guided rounds in flight: not assessed — ground receivers only');
});

test('terminal: one line per state, never "clear"', () => {
  const e = { payload: B115, receivedAtMs: LATER };
  assert.equal(M.terminalLine('opened', e, UNITS, [AB1001]), 'Est. GPS denial opened · Pole-21-class · OBS B inside (90%)');
  const lines = (['stale', 'retired', 'unbounded'] as const).map((k) => M.terminalLine(k, { payload: B215, receivedAtMs: LATER }, UNITS, [AB1001]));
  assert.match(lines[0]!, /stale — last est\. 1843Z/);
  assert.match(lines[1]!, /retired — evidence stopped/);
  for (const t of lines) assert.doesNotMatch(t, NEVER);
});
