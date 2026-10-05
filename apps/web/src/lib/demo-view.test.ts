// Run with `pnpm --filter @hamilton/web test` (node --test, native TS type
// stripping). See link-trust-rating.test.ts for the ts-ignore rationale.

import assert from 'node:assert/strict';
import { test } from 'node:test';
// @ts-ignore TS5097 — explicit .ts extension for Node's ESM loader
import * as D from './demo-view.ts';

const M: typeof import('./demo-view') = D;
type Id = import('./demo-view').DemoComponentId;
type State = import('./demo-view').DemoViewState;

const view = (hidden: Id[], preset: State['preset'] = 'custom'): State => ({ v: 1, hidden, preset });

test('registry: 16 unique ids, parents exist, no cycles, presets reference known ids', () => {
  assert.equal(M.DEMO_COMPONENTS.length, 16);
  assert.equal(new Set(M.DEMO_COMPONENT_IDS).size, 16);
  for (const c of M.DEMO_COMPONENTS) {
    if (c.parent) assert.ok(M.isDemoComponentId(c.parent), `${c.id} parent ${c.parent}`);
    const seen = new Set<string>();
    let cur: Id | undefined = c.id;
    while (cur) {
      assert.ok(!seen.has(cur), `cycle at ${c.id}`);
      seen.add(cur);
      cur = M.DEMO_COMPONENTS.find((x) => x.id === cur)?.parent;
    }
    assert.ok(c.group in M.DEMO_GROUP_LABELS);
  }
  assert.deepEqual(
    M.DEMO_PRESETS.map((p) => p.id),
    ['full', 'cleanMap', 'firesOnly', 'trustOnly', 'aoeFocus'],
  );
  for (const p of M.DEMO_PRESETS) for (const id of p.hidden) assert.ok(M.isDemoComponentId(id), `${p.id}: ${id}`);
  assert.equal(M.isDemoComponentId('map.nope'), false);
  assert.equal(M.isPresetId('cleanMap'), true);
  assert.equal(M.isPresetId('custom'), false);
});

test('FULL_VIEW shows everything and is frozen', () => {
  for (const id of M.DEMO_COMPONENT_IDS) assert.equal(M.isVisible(M.FULL_VIEW, id), true);
  assert.equal(M.hiddenCount(M.FULL_VIEW), 0);
  assert.ok(Object.isFrozen(M.FULL_VIEW));
  assert.equal(M.FULL_VIEW.preset, 'full');
});

test('isVisible walks parents: trust panel hides candidates and the AoE card', () => {
  const s = view(['side.trustPanel']);
  assert.equal(M.isVisible(s, 'side.trustPanel'), false);
  assert.equal(M.isVisible(s, 'side.trustReadout'), false);
  assert.equal(M.isVisible(s, 'side.candidates'), false);
  assert.equal(M.isVisible(s, 'side.aoeCard'), false);
  assert.equal(M.isVisible(s, 'side.missionQueue'), true);
  assert.equal(M.isVisible(view(['side.missionQueue']), 'side.tssInForce'), false);
});

test('toggle: idempotent twice over, always custom', () => {
  const full = M.applyPreset(M.FULL_VIEW, 'full');
  const once = M.toggle(full, 'map.tracks');
  assert.deepEqual(once.hidden, ['map.tracks']);
  assert.equal(once.preset, 'custom');
  const twice = M.toggle(once, 'map.tracks');
  assert.deepEqual(twice.hidden, []);
  assert.equal(twice.preset, 'custom');
  const clean = M.applyPreset(M.FULL_VIEW, 'cleanMap');
  assert.equal(M.toggle(clean, 'map.tracks').preset, 'custom');
});

test('applyPreset / presetById / matchingPreset', () => {
  for (const p of M.DEMO_PRESETS) {
    const s = M.applyPreset(M.FULL_VIEW, p.id);
    assert.equal(s.preset, p.id);
    assert.equal(s.v, 1);
    assert.deepEqual([...s.hidden].sort(), [...p.hidden].sort());
    assert.equal(M.matchingPreset(s.hidden), p.id);
    assert.equal(M.presetById(p.id), p);
  }
  assert.equal(M.matchingPreset(['map.tracks']), 'custom');
  assert.equal(M.matchingPreset([]), 'full');
  const fires = M.applyPreset(M.FULL_VIEW, 'firesOnly');
  for (const id of ['map.aoeArea', 'map.aoeLabel', 'map.aoeKey', 'side.trustPanel', 'bar.llmToggle'] as Id[]) {
    assert.equal(M.isVisible(fires, id), false, id);
  }
  assert.equal(M.isVisible(fires, 'side.missionQueue'), true);
});

test('hiddenCount counts effectively hidden components, parents included', () => {
  assert.equal(M.hiddenCount(view(['map.tracks'])), 1);
  // trustPanel + readout + trace + candidates + aoeCard
  assert.equal(M.hiddenCount(view(['side.trustPanel'])), 5);
  // missionQueue + tssInForce
  assert.equal(M.hiddenCount(view(['side.missionQueue'])), 2);
  // explicitly hiding a child under a hidden parent is not double-counted
  assert.equal(M.hiddenCount(view(['side.trustPanel', 'side.aoeCard'])), 5);
  // cleanMap: 8 listed + tssInForce + 4 trust children = 13
  assert.equal(M.hiddenCount(M.applyPreset(M.FULL_VIEW, 'cleanMap')), 13);
});

test('serialize → parseStored round trip', () => {
  for (const p of M.DEMO_PRESETS) {
    const s = M.applyPreset(M.FULL_VIEW, p.id);
    assert.deepEqual(M.parseStored(M.serialize(s)), s);
  }
  const custom = M.toggle(M.FULL_VIEW, 'bar.hairline');
  assert.deepEqual(M.parseStored(M.serialize(custom)), custom);
});

test('parseStored: null, bad JSON, wrong v/shape → null; unknown ids dropped; stale preset → custom', () => {
  assert.equal(M.parseStored(null), null);
  assert.equal(M.parseStored(''), null);
  assert.equal(M.parseStored('{nope'), null);
  assert.equal(M.parseStored('42'), null);
  assert.equal(M.parseStored('null'), null);
  assert.equal(M.parseStored('[]'), null);
  assert.equal(M.parseStored(JSON.stringify({ v: 2, hidden: [], preset: 'full' })), null);
  assert.equal(M.parseStored(JSON.stringify({ v: 1, hidden: 'map.tracks', preset: 'custom' })), null);
  assert.equal(M.parseStored(JSON.stringify({ v: 1, hidden: [], preset: 'bogus' })), null);
  assert.deepEqual(
    M.parseStored(JSON.stringify({ v: 1, hidden: ['map.tracks', 'map.gone', 7, 'map.tracks'], preset: 'custom' })),
    view(['map.tracks']),
  );
  // Named preset whose ids no longer match → custom.
  assert.deepEqual(
    M.parseStored(JSON.stringify({ v: 1, hidden: ['map.tracks'], preset: 'cleanMap' })),
    view(['map.tracks']),
  );
  // Matching named preset survives.
  assert.equal(M.parseStored(JSON.stringify({ v: 1, hidden: [], preset: 'full' }))?.preset, 'full');
});

test('parseSearch: ?view= wins, ?hide= gives custom, unknown ignored', () => {
  assert.deepEqual(M.parseSearch('?view=cleanMap'), M.applyPreset(M.FULL_VIEW, 'cleanMap'));
  assert.deepEqual(M.parseSearch('view=full'), M.applyPreset(M.FULL_VIEW, 'full'));
  assert.deepEqual(M.parseSearch('?admin=1&hide=map.tracks,log.terminal'), view(['map.tracks', 'log.terminal']));
  assert.deepEqual(M.parseSearch('?hide=map.tracks,nope'), view(['map.tracks']));
  assert.deepEqual(M.parseSearch('?view=firesOnly&hide=map.tracks'), M.applyPreset(M.FULL_VIEW, 'firesOnly'));
  assert.deepEqual(M.parseSearch('?view=nope&hide=bar.operator'), view(['bar.operator']));
  assert.equal(M.parseSearch(''), null);
  assert.equal(M.parseSearch('?view=nope'), null);
  assert.equal(M.parseSearch('?hide=nope,also'), null);
  assert.equal(M.parseSearch('?hide='), null);
  assert.equal(M.parseSearch('?view=custom'), null);
});

test('resolveInitial: URL beats storage beats Full; admin disabled → Full', () => {
  const stored = M.serialize(M.applyPreset(M.FULL_VIEW, 'trustOnly'));
  assert.equal(M.resolveInitial({ adminEnabled: true, search: '?view=aoeFocus', stored }).preset, 'aoeFocus');
  assert.equal(M.resolveInitial({ adminEnabled: true, search: '?admin=1', stored }).preset, 'trustOnly');
  assert.equal(M.resolveInitial({ adminEnabled: true, search: '', stored: null }), M.FULL_VIEW);
  assert.equal(M.resolveInitial({ adminEnabled: true, search: '', stored: '{bad' }), M.FULL_VIEW);
  assert.equal(M.resolveInitial({ adminEnabled: false, search: '?view=cleanMap', stored }), M.FULL_VIEW);
  assert.equal(M.resolveInitial({ adminEnabled: false, search: '', stored }), M.FULL_VIEW);
});

test('layoutFor: log row, side column', () => {
  assert.deepEqual(M.layoutFor(M.FULL_VIEW), {
    gridTemplateRows: M.BASE_GRID_ROWS,
    gridTemplateColumns: M.BASE_GRID_COLUMNS,
    sideColumn: true,
  });
  assert.equal(M.BASE_GRID_ROWS, '56px minmax(0, 1fr) 160px');
  assert.equal(M.BASE_GRID_COLUMNS, '2fr 1fr');
  assert.equal(M.LOG_ROW_PX, 160);
  assert.equal(M.layoutFor(view(['log.terminal'])).gridTemplateRows, '56px minmax(0, 1fr)');
  const both = M.layoutFor(view(['side.missionQueue', 'side.trustPanel']));
  assert.equal(both.gridTemplateColumns, '1fr');
  assert.equal(both.sideColumn, false);
  const one = M.layoutFor(view(['side.missionQueue']));
  assert.equal(one.gridTemplateColumns, '2fr 1fr');
  assert.equal(one.sideColumn, true);
  // Hiding only children keeps the column.
  assert.equal(M.layoutFor(view(['side.missionQueue', 'side.candidates'])).sideColumn, true);
  const clean = M.layoutFor(M.applyPreset(M.FULL_VIEW, 'cleanMap'));
  assert.deepEqual(clean, { gridTemplateRows: '56px minmax(0, 1fr)', gridTemplateColumns: '1fr', sideColumn: false });
});

test('adminEnabled truth table', () => {
  const t = (adminEnv: string | undefined, nodeEnv: string | undefined, search: string) =>
    M.adminEnabled({ adminEnv, nodeEnv, search });
  assert.equal(t('1', 'production', ''), true);
  assert.equal(t('1', undefined, ''), true);
  assert.equal(t(undefined, 'development', '?admin=1'), true);
  assert.equal(t(undefined, 'test', '?view=full&admin=1'), true);
  assert.equal(t(undefined, 'production', '?admin=1'), false);
  assert.equal(t(undefined, 'development', ''), false);
  assert.equal(t(undefined, 'development', '?admin=0'), false);
  assert.equal(t(undefined, 'development', '?admin=true'), false);
  assert.equal(t('true', 'production', ''), false);
  assert.equal(t('0', 'production', ''), false);
  assert.equal(t('0', 'production', '?admin=1'), false);
  assert.equal(t(undefined, 'production', ''), false);
});

test('matchAdminShortcut: Alt+Shift on code, ctrl/meta and typing ignored', () => {
  const k = (code: string, extra: Record<string, unknown> = {}) =>
    M.matchAdminShortcut({ code, altKey: true, shiftKey: true, ...extra });
  assert.deepEqual(k('KeyA'), { kind: 'toggleMenu' });
  assert.deepEqual(k('Digit0'), { kind: 'preset', id: 'full' });
  assert.deepEqual(k('Digit1'), { kind: 'preset', id: 'cleanMap' });
  assert.deepEqual(k('Digit2'), { kind: 'preset', id: 'firesOnly' });
  assert.deepEqual(k('Digit3'), { kind: 'preset', id: 'trustOnly' });
  assert.deepEqual(k('Digit4'), { kind: 'preset', id: 'aoeFocus' });
  assert.equal(k('Digit5'), null);
  assert.equal(k('KeyB'), null);
  assert.equal(M.matchAdminShortcut({ code: 'KeyA', altKey: true, shiftKey: false }), null);
  assert.equal(M.matchAdminShortcut({ code: 'KeyA', altKey: false, shiftKey: true }), null);
  assert.equal(k('KeyA', { ctrlKey: true }), null);
  assert.equal(k('KeyA', { metaKey: true }), null);
  for (const tagName of ['INPUT', 'textarea', 'SELECT']) assert.equal(k('KeyA', { target: { tagName } }), null, tagName);
  assert.equal(k('Digit1', { target: { tagName: 'DIV', isContentEditable: true } }), null);
  assert.deepEqual(k('KeyA', { target: { tagName: 'BUTTON' } }), { kind: 'toggleMenu' });
  // The panel's own checkboxes and radios take no text: the shortcuts still work there.
  assert.deepEqual(k('KeyA', { target: { tagName: 'INPUT', type: 'checkbox' } }), { kind: 'toggleMenu' });
  assert.deepEqual(k('Digit2', { target: { tagName: 'INPUT', type: 'radio' } }), { kind: 'preset', id: 'firesOnly' });
  assert.equal(k('KeyA', { target: { tagName: 'INPUT', type: 'text' } }), null);
  assert.equal(M.isTypingTarget(null), false);
  assert.equal(M.ADMIN_SHORTCUT_LABEL, 'Alt+Shift+A');
  assert.deepEqual([...M.ADMIN_SHORTCUT_PRESETS], ['full', 'cleanMap', 'firesOnly', 'trustOnly', 'aoeFocus']);
});

test('copy lint: no spec ids, no "clear"/"window open", no jammer location', () => {
  const labels = [
    ...M.DEMO_COMPONENTS.map((c) => c.label),
    ...M.DEMO_PRESETS.map((p) => p.label),
    ...Object.values(M.DEMO_GROUP_LABELS),
  ];
  for (const l of labels) {
    assert.doesNotMatch(l, /\b(FR|UR|HS|NFR)-|§/, l);
    assert.doesNotMatch(l, /GPS clear|window open/i, l);
    assert.doesNotMatch(l, /jammer|location|position|coordinates|\d+\.\d+/i, l);
  }
});
