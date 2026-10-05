// Run with `pnpm --filter @hamilton/web test` (node --test, native TS type
// stripping). See link-trust-rating.test.ts for the ts-ignore rationale.

import assert from 'node:assert/strict';
import { test } from 'node:test';
// @ts-ignore TS5097 — explicit .ts extension for Node's ESM loader
import * as D from './declutter.ts';

const M: typeof import('./declutter') = D;

const box = (id: string, x: number, y: number, rank?: number) =>
  rank === undefined ? { id, x, y, width: 30, height: 30 } : { id, x, y, width: 30, height: 30, rank };

test('well-separated symbols stay single', () => {
  const r = M.declutter([box('a', 100, 100), box('b', 100, 180), box('c', 200, 100)]);
  assert.deepEqual(r.singles, ['a', 'b', 'c']);
  assert.equal(r.groups.length, 0);
});

test('overlapping or too-close boxes group; edge gap respects minSeparation', () => {
  // 30 px boxes, 34 px apart → 4 px gap < 6 px default → grouped.
  assert.equal(M.declutter([box('a', 0, 0), box('b', 34, 0)]).groups.length, 1);
  // 37 px apart → 7 px gap → separate.
  assert.equal(M.declutter([box('a', 0, 0), box('b', 37, 0)]).groups.length, 0);
  assert.equal(M.declutter([box('a', 0, 0), box('b', 37, 0)], { minSeparationPx: 10 }).groups.length, 1);
  // Diagonal: only grouped when both axes are close.
  assert.equal(M.declutter([box('a', 0, 0), box('b', 30, 50)]).groups.length, 0);
});

test('A26 regression: A/B/C 25–30 px apart at the old fixed camera collapse into one stack', () => {
  const r = M.declutter([box('unit_a', 400, 100), box('unit_b', 400, 127), box('unit_c', 400, 154)]);
  assert.equal(r.groups.length, 1);
  assert.deepEqual(r.groups[0]!.ids, ['unit_a', 'unit_b', 'unit_c']);
  assert.deepEqual(r.groups[0]!.anchor, { x: 400, y: 127 });
});

test('single linkage chains transitively', () => {
  // a–b close, b–c close, a–c not: still one stack.
  const r = M.declutter([box('a', 0, 0), box('b', 30, 0), box('c', 60, 0), box('far', 500, 500)]);
  assert.equal(r.groups.length, 1);
  assert.deepEqual(r.groups[0]!.ids, ['a', 'b', 'c']);
  assert.deepEqual(r.singles, ['far']);
});

test('hostile listed first, then unknown, neutral, friendly; ties by id', () => {
  const r = M.declutter([
    box('f2', 0, 0, M.affiliationRank('friendly')),
    box('n1', 2, 0, M.affiliationRank('neutral')),
    box('h1', 4, 0, M.affiliationRank('enemy')),
    box('f1', 6, 0, M.affiliationRank('friendly')),
    box('u1', 8, 0, M.affiliationRank('unknown')),
  ]);
  assert.deepEqual(r.groups[0]!.ids, ['h1', 'u1', 'n1', 'f1', 'f2']);
  assert.equal(r.groups[0]!.key, 'f1|f2|h1|n1|u1');
});

test('stack is offset from the anchor (offset locator) and kept in the viewport', () => {
  const r = M.declutter([box('a', 100, 100), box('b', 110, 100)], { offset: { dx: 40, dy: -40 } });
  const g = r.groups[0]!;
  assert.deepEqual(g.anchor, { x: 105, y: 100 });
  assert.deepEqual(g.stack, { x: 145, y: 60 });
  // Near the top-right corner: displacement flips inward instead of pinning.
  const edge = M.declutter([box('a', 790, 10), box('b', 795, 10)], {
    offset: { dx: 40, dy: -40 },
    viewport: { width: 800, height: 600 },
    edgePx: 20,
  }).groups[0]!;
  assert.ok(edge.stack.x < edge.anchor.x && edge.stack.y > edge.anchor.y, JSON.stringify(edge));
  assert.ok(edge.stack.x >= 20 && edge.stack.x <= 780 && edge.stack.y >= 20 && edge.stack.y <= 580);
});

test('non-finite points are ignored; output is order-independent', () => {
  const pts = [box('a', 0, 0), box('b', 5, 5), box('c', 300, 300), { ...box('x', 0, 0), x: NaN }];
  const r1 = M.declutter(pts);
  const r2 = M.declutter([...pts].reverse());
  assert.deepEqual(r1, r2);
  assert.ok(!r1.singles.includes('x'));
});

test('sameDeclutter compares grouping + rounded positions', () => {
  const a = M.declutter([box('a', 0, 0), box('b', 5, 5)]);
  const b = M.declutter([box('a', 0.2, 0), box('b', 5.2, 5)]);
  const c = M.declutter([box('a', 0, 0), box('b', 5, 50)]);
  assert.equal(M.sameDeclutter(a, b), true);
  assert.equal(M.sameDeclutter(a, c), false);
  assert.equal(M.sameDeclutter(null, a), false);
});

test('throttle: leading call, trailing call coalesced', async () => {
  let n = 0;
  const t = M.throttle(() => n++, 30);
  t.call();
  t.call();
  t.call();
  assert.equal(n, 1);
  await new Promise((r) => setTimeout(r, 60));
  assert.equal(n, 2);
  t.cancel();
});

test('minCount: clusters below it stay singles (decision 6: ≥ 3)', () => {
  const pair = [box('a', 0, 0), box('b', 5, 5), box('far', 400, 400)];
  assert.deepEqual(M.declutter(pair, { minCount: 3 }), { singles: ['a', 'b', 'far'], groups: [] });
  const trio = [...pair, box('c', 10, 0)];
  const r = M.declutter(trio, { minCount: 3 });
  assert.equal(r.groups.length, 1);
  assert.deepEqual(r.groups[0]!.ids, ['a', 'b', 'c']);
  assert.deepEqual(r.singles, ['far']);
});
