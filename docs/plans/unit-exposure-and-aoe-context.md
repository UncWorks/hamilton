# Plan — Per-unit interference exposure · AoE "why it opened" and pending cue

Status: planned, not started. Branch: `plan/unit-exposure` (based on
`origin/feat/demo-view`: main + PRs #1–#7, the AoE MVP, #14, #15). Planning
route: kr:plan, **plan mode** (chosen by the planning agent; it could not ask
the user from a subagent).

## Summary

Two features that give the FDC context they lack today. Both are context only:
they change no trust value, no TSS threshold and no pinned beat.

1. **Interference exposure by unit.** The engine keeps a per-unit history of
   interference symptoms over the last 15 and 60 min. That covers time
   degraded, separate episodes, worst rating, time inside the estimated denial
   areas, jammer-match hits, GPS-fix loss, a trend, and "still / again
   degraded after moving". It publishes a small retained summary per unit
   (`integrity/exposure/{source_id}`) and serves a second-resolution history
   over HTTP. The web shows an **Interference by unit** section (a sortable
   table with timeline strips) and a focused history block in the Trust panel.
   A failing mission row gets a one-line, text-only hint naming a less-exposed
   unit of the same role. The FDC decides.
2. **AoE context.** The estimate's open line and map label say why it opened
   ("GPS lost at B, D, E, H · jammer match 6/6"). A new retained engine topic,
   `integrity/emitter/trigger`, publishes the trigger's partial state, so the
   COP can show a quiet "estimate pending" cue when the trigger is substantially
   but not fully met. The existing 300 ms fade-in is made to actually show on
   Cesium, where the async ground primitive currently swallows it.

**One finding sets expectations for Feature 2.** In the pinned scenario,
the only RF observation (B's spectrum monitor) first appears at 1:15. That is
the same tick as the GNSS loss, and the trigger fires on that tick. Before 1:15
there is no jammer match at all (0/6) and no GPS loss. So **the pending cue
never appears in the pinned demo**, by design and without any change to beats.
Its value there is zero. Its value is in real use and in Storybook. The visible
demo gain from Feature 2 is the reason text plus a fade that really plays. See
open decision 6 for an optional non-pinned ramp scenario.

## Context (surveyed 2026-10-05)

### Engine (`services/trust-engine`)

- **Tick loop.** `src/ticker.rs` `run` runs once per second.
  - `publish_one_tick` computes the four detector readings, `aggregate`s a `TrustScorePayload` per source and publishes it on `integrity/trust/{id}`. It also publishes the candidates on `integrity/fingerprint/candidates` and logs a `fingerprint` event when a unit's top method changes. **The scores are not kept.** They exist only inside this function, and the engine has no notion of the J rating bands (those live in the web, in `apps/web/src/lib/link-trust-rating.ts` `LINK_TRUST_SCALE`: NOMINAL ≥ 0.85, WATCH ≥ 0.60, DEGRADED ≥ 0.30, UNRELIABLE below; STALE after 10 s without a report).
  - Then `unit_views(&snapshot)` builds `aoe::inputs::UnitView { source_id, gnss: Option<GnssTrack>, link_degraded, rf }` per unit, and `AoeTracker::tick` returns `AoeAction`s, which `execute_aoe` publishes and `record_aoe` logs.
- **State.** `src/state.rs` holds `SourceState` per unit: `location.position` (latest), `gnss: Option<GnssTrack>`, `last_rf` and `last_report_ms`.
  - `GnssTrack` has `current: ClassObservation { state, lat, lon, last_ms }`, `since_ms` (when the current state began) and `previous`.
  - `ClassState::Degraded` means `gnss_fix` is `2d` or `none` (K2).
- **AoE trigger.** `src/aoe/mod.rs` `AoeTracker::trigger` returns `Option<TriggerReading { method_id, top_matched, lead, degraded_held }>`.
  - It is `None` when no unit has an RF observation.
  - `degraded_held` is true when any unit's GNSS has been degraded, or its link verdict degraded, for ≥ `degraded_hold_ms` (3 s). The link side is tracked in `AoeTracker.link: HashMap<id, (bool, since_ms)>`.
  - `TriggerReading::fires` requires ≥ 5/6 matched, a lead of ≥ 2 and `degraded_held`.
  - `transition_event` writes the `events` row: "Est. GPS denial {id} opened · {method} · {state} · {d} degraded / {h} healthy".
  - `AoeConfig::default()` holds the pinned thresholds.
- **Pinned timeline.** Both replay fixtures (`packages/contracts/fixtures/aoe/telemetry-beats.jsonl` synthetic, `…recorded.jsonl` from the sim) show the same timeline:
  - 0:00: all healthy.
  - 0:45: B cadence 1.17 s (WATCH). In the recorded fixture, D and H links also degrade (goldens, not pinned).
  - 0:55: B CRC 6% (still WATCH, ≈ 0.65).
  - **1:15: B gets `rf` for the first time.** GNSS is lost at B, D, E, H, and B drops to 0.13. The estimate opens on this tick (`aoe/tests.rs` `check_lifecycle` asserts `(75, Open)`).
  - 1:50: B moves 5 km west. Its GNSS is healthy, but its link is still jammed (0.22).
  - 2:15: jammer off; stale at 2:25, retired at 4:15.
  - The sim (`services/comms-sim/src/comms_sim/scenarios/avdiivka.py` `derive_rf`) only emits `rf` while the GNSS module is on, and that module switches on as a step at 1:15.
- **Replay harness.** `src/aoe/tests.rs` `replay(name, until, estimator)` drives `telemetry::apply_payload` → `ticker::unit_views` → `AoeTracker::tick` with the fake clock `ms(t)`. The new tests extend this.
- **Persistence.** `crates/transport/src/log.rs` `AfterActionLog` holds DuckDB `events` and `emitter_estimates`, both append-only. `crates/transport/src/mqtt.rs` holds `BROKER_MESSAGE_SIZE_LIMIT = 8192` and `encode_emitter_estimate`, which errors above 8192 and warns above `EMITTER_ESTIMATE_MAX_BYTES = 7168`.
- **HTTP.** `crates/server/src/lib.rs` provides `/healthz`, `GET /api/events` and `POST /api/modal/selection`. `AppState { log }` only.
- **Contracts.** `packages/contracts/src/*.ts` (zod) mirrored in `packages/contracts-rs/src/lib.rs`. New payload structs use `#[serde(deny_unknown_fields)]` (see `EmitterEstimatePayload`). `DetectionKind` is mirrored in `detection-event.ts`. The contracts test is `packages/contracts/test/aoe-contracts.test.mjs`.

### Web (`apps/web`)

- **Store.** `src/store/hamilton.ts` holds `tracks`, `missions` (TSS per mission, evaluated client-side at 1 Hz), `emitterEstimate` / `emitterState` / `emitterLog` and `selectedSource`.
  - MQTT is wired in `src/lib/mqtt-client.ts` and `src/hooks/useHamiltonMqtt.ts`.
  - Engine HTTP goes through the same-origin proxy `app/engine/api/[...path]/route.ts`. Its `ALLOWED` set is `events` and `modal/selection` only. `src/lib/engine-api.ts` `engineUrl` is typed to those two.
- **Estimate strings.** `src/lib/emitter-estimate.ts` holds every one: `mapLabel`, `aoeCard`, `terminalLine` (`opened` → "Est. GPS denial opened · <class> · OBS B inside (90%)"), `evidenceByUnit`, `insideList` and `estimateAgeS`. `EventTerminal` hides the engine's `emitter_estimate` rows once the web's own `emitterLog` has lines.
- **Fade.** `src/hooks/useEmitterEstimate.ts` `useAoeFade(episodeKey = estimate_id, reducedMotion)` runs 0 → 1 over `AOE_FADE_MS = 300` (`lib/aoe-style.ts`), as FR-06a (5) requires ("one fade-in ≤ 300 ms, none under reduced motion").
  - MapSpine passes `opacity` to the three deck layers.
  - CesiumSpine feeds `fadeRef` into `CallbackProperty` colours on **clamped-to-ground** polygons and polylines. Those are built asynchronously, as ground primitives, after the entity is added, so the 300 ms fade usually finishes before the first frame that draws them. That is the most likely reason the area "appears suddenly" (to confirm in step B0).
  - `AoeScreen` (`components/cop/AoeKey.tsx`) fades the label with the same opacity.
- **Side column.** `app/page.tsx` stacks `DemoSlot side.missionQueue` → `MissionQueue` over `DemoSlot side.trustPanel` → `TrustPanel` in one scroll container.
  - `TrustPanel` focuses `selectedSource`, or the lowest score. It shows the header, `TrustReadout`, `TraceBullets` and `CandidateCards` (with `AoeCardBlock`).
  - Map symbol clicks call `selectSource`.
- **Mission row.** `components/fires/MissionRow.tsx` shows the branches only when `fail && tss.gated && !firing` (`showBranches`). Keys 1–4 are row-scoped.
  - AB1001 (OBS B, M982, HPT, FU A) fails at 1:15 on B.
  - AB1002 (OBS C, M795) is never gated.
  - Mission dependencies are `observer_link`, `target_location` and `firing_unit_nav` (`packages/contracts/src/fire-mission.ts`).
- **Demo-view registry.** `src/lib/demo-view.ts` holds `DemoComponentId`, `DEMO_COMPONENTS`, `DEMO_PRESETS` and `layoutFor`. `layoutFor` hides the side column only when *every* side block is hidden. `DemoSlot` hides without unmounting.
- **Names.** `src/lib/display-names.ts` `UNIT_ROLES` (A "FA battery (FU A)" … H "UAS team"), `unitName`, `eventMessage` (engine `unit_b` → "Unit B"). `src/lib/cop-symbols.ts` `designationOf` gives "B".
- **Gates.** `pnpm --filter @hamilton/web typecheck`, `pnpm --filter @hamilton/web test` (`node --test src/lib/*.test.ts`), `scripts/lint-phosphor.sh`, `cargo fmt --all -- --check`, `cargo clippy --workspace -- -D warnings`, `cargo test --workspace`, `pnpm --filter @hamilton/contracts test`.

### Problems

1. The FDC sees each unit's *current* trust only. When AB1001 fails on OBS B, nothing tells them that OBS C has been clean for the last hour, or that B has been hit three times. Nor do they learn that moving B 5 km did not get it out.
2. The estimate appears at 1:15 with no stated reason, no lead-up and, on Cesium, no visible fade.

## Decisions

### D1 — Compute exposure in the engine

**Choice.** A new pure, clock-free module, `services/trust-engine/src/exposure/`, shaped like `aoe/`. It is fed once per tick from `ticker.rs`. It publishes a retained summary per unit, serves HTTP, and stores closed segments in DuckDB.

**Alternative.** Compute it in the web from the trust stream.

**Why.** Web-side history dies on reload, differs between consoles that joined at different times, and can't see `gnss_fix`, link verdicts or per-unit match counts. The web only gets the blended score. The engine already owns all of these inputs and the after-action record.

### D2 — "Affected" means DEGRADED or worse, or GPS-fix lost

**Choice.** A unit is **affected** in a second when either holds:
- its rating band is DEGRADED (D4) or UNRELIABLE (E5), i.e. `score < 0.60`; or
- its GNSS track is `ClassState::Degraded` (`gnss_fix` is `2d` or `none`).

STALE (F6, no report for ≥ 10 s) is **not** affected. It is counted separately, because a unit that powers down also goes stale. Episodes and the sort key use "affected". "Time degraded" stays rating-only, as the brief asks.

**Alternative.** Rating only.

**Why.** Barrage jamming shows up in both ways. In the synthetic fixture D, E and H lose GPS at 1:15 while their links rate NOMINAL. A rating-only metric would call them unexposed, and the alternatives hint would then suggest them as clean.

### D3 — Episode boundaries with hysteresis: 3 s in, 30 s out

**Choice.**
- An episode **opens** when a unit has been affected for ≥ 3 s continuously. Its start is backdated to the first affected second, so a 3 s flicker counts 3 s.
- It **closes** once the unit has been unaffected (and not stale) for ≥ 30 s. The end is the last affected second.
- Unaffected gaps under 30 s merge into the same episode.
- STALE seconds neither open nor close an episode. They freeze the exit timer.
- Affected runs under 3 s add to the `affected_s` totals but never make an episode.

**Alternative.** No hysteresis (an edge count), or the TSS 5 s recovery hold.

**Why.** The 3 s entry matches `AoeConfig::degraded_hold_ms`, so a symptom the AoE trigger would count is the same one exposure counts. The 30 s exit stops a link hovering near 0.60 from counting as ten episodes. It is long enough to bridge a jamming duty cycle, and short against the 15-min window. The TSS hold (5 s) damps a *recommendation*. Exposure is a *history*, so it can afford a longer exit.

### D4 — Exposure never changes TSS, trust or the AoE estimator

**Choice.** Exposure is read-only context. It doesn't feed `evaluateTss`, the aggregator, the trigger or the estimator. Pinned scores, TSS thresholds and beats are untouched.

**Alternative.** Penalise reliability for repeat exposure, or seed the estimator with past degraded positions (FRS FR-04b's "moving-unit history (v2)").

**Why.**
- The J letter is defined from the live link (Track Symbology decision 3). A history penalty would make a recovered link read worse than it measures, and would move the pinned 1:15 / 1:50 values.
- Feeding history into the estimator is a v2 estimator change with its own validation. It would also turn per-unit history into position evidence, which rule D8 forbids for this feature.

### D5 — Wire shape: one small retained topic per unit, plus HTTP for detail

**Choice.**
- `integrity/exposure/{source_id}`: retained, QoS 0, schema `unit-exposure/1`, about 1.1 KB.
- `GET /api/exposure` returns all summaries, and `GET /api/units/{id}/exposure` returns one. Both are served from the in-memory latest map.
- `GET /api/units/{id}/exposure/history?minutes=15|60` returns second-resolution segments for the focused unit, from DuckDB plus the open in-memory segment.

**Alternatives.**
- One topic holding all 8 units: about 9 KB, over the 8192 B broker cap.
- HTTP only, polled: it doesn't push, and consoles disagree for up to one poll.

**Why.** A retained message per unit gives a reloaded page the full table at once, without polling. Each message stays far below the 7168 B budget, and it scales with unit count. The fine-resolution history is only needed for the one focused unit, so it goes over HTTP on demand.

### D6 — Storage: run-length segments in DuckDB, written on close; no positions

**Choice.** A new table, `unit_exposure_segments`. One row is written when a unit's sample state changes (the previous segment closes). On startup the engine seeds each unit's tracker from rows with `ts_end ≥ now − 60 min`, and leaves a "no data" gap up to startup. Positions are never stored.

**Alternative.** A per-second sample table, which is ~3600 rows/unit/h and mostly identical; or memory only.

**Why.** Segments are what the history endpoint and the strips need. A demo run writes dozens of rows, not thousands. An engine restart keeps the last hour. No positions means the stored history can't be replayed into a track of where units were degraded (D8).

### D7 — The engine mirrors the rating bands, guarded by a shared fixture

**Choice.**
- Add `packages/contracts/fixtures/rating-bands.json`: `{ nominal: 0.85, watch: 0.60, degraded: 0.30, stale_after_s: 10, j: {nominal:"B2", watch:"C3", degraded:"D4", unreliable:"E5", stale:"F6"} }`.
- The engine's `exposure::band(score, stale)` and the web's `LINK_TRUST_SCALE` each have a test asserting they equal the fixture.
- Exposure reports the **uncorroborated** J. Corroboration (credibility 1) is per mission and web-only.

**Alternative.** Publish the J from the web, or move the bands into contracts-rs only.

**Why.** The engine has to classify every second without a web console attached. One fixture read by both test suites catches drift, in the same way `link-trust-rating.test.ts` already checks `trust-gradient.ts`.

### D8 — Language and position safety (hard rules)

- **Wording.** "Interference exposure", "affected", "GPS fix lost", "est. GPS denial area". **Never** "targeted", "hit by the jammer", "near the jammer", "GPS clear" or "window open".
- **No spec IDs.** No `FR-`, `UR-`, `HS-` or `§` in UI text. Copy-lint tests enforce this.
- **No positions or bearings.** No exposure payload, endpoint or table carries lat/lon, x/y, a bearing, a direction or a centroid. "Moved" is reported as a distance only (`moved_km`). An engine test asserts the serialised payload has no `lat`, `lon` or `bearing` key.
- **No exposure layer on the map.** That means no heat map, no per-unit history rings, and no colouring of symbols by exposure. Exposure appears only in the side column, the Trust panel and the mission row. Plotting where units were affected would trace the denial area and point toward the emitter, so per-unit history is never combined spatially.
- **Barrage jamming covers an area.** Copy frames exposure as where a unit has *been* affected, not what was aimed at it. The table header tooltip reads: "Interference exposure: time this unit's link or GPS was affected. Area jamming affects every unit in range — exposure is not intent."

### D9 — Exposure UI: a collapsible side-column section plus a Trust-panel block

**Choice.**
- **`ExposureSection`** sits between the mission queue and the Trust panel. It's a disclosure: a `<button aria-expanded>` header.
  - **Collapsed** (the default) is one line: `Interference exposure · 60 min · 4 affected · most: Unit B E5 · 1 min`.
  - **Expanded** is a compact 8-row table.
  - The expanded/collapsed state is a per-viewer convenience in `localStorage['hamilton.exposure.open']`, wrapped in try/catch.
- **`ExposureFocus`** goes inside `TrustPanel`, under `TrustReadout`, for the focused unit. It shows a second-resolution timeline (HTTP history), the episode list, the worst rating, GPS loss, time in the est. areas, match hits and any after-move note.
- Clicking a table row calls the existing `selectSource(id)`, so the Trust panel, its focus block and the map tooltip focus agree. Focus is never moved programmatically; the row is a `<button>`.

**Alternatives.**
- A tab strip inside the Trust panel: it hides the readout, which is the panel's primary job.
- A tab in the bottom terminal row: 160 px is too short for 8 rows, and the log is a different job.
- An always-expanded section: it pushes the Trust panel below the fold during a FAIL.

**Why.** It costs one line when closed, and the side column already scrolls. Reusing `selectSource` gives "click a row to focus that unit's history" with no new focus model.

### D10 — Alternatives hint: one text line on a FAILing, gated row

**Choice.** It shows in `MissionRow` only when `showBranches` is true (FAIL, gated, not firing), as a line under the branches. For example:

`Less exposed (FDC decides): OBS C (radar) — B2 · 0 of 60 min affected`

- **Role pools.**
  - `firing_unit_nav` → firing units {A, F}.
  - `observer_link` / `target_location` → observers {B, C, D, E, H}.
  - G (AD section) is never offered.
  - The pools are data in `lib/exposure.ts` (`ROLE_POOLS`).
- **Candidates.** A unit in the failing dependency's pool that:
  - is not already a dependency of this mission;
  - is not affected now and not stale;
  - has a current band that meets the mission's TSS reliability minimum (`minScoreForLetter`).
- **Ranking.** By `w60.affected_s` ascending, then `w60.episodes`, then current score descending. Show the best **one**, prefixed "Less exposed (FDC decides):".
- **Nothing qualifies.** Show nothing; silence beats a "none available" line in a busy row.
- **Interaction.**
  - No key binding, no button styled as an action, no change to TSS or branches.
  - The unit name is a link-styled `<button>` that calls `selectSource`, the same as a table row.
  - `aria-describedby` on the row reads it after the branches.

**Alternative.** A fifth branch, "[5] re-task to OBS C", or a ranked list of three.

**Why.**
- Re-tasking a unit is a fires decision, and Hamilton recommends a method of control only. A key or branch would read as a command.
- A list of three adds noise to the one row that is already the busiest. One line, labelled as the FDC's decision, is enough for "consider an alternative".

In the demo at 1:15, AB1001 fails on B. The pool minus the dependencies {B, A} leaves C, D, E and H. D, E and H are affected (GPS lost), so the hint names **OBS C — B2 · 0 of 60 min affected**.

### D11 — Trigger state: a new retained topic, `integrity/emitter/trigger`

**Choice.** It carries schema `emitter-trigger/1` and is retained, QoS 0.

The engine computes a `TriggerStatus` each tick, **beside** the existing `trigger()`. `trigger()` and `fires()` are byte-for-byte unchanged, so the pinned open tick can't move. `TriggerStatus.state` is:
- `open` while an estimate episode exists (active or stale);
- else `pending` when the **pending rule** holds;
- else `idle`.

The **pending rule** (new constants, pinned thresholds untouched): no estimate is open, the trigger does not fire, and **either**
- the top candidate matches ≥ 3/6 (`pending_min_matched = 3`); **or**
- ≥ 2 units have had their GPS fix lost for ≥ 3 s (`pending_min_gps_units = 2`, reusing `degraded_hold_ms`).

**Cadence.** Publish once on every state change. While `pending`, publish at 1 Hz, because the held seconds change. While `open` or `idle`, send a heartbeat every 10 s.

**Alternatives.**
- Add `trigger` to `EmitterEstimatePayload`: there is no estimate while pending, and it is `deny_unknown_fields`.
- Have the web infer pending from candidates plus trust: it lacks `gnss_fix` and the hold timers.

**Why.** Only the engine knows the hold timers and the per-unit GNSS state. A tiny retained topic restores the cue on reload.

The thresholds keep it quiet:
- 1/6 or 2/6 never shows.
- A single unit losing GPS (under a bridge, a dead antenna) never shows.
- Link degradation alone never shows, since the trust panel already covers it. In the recorded fixture, D and H links degrade from 0:45 with no GPS loss and no RF, so the trigger stays `idle`.

### D12 — The reason text is derived from the estimate payload, not a new field

**Choice.** `openReason(payload)` in `lib/emitter-estimate.ts` returns `GPS lost at B, D, E, H · jammer match 6/6`. It takes the units whose newest evidence is degraded (`evidenceByUnit`) and `round(method_match × 6)`. It is used:
- **in the open terminal line:** `Est. GPS denial opened · GPS lost at B, D, E, H · jammer match 6/6 · Pole-21-class · OBS B inside (90%)`;
- **in the map label for the first 30 s after the open:** `Est. GPS denial opened · GPS lost at B, D, E, H · jammer match 6/6`. After that the label reverts to the existing `mapLabel` text.

The open time comes from the estimate id (`J1-YYYYMMDDTHHMMSSZ`) when the clocks are aligned, otherwise from the C2's first receipt of that id (`EstimateEntry.firstSeenMs`).

The engine's `transition_event` builds the same reason from the payload for the after-action row: `… opened · <method> · active · GPS lost at unit_b, unit_d, unit_e, unit_h · jammer match 6/6 · 4 degraded / 4 healthy`. `eventMessage` already relabels `unit_b` → "Unit B". The `values` gain `gps_lost: [ids]` and `matched: 6`.

**Alternative.** Add `opened_reason` to the estimate contract.

**Why.** At open, the evidence and `method_match` already carry exactly these facts: degraded units B, D, E, H and match 1.0. No contract change, and a late-joining console computes the same text.

### D13 — Fade: keep 300 ms, but start it when Cesium can draw

**Choice.**
- `useAoeFade` gains a `ready` argument. The fade starts when the estimate id is new **and** `ready` is true.
- CesiumSpine sets `ready` from a `scene.postRender` listener: the first frame after the overlay entities were (re)built at which `viewer.dataSourceDisplay.ready` is true.
- MapSpine passes `ready = true` (deck draws synchronously), after B0 confirms the deck opacity animates.
- Reduced motion still means opacity 1 at once.
- The duration stays at `AOE_FADE_MS = 300`.

**Alternative.** Lengthen the fade to 600–800 ms so some of it survives the async build.

**Why.** FR-06a (5) caps the fade at ≤ 300 ms. Lengthening it hides the bug and breaks the requirement. Starting on readiness makes all 300 ms visible.

### D14 — Shared per-unit GNSS state

**Choice.**
- `ticker.rs` builds `unit_views` **once** per tick and passes the same slice to `AoeTracker`, `TriggerStatus` and the `ExposureTracker`.
- One helper, `aoe::inputs::gnss_lost_held_ms(&UnitView, now_ms) -> Option<i64>`, gives both the trigger cue's "GPS lost at B (2 s)" and exposure's `now.gnss_lost_s`.
- On the web, both are displayed from engine payloads. A unit test asserts that the trigger's `gps_lost` ids equal the set of exposure summaries with `now.gnss_lost` at the same tick.

**Alternative.** Each feature reads `GnssTrack` its own way.

**Why.** Two definitions of "GPS lost" would disagree on screen within a second of each other.

## Metric definitions (Feature 1)

**Sampling.** Each tick (1 s) the exposure tracker takes one `Sample` per known unit:

| Field | Definition | Source (existing data) |
|---|---|---|
| `band` | `B`/`C`/`D`/`E` from `score` via D7 bands; `F` when `now − last_report_ms ≥ 10 s` | `aggregate(...)` score from the extracted `scores::compute` (step A1); `SourceState.last_report_ms` |
| `score` | Aggregated trust | same |
| `gnss_lost` | `GnssTrack.current.state == Degraded` | `SourceState.gnss` (from `gnss_fix`, K2) |
| `link_degraded` | `spatial::is_degrading(temporal, stability)` | `UnitView.link_degraded` |
| `area` | `0.9` if the unit's current position is inside the **active** (not stale, not unbounded) estimate's 90% contour for its receiver class; `0.5` if inside the 50% contour only; else none. Class = the unit's GNSS `rx_class` (`gnss_mil*` → military layer, otherwise civil), as the web's `rxClassOf` | `AoeTracker::active_estimate()` (new accessor) + `trust_estimator::contour::point_in_ring` on lon/lat rings |
| `match_k` | Top candidate's matched count at this unit, when the unit has an RF observation; else 0 | `rank_candidates_with(rf, ObservedClasses(degraded_classes), library)` (as `AoeTracker::trigger`) |
| `affected` | `band ∈ {D, E}` **or** `gnss_lost` (D2) | derived |
| position (memory only) | `AoFrame::to_xy` of `location.position`, used only for the move rule; never stored or published | `SourceState.location` |

Consecutive identical samples (all fields except `score` and position) extend one **segment**. `score_min` is kept per segment.

**Windows.** `w15` and `w60` sum the segments clipped to `[now − 15 min, now]` and `[now − 60 min, now]`. `window_start` is the earliest data in the window (engine start or seed), so the UI can say "since 0712Z" when coverage is under 60 min.

| Metric | Precise definition |
|---|---|
| `degraded_s` | Seconds with `band ∈ {D, E}` in the window |
| `affected_s` | Seconds with `affected` (the sort key) |
| `gnss_lost_s` | Seconds with `gnss_lost` |
| `stale_s` | Seconds with `band = F` |
| `in90_s` / `in50_s` | Seconds with `area = 0.9` / with `area ∈ {0.9, 0.5}` (50% includes 90%). Only counted while an estimate is active; time before an estimate opened is **not** counted retroactively |
| `episodes` | Episodes (D3) overlapping the window, including an open one |
| Worst rating | Lowest band reached in the 60-min window (E < D < C < B; F reported separately as `stale_s`), with `at` = the first second it was reached, and `score_min` over the window. Null if never below B |
| Jammer-match hits | `match_onsets`: rising edges of `match_k ≥ 5` (the trigger's matched threshold) in the window; `match_s`: seconds with `match_k ≥ 5`; `best_k`: max `match_k` in the window; `last_at`. Units without an RF monitor read `best_k = 0`. In the demo only B has one |
| GPS-fix loss | `gnss_lost_s` per window, plus `now.gnss_lost_s` = the current run length (`gnss_lost_held_ms`, D14) |
| Trend | `recovering`: not affected now, unaffected for ≥ 10 s, and `w15.affected_s > 0`. `worsening`: affected now and (the open episode started < 120 s ago, **or** the band is lower than 120 s ago, **or** affected fraction over the last 120 s > fraction over [−600 s, −120 s] + 0.25). `steady`: otherwise (including never affected) |
| After-move | **Still affected after moving**: during an open episode the unit's displacement from the episode's start position reaches ≥ 1.0 km, and it is still affected 30 s after the displacement first reached 1.0 km. **Affected again after moving**: a new episode opens with the unit ≥ 1.0 km from where its previous episode (within 60 min) opened. Both report `{ kind, at, moved_km }` (distance rounded to 0.5 km, never a direction). Memory only, so it resets on an engine restart |

**Pinned demo values (synthetic fixture), asserted in tests.** Tolerance is ±3 s on boundaries, because trust detectors integrate a cadence window. Values marked ≈, and the exact second B's score crosses 0.60 after 2:15, are first **measured** by the A1 replay and then pinned. FRS FR-06 says B "snaps back" at 2:15. If the temporal window delays recovery past 2:20, the "still affected after moving" expectation flips, and the test must pin what the engine does, not change any beat.
- 0:45 – 1:14: B is `C` (WATCH), not affected, 0 episodes, trend `steady`. A to H have zero `affected_s`.
- 1:15 – 1:18:
  - B: `E`, gnss_lost, link_degraded, `area = 0.9`, `match_k = 6`.
  - D, E, H: gnss_lost.
  - B, D, E and H each open one episode, backdated to 1:15.
  - B: worst `E5` at 1:15, `match_onsets = 1`, trend `worsening`.
- 1:50: B moved 5 km. GNSS is back but it is still `E` (0.22), still affected (link). It reaches `moved: still_after_move, moved_km 5.0` at 1:50 + 30 s = 2:20 (checked at 2:20 only if still affected).
  - In the synthetic fixture B recovers at 2:15, so the "still" rule must **not** fire. The test pins that.
  - A second synthetic test keeps B jammed past 2:20 and asserts it does fire.
- 2:15 →:
  - All units are unaffected. B trend `recovering` from 2:25.
  - B's episode closes with end 2:14, after the 30 s exit at 2:45.
  - Totals at 4:25: B `degraded_s ≈ 60`, `gnss_lost_s ≈ 35`, `episodes = 1`. D/H `gnss_lost_s ≈ 60`. E `gnss_lost_s ≈ 60`.
- A and C: zero `affected_s`, zero episodes and trend `steady` at every beat, in **both** fixtures (K5).

## New interfaces

### Contracts — TS (`packages/contracts/src/unit-exposure.ts`, `emitter-trigger.ts`)

```ts
export const ExposureBandSchema = z.enum(['B', 'C', 'D', 'E', 'F']);
export const ExposureWindowSchema = z.object({
  affected_s: z.number().int().min(0), degraded_s: z.number().int().min(0),
  gnss_lost_s: z.number().int().min(0), stale_s: z.number().int().min(0),
  in90_s: z.number().int().min(0), in50_s: z.number().int().min(0),
  match_s: z.number().int().min(0), match_onsets: z.number().int().min(0),
  episodes: z.number().int().min(0),
}).strict();
export const UnitExposurePayloadSchema = z.object({
  schema: z.literal('unit-exposure/1'),
  source_id: z.string().min(1),
  computed_at: z.string().datetime(),
  window_start: z.string().datetime(),          // earliest data covered
  now: z.object({
    band: ExposureBandSchema, j: z.string().regex(/^[B-F][1-6]$/), score: z.number().min(0).max(1),
    affected: z.boolean(), gnss_lost: z.boolean(), gnss_lost_s: z.number().int().min(0),
    link_degraded: z.boolean(), area: z.union([z.literal(0.9), z.literal(0.5)]).nullable(),
  }).strict(),
  w15: ExposureWindowSchema, w60: ExposureWindowSchema,
  worst: z.object({ band: ExposureBandSchema, j: z.string(), score_min: z.number(), at: z.string().datetime() }).strict().nullable(),
  best_k: z.number().int().min(0).max(6),
  trend: z.enum(['worsening', 'steady', 'recovering']),
  episode: z.object({ open: z.boolean(), started_at: z.string().datetime().nullable() }).strict(),
  moved: z.object({ kind: z.enum(['still_after_move', 'again_after_move']), at: z.string().datetime(), moved_km: z.number().min(0) }).strict().nullable(),
  /** 60 cells oldest→newest: 15 min @ 15 s and 60 min @ 1 min. Char = worst band in the cell;
   *  uppercase = GPS fix held, lowercase = GPS fix lost in the cell; '-' = no data. */
  strip15: z.string().regex(/^[BCDEFbcdef-]{60}$/),
  strip60: z.string().regex(/^[BCDEFbcdef-]{60}$/),
}).strict();
export const UNIT_EXPOSURE_MAX_BYTES = 7168;

export const EmitterTriggerPayloadSchema = z.object({
  schema: z.literal('emitter-trigger/1'),
  state: z.enum(['idle', 'pending', 'open']),
  method_id: z.string().nullable(),
  matched: z.number().int().min(0).max(6), lead: z.number().int().min(0).max(6),
  thresholds: z.object({ open_matched: z.literal(5), open_lead: z.literal(2), hold_s: z.literal(3),
                         pending_matched: z.literal(3), pending_gps_units: z.literal(2) }).strict(),
  gps_lost: z.array(z.object({ source_id: z.string(), held_s: z.number().int().min(0) }).strict()),
  link_degraded: z.array(z.object({ source_id: z.string(), held_s: z.number().int().min(0) }).strict()),
  degraded_held: z.boolean(),
  estimate_id: z.string().nullable(),
  computed_at: z.string().datetime(),
}).strict();
```

Topics (`topics.ts` and contracts-rs `topics`):
- `TOPIC_EXPOSURE_PREFIX = 'integrity/exposure'` and `exposureTopic(id)`;
- `TOPIC_EMITTER_TRIGGER = 'integrity/emitter/trigger'`.

`DetectionKindSchema` gains `'emitter_trigger'` (pending start and end, open decision 7) and `'exposure'` (episode open and close). `ENGINE_KIND_LABEL` gets `emitter_trigger: 'est. pending'` and `exposure: 'interference exposure'`.

### Contracts — Rust (`packages/contracts-rs/src/lib.rs`)

Field-for-field mirrors: `UnitExposurePayload`, `ExposureWindow`, `ExposureNow`, `ExposureWorst`, `ExposureEpisode`, `ExposureMoved`, `ExposureBand`, `ExposureTrend`, `EmitterTriggerPayload`, `TriggerThresholds` and `TriggerUnit`. Every struct is `#[serde(deny_unknown_fields)]`. Add the `UNIT_EXPOSURE_MAX_BYTES` and `EMITTER_TRIGGER_SCHEMA` constants, and the `DetectionKind::EmitterTrigger` and `DetectionKind::Exposure` variants.

Fixtures, parsed by both the TS contracts test and a contracts-rs test:
- `packages/contracts/fixtures/exposure/unit-exposure.b115-unit_b.json`
- `…/unit-exposure.quiet-unit_c.json`
- `…/emitter-trigger.pending.json`, `…/emitter-trigger.open.json`
- `…/reject-position.json`: an exposure payload with `lat`, which must fail both parsers.

### Engine

```rust
// src/exposure/mod.rs (pure, clock-free)
pub struct ExposureConfig { pub entry_hold_ms: i64 /*3000*/, pub exit_hold_ms: i64 /*30000*/,
    pub trend_recent_ms: i64 /*120000*/, pub trend_prior_ms: i64 /*600000*/, pub trend_delta: f64 /*0.25*/,
    pub recovering_after_ms: i64 /*10000*/, pub move_km: f64 /*1.0*/, pub still_after_ms: i64 /*30000*/,
    pub publish_heartbeat_ms: i64 /*10000*/ }
pub struct UnitTick<'a> { pub view: &'a UnitView, pub score: f64, pub last_report_ms: i64, pub xy_km: (f64, f64),
    pub area: Option<f64>, pub match_k: u32 }
pub enum ExposureAction { Publish(Box<UnitExposurePayload>), CloseSegment(SegmentRow), Event(DetectionEvent) }
pub struct ExposureTracker { /* per unit: VecDeque<Segment>, open episode, last published */ }
impl ExposureTracker {
    pub fn new(cfg: ExposureConfig) -> Self;
    pub fn seed(&mut self, rows: &[SegmentRow], now_ms: i64);
    pub fn tick(&mut self, now_ms: i64, units: &[UnitTick]) -> Vec<ExposureAction>;
    pub fn latest(&self) -> impl Iterator<Item = &UnitExposurePayload>;
    pub fn history(&self, source_id: &str, from_ms: i64, now_ms: i64) -> Vec<Segment>; // open segment included
}
pub fn band(score: f64, stale: bool) -> ExposureBand;   // D7

// src/aoe/mod.rs (additions; trigger()/fires() untouched)
pub struct AoeConfig { /* … existing … */ pub pending_min_matched: u32 /*3*/, pub pending_min_gps_units: usize /*2*/ }
impl AoeTracker {
    pub fn active_estimate(&self) -> Option<&Estimate>;               // Active phase, not unbounded
    pub fn status(&self, reading: Option<&TriggerReading>, units: &[UnitView], now_ms: i64) -> TriggerStatus;
}
pub struct TriggerStatus { pub state: TriggerState, pub reading: Option<TriggerReading>,
    pub gps_lost: Vec<(String, i64)>, pub link_degraded: Vec<(String, i64)>, pub estimate_id: Option<String> }
pub fn trigger_payload(s: &TriggerStatus, cfg: &AoeConfig, now_ms: i64) -> EmitterTriggerPayload;
// src/aoe/inputs.rs
pub fn gnss_lost_held_ms(u: &UnitView, now_ms: i64) -> Option<i64>;

// src/scores.rs (extracted from publish_one_tick; numbers unchanged)
pub fn compute(snapshot: &EngineState, weights: &AggregatorWeights, library: &[FingerprintEntry],
               radius_m: f64, now: DateTime<Utc>) -> Vec<ScoredSource>; // payload + ranked candidates per source

// crates/transport: log.rs
//   CREATE TABLE unit_exposure_segments(source_id, ts_start, ts_end, band, gnss_lost, link_degraded, area_level, match_k, score_min)
//   append_exposure_segment(&SegmentRow), exposure_segments_since(DateTime) -> Vec<SegmentRow>
// crates/transport: mqtt.rs
//   publish_unit_exposure(&UnitExposurePayload) (retained, QoS 0, encode guard ≤ 8192 error / > 7168 warn)
//   publish_emitter_trigger(&EmitterTriggerPayload) (retained, QoS 0)
// crates/server: lib.rs
//   AppState { log, exposure: Arc<std::sync::RwLock<ExposureView>> }
//   GET /api/exposure, GET /api/units/:id/exposure, GET /api/units/:id/exposure/history?minutes=15|60
```

The history response is `{ source_id, from, to, segments: [{ from, to, band, gnss_lost, link_degraded, area, match_k }] }`, with no positions. It is capped at 60 min, and `minutes` is clamped to 15 or 60.

**Tick order in `ticker.rs`.**
1. `scores::compute`, then publish the trust and candidates exactly as today.
2. `unit_views` once.
3. `AoeTracker::tick`, then publish and log as today.
4. `AoeTracker::status`, then publish the trigger (cadence D11) and log pending transitions.
5. Build the `UnitTick`s (score, area from `active_estimate()`, match_k), then `ExposureTracker::tick`, then execute its actions (publish, segment rows, events), then update `AppState.exposure`.

Step 5 runs after the AoE tick, so `area` uses the estimate as published on that tick.

### Web

```ts
// src/lib/exposure.ts (pure; node --test)
export const ROLE_POOLS: Readonly<Record<DependencyRole, readonly string[]>>;
export const UNIT_SHORT: Readonly<Record<string, string>>;   // 'unit_f' → 'Battery 2', 'unit_c' → 'OBS C (radar)'…
export type ExposureSort = 'exposure' | 'rating' | 'name';
export function sortExposure(rows: UnitExposurePayload[], by: ExposureSort): UnitExposurePayload[];
export function summaryLine(rows: UnitExposurePayload[]): string;            // collapsed header text
export function rowCells(p: UnitExposurePayload): { unit: string; now: string; affected15: string; affected60: string; episodes: string; trend: string };
export function stripCells(strip: string): { band: 'B'|'C'|'D'|'E'|'F'|null; gnssLost: boolean }[];
export function focusLines(p: UnitExposurePayload): { key: string; text: string }[];   // worst, GPS, areas, match, moved
export function altHint(ms: MissionState, exposure: Record<string, UnitExposurePayload>, tracks: Record<string, TrackState>, table: TssTable): { source_id: string; text: string } | null;
export function isExposureStale(p: UnitExposurePayload, nowMs: number): boolean; // > 30 s since computed_at (aligned clocks)

// src/lib/emitter-trigger.ts (pure)
export function pendingCue(p: EmitterTriggerPayload | null): { text: string; announce: string } | null;
//  pending + matched ≥ 3:  "Jammer match 4/6 · GPS lost at B (2 s) · estimate pending"
//  pending + matched < 3:  "GPS lost at D, E (4 s) · jammer match 2/6 · no estimate yet"
//  idle / open / null:     null.  `announce` omits seconds (live-region text changes only on state/match/unit-set change)

// src/lib/emitter-estimate.ts (additions)
export function openReason(p: EmitterEstimatePayload): string;           // "GPS lost at B, D, E, H · jammer match 6/6"
export function openedAtMs(e: EstimateEntry, nowMs: number): number;     // from estimate_id when aligned, else firstSeenMs
export const OPEN_REASON_LABEL_MS = 30_000;
// mapLabel(...) returns `Est. GPS denial opened · ${openReason}` while nowMs − openedAtMs < 30 s and state === 'active'
// terminalLine('opened', …) → `Est. GPS denial opened · ${openReason} · ${cls} · ${inside}`
// EstimateEntry gains firstSeenMs (kept across receives of the same estimate_id in reduceEstimate)

// store/hamilton.ts additions
exposure: Record<string, UnitExposurePayload>;  receiveExposure(p): void;
emitterTrigger: EmitterTriggerPayload | null;   receiveEmitterTrigger(p): void;
```

## UI

### Interference by unit (`components/exposure/ExposureSection.tsx`, `ExposureTable.tsx`, `ExposureStrip.tsx`)

- **Header.** A `<button aria-expanded aria-controls="exposure-table">` holding the summary line. It is mono micro, `--text-secondary` on `--surface-panel`, with a 1 px `--surface-elevated` top border, like the queue header.
- **Table.** A native `<table>` with `<caption class="sr-only">Interference exposure by unit</caption>`.
  - Columns: **Unit** · **Now** (J + name, e.g. "E5 UNRELIABLE"; the band token is the colour, **plus** the text) · **15-min strip** · **Affected 15 / 60 min** · **Ep.** · **Trend** ("↗ worsening" / "→ steady" / "↘ recovering": arrow **and** word).
  - Sortable headers are `<button>`s with `aria-sort`. The default sort is by exposure (`w60.affected_s` desc, then worst band). A 15 / 60 min toggle switches the strip resolution.
- **Strip.** 60 cells, each a 4 px × 12 px SVG rect. Never colour alone:
  - **Height** encodes the band: B 3 px, C 6 px, D 9 px, E 12 px, F full height in hatch.
  - **Colour**: `--trust-nominal` / `--trust-watching` / `--trust-degraded` / `--trust-failed-stroke` / `--trust-stale` (rating tokens are the only colours a rating may use).
  - A GPS-lost cell gets a 2 px `--text-primary` underline tick.
  - No-data cells are `--surface-elevated` outlines.
  - Each strip has an `aria-label` text summary, e.g. "Last 15 min: affected 1 min 0 s, GPS fix lost 35 s, worst E5".
- **Row.** The whole row is a `<button>` cell spanning the unit name and calling `selectSource(id)`. The selected row has `aria-current="true"` and a 2 px left rule in `--text-primary`. No phosphor.
- **Empty and stale states.**
  - No payloads: "Interference exposure: awaiting engine".
  - Any payload over 30 s old: the header adds "· data 45 s old" in `--text-tertiary`.
- **Copy.** The tooltip text is D8's. "Exposure", "affected" and "GPS fix lost" only.

### Focused history (`components/exposure/ExposureFocus.tsx`, inside `TrustPanel`)

- **Heading.** "Interference exposure · last 15 min" with a 15/60 toggle.
- **Timeline.** A second-resolution SVG bar from `GET /api/units/{id}/exposure/history`, fetched on focus change and every 5 s while focused. If the fetch fails, it falls back to `strip15`. Episodes are drawn as brackets above the bar, labelled "Ep 1 · 1842Z–1843Z".
- **Lines** (`focusLines`):
  - `Worst: E5 at 1842Z (0.13)`
  - `GPS fix lost: 35 s / 15 min · 35 s / 60 min`
  - `In est. GPS denial area: 90% 60 s · 50% 60 s`
  - `Jammer match ≥ 5/6: 1 onset · 60 s (best 6/6)`
  - `Still affected after moving 5 km` / `Affected again after moving 1.5 km`
  - `Coverage since 1841Z` (when under the window)
- No positions, no bearings, no map interaction.

### Alternatives hint (`components/exposure/AltUnitHint.tsx`, rendered by `MissionRow`)

- Shown only under `showBranches`. One mono micro line in `--text-secondary`, prefixed "Less exposed (FDC decides):".
- The unit name is a `<button>` that calls `selectSource`. It has `data-testid="fm-alt-{mission_id}"`.
- It is included in the row's `aria-label` tail: ". Less exposed unit: OBS C (radar), B2, 0 of 60 minutes affected."
- No key, no `role="button"` styling as a branch, no gating colour.

### Pending cue and reason (`components/cop/AoeKey.tsx` `AoePendingPlate`, rendered by `SpineOverlay`)

- **Placement.** It shows only when `pendingCue` is non-null **and** there is no active estimate. It is the same `plate` style as the AoE label, anchored where `AoeKey` sits, with `data-testid="aoe-pending"`.
- **Look.** A dashed 1 px left border in the AoE civil hue (`AOE_RGB.gnss_civil`), so it reads as "not an area yet". No fill, no pulse, no animation beyond a 120 ms opacity in (none under reduced motion).
- **a11y.** `role="status"` and `aria-live="polite"` on a visually hidden span carrying `announce`. The visible seconds counter is `aria-hidden`, so a screen reader isn't spammed at 1 Hz.
- **Reason.** It reaches the map through `mapLabel` and the terminal through `terminalLine`. No new component.

## Admin demo-view registry (additions to `src/lib/demo-view.ts`)

| Group | Id | Component · file | Panel label | Parent |
|---|---|---|---|---|
| Map | `map.aoePending` | `AoePendingPlate` · `cop/AoeKey.tsx` | Est. GPS denial pending cue | — |
| Side | `side.exposure` | `ExposureSection` · `exposure/ExposureSection.tsx` | Interference by unit | — |
| Side | `side.exposureFocus` | `ExposureFocus` · `exposure/ExposureFocus.tsx` | Unit interference history | `side.trustPanel` |
| Side | `side.altHint` | `AltUnitHint` · `exposure/AltUnitHint.tsx` | Less-exposed unit hint | `side.missionQueue` |

The reason text is covered by `map.aoeLabel` and `log.terminal`, and the fade by `map.aoeArea`. They don't get their own ids.

`layoutFor` must treat `side.exposure` as a top-level side block. The side column hides only when `side.missionQueue`, `side.exposure` **and** `side.trustPanel` are all hidden.

Preset updates:

| Preset | Adds to hidden |
|---|---|
| `cleanMap` | `side.exposure`, `map.aoePending` (without `side.exposure` the side column would no longer hide) |
| `firesOnly` | `side.exposure`, `map.aoePending` (`side.altHint` stays: it is fires context) |
| `trustOnly` | none (`side.altHint` is already hidden with the queue) |
| `aoeFocus` | `side.exposure`, `side.exposureFocus` |

`demo-view.test.ts` already checks that the registry is consistent. It gains assertions that `cleanMap` still gives `sideColumn: false`, and that copy-lint covers the new labels.

## Existing patterns to follow

- **Pure clock-free engine module with a replay test:** `services/trust-engine/src/aoe/mod.rs` + `aoe/tests.rs` (`replay`, `ms(t)`, `check_lifecycle`).
- **Action list executed by the ticker:** `AoeAction` → `execute_aoe` / `record_aoe` in `src/ticker.rs`.
- **DuckDB table plus an in-memory round-trip test:** `crates/transport/src/log.rs` `emitter_estimates` and `round_trips_emitter_estimate_rows_and_events`.
- **Wire size guard:** `crates/transport/src/mqtt.rs` `encode_emitter_estimate`.
- **Strict contract mirror:** `EmitterEstimatePayload` (TS `emitter-estimate.ts` / RS `deny_unknown_fields`), fixtures in `packages/contracts/fixtures/aoe/`, and the test `packages/contracts/test/aoe-contracts.test.mjs`.
- **axum route plus state:** `crates/server/src/lib.rs` `list_events`.
- **Pure web lib with a node test:** `src/lib/emitter-estimate.ts` + `emitter-estimate.test.ts` (fake clock), using the `// @ts-ignore TS5097` `.ts` import idiom from `camera-fit.test.ts`.
- **Store reducer for a retained topic:** `receiveEmitterEstimate` / `clearEmitterEstimate` in `store/hamilton.ts`; the MQTT dispatch in `lib/mqtt-client.ts`.
- **Hide-not-unmount slot:** `components/admin/DemoSlot.tsx`.
- **Mono micro row styling and the row a11y label:** `components/fires/MissionRow.tsx`.
- **Screen-space plate on the map:** `AoeScreen` `plate` in `components/cop/AoeKey.tsx`.
- **Reduced motion:** `hooks/usePrefersReducedMotion.ts`.
- **Story seeding:** `parameters.hamilton` → `seedHamilton` (`src/stories/support/mocks.tsx`); the play test in `src/stories/pages/CopPage.stories.tsx` `CrescendoReplay`.

## Implementation steps and lanes

Each lane owns a disjoint set of files. Lane 0 freezes the interfaces. After it merges, lanes A–D run in parallel, and lane E joins them.

```
L0 (interfaces) ──┬── A (engine: exposure + transport + server + ticker) ──┐
                  ├── B (engine: aoe trigger status + reason)  ───────────┤── E (join: pages, live check, docs)
                  ├── C (web: exposure UI + alt hint)        ─────────────┤
                  └── D (web: reason, pending cue, fade)     ─────────────┘
```

A calls B's `AoeTracker::status` / `trigger_payload` / `active_estimate` / `gnss_lost_held_ms`. Their signatures are frozen above. A can stub them until B lands, or B lands first, since it is small.

### Lane 0 — interface freeze (serial, ≈ 0.75 d)

1. **Contracts.**
   - Change: create `packages/contracts/src/unit-exposure.ts` and `emitter-trigger.ts`.
   - Change: edit `topics.ts`, `index.ts` and `detection-event.ts`, and mirror all of it in `packages/contracts-rs/src/lib.rs`.
   - Change: add the fixtures under `packages/contracts/fixtures/exposure/` and `fixtures/rating-bands.json`.
   - Change: extend `packages/contracts/test/aoe-contracts.test.mjs` (or add `exposure-contracts.test.mjs`) and add a contracts-rs `#[cfg(test)]` round-trip.
   - Check: `pnpm --filter @hamilton/contracts test` and `cargo test -p hamilton-contracts` pass, and `reject-position.json` fails both parsers.
2. **Web interface.**
   - Change: in `src/lib/demo-view.ts` (+ test), add the 4 ids, presets and the `layoutFor` rule.
   - Change: in `src/store/hamilton.ts`, add `exposure` / `receiveExposure` and `emitterTrigger` / `receiveEmitterTrigger`, and `firstSeenMs` on `EstimateEntry` (set in `reduceEstimate`).
   - Change: in `src/lib/mqtt-client.ts` and `src/hooks/useHamiltonMqtt.ts`, subscribe to `integrity/exposure/+` and `integrity/emitter/trigger`, zod-parse, and dispatch.
   - Change: in `src/stories/support/mocks.tsx`, seed defaults.
   - Check: web typecheck and test pass; the existing 114+ tests stay green.

### Lane A — engine exposure (≈ 2.5 d)

Files: `services/trust-engine/src/scores.rs` (new), `src/exposure/{mod.rs,tests.rs}` (new), `src/ticker.rs`, `src/main.rs`, `crates/transport/src/{log.rs,mqtt.rs,lib.rs}`, `crates/server/src/lib.rs`.

- **A1. Extract `scores::compute`** from `publish_one_tick`. It is pure and returns the payloads plus the ranked candidates, and the publish loop consumes it.
  - Check: a new test replays the synthetic fixture and pins B at 0.13 ± 0.005 (1:15) and 0.22 ± 0.005 (1:50), with A and C ≥ 0.85 throughout. The existing tests stay green, and `--trust` output on the live stack is unchanged.
- **A2. `exposure::band` plus the rating-bands fixture test.**
  - Check: the test reads `packages/contracts/fixtures/rating-bands.json`.
- **A3. `ExposureTracker`:** segments, windows, episodes (D3), worst, match, trend, after-move, strips, and the payload builder.
  - Check: the unit tests in `exposure/tests.rs` (see Testing).
- **A4. Transport.** The `unit_exposure_segments` table, `append_exposure_segment`, `exposure_segments_since`, `publish_unit_exposure` (with a size guard) and `publish_emitter_trigger`.
  - Check: the in-memory DuckDB round trip, and an encode-guard test on a worst-case payload.
- **A5. Server.** `AppState.exposure` and the three GET routes.
  - Check: axum `oneshot` tests return 200 with JSON for a known unit, 404 for an unknown one, `minutes` clamped, and no `lat` in any body.
- **A6. Wiring.**
  - `ticker.rs` follows the tick order above: publish the trigger with its D11 cadence and execute the exposure actions.
  - `main.rs` seeds the tracker from `exposure_segments_since(now − 60 min)` unless `TRUST_ENGINE_EXPOSURE_SEED=0`.
  - Check: on the live stack, `mosquitto_sub -t 'integrity/exposure/#' -v -C 8` shows 8 retained payloads, and `curl :8081/api/exposure` returns 8.

### Lane B — engine AoE trigger status and reason (≈ 0.75 d)

Files: `services/trust-engine/src/aoe/{mod.rs,inputs.rs,tests.rs}` only.

- **B1.** Add `gnss_lost_held_ms`, `AoeConfig.pending_*`, `TriggerStatus`, `AoeTracker::status`, `trigger_payload` and `active_estimate`. Leave `trigger()` and `fires()` untouched.
  - Check: the trigger tests below, plus every existing `aoe/tests.rs` test unchanged and green (the open tick stays 75).
- **B2.** In `transition_event`, the Open message and `values` gain the reason (`gps_lost`, `matched`). Add a `pending_event(status)` helper for the `emitter_trigger` rows.
  - Check: a test asserts the open message contains `GPS lost at unit_b, unit_d, unit_e, unit_h · jammer match 6/6`.

### Lane C — web exposure UI (≈ 2.25 d)

Files:
- new: `src/lib/exposure.ts` (+ `exposure.test.ts`), `src/components/exposure/{ExposureSection,ExposureTable,ExposureStrip,ExposureFocus,AltUnitHint}.tsx` (+ `Exposure.stories.tsx`), `src/stories/fixtures/exposure.ts`;
- modified: `app/page.tsx` (slot `side.exposure`), `components/panel/TrustPanel.tsx` (slot `side.exposureFocus`), `components/fires/MissionRow.tsx` (slot `side.altHint`), `src/lib/display-names.ts` (`UNIT_SHORT` if not kept in `exposure.ts`), `src/lib/engine-api.ts` (path union), `app/engine/api/[...path]/route.ts` (allowlist `exposure`, `units/<id>/exposure`, `units/<id>/exposure/history`, matched by regex `^units/unit_[a-z]+/exposure(/history)?$`).

- **C1. `lib/exposure.ts` plus tests.**
  - Check: `pnpm --filter @hamilton/web test`.
- **C2. Section, table and strip,** wired into `page.tsx`.
  - Check: the Storybook `Exposure/Section` stories render, and the collapsed line matches `summaryLine`.
- **C3. Focus block** in `TrustPanel`, with the history fetch and the strip fallback.
  - Check: a story with a mocked fetch; clicking a row changes the Trust panel heading.
- **C4. `AltUnitHint`** in `MissionRow`.
  - Check: the `Fires/MissionQueue › FailWithAlternative` story shows `fm-alt-AB1001` reading "OBS C (radar) — B2 · 0 of 60 min affected"; no new key handler (grep).

### Lane D — web AoE context (≈ 1.25 d)

Files:
- new: `src/lib/emitter-trigger.ts` (+ test);
- modified: `src/lib/emitter-estimate.ts` (+ test), `src/hooks/useEmitterEstimate.ts`, `src/components/cop/AoeKey.tsx`, `src/components/cop/SpineOverlay.tsx`, `src/components/cop/CesiumSpine.tsx`, `src/components/cop/MapSpine.tsx`, the AoE stories in `CesiumSpine.stories.tsx` / `MapSpine.stories.tsx`, and `src/stories/fixtures/aoe-trigger.ts` (new).

- **D0 (spike, 0.25 d). Confirm the fade bug.** On :3001 (Cesium default) and with `NEXT_PUBLIC_RENDERER=maplibre` in Storybook, sample the AoE fill alpha every 16 ms for 600 ms after an open, using puppeteer `page.evaluate`: the Cesium entity's material colour alpha times the visible state, or a canvas pixel read at a known fill point.
  - Check: a note in the PR saying whether each renderer showed intermediate alphas. If MapSpine already animates, D3 touches Cesium only.
- **D1.** `openReason`, `openedAtMs`, the `mapLabel` reason window and the `terminalLine` open text.
  - Check: unit tests on fixture `emitter-estimate.b115.json` (reason `GPS lost at B, D, E, H · jammer match 6/6`); the label reverts at 30 s; stale and unbounded labels are unchanged.
- **D2.** `pendingCue` and `AoePendingPlate`, shown through `SpineOverlay` when no estimate is active.
  - Check: unit tests (thresholds, 1/6 → null, text forms, `announce` stable across seconds); the stories `COP/MapSpine › Pending` and `COP/CesiumSpine › Pending`.
- **D3.** `useAoeFade(key, reducedMotion, ready)` and Cesium readiness from `postRender` / `dataSourceDisplay.ready`.
  - Check: the D0 sampler shows ≥ 5 intermediate alpha values on both renderers; reduced motion gives alpha 1 on the first drawn frame; a demo-view toggle never replays the fade.

### Lane E — join (≈ 0.75 d, after A–D)

- **E1. Stories.**
  - Change: in `src/stories/pages/CopPage.stories.tsx`, add `ExposureAndAlternative`: the crescendo with exposure fixtures, asserting `fm-alt-AB1001` after FAIL; clicking it focuses OBS C.
  - Change: add `AoeOpensWithReason`, asserting the label text at open.
- **E2. Docs.**
  - Change: in `docs/System Design.md`, add §5.5 `integrity/exposure/{id}` and §5.6 `integrity/emitter/trigger`, plus a §4 traceability row.
  - Change: in `docs/FRS.md`, add a short "context only, no TSS effect" note under FR-07, without renumbering.
- **E3.** The live check (Testing) and the gate run.

## Testing strategy

### Rust (`cargo test --workspace`; `cargo clippy --workspace -- -D warnings`; `cargo fmt --all -- --check`)

`src/exposure/tests.rs`, unit level, with a fake clock and synthetic `UnitTick`s:
- **Entry hysteresis.** Affected 2 s gives no episode, but `affected_s` = 2. Affected 3 s gives one episode, backdated.
- **Exit hysteresis.** A 29 s gap keeps one episode; a 30 s gap makes two. A stale stretch inside an episode doesn't close it, and its seconds count as `stale_s`, not `affected_s`.
- **Windows.** A segment straddling `now − 15 min` is clipped exactly. `window_start` reports coverage under 60 min.
- **Worst.** The lowest band wins, `at` is the first second reached, and F never counts as worst.
- **Match.** Onsets count rising edges of `match_k ≥ 5`; 4/6 never counts.
- **Trend.** One table-driven case each for worsening (new episode, band drop, fraction rise), recovering (10 s quiet) and steady.
- **After-move.** "Still" fires at +30 s after a 1.0 km displacement while affected. It doesn't fire if the unit recovers first (the 2:15 case). "Again" fires when a new episode opens ≥ 1 km from the previous one's start. The distance is rounded to 0.5 km. The payload has no direction field.
- **Strips.** Lowercase marks GPS loss, `-` marks before coverage, and the worst band per cell is used.
- **Payload.** It round-trips strictly through `UnitExposurePayload`, its serialised size is under 7168 B (assert < 2048 B), and it contains no `"lat"`, `"lon"` or `"bearing"`.
- **Seed.** `seed(rows)` followed by `tick` reproduces the windows of an uninterrupted run (±1 s), with a no-data gap.

Integration, replaying both fixtures through `apply_payload` → `scores::compute` → `unit_views` → `AoeTracker` → `ExposureTracker`, in `exposure/tests.rs` using the `aoe/tests.rs` helpers (make `replay` / `beats` / `ms` `pub(crate)` in a shared `test_support` module):
- **Pinned beats** 0:45 / 1:15 / 1:50 / 2:15 per "Pinned demo values" above (synthetic exact; recorded: B, A and C only).
- **A and C** are unaffected at every second in both fixtures.
- **Determinism.** Two runs of the same fixture give byte-identical sequences of serialised exposure and trigger payloads.
- **TSS and trust untouched.** B's score at 1:15 and 1:50 equals the pre-refactor values (A1), and the `aoe/tests.rs` open tick is still 75.

`src/aoe/tests.rs`, trigger status:
- **Both fixtures.** `idle` at every t < 75 (the pinned demo shows no pending cue), `open` from 75 to 254, `idle` from 255.
- **Synthetic.** 4/6 with lead 1 → `pending`. 2/6 plus two units with GPS lost ≥ 3 s → `pending`. 2/6 plus one unit GPS lost → `idle`. 1/6 plus link-degraded only → `idle`. 6/6 with lead 2 and degraded held → `open`, on the same tick as `AoeAction::Publish(Open)`.
- **Shared GPS state.** `status().gps_lost` ids equal the exposure units with `now.gnss_lost` on the same tick.
- **Payload.** The trigger payload round-trips and is < 1024 B.
- **Reason.** The open `events` message contains the reason, and `values.gps_lost == ["unit_b","unit_d","unit_e","unit_h"]`.

`crates/transport`: the segments table round trip, plus encode guards for exposure and trigger.

`crates/server`: the route tests (A5).

### Web (`pnpm --filter @hamilton/web test`; only `src/lib/*.test.ts` runs)

`src/lib/exposure.test.ts`:
- `sortExposure` orders and breaks ties.
- `summaryLine` and `rowCells` text.
- `stripCells` decodes the format.
- `focusLines` wording.
- `altHint`:
  - picks OBS C for AB1001 at the 1:15 fixture;
  - excludes dependencies, affected, stale and below-minimum units;
  - returns null when nothing qualifies;
  - uses the firing-unit pool for `firing_unit_nav`;
  - never offers G.
- `isExposureStale`.
- **Copy lint** over every produced string:
  - no `/\btarget(ed|ing)?\b/i` except mission "target" fields (none in exposure);
  - no `/(FR|UR|HS|NFR)-\d|§/`;
  - no `/GPS clear|window open|near the jammer|bearing/i`.
- `ROLE_POOLS` and `UNIT_SHORT` cover `unit_a`–`unit_h`.

`src/lib/emitter-trigger.test.ts`: `pendingCue` for each state and threshold, `announce` unchanged when only `held_s` changes, and the same copy lint.

`src/lib/emitter-estimate.test.ts` (additions):
- `openReason` on b115;
- `mapLabel` reason within 30 s and the normal label after;
- the `openedAtMs` id parse versus `firstSeenMs` for skewed fixtures;
- `terminalLine('opened')` text;
- `firstSeenMs` kept across same-id receives and reset on a new id.

`src/lib/link-trust-rating.test.ts`: `LINK_TRUST_SCALE` mins equal `fixtures/rating-bands.json`.

`src/lib/demo-view.test.ts`: the new ids, parents, presets and the `layoutFor` three-block rule.

### Storybook (play tests)

- `Exposure/Section`:
  - Collapsed and Expanded.
  - SortByRating.
  - Stale (with the "data 45 s old" text).
  - Play test: expand by Enter, check `aria-expanded`, sort by a header click and check `aria-sort`, click the B row and check `selectedSource`.
- `Exposure/Focus`: B at 1:15, B at 2:30 (recovering, "still affected after moving" absent), C quiet, and a history-fetch failure that falls back to the strip.
- `Fires/MissionQueue › FailWithAlternative`: the hint text; no new keyboard handler (pressing 5 does nothing).
- `COP/MapSpine` and `COP/CesiumSpine › Pending`: the plate text, `role=status`, no polygon drawn.
- `COP/MapSpine` and `COP/CesiumSpine › OpenReason`: the label starts "Est. GPS denial opened · GPS lost at B, D, E, H · jammer match 6/6".
- `Pages/COP › ExposureAndAlternative`, and `DemoPresets` updated for the new ids. `cleanMap` must still give a full-width map.

### Live check on :3001 (read-only against the running stack; puppeteer-core as in `admin-demo-menu.md`; script in `/tmp`)

1. `curl -s localhost:8081/api/exposure | jq length` gives 8. `curl localhost:8081/api/units/unit_b/exposure/history?minutes=15` returns segments with no `lat`.
2. `docker exec hamilton-consolidated-mqtt mosquitto_sub -t 'integrity/exposure/#' -C 8 -W 10 -v` gives 8 retained messages, each < 2 KB. `… -t integrity/emitter/trigger -C 1 -W 10` gives one retained message.
3. Through a scenario run:
   - before 1:15 the trigger reads `idle`;
   - at 1:15 the label shows the reason for 30 s, and the terminal open line has the reason;
   - the fade sampler shows intermediate alphas on Cesium;
   - after the open, the B row shows E5 and episodes 1, and AB1001 shows `fm-alt-AB1001` naming OBS C;
   - clicking it focuses OBS C in the Trust panel.
4. Reload mid-run: the exposure table and trigger state reappear at once (retained).
5. `?admin=1`: toggle each new id and check that `cleanMap` still gives a full-width map.
6. No console errors. A screenshot at 1:15 and 2:30.

Don't restart or kill the live stack. Exposure from earlier runs may already be in its 60-min window (see Risks).

### Gates

- `pnpm --filter @hamilton/contracts build && pnpm --filter @hamilton/contracts test`
- `pnpm --filter @hamilton/web typecheck && pnpm --filter @hamilton/web test`
- `scripts/lint-phosphor.sh`
- `cargo fmt --all -- --check && cargo clippy --workspace -- -D warnings && cargo test --workspace`

## Effort

| Item | Days |
|---|---|
| Lane 0: contracts, registry, store and MQTT | 0.75 |
| Lane A: engine exposure, transport, server, wiring | 2.5 |
| Lane B: engine trigger status and reason | 0.75 |
| Lane C: web exposure UI and alt hint | 2.25 |
| Lane D: reason, pending cue, fade (incl. 0.25 spike) | 1.25 |
| Lane E: join, stories, docs, live check | 0.75 |
| **Feature 1 total** | ≈ 6 d (0.5 of L0 + A + C + 0.5 of E) |
| **Feature 2 total** | ≈ 2.5 d (0.25 of L0 + B + D + 0.25 of E) |
| **Wall clock with 4 parallel lanes** | ≈ 4 d (0.75 + 2.5 + 0.75) |

## Files

**Create:**
- `packages/contracts/src/unit-exposure.ts`
- `packages/contracts/src/emitter-trigger.ts`
- `packages/contracts/fixtures/exposure/*.json`
- `packages/contracts/fixtures/rating-bands.json`
- `packages/contracts/test/exposure-contracts.test.mjs`
- `services/trust-engine/src/scores.rs`
- `services/trust-engine/src/exposure/mod.rs`
- `services/trust-engine/src/exposure/tests.rs`
- `services/trust-engine/src/test_support.rs` (shared replay helpers)
- `apps/web/src/lib/exposure.ts`, `exposure.test.ts`
- `apps/web/src/lib/emitter-trigger.ts`, `emitter-trigger.test.ts`
- `apps/web/src/components/exposure/ExposureSection.tsx`
- `apps/web/src/components/exposure/ExposureTable.tsx`
- `apps/web/src/components/exposure/ExposureStrip.tsx`
- `apps/web/src/components/exposure/ExposureFocus.tsx`
- `apps/web/src/components/exposure/AltUnitHint.tsx`
- `apps/web/src/components/exposure/Exposure.stories.tsx`
- `apps/web/src/stories/fixtures/exposure.ts`
- `apps/web/src/stories/fixtures/aoe-trigger.ts`

**Modify:**
- `packages/contracts/src/{topics,index,detection-event}.ts`
- `packages/contracts-rs/src/lib.rs`
- `services/trust-engine/src/{main,ticker}.rs`
- `services/trust-engine/src/aoe/{mod,inputs,tests}.rs`
- `services/trust-engine/crates/transport/src/{log,mqtt,lib}.rs`
- `services/trust-engine/crates/server/src/lib.rs`
- `apps/web/app/page.tsx`
- `apps/web/app/engine/api/[...path]/route.ts`
- `apps/web/src/store/hamilton.ts`
- `apps/web/src/lib/{mqtt-client,engine-api,demo-view,demo-view.test,emitter-estimate,emitter-estimate.test,link-trust-rating.test,display-names}.ts`
- `apps/web/src/hooks/{useHamiltonMqtt,useEmitterEstimate}.ts`
- `apps/web/src/components/panel/TrustPanel.tsx`
- `apps/web/src/components/fires/MissionRow.tsx`
- `apps/web/src/components/cop/{AoeKey,SpineOverlay,CesiumSpine,MapSpine}.tsx` and their AoE stories
- `apps/web/src/stories/support/mocks.tsx`
- `apps/web/src/stories/pages/CopPage.stories.tsx`
- `apps/web/src/components/fires/MissionQueue.stories.tsx`
- `docs/System Design.md`, `docs/FRS.md` (notes only)

## Risks and mitigations

- **The pending cue is invisible in the pinned demo.** This is by design: RF and GNSS loss both arrive at 1:15, and the beats can't change. A presenter could be disappointed. Mitigations:
  - Say so in the demo notes.
  - Show it in Storybook.
  - Optionally add a non-pinned `avdiivka_ramp` sim scenario (open decision 6).
- **The `scores::compute` extraction shifts a pinned value.** Mitigations: it is a pure move, with A1's pin test written **before** the refactor and run on both sides of it, and `aoe/tests.rs` untouched.
- **Rehearsals pile up in the 60-min window.** The engine stays up while the sim reruns the scenario, so B shows "3 episodes / 60 min" by the third run. That is truthful, but it muddies the demo. Mitigations:
  - `TRUST_ENGINE_EXPOSURE_SEED=0` plus an engine restart between rehearsals, documented.
  - The UI says "since HHMMZ".
  - A reset control is out of scope, because it would be a data-changing admin control (admin plan D1).
- **Exposure is read as a jammer locator.** Mitigations:
  - D8: no positions in payload or storage, no map layer, no direction, distance only.
  - Engine and web tests reject position keys, and copy lint bans "near the jammer" and "bearing".
- **"Targeted" or intent creeps into copy.** Mitigations: copy-lint tests on every string function, plus review of the stories.
- **The alternatives hint is read as a command.** Mitigations: "(FDC decides)", text only, no key, no branch styling, shown only on gated FAIL rows; the "never a fire command" ethos is in its header comment.
- **The side column gets crowded during a FAIL.** Mitigations: collapsed by default (one line), the shared scroll container, and an Admin preset to hide it.
- **The Cesium readiness signal is flaky** (`dataSourceDisplay.ready` toggles while other entities load). Mitigations: latch on the first ready frame *after* the overlay rebuild for that estimate id, with a 1 s timeout fallback that starts the fade anyway.
- **Broker load.** Eight units at ≤ 1 Hz × ~1.1 KB, plus the trigger at 1 Hz only while pending: negligible against today's trust stream.
- **DuckDB contention** between the tick writes and the HTTP history reads. Mitigations: segment writes are rare (on change only), history queries are bounded to 60 min and indexed on `(source_id, ts_end)`, and the same mutex pattern as `events` is used.
- **Clock skew in fixtures** (2024 timestamps in Storybook). Mitigations: the exposure stale check and `openedAtMs` use the existing `clocksAligned` rule from `emitter-estimate.ts`.

## Open decisions (for the user; defaults recommended)

1. **Where the table lives.** Default: **a collapsible "Interference by unit" section between the queue and the Trust panel, collapsed by default**, with the focused history inside the Trust panel. Alternatives: a Trust-panel tab, or a terminal-row tab.
2. **What counts as "affected".** Default: **D4/E5 or GPS fix lost; STALE counted separately.** Alternative: rating only.
3. **Episode hysteresis.** Default: **3 s in / 30 s out.**
4. **Trend rule.** Default: **as defined** (120 s recent vs the 8 min before; recovering after 10 s quiet).
5. **Alternatives hint.** Default: **one unit, same role pool, must meet the TSS minimum now, hidden when none qualifies, shown only on gated FAIL rows.** Alternatives: show two, or show "no less-exposed unit" explicitly.
6. **Pending cue in the demo.** Default: **leave the pinned scenario alone, so the cue shows only in real use and in Storybook.** Option: add a separate non-pinned `avdiivka_ramp` sim scenario in which the GNSS module ramps up over 20 s before 1:15 (≈ 0.5 d, sim only, never the default).
7. **Log pending transitions to the after-action record** (new `emitter_trigger` kind). Default: **yes**, one row at pending start and one at its end, not per second.
8. **Seed exposure from DuckDB on engine restart.** Default: **yes**, with `TRUST_ENGINE_EXPOSURE_SEED=0` to start clean for rehearsals.
9. **How long the map label shows the open reason.** Default: **30 s**, then the normal label. The terminal keeps it permanently.
10. **Strip resolution in the table.** Default: **15 min at 15 s per cell, with a 60-min (1 min per cell) toggle.** The demo is about 4 min, so a 60-min-only strip would show 4 cells.
11. **Exposure effect on TSS.** Default: **none.** It stays context only, per D4.
12. **Fade length.** Default: **keep 300 ms (FR-06a (5)) and fix when it starts.** Changing the length would need an FRS edit.

## Out of scope

- Any exposure input to TSS, the trust aggregator, the AoE trigger or the estimator ("moving-unit history" stays v2).
- Any map rendering of exposure: heat map, history trails, symbol tinting.
- A reset-exposure admin control or any other data-changing demo control.
- Exposure for the hostile or emitter side, and any jammer position, bearing or ring.
- Changes to the pinned beats, `AoeConfig` trigger thresholds, TSS tables or the comms-sim default scenario.
- Cross-console sync of the section's open/closed state (it is per viewer).
- Exporting exposure into CoT or the AAR document (later: it is already in DuckDB).
