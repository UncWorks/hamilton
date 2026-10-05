# Plan — Admin menu · Demo simulation (show / hide COP components)

Status: planned, not started. Branch: `fix/aoe-ui-polish` (worktree
`.claude/worktrees/aoe-ui-fixes`). Planning route: kr:plan, plan mode.

## Summary

A presenter-only **Admin** control in the brand bar opens a small,
non-modal panel. Its **Demo simulation** section shows or hides chosen COP
components on this screen only: map layers, side-column blocks, brand-bar
items and the after-action log. It also offers one-click presets such as
"Clean map" and "Fires only". It is a **view filter**. It never changes data,
timers, the MQTT feed, the engine, the TSS evaluation or the after-action
record. Admin builds only: in an operator build the trigger, panel and
shortcuts don't exist, and any leftover saved state is ignored.

## Context

Here is what exists today, as surveyed on 2026-10-04.

- **Page.** `apps/web/app/page.tsx` is a 3-row grid, `56px minmax(0,1fr) 160px`:
  - `BrandBar` across the top.
  - A `2fr 1fr` row: the `Spine` (`src/components/cop/Spine.tsx`) picks `CesiumSpine` or `MapSpine` from `NEXT_PUBLIC_RENDERER`. The right column is one scroll container holding `MissionQueue` (`src/components/fires/`) over `TrustPanel` (`src/components/panel/`).
  - `EventTerminal` (`src/components/terminal/`) at the bottom.
- **BrandBar** (`src/components/brand/BrandBar.tsx`) is a grid, `auto 1fr auto`:
  - Left: the Wordmark, the tagline and the TSS hairline (`tssFailedThisSession`).
  - Middle: an empty `1fr` cell.
  - Right: `LlmToggle` and `<span aria-label="Operator">FDC · ADAM</span>`.
- **Map layers.**
  - AoE polygons:
    - Cesium: entities in `overlayEntitiesRef` (`aoe-fill90/edge90/edge50-gnss_civil-*`), built in the effect at `CesiumSpine.tsx`, "Area graphics".
    - MapLibre: deck.gl `PolygonLayer` / `PathLayer` with the same ids, in `MapSpine.tsx` `aoe` memo, pushed by `overlayRef.current.setProps`.
  - Screen space (`SpineOverlay.tsx`): `AoeScreen` (`AoeKey.tsx`) draws the map label (`data-testid="aoe-label"`) and `AoeKey` (`aoe-key`). It also draws the declutter stacks, the symbol hit targets (`cop-symbol-*`, `stack-slot-*`), the rating tooltips and the FIT TO TRACKS button (`fit-to-tracks`).
  - Track symbols:
    - Cesium: billboards in `symbolEntitiesRef`. `runDeclutterRef` sets `ent.show` on every pass.
    - MapLibre: drawn in `SpineOverlay` (`drawSingles`).
  - `BasemapAttribution`.
- **Timers that live inside components.** Hiding by unmounting would stop these:
  - `MissionQueue` runs the **1 Hz TSS tick** (`evaluateMissions`). This drives verdict changes, the AT MY COMMAND re-rate, journal entries and `tssFailedThisSession`.
  - `EventTerminal` polls `GET /api/events` every 1 s.
  - `useAoeCard` / `useEstimateView` run a 1 s clock.
  - Page-level and **not** affected by any hiding: the estimate stale tick (`useHamiltonMqtt`) and the MQTT subscription.
- **Keyboard.**
  - Branch keys 1–4 are **row-scoped**: an `onKeyDown` on a focused `MissionRow`, ignored with Alt/Ctrl/Meta.
  - F ("fit") is a **window** listener in each spine (`isFitShortcut`, `lib/camera-fit.ts`). It ignores INPUT/TEXTAREA/SELECT and modifiers.
  - Escape is a window listener in `SpineOverlay` (it closes tips and stacks).
- **State.**
  - One domain zustand store, `src/store/hamilton.ts`. Storybook resets it per story through `seedHamilton` (`src/stories/support/mocks.tsx`, `.storybook/preview.tsx` `beforeEach`).
  - Nothing in the web app uses `localStorage`, URL params or `BroadcastChannel` yet. `?layout=ops-center` / `BroadcastChannel` are designed (Branding §7.3) but not built.
- **Env.** The existing `NEXT_PUBLIC_*` flags are `RENDERER`, `BASEMAP` and `MQTT_WS_URL`. `infra/docker/docker-compose.yml` runs `pnpm dev` (`Dockerfile.dev`), so the docker demo stack is a **development** build.
- **Gates.** `pnpm --filter @hamilton/web typecheck` and `pnpm --filter @hamilton/web test` (`node --test src/lib/*.test.ts`, 114 pass) must pass, and so must `scripts/lint-phosphor.sh`: phosphor green stays only in `--trust-nominal` / `--gating-secondary`.

**Problem.** A presenter has no way to show a simpler COP for one beat, such as the map alone or only the fires story, and then bring the rest back. Today that takes code edits or browser devtools.

## Decisions

### D1 — MVP scope: client-side visibility only

**Choice.** "Render / unrender" means a per-screen **view filter**:
- Hiding never unmounts anything that owns a timer or data path.
- Hiding never writes to `useHamilton`, MQTT, the engine or the journal.

**Alternative.** Demo controls that change data, such as forcing a trust beat, retiring or hiding the estimate in the store, injecting a mission or resetting the session.

**Why.** Data controls would:
- break the pinned trust beats and the TSS hysteresis;
- desync the C2 from the engine's after-action record;
- risk putting simulator truth on the bus (`scripts/check-no-truth.sh`).

The non-modal, "never a fire command" ethos argues against a hidden lever on outcomes. Visibility alone covers the stated need. Data controls are **later work** (see Out of scope). If they come, they must go through comms-sim or engine endpoints, never web-store writes.

### D2 — State: a separate store plus a pure lib

**Choice.**
- `src/lib/demo-view.ts` is pure and dependency-free. It holds the registry, presets, reducer, (de)serialisation, layout helper, gate and shortcut matcher.
- `src/store/demo-view.ts` is a tiny zustand store wrapping it.
- Components read `useDemoVisible(id)`.

**Alternative.** A `demoView` slice inside `useHamilton`.

**Why.** `useHamilton` is domain state. Stories reset it with `setState(..., true)`, and its `INITIAL` would have to learn about view state. A separate store:
- makes "never touches data" structural: `demo-view.ts` imports nothing from `store/hamilton`;
- keeps domain selectors from re-rendering on toggles;
- keeps all the logic testable under the `src/lib/*.test.ts` runner.

### D3 — Hidden-set model, default visible

**Choice.** The state is `{ v: 1, hidden: DemoComponentId[], preset: PresetId | 'custom' }`. Anything not listed is visible, and a child is hidden when its parent is.

**Alternative.** A visible-set (allow-list).

**Why.** A component added later shows by default. A corrupt, empty or old saved state degrades to "Full", never to a blank COP.

### D4 — Persistence: URL param first, then localStorage, admin sessions only

**Choice.** On load, resolve the view in this order:
1. `?view=<presetId>` or `?hide=<id,id,…>`, which wins;
2. `localStorage['hamilton.demoView.v1']`, read and written in try/catch;
3. Full.

Writes happen only while admin is enabled. With admin disabled, the resolver returns Full and ignores both sources.

**Alternatives.** localStorage only (not repeatable from a bookmark), or URL only (a hot reload or refresh mid-rehearsal loses the view).

**Why.** A bookmarked `?admin=1&view=cleanMap` makes a rehearsal repeatable. localStorage survives the dev server's hot reload. The admin-only rule means a leftover key can never hide anything on an operator screen.

### D5 — No cross-console sync in the MVP

**Choice.** The view is per screen.

**Alternatives.** `BroadcastChannel('hamilton-demo-view')`, or an MQTT topic.

**Why.** The demo is single-screen (Branding §7.1), and multi-window ops-center isn't built. MQTT is the operational bus, and presentation state doesn't belong on it. Later, if ops-center lands, add a same-origin `BroadcastChannel` beside its planned `hamilton-ops-center` channel. Never MQTT.

### D6 — Gating: a build flag, or a dev build plus a URL param

**Choice.** `adminEnabled({ adminEnv, nodeEnv, search })` returns true when either holds:
- `NEXT_PUBLIC_ADMIN === '1'`, inlined at build time; or
- `NODE_ENV === 'development'` **and** `?admin=1`.

When it's false, `BrandBar` renders no trigger, no shortcut listener is registered and the panel module is never loaded (`next/dynamic`). The gate is evaluated after mount so there's no hydration mismatch.

**Alternatives.**
- Env only: the live dev stack on :3001 can't be checked without a restart.
- URL only: any operator build could expose it.
- Always present but hidden: it would ship to operators.

**Why.** Default builds (docker-compose, Makefile, `next build`) don't set the flag, so nothing is visible by accident. A production build needs a deliberate `NEXT_PUBLIC_ADMIN=1`. The dev path needs a deliberate URL param.

### D7 — Placement and form: a disclosure button plus a non-modal popover

**Choice.**
- The trigger is a quiet `Admin` text button at the far right of the BrandBar cluster, after `FDC · ADAM`. It uses `--text-tertiary` and the LlmToggle's mono micro style.
- It opens a popover anchored under the bar's right edge (z 30), 280 px wide, over the top of the side column. It never covers the map.
- No scrim and no focus trap. It never opens by itself. It closes on Escape, the trigger, or a click outside.
- Inside is one section headed **Demo simulation**: presets, then grouped checkboxes, then Reset. Later admin sections stack under it.

**Alternatives.**
- ARIA `menu` with nested flyout submenus: poor keyboard semantics, and flyouts cover more of the COP.
- A modal dialog: rejected by the non-modal ethos, since the kill-chain modal was removed for exactly this.
- A docked column: it permanently reflows the COP.

**Why.** Small, on demand and dismissable. While closed, the only footprint is one word in the brand bar.

### D8 — Hiding mechanics, per component

The rule is to **hide, not unmount**, anything that owns a timer or feeds data.

| Kind | Mechanism | Why |
|---|---|---|
| Side column and log blocks (`MissionQueue`, `TrustPanel` and its children, `EventTerminal`) | `<DemoSlot id>` wrapper: always renders children; when hidden sets the `hidden` attribute (`display:none`, out of the a11y tree and tab order) | Keeps the TSS 1 Hz tick, journal and hairline running; terminal keeps polling so it is current when shown again |
| Layout | `layoutFor(state)` → `gridTemplateRows` drops the 160px row when the log is hidden; `gridTemplateColumns` becomes `1fr` when the whole side column is hidden | Map takes the space; Cesium resizes per frame, MapSpine already has a `ResizeObserver` → `map.resize()` |
| AoE polygons | Cesium: `ent.show = visible` on `overlayEntitiesRef` entities (not removed); MapLibre: deck layer prop `visible` | Fade / episode / `aoeDrawn` state untouched; `data-layers` keeps reporting what is drawn; add `data-hidden` on `aoe-layer` for tests |
| AoE label, AoE key, Fit button | New props `showLabel`, `showKey` on `AoeScreen` and `showFit` on `SpineOverlay` → conditional render | Purely presentational, no timers |
| Track symbols | Cesium: AND the declutter pass's `show` with `tracksVisible` (else the next pass re-shows them); `SpineOverlay` `showTracks=false` skips singles, hit targets and stacks | Declutter keeps computing; picking a hidden billboard is impossible; the camera fit still uses store positions |
| Brand bar items (LLM toggle, operator seat, hairline) | Conditional render (the hairline uses opacity 0, as it does today when off) | No timers |
| `BasemapAttribution` | **Not toggleable** | OSM / Protomaps licence attribution must stay visible whenever the basemap does |

Effects, answered:
- **Does hiding `MissionQueue` stop the TSS tick?** No. It stays mounted. Verdicts, re-rates, journal lines and the hairline continue. A Storybook play test proves this (Testing).
- **Does hiding the terminal stop engine polling?** No. It keeps polling (harmless and read-only), and the engine's after-action record is server-side anyway.
- **Branch keys 1–4.** They work only with focus inside a visible row. A hidden row isn't focusable, which is intended. Showing it again restores them.
- **F.** It still fits with the Fit button or the symbols hidden, because it's a window listener in the spine.
- **Escape.** Inside the popover, Escape closes it and calls `stopPropagation()`, so the spine's window Escape doesn't also collapse a pinned stack.

### D9 — A "demo view" marker while anything is hidden

**Choice.** In an admin session with at least one component hidden, the brand bar shows `DEMO VIEW · n hidden` in `--text-tertiary`, as text (not colour alone), left of the trigger.

**Alternative.** No marker, for the cleanest stage look.

**Why.** Hiding the GPS-denial estimate area or the mission queue makes the COP incomplete. A screenshot or a forgotten saved view must not pass for the full picture. **This is an open decision for the user** (see Open decisions).

## Component registry (inventory)

`DemoComponentId` and the panel's labels. A label never contains a spec ID and always uses "est." / "estimate" language.

| Group | Id | Component · file | Panel label | Parent |
|---|---|---|---|---|
| Map | `map.tracks` | billboards / `SpineOverlay` singles+stacks+hit targets · `CesiumSpine.tsx`, `MapSpine.tsx`, `SpineOverlay.tsx` | Unit symbols | — |
| Map | `map.aoeArea` | AoE polygons (90% fill + edge, 50% dash) · `CesiumSpine.tsx`, `MapSpine.tsx` | Est. GPS denial area | — |
| Map | `map.aoeLabel` | `AoeScreen` label · `AoeKey.tsx` | Est. GPS denial label | — |
| Map | `map.aoeKey` | `AoeKey` · `AoeKey.tsx` | Area key | — |
| Map | `map.fitButton` | Fit control · `SpineOverlay.tsx` | Fit-to-tracks button (F still works) | — |
| Side | `side.missionQueue` | `MissionQueue` · `fires/MissionQueue.tsx` | Fire missions | — |
| Side | `side.tssInForce` | `TssInForceStrip` · `fires/TssInForce.tsx` | TSS in force strip | `side.missionQueue` |
| Side | `side.trustPanel` | `TrustPanel` · `panel/TrustPanel.tsx` | Trust panel | — |
| Side | `side.trustReadout` | `TrustReadout` · `panel/TrustReadout.tsx` | Trust readout | `side.trustPanel` |
| Side | `side.trustTrace` | `TraceBullets` · `panel/TrustPanel.tsx` | Trust trace | `side.trustPanel` |
| Side | `side.candidates` | `CandidateCards` · `panel/CandidateCards.tsx` | Likely jamming methods | `side.trustPanel` |
| Side | `side.aoeCard` | `AoeCardBlock` · `panel/AoeCardBlock.tsx` | Est. GPS denial card | `side.candidates` |
| Brand bar | `bar.llmToggle` | `LlmToggle` · `toggle/LlmToggle.tsx` | LLM toggle | — |
| Brand bar | `bar.operator` | operator span · `brand/BrandBar.tsx` | Operator seat | — |
| Brand bar | `bar.hairline` | TSS hairline · `brand/BrandBar.tsx` | TSS-fail hairline | — |
| Log | `log.terminal` | `EventTerminal` · `terminal/EventTerminal.tsx` | After-action log | — |

Not toggleable: `BasemapAttribution` (licence), the Wordmark, and the Admin trigger itself.

**Presets.** These are data in `lib/demo-view.ts`, so the user can rename them or add more.

| Preset id | Label | Hidden |
|---|---|---|
| `full` | Full | nothing |
| `cleanMap` | Clean map | `map.aoeLabel`, `map.aoeKey`, `map.fitButton`, `side.missionQueue`, `side.trustPanel`, `log.terminal`, `bar.llmToggle`, `bar.operator` (full-width map: units + estimate area) |
| `firesOnly` | Fires only | `map.aoeArea`, `map.aoeLabel`, `map.aoeKey`, `side.trustPanel`, `bar.llmToggle` |
| `trustOnly` | Trust only | `side.missionQueue`, `map.aoeArea`, `map.aoeLabel`, `map.aoeKey`, `side.aoeCard` |
| `aoeFocus` | Estimate focus | `side.missionQueue`, `side.trustReadout`, `side.trustTrace`, `log.terminal`, `bar.llmToggle` |

Toggling any single checkbox after choosing a preset sets `preset: 'custom'`.

## New interfaces

```ts
// src/lib/demo-view.ts (pure; no React, no zustand, no @/store imports)
export type DemoGroup = 'map' | 'side' | 'bar' | 'log';
export type DemoComponentId = 'map.tracks' | 'map.aoeArea' | /* … table above … */ 'log.terminal';
export interface DemoComponent { id: DemoComponentId; group: DemoGroup; label: string; parent?: DemoComponentId }
export type PresetId = 'full' | 'cleanMap' | 'firesOnly' | 'trustOnly' | 'aoeFocus';
export interface DemoViewState { v: 1; hidden: readonly DemoComponentId[]; preset: PresetId | 'custom' }

export const DEMO_COMPONENTS: readonly DemoComponent[];
export const DEMO_PRESETS: readonly { id: PresetId; label: string; hidden: readonly DemoComponentId[] }[];
export const FULL_VIEW: DemoViewState;
export function isVisible(s: DemoViewState, id: DemoComponentId): boolean;            // ancestors too
export function toggle(s: DemoViewState, id: DemoComponentId): DemoViewState;
export function applyPreset(s: DemoViewState, id: PresetId): DemoViewState;
export function hiddenCount(s: DemoViewState): number;
export function serialize(s: DemoViewState): string;                                  // localStorage JSON
export function parseStored(raw: string | null): DemoViewState | null;                // unknown ids dropped, bad/old → null
export function parseSearch(search: string): DemoViewState | null;                    // ?view= / ?hide=
export function resolveInitial(o: { adminEnabled: boolean; search: string; stored: string | null }): DemoViewState;
export function layoutFor(s: DemoViewState): { gridTemplateRows: string; gridTemplateColumns: string; sideColumn: boolean };
export function adminEnabled(o: { adminEnv: string | undefined; nodeEnv: string | undefined; search: string }): boolean;
export type AdminShortcut = { kind: 'toggleMenu' } | { kind: 'preset'; id: PresetId };
export function matchAdminShortcut(e: { code: string; altKey: boolean; shiftKey: boolean; ctrlKey?: boolean; metaKey?: boolean; target?: unknown }): AdminShortcut | null;
```

Shortcuts are matched on `e.code`, because macOS turns Option+Shift+letter into a symbol in `e.key`:
- `Alt+Shift+A` toggles the panel.
- `Alt+Shift+0` applies Full; `Alt+Shift+1…4` apply Clean map, Fires only, Trust only and Estimate focus.
- All of them are ignored while typing in an input, textarea or select (for example the accept-risk form).

None of these collide with the existing keys: branch keys and F both ignore Alt.

## Existing patterns to follow

- **Pure lib with a node test:** `src/lib/camera-fit.ts` + `camera-fit.test.ts`, including the `// @ts-ignore TS5097` `.ts` import idiom.
- **Shortcut predicate with a typing guard:** `isFitShortcut` in `src/lib/camera-fit.ts`.
- **zustand store shape:** `src/store/hamilton.ts` (`create<…>((set, get) => …)`).
- **Brand-bar control styling and a11y:** `src/components/toggle/LlmToggle.tsx` (mono micro, `--surface-panel` chip, gating-secondary underline for the selected state).
- **Popover surface:** `listBox` / `tooltipSurface` in `SpineOverlay.tsx` / `components/symbol` (`--surface-elevated`, 1px `--surface-panel` border, `--surface-modal-scrim` shadow tint).
- **Reduced motion:** `usePrefersReducedMotion` (`src/hooks/`).
- **Story seeding through parameters:** `parameters.hamilton` → `seedHamilton` in `.storybook/preview.tsx`. Add a `parameters.demoView` → `seedDemoView` beside it.
- **Full-page play test:** `src/stories/pages/CopPage.stories.tsx` `CrescendoReplay` (waits for `fm-row-AB1001` `data-verdict="FAIL"`).
- **Optional env flag pass-through:** the `NEXT_PUBLIC_BASEMAP: ${NEXT_PUBLIC_BASEMAP:-}` line in `infra/docker/docker-compose.yml`.

## Implementation steps

The dependency order is: 1 → 2 → (3, 4, 5, 6 can run in parallel) → 7 → 8 → 9.

1. **Pure lib.**
   - Change: create `apps/web/src/lib/demo-view.ts` (the interfaces above) and `demo-view.test.ts`.
   - Check: `pnpm --filter @hamilton/web test` passes the 114 existing tests plus the new ones.
2. **Store and gate hooks.**
   - Change: create `apps/web/src/store/demo-view.ts`, holding `useDemoView` (state plus `toggle`, `applyPreset`, `reset`, `hydrate`), `useDemoVisible(id)`, and `useAdminEnabled()`. The last is post-mount and reads `window.location.search`, `process.env.NEXT_PUBLIC_ADMIN` and `process.env.NODE_ENV`.
   - Change: add a `useDemoViewPersistence()` effect that hydrates once through `resolveInitial` and writes `serialize` on change, only when admin is enabled.
   - Check: typecheck passes, and `demo-view.ts` has no import from `@/store/hamilton` (grep).
3. **Side column, log and layout.**
   - Change: create `src/components/admin/DemoSlot.tsx`.
   - Change: in `app/page.tsx`, wrap `MissionQueue`, `TrustPanel` and `EventTerminal`, and apply `layoutFor` to `<main>` and to the row.
   - Change: inside `TrustPanel.tsx`, wrap `TrustReadout`, `TraceBullets` and `CandidateCards`. Inside `CandidateCards.tsx`, gate `AoeCardBlock`. Inside `MissionQueue.tsx`, gate `TssInForceStrip`.
   - Check: in Storybook `Pages/COP`, toggling hides the block, the map widens and the FAIL still lands.
4. **Map: screen space.**
   - Change: in `SpineOverlay.tsx`, add the props `showTracks` and `showFit`. In `AoeKey.tsx` `AoeScreen`, add `showLabel` and `showKey`, plus `data-hidden` on `aoe-layer`.
   - Check: the `COP/CesiumSpine` and `COP/MapSpine` stories render unchanged by default.
5. **Map: renderer layers.**
   - Change: in `CesiumSpine.tsx`, set the AoE entity `show`, AND the declutter pass with `map.tracks`, and pass the overlay props.
   - Change: in `MapSpine.tsx`, set deck `visible` on the three AoE layers and pass the overlay props.
   - Check: with each renderer, toggling "Est. GPS denial area" removes and restores the polygons with no flash of a re-fade, and the declutter doesn't re-show hidden billboards after a pan.
6. **Brand-bar items.**
   - Change: in `BrandBar.tsx`, gate `LlmToggle`, the operator span and the hairline.
   - Check: the `Brand/BrandBar` stories are unchanged by default.
7. **Admin trigger, panel and shortcuts.**
   - Change: create `src/components/admin/AdminMenu.tsx` (trigger plus a `next/dynamic` panel) and `AdminPanel.tsx`.
   - Change: in `BrandBar.tsx`, render `<AdminMenu/>` and the `DEMO VIEW · n hidden` marker only when `useAdminEnabled()` is true.
   - Change: add a window `keydown` listener that uses `matchAdminShortcut` and is registered only when admin is enabled.
   - Check: the a11y checklist below, plus `scripts/lint-phosphor.sh`.
8. **Stories.**
   - Change: create `src/components/admin/AdminMenu.stories.tsx`.
   - Change: add a `WithAdmin` story to `BrandBar.stories.tsx` and `DemoPresets` / `HiddenQueueStillTicks` to `CopPage.stories.tsx`.
   - Change: add `seedDemoView` and an admin override to `src/stories/support/mocks.tsx` and `.storybook/preview.tsx`.
   - Check: the play tests pass in Storybook.
9. **Env pass-through and docs.**
   - Change: add `NEXT_PUBLIC_ADMIN: ${NEXT_PUBLIC_ADMIN:-}` to `infra/docker/docker-compose.yml`.
   - Change: add one paragraph on the Admin menu (presenter only, view filter, gating) to `docs/System Design.md`, beside §6c.
   - Check: `docker compose config` shows the variable as empty by default.

## Accessibility and keyboard (the menu itself)

- **Trigger.** A `<button aria-expanded aria-controls="admin-panel" aria-keyshortcuts="Alt+Shift+A">Admin</button>`. Visible focus uses the existing `--gating-secondary` focus treatment, as LlmToggle does.
- **Panel.**
  - `<section id="admin-panel" role="region" aria-label="Admin">` with an `<h2>Demo simulation</h2>`. It's a disclosure, not `role="menu"` and not `role="dialog"`, so there's no focus trap.
  - Opening it moves focus to the first preset button. Opening by shortcut also counts, since the presenter asked for it.
  - Closing (Escape, the trigger, or a click outside) returns focus to **the element that had focus before it opened**, which may be a mission row. Focus is never moved to `<body>`.
- **Presets.** A `role="radiogroup"` of buttons with `aria-checked`. "Custom" shows as text when no preset matches.
- **Groups.** One `<fieldset><legend>` per group (Map, Side column, Brand bar, Log) holding native `<input type="checkbox">` controls with `<label>`. Each row shows a "shown" or "hidden" text suffix, so state isn't carried by colour alone.
  - A child whose parent is hidden is `disabled`, with `aria-describedby` pointing to "Hidden with Trust panel".
  - Tab moves between controls, Space toggles, Enter activates a preset.
- **Reset.** A "Show all" button applies Full.
- **Live feedback.** None. The checkbox state is announced natively, and the panel never announces anything into the COP's live regions.
- **Motion.** Opacity 0→1 over 120 ms with `--ease-out-expo`. Under `prefers-reduced-motion` it appears instantly. No transforms on layout properties (Branding §6).
- **Contrast and tokens.**
  - Text uses `--text-secondary` / `--text-tertiary` on `--surface-elevated`.
  - The checked state uses the native checkbox plus text, not phosphor. `--gating-secondary` (phosphor) appears only as the selected-preset underline, as in LlmToggle, which `lint-phosphor.sh` allows because it is the token.
- **Hidden content.** `hidden` removes it from the a11y tree and tab order, so a screen reader never reads hidden blocks.

## Testing strategy

- **Unit tests** in `src/lib/demo-view.test.ts`, run with `pnpm --filter @hamilton/web test`. They cover:
  - Registry ids are unique, every parent exists, and there are no cycles. Every preset references known ids.
  - `FULL_VIEW` shows everything. `isVisible` honours ancestors: hiding `side.trustPanel` hides `side.aoeCard`.
  - `toggle` is idempotent twice over, and switches the preset to `custom`. `applyPreset` and `hiddenCount` behave.
  - `parseStored`: null, bad JSON, the wrong `v` and unknown ids give null or drop the ids. The `serialize` → `parseStored` round trip holds.
  - `parseSearch`: `?view=cleanMap`, `?hide=a,b`, unknown values ignored.
  - `resolveInitial`: URL beats storage beats Full. **With `adminEnabled: false` it always returns Full**, even if storage holds hidden ids.
  - `layoutFor`: the log hidden drops the 160px row; both side blocks hidden gives `1fr`; one side block hidden keeps `2fr 1fr`.
  - `adminEnabled` truth table: env `'1'` alone is true. Dev plus `?admin=1` is true. Production plus `?admin=1` is false. `'true'` / `'0'` / undefined are false.
  - `matchAdminShortcut`: it requires Alt+Shift, ignores Ctrl/Meta, matches on `code`, ignores INPUT/TEXTAREA/SELECT/contentEditable, and Digit0–4 map to presets.
  - Copy lint: no label matches `/\b(FR|UR|HS|NFR)-|§/`, and none matches `/GPS clear|window open/i`.
- **Storybook.**
  - `Admin/AdminMenu`: Closed, Open, Preset Clean map. A play test opens the panel, Tabs to a checkbox, presses Space, checks that `aria-checked` and the "hidden" suffix change, presses Escape, and checks that focus returns to the trigger.
  - `Brand/BrandBar › WithAdmin`: shows the trigger and the marker. The existing stories must stay identical, with no trigger.
  - `Pages/COP › HiddenQueueStillTicks`: the crescendo script with `demoView: { hidden: ['side.missionQueue'] }`. The play test asserts that `[data-demo-slot="side.missionQueue"]` has `hidden`, then shows it again and asserts that `fm-row-AB1001` already has `data-verdict="FAIL"`. That proves the 1 Hz tick kept running while hidden.
  - `Pages/COP › DemoPresets`: applies each preset, then asserts the slots and `layoutFor` columns.
- **Live check** against the running dev stack on :3001, using puppeteer-core at `/Users/kristianromero/.claude/jobs/610837f7/tmp/node_modules` and Chrome for Testing in `~/.cache/puppeteer/chrome/mac_arm-148.0.7778.97`. The script lives in `/tmp`, not the repo. Don't restart the stack: the dev gate makes `?admin=1` work without a restart. It should check:
  1. `/`: there is no "Admin" button and no `DEMO VIEW` text.
  2. `/?admin=1`: the trigger is present. Alt+Shift+A opens the panel, and `document.activeElement` is inside it.
  3. Toggle each id, and assert `[data-demo-slot=…][hidden]`. Assert that `aoe-key`, `aoe-label` and `fit-to-tracks` are absent, that `aoe-layer[data-hidden~=area]` is set, and that no `cop-symbol-*` is present. Take a screenshot at each preset.
  4. With the Fit button hidden, pan the map and press F. The "manual" state clears (show the button again to read it), so F still works.
  5. Reload `/?admin=1`: the view persists. Then `/?admin=1&view=full` resets it, and `/` without admin shows everything despite the stored key.
  6. There are no console errors.
- **Gates:** `pnpm --filter @hamilton/contracts build` if needed, then `pnpm --filter @hamilton/web typecheck`, `pnpm --filter @hamilton/web test` and `scripts/lint-phosphor.sh`.

## Effort, files and risks

**Effort.** About 1–1.5 developer days:
- lib, store and tests: 0.3;
- slots, layout and brand bar: 0.2;
- map renderers: 0.3;
- panel and a11y: 0.3;
- stories and the puppeteer check: 0.3.

**Create:**
- `apps/web/src/lib/demo-view.ts`
- `apps/web/src/lib/demo-view.test.ts`
- `apps/web/src/store/demo-view.ts`
- `apps/web/src/components/admin/DemoSlot.tsx`
- `apps/web/src/components/admin/AdminMenu.tsx`
- `apps/web/src/components/admin/AdminPanel.tsx`
- `apps/web/src/components/admin/AdminMenu.stories.tsx`

**Modify:**
- `apps/web/app/page.tsx`
- `apps/web/src/components/brand/BrandBar.tsx`
- `apps/web/src/components/brand/BrandBar.stories.tsx`
- `apps/web/src/components/cop/CesiumSpine.tsx`
- `apps/web/src/components/cop/MapSpine.tsx`
- `apps/web/src/components/cop/SpineOverlay.tsx`
- `apps/web/src/components/cop/AoeKey.tsx`
- `apps/web/src/components/fires/MissionQueue.tsx`
- `apps/web/src/components/panel/TrustPanel.tsx`
- `apps/web/src/components/panel/CandidateCards.tsx`
- `apps/web/src/stories/pages/CopPage.stories.tsx`
- `apps/web/src/stories/support/mocks.tsx`
- `apps/web/.storybook/preview.tsx`
- `infra/docker/docker-compose.yml`
- `docs/System Design.md` (one paragraph)

**Risks and mitigations:**
- **Cesium declutter re-shows hidden billboards.** `runDeclutterRef` reassigns `ent.show` on every pass. Read the tracks flag through a ref inside the pass, and test with a pan.
- **Hydration flash of the full COP before a saved view applies.** Hydrate in a `useLayoutEffect` on the client. A ≤1-frame flash is acceptable for a presenter tool.
- **A forgotten saved view hides the estimate area or the queue in the next rehearsal.** Mitigated by the `DEMO VIEW · n hidden` marker (D9), "Show all", `?view=full` and the admin-only rule (D4).
- **The dev gate also opens on the docker demo stack, which runs `pnpm dev`.** It needs an explicit `?admin=1`, so it can't happen by accident. If the user wants operator-grade lockout on that stack too, drop the dev path and require the env flag (open decision 2).
- **Brand bar width.** The trigger and marker compete with LlmToggle on narrow screens. Check `Brand/BrandBar › Narrow`, and hide the marker text below 1024 px, leaving the count only.
- **Unmounting by mistake later.** The "hide, not unmount" rule must survive refactors. The `HiddenQueueStillTicks` play test guards it, and a header comment in `DemoSlot.tsx` states the rule.
- **Copy drift.** The copy-lint unit test keeps spec IDs and forbidden phrases out of the labels.

## Open decisions (for the user; defaults recommended)

1. **Show the `DEMO VIEW · n hidden` marker while anything is hidden?** Default: **yes**.
2. **Gate.** Keep the dev-build `?admin=1` path, or require `NEXT_PUBLIC_ADMIN=1` everywhere? Default: **keep the dev path**. It's needed to verify on :3001 without a restart, and production builds still need the env flag.
3. **Trigger visibility in admin builds.** Always show the `Admin` word, or show nothing and use only the shortcut, for a cleaner projector? Default: **show it**, quiet in `--text-tertiary`.
4. **Preset set and names** (Full, Clean map, Fires only, Trust only, Estimate focus). Default: **as listed**. They're data, so they're cheap to change.
5. **Persist to localStorage?** Default: **yes, in admin sessions only**. The URL param still wins.

## Out of scope (later work)

- **Data-changing demo controls:** force a beat, retire or hide the estimate in the store, inject or clear missions, restart the scenario, jump to a timestamp. These would go through comms-sim / engine control endpoints with their own plan, never web-store writes. They must respect pinned beat values, TSS thresholds and `check-no-truth.sh`.
- **Cross-console sync** (a `BroadcastChannel`, only alongside a built `?layout=ops-center`).
- **Basemap on/off** as a toggle (Cesium `imageryLayers` / MapLibre style layers), and per-unit symbol filtering.
- **Hotkey-driven scripted "scenes"** that change the view automatically at beat times.
- Any jammer-position view. There is never a point, ring or bearing.
