// Admin · Demo simulation — a per-screen VIEW FILTER over COP components.
//
// Pure and dependency-free (no React, no zustand, no @/store imports): the
// registry, presets, reducer, (de)serialisation, layout helper, admin gate and
// shortcut matcher. Hiding never touches domain data; see
// docs/plans/admin-demo-menu.md (D1–D9).

export type DemoGroup = 'map' | 'side' | 'bar' | 'log';

export type DemoComponentId =
  | 'map.tracks'
  | 'map.aoeArea'
  | 'map.aoeLabel'
  | 'map.aoeKey'
  | 'map.fitButton'
  | 'side.missionQueue'
  | 'side.tssInForce'
  | 'side.trustPanel'
  | 'side.trustReadout'
  | 'side.trustTrace'
  | 'side.candidates'
  | 'side.aoeCard'
  | 'bar.llmToggle'
  | 'bar.operator'
  | 'bar.hairline'
  | 'log.terminal';

export interface DemoComponent {
  id: DemoComponentId;
  group: DemoGroup;
  label: string;
  parent?: DemoComponentId;
}

export type PresetId = 'full' | 'cleanMap' | 'firesOnly' | 'trustOnly' | 'aoeFocus';

export interface DemoViewState {
  v: 1;
  hidden: readonly DemoComponentId[];
  preset: PresetId | 'custom';
}

export type AdminShortcut = { kind: 'toggleMenu' } | { kind: 'preset'; id: PresetId };

// ---------------------------------------------------------------------------
// Registry

export const DEMO_COMPONENTS: readonly DemoComponent[] = Object.freeze([
  { id: 'map.tracks', group: 'map', label: 'Unit symbols' },
  { id: 'map.aoeArea', group: 'map', label: 'Est. GPS denial area' },
  { id: 'map.aoeLabel', group: 'map', label: 'Est. GPS denial label' },
  { id: 'map.aoeKey', group: 'map', label: 'Area key' },
  { id: 'map.fitButton', group: 'map', label: 'Fit-to-tracks button (F still works)' },
  { id: 'side.missionQueue', group: 'side', label: 'Fire missions' },
  { id: 'side.tssInForce', group: 'side', label: 'TSS in force strip', parent: 'side.missionQueue' },
  { id: 'side.trustPanel', group: 'side', label: 'Trust panel' },
  { id: 'side.trustReadout', group: 'side', label: 'Trust readout', parent: 'side.trustPanel' },
  { id: 'side.trustTrace', group: 'side', label: 'Trust trace', parent: 'side.trustPanel' },
  { id: 'side.candidates', group: 'side', label: 'Likely jamming methods', parent: 'side.trustPanel' },
  { id: 'side.aoeCard', group: 'side', label: 'Est. GPS denial card', parent: 'side.candidates' },
  { id: 'bar.llmToggle', group: 'bar', label: 'LLM toggle' },
  { id: 'bar.operator', group: 'bar', label: 'Operator seat' },
  { id: 'bar.hairline', group: 'bar', label: 'TSS-fail hairline' },
  { id: 'log.terminal', group: 'log', label: 'After-action log' },
] satisfies DemoComponent[]);

export const DEMO_COMPONENT_IDS: readonly DemoComponentId[] = Object.freeze(DEMO_COMPONENTS.map((c) => c.id));

export const DEMO_GROUP_LABELS: Readonly<Record<DemoGroup, string>> = Object.freeze({
  map: 'Map',
  side: 'Side column',
  bar: 'Brand bar',
  log: 'Log',
});

const BY_ID: ReadonlyMap<DemoComponentId, DemoComponent> = new Map(DEMO_COMPONENTS.map((c) => [c.id, c]));

export function isDemoComponentId(x: unknown): x is DemoComponentId {
  return typeof x === 'string' && BY_ID.has(x as DemoComponentId);
}

// ---------------------------------------------------------------------------
// Presets

export const DEMO_PRESETS: readonly { id: PresetId; label: string; hidden: readonly DemoComponentId[] }[] =
  Object.freeze([
    { id: 'full', label: 'Full', hidden: Object.freeze([]) },
    {
      id: 'cleanMap',
      label: 'Clean map',
      hidden: Object.freeze([
        'map.aoeLabel',
        'map.aoeKey',
        'map.fitButton',
        'side.missionQueue',
        'side.trustPanel',
        'log.terminal',
        'bar.llmToggle',
        'bar.operator',
      ] as const),
    },
    {
      id: 'firesOnly',
      label: 'Fires only',
      hidden: Object.freeze(['map.aoeArea', 'map.aoeLabel', 'map.aoeKey', 'side.trustPanel', 'bar.llmToggle'] as const),
    },
    {
      id: 'trustOnly',
      label: 'Trust only',
      hidden: Object.freeze(['side.missionQueue', 'map.aoeArea', 'map.aoeLabel', 'map.aoeKey', 'side.aoeCard'] as const),
    },
    {
      id: 'aoeFocus',
      label: 'Estimate focus',
      hidden: Object.freeze([
        'side.missionQueue',
        'side.trustReadout',
        'side.trustTrace',
        'log.terminal',
        'bar.llmToggle',
      ] as const),
    },
  ]);

export function isPresetId(x: unknown): x is PresetId {
  return typeof x === 'string' && DEMO_PRESETS.some((p) => p.id === x);
}

export function presetById(id: PresetId): { id: PresetId; label: string; hidden: readonly DemoComponentId[] } {
  const p = DEMO_PRESETS.find((q) => q.id === id);
  if (!p) throw new Error(`unknown preset ${id}`);
  return p;
}

export const FULL_VIEW: DemoViewState = Object.freeze({ v: 1, hidden: Object.freeze([]), preset: 'full' }) as DemoViewState;

// ---------------------------------------------------------------------------
// Reducer

/** Canonical order (registry order), de-duplicated, unknown ids dropped. */
function normalise(ids: readonly unknown[]): DemoComponentId[] {
  const set = new Set(ids.filter(isDemoComponentId));
  return DEMO_COMPONENT_IDS.filter((id) => set.has(id));
}

function sameIds(a: readonly DemoComponentId[], b: readonly DemoComponentId[]): boolean {
  const na = normalise(a);
  const nb = normalise(b);
  return na.length === nb.length && na.every((id, i) => id === nb[i]);
}

/** The preset whose hidden set equals `hidden` exactly, else 'custom'. */
export function matchingPreset(hidden: readonly DemoComponentId[]): PresetId | 'custom' {
  return DEMO_PRESETS.find((p) => sameIds(p.hidden, hidden))?.id ?? 'custom';
}

/** Visible when neither the component nor any ancestor is hidden. */
export function isVisible(s: DemoViewState, id: DemoComponentId): boolean {
  const seen = new Set<DemoComponentId>();
  let cur: DemoComponentId | undefined = id;
  while (cur && !seen.has(cur)) {
    if (s.hidden.includes(cur)) return false;
    seen.add(cur);
    cur = BY_ID.get(cur)?.parent;
  }
  return true;
}

/** Flip one component's own hidden flag. Always sets preset to 'custom'. */
export function toggle(s: DemoViewState, id: DemoComponentId): DemoViewState {
  const hidden = s.hidden.includes(id) ? s.hidden.filter((h) => h !== id) : [...s.hidden, id];
  return { v: 1, hidden: normalise(hidden), preset: 'custom' };
}

export function applyPreset(_s: DemoViewState, id: PresetId): DemoViewState {
  return { v: 1, hidden: normalise(presetById(id).hidden), preset: id };
}

/** Components EFFECTIVELY hidden (children of a hidden parent included). */
export function hiddenCount(s: DemoViewState): number {
  return DEMO_COMPONENT_IDS.reduce((n, id) => (isVisible(s, id) ? n : n + 1), 0);
}

// ---------------------------------------------------------------------------
// Persistence

export function serialize(s: DemoViewState): string {
  return JSON.stringify({ v: 1, hidden: normalise(s.hidden), preset: s.preset });
}

export function parseStored(raw: string | null): DemoViewState | null {
  if (raw == null) return null;
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
  const o = data as { v?: unknown; hidden?: unknown; preset?: unknown };
  if (o.v !== 1 || !Array.isArray(o.hidden)) return null;
  if (o.preset !== 'custom' && !isPresetId(o.preset)) return null;
  const hidden = normalise(o.hidden);
  let preset: PresetId | 'custom' = o.preset;
  if (preset !== 'custom' && !sameIds(presetById(preset).hidden, hidden)) preset = 'custom';
  return { v: 1, hidden, preset };
}

export function parseSearch(search: string): DemoViewState | null {
  const params = new URLSearchParams(search);
  const view = params.get('view');
  if (isPresetId(view)) return applyPreset(FULL_VIEW, view);
  const hide = params.get('hide');
  if (hide != null) {
    const hidden = normalise(hide.split(',').map((x) => x.trim()));
    if (hidden.length > 0) return { v: 1, hidden, preset: 'custom' };
  }
  return null;
}

/** URL, then storage, then Full. Always Full when admin is disabled. */
export function resolveInitial(o: { adminEnabled: boolean; search: string; stored: string | null }): DemoViewState {
  if (!o.adminEnabled) return FULL_VIEW;
  return parseSearch(o.search) ?? parseStored(o.stored) ?? FULL_VIEW;
}

// ---------------------------------------------------------------------------
// Layout (mirrors apps/web/app/page.tsx)

export const LOG_ROW_PX = 160;
export const BASE_GRID_ROWS = `56px minmax(0, 1fr) ${LOG_ROW_PX}px`;
export const BASE_GRID_COLUMNS = '2fr 1fr';

export function layoutFor(s: DemoViewState): {
  gridTemplateRows: string;
  gridTemplateColumns: string;
  sideColumn: boolean;
} {
  const logShown = isVisible(s, 'log.terminal');
  const sideColumn = isVisible(s, 'side.missionQueue') || isVisible(s, 'side.trustPanel');
  return {
    gridTemplateRows: logShown ? BASE_GRID_ROWS : '56px minmax(0, 1fr)',
    gridTemplateColumns: sideColumn ? BASE_GRID_COLUMNS : '1fr',
    sideColumn,
  };
}

// ---------------------------------------------------------------------------
// Gate and shortcuts

export function adminEnabled(o: { adminEnv: string | undefined; nodeEnv: string | undefined; search: string }): boolean {
  if (o.adminEnv === '1') return true;
  if (o.nodeEnv === 'production') return false;
  return new URLSearchParams(o.search).get('admin') === '1';
}

/** Inputs that take no text: the panel's own checkboxes must not swallow Alt+Shift+A. */
const NON_TEXT_INPUTS = new Set(['checkbox', 'radio', 'button', 'submit', 'reset', 'range', 'color']);

/** True while typing in a form control (the isFitShortcut guard). */
export function isTypingTarget(target: unknown): boolean {
  const t = target as { tagName?: string; type?: string; isContentEditable?: boolean } | null | undefined;
  const tag = t?.tagName?.toUpperCase();
  if (tag === 'INPUT') return !NON_TEXT_INPUTS.has((t?.type ?? 'text').toLowerCase());
  return tag === 'TEXTAREA' || tag === 'SELECT' || t?.isContentEditable === true;
}

export const ADMIN_SHORTCUT_LABEL = 'Alt+Shift+A';

/** Alt+Shift+Digit0…4, in DEMO_PRESETS order. */
export const ADMIN_SHORTCUT_PRESETS: readonly PresetId[] = Object.freeze(DEMO_PRESETS.map((p) => p.id));

export function matchAdminShortcut(e: {
  code: string;
  altKey: boolean;
  shiftKey: boolean;
  ctrlKey?: boolean;
  metaKey?: boolean;
  target?: unknown;
}): AdminShortcut | null {
  if (!e.altKey || !e.shiftKey || e.ctrlKey || e.metaKey) return null;
  if (isTypingTarget(e.target)) return null;
  if (e.code === 'KeyA') return { kind: 'toggleMenu' };
  const m = /^Digit([0-9])$/.exec(e.code);
  if (m) {
    const id = ADMIN_SHORTCUT_PRESETS[Number(m[1])];
    if (id) return { kind: 'preset', id };
  }
  return null;
}
