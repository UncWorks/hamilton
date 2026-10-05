# AoE requirements trace and necessity matrix

**Branch:** `feat/aoe-preview` (PR #6, base `review/combined`). **Plan under test:** `docs/plans/jammer-aoe.md` (identical to `tmp/aoe-plan.md`).
**Review (2026-10-04):** the plan review (`jammer-aoe.md` §0) changed 9 classifications (marked **[rev]** in §3), applied cuts 1–11, did not apply 12–13, and resolved every §5 item. Counts in §3.3 are updated.
**Purpose:** write the minimum operator-outcome requirements for the suspected-jammer area of effect (AoE), then test every part of the plan against them. Anything that traces to no MUST is a candidate cut. This doc does **not** edit `jammer-aoe.md`; a reviewer applies the cuts.

> **User intent (verbatim):** *"Make the scenario more real: the origin of the jammer would not be known to us. I want to communicate through the C2 by showing a visualization of the estimated area of effect of the suspected jammer if the fingerprint is a high match."* The requirements are to be used *"as a guideline to ensure we are not wasting resources on unnecessary components."*

---

## 1. Requirements sources of truth

| Doc | Role | Authoritative copy | Status / divergence |
|---|---|---|---|
| `docs/URS.md` | Operator requirements: UR-01..09, HS-05 / HS-07 (TSS rework), **HS-20..HS-28 (AoE, this commit)** | **This branch** (`hamilton/docs`) | Vault copy is the 2026-05-03 pre-TSS text: still has UR-05 "interrupt me with a modal", "kill-chain gating", "ROE floor", old beat numbers (14% / 6.2 s at 0:55). 23 lines differ on each side; no AoE stories. |
| `docs/FRS.md` | FR-01..08 with Acceptance rows; NFR-01..07; **FR-04 revision, FR-04b, FR-06a, FR-07a (this commit)** | **This branch** | Vault copy is pre-TSS: FR-07 is the "decision-level trace + kill-chain gating" modal; FR-01/02/04 acceptance use the old numbers (6.1 s at 0:45, 14% at 0:55, match 0.81); FR-03 has no trust-oriented spatial output; FR-05 lacks the trust-orientation note. 20 lines differ each side. |
| `docs/System Design.md` | §2 beats (de-facto ACs), §4 UR→FR→component traceability, §5 MQTT contracts, §7 R14/15/16 | **This branch** | Vault copy has the `T1 → MODAL` R16 edge, the old payload example (0.42), no `fires/mission` topic (§5.2a) and no §6c.1 basemap. 35 vault-only / 59 branch-only lines. |
| `docs/Tech Stack.md` | Locked stack, dependency budget | **This branch** | Vault lacks the basemap row and the offline-basemap checklist item; still lists the DOM kill-chain modal as open. 1 / 3 lines. |
| `docs/Branding and Frontend Design.md` | Tokens, T5 legibility, beat choreography (§10) | **This branch** | Vault is pre-TSS (21 / 48 lines). **Both copies conflict with HS-20:** §10.3 still draws "a subtle directional vector … from B toward the suspected jammer location". Needs an edit (not made here). |
| `docs/plans/tss-mission-row.md` | Built design for HS-05 / HS-07 (FR-07) | This branch only | Current. Its "Deferred" list (NAI, DP/DSM, CCIR, HS-10/13/17/18) is consistent with the AoE MoSCoW below. |
| `docs/plans/cop-basemap.md` | Built design for the offline basemap (§6c.1) | This branch only | Current. Bbox 37.60–37.90 E × 48.05–48.23 N covers all 8 proposed AoE units, so the plan's bbox growth is not needed (§3). |
| `docs/plans/fix-*.md` | FR-03 spatial trust, FR-04→FR-05 inversion, gate timing | This branch only | Current; they pin the trust beats 0.70 / 0.65 / 0.13 / 0.22 / 1.00 that the AoE scenario must keep. |
| `docs/plans/jammer-aoe.md` | The AoE plan under test | This branch (= `tmp/aoe-plan.md`, byte-identical) | Its own §2.6 docs edits are **superseded** by this commit (radius not adopted; FR-04a unchanged; FR-04b / FR-06a / FR-07a instead of "FR-04b + traceability rows"). |
| `README.md` beats | Run-book beat table | This branch | Matches FRS. "Known gaps" still lists procedural jammer stand-ins at named coordinates and glTF jammer models — both conflict with HS-20. |
| Vault `05 - Build Plan/Demo and Pitch.md` | Storyboard (beat keys `B-T:SS`) | **Vault** (no repo copy) | **Stale:** 0:45 = 6.1 s gap, 0:55 = 14% CRC, match 0.81 with different candidates, 1:20 = modal + "AI refuses to recommend", calls FR-04 a "classifier" (R14 breach). No TSS row, no AoE. |
| Decision-workflow assessment (`tmp/decision-workflow-assessment.md`) | Doctrine (FM 1-02 / MCRP 5-12A) and revised stories HS-01..HS-19 | `tmp` (job scratch) | HS-05 / HS-07 adopted in URS; **HS-10..HS-19 and FR-09..FR-13 are proposed but not adopted** — so AoE IDs start at HS-20 and use FR-04b / FR-06a / FR-07a to avoid collisions. |
| AoE design (`tmp/jammer-aoe-design.md`; vault `06 - Research/Signal Interference/Jammer Area-of-Effect Design.md`) | Estimator approaches, display, C2 comms | Vault copy (tmp is the same body without front-matter) | Superseded where the plan re-parameterised it (20 W / 15 m → Pole-21E 300 W / 10 m). Its §3.4 "CAUTION → AT MY COMMAND" rule is overruled by FR-07a (advisory only). |
| Verification (`06 - Research/Signal Interference/Ukraine Signal Interference Verification.md`; `tmp/ua-jamming-verification.md`) | Verified emitter parameters, grade B− | Vault | Wins over the inventory. Source of the IoU ≥ 0.4 and Pole-21E envelope used in FR-04b acceptance. |
| SDR / MANET fit assessment (`tmp/sdr-manet-fit-assessment.md`) | Reality check on telemetry and notification | `tmp` | Supports HS-20 (hard-coded jammer, circular fingerprint) and the COULD rating of CoT export (nothing sends CoT today). |
| Excalibur AAR research (`tmp/excalibur-aar-research.md`) | — | — | **Not present** when this was written; not used. |

**Rule:** the branch `docs/` are authoritative for requirements; the vault Specs are a stale mirror until synced (§6). The storyboard is the one vault-only source and is stale.

---

## 2. Requirement IDs (new and revised)

| ID | Summary | MoSCoW | Justification |
|---|---|---|---|
| `HS-20` | The COP never shows a jammer position as fact; emitter truth lives only in the sim; degradation follows from it | **MUST** | Intent: "origin … not known to us". Doctrine: unconfirmed hostile = suspected (dashed); emitter location is a PIR |
| `HS-21` | Estimated AoE (90% fill, 50% dash) with confidence, evidence and "Est." when the match is high | **MUST** | Intent, verbatim |
| `HS-22` | Name units / mission points inside the AoE per receiver class, GPS-dependent first; unmodelled = "not assessed" | **MUST** (civil GNSS); SHOULD (DAGR); WON'T (CRPA / in-flight, UHF, FPV) | Intent (actionable AoE); FM 1-02 information management; assessment HS-09 |
| `HS-23` | Mission-row advisory; verdict, method of control and branches never change | **SHOULD** | AB1001 already fails on measured reliability at 1:15; no new decision in the demo |
| `HS-24` | Every estimate open / update / stale / retire in the after-action record with evidence | **MUST** (record); SHOULD (sim-only truth vs estimate) | Intent "communicate through the C2"; HS-18; FM 1-02 risk-decision record |
| `HS-25` | Stale after 10 s without trigger, retired at 120 s; C2 goes stale on its own | **MUST** | TSS report age; FM 1-02 status-chart "no information"; an un-retired estimate is a presumption |
| `HS-26` | Status-1 `J1?` symbol only if 90% region ≤ 25 km² or ≥ 2 bearings ≥ 30° | **COULD** (prohibition half is MUST in HS-20) | Unreachable with binary evidence (D3) |
| `HS-27` | Emitter region as dashed NAI J1 + PIR line | **SHOULD** | Doctrinal (NAI) but outside stated intent; serves S2 |
| `HS-28` | CoT `u-d-f` / TAK export | **COULD** | FRS §6 keeps ATAK out; EEFI |
| `FR-04` (revised) | Fingerprint dimensions observable only; dimension 6 "effective range" → "affected receiver classes consistent"; sim RF derived from hidden emitter | MUST (via HS-20/21) | — |
| `FR-04b` (new) | AoE estimation: trigger, method, payload, staleness, AAR log; 10 measurable acceptance items (containment, IoU ≥ 0.4, determinism, ≤ 6 s latency, no leak, no `mode`, trigger, staleness, AAR, deps) | MUST | — |
| `FR-06a` (new) | AoE map layer + card block on both spines; no jammer point / bearing / ring; T5 contrast; zero web deps | MUST (+ SHOULD / COULD rows) | — |
| `FR-07a` (new) | TSS geometry advisory, never changes verdict | SHOULD | — |
| `FR-03` (note only) | Method-aware radius **not adopted**; 1:05 wording open item | — | No MUST needs it |
| `FR-04a` | **Unchanged** | — | HS-22 is met by FR-06a from the estimate; no change to the candidates contract needed |
| `NFR-07` (acceptance note) | AoE adds zero web runtime deps, no Rust crate beyond `serde` | — | Real dependency-budget implication |
| FRS header / System Design §7 (R14 amendment) | Estimator reports closed-form 50% / 90% levels — R14-safe, but "no probability distribution anywhere" is no longer literally true | — | Real determinism / no-ML implication |
| System Design | §2 beats 5–7, §3 diagram (`T3`), §4 rows HS-20..28, §5.4 `integrity/emitter/estimate`, §5.3 consumers, two §4 cells marked superseded by HS-20 | — | §5.4 needed by HS-21 (engine owns the estimate, C2 draws it) |

---

## 3. Traceability and necessity matrix

Classes: **REQUIRED** → traces to a MUST · **SUPPORTING** → SHOULD · **DEFER** → COULD / WON'T / v2 / v3 · **UNNECESSARY** → traces to nothing. Effort from the plan (S ≤ ½ d, M 1–2 d, L 3+ d). "Partial" names the part of a REQUIRED row that can be cut.

### 3.1 Plan §2 file-change table (70 rows)

#### §2.1 `services/comms-sim`

| # | Path | Traces to | Class | Effort | Partial cut / note |
|---|---|---|---|---|---|
| C1 | `scenarios/emitter_truth.py` | HS-20 | REQUIRED | S | — |
| C2 | `propagation.py` | HS-20 (degradation follows from the hidden emitter) | REQUIRED | S–M | Option: replay a per-beat J/S table generated by the existing `gen_fixtures.py` instead of a runtime model (reviewer decision) |
| C3 | `scenarios/avdiivka.py` (8 units, EIRP ramp, B 1:50 waypoint, drop `JAMMER_RF`) | HS-20, HS-21 (an observable edge needs units straddling it) | REQUIRED | M | — |
| C4 | `payloads.py` (telemetry v2) | HS-21 (`rx_class`, `gnss_fix`), FR-04 rev (observable `rf`) | REQUIRED | S | Partial: `gnss_cn0_dbhz`, `gnss_agc`, `gnss_jam_ind`, `snr_db`, `noise_floor_dbm`, `rlq` → DEFER (graded evidence, v2) |
| C5 | `runner.py` | HS-20 | REQUIRED | S | — |
| C6 | `missions.py` | — (ids unchanged; new units only "if a new mission uses them") | **UNNECESSARY** | S | No requirement adds a mission |
| C7 | `tests/test_truth_isolation.py` | HS-20, FR-04b (6) | REQUIRED | S | — |
| C8 | `tests/test_avdiivka.py` | HS-20; FR-01/02/06 beats | REQUIRED | S | — |

#### §2.2 contracts

| # | Path | Traces to | Class | Effort | Partial cut / note |
|---|---|---|---|---|---|
| K1 | `contracts/src/telemetry.ts` | HS-21, FR-04 rev | REQUIRED | S | Partial: only `schema`, `rx_class`, `gnss_fix` + optional `effective_range_km` for MVP |
| K2 | `contracts/src/emitter-estimate.ts` | HS-21, §5.4 | REQUIRED | S | Partial: `emitter.mode`, `bearings_used`, `ref_link_km`, `kind: grid+aoa`, `propagation: itm` → reserved / DEFER |
| K3 | `contracts/src/df-bearing.ts` (v3) | HS-26 (COULD) | DEFER | S | — |
| K4 | `contracts/src/topics.ts` | HS-21 | REQUIRED | S | Partial: `dfBearingTopic` → DEFER |
| K5 | `contracts/src/index.ts` | HS-21 | REQUIRED | S | — |
| K6 | `contracts/src/detection-event.ts` | HS-24 | REQUIRED | S | — |
| K7 | `contracts-rs/src/lib.rs` | HS-21, HS-24 | REQUIRED | M | Shrinks with K1/K2 trims |

#### §2.3 `services/trust-engine`

| # | Path | Traces to | Class | Effort | Partial cut / note |
|---|---|---|---|---|---|
| E1 | `Cargo.toml` (workspace) | HS-21 | REQUIRED | S | — |
| E2 | `crates/estimator/Cargo.toml` | HS-21, NFR-07 | REQUIRED | S | Hand-rolled contours (D9) |
| E3 | `estimator/src/lib.rs` | HS-21 | REQUIRED | S | — |
| E4 | `estimator/src/propagation.rs` | HS-21 | REQUIRED | S | `Propagation` trait for ITM → DEFER (YAGNI) |
| E5 | `estimator/src/grid.rs` | HS-21 | REQUIRED | S | — |
| E6 | `estimator/src/evidence.rs` | HS-21 | REQUIRED | S–M → **S** | Partial: graded (v2) and AOA (v3) likelihoods → DEFER |
| E7 | `estimator/src/set.rs` | HS-21 | REQUIRED | M | — |
| E8 | `estimator/src/aoe.rs` | HS-21, HS-22 | REQUIRED | S–M | — |
| E9 | `estimator/src/contour.rs` | HS-21, NFR-07 | REQUIRED | M | — |
| E10 | `estimator/src/gate.rs` (+ ce90) | HS-26 (COULD) | DEFER | S | MVP never emits `mode`; FR-04b (6) is met by not emitting it |
| E11 | `estimator/tests/golden.rs` | FR-04b (1)(2)(3) | REQUIRED | M | — |
| E12 | `estimator/tests/determinism.rs` | FR-04b (4) | REQUIRED | S | — |
| E13 | `src/state.rs` | HS-21 (`rx_class`, last-degraded ts for the ≥ 3 s trigger and evidence age) | REQUIRED | S | Partial: ring of (position, state, metric) changes → DEFER (moving-unit history is v2; the 1:50 "earlier" mark is DEFER) |
| E14 | `src/telemetry.rs` | HS-21 | REQUIRED | S | — |
| E15 | `src/ticker.rs` | HS-21, HS-25, FR-04b (5)(7)(8) | REQUIRED | M → **S–M** | Partial: replace the IoU < 0.9 / mode > 250 m publish gate with "evidence hash changed (positions on the 250 m grid) or 10 s heartbeat" — binary evidence makes the IoU gate redundant, and `mode` is deferred |
| E16 | `transport/src/mqtt.rs` | HS-21, HS-25 | REQUIRED | S | — |
| E17 | `transport/src/log.rs` | HS-24 | REQUIRED | S | Partial: sim `eval` table → **DEFER [rev]**, and moved out of the engine to a sim-side post-run script (the engine must never read `truth.json`, HS-20) |
| E18 | `server/src/lib.rs` (`GET` estimate, `POST` dismiss) | GET: — (the retained topic already serves late joiners); dismiss: HS-25 COULD | **UNNECESSARY** (GET) / DEFER (dismiss) | S | — |
| E19 | `detectors/src/spatial.rs` (method-aware radius) | — (FR-03 unchanged; no AoE MUST) | **UNNECESSARY** | S | Its only effect is B spatial 0.6 → 0.3, which forces the High-risk re-baselines E23 / W14 |
| E20 | `detectors/src/fingerprint.rs` (dimension 6) | FR-04 rev → HS-20, HS-21 | REQUIRED | S | Keep 6/6 at 1:15 so fingerprint trust stays 0.00 |
| E21 | `detectors/src/fingerprint_candidates.rs` | FR-04 rev (same ranking) | REQUIRED | S | Partial: "candidate output gains the method's receiver classes" → UNNECESSARY (FR-04a unchanged; classes ride in the estimate) |
| E22 | `library/src/lib.rs` (v0.2 parse) | HS-21 (emitter envelope, `affects_rx_classes`) | REQUIRED | S | Partial: `antenna_pattern`, `antenna_sector_deg` → DEFER (sector fitting v2, D8); `range_km_claimed` → SUPPORTING (legend provenance) |
| E23 | `aggregator/src/lib.rs` (`avdiivka_beats_end_to_end`) | HS-20 (geometry changes) + FR-01..06 beats | REQUIRED | M → **S** | With E19 cut and 6/6 kept, the pinned values stay; only positions / `effective_range_km` change. Risk High → Med |

#### §2.4 `assets/fingerprints`

| # | Path | Traces to | Class | Effort | Partial cut / note |
|---|---|---|---|---|---|
| A1 | `library.json` → v0.2 | HS-21 (emitter envelope for the demo method) | REQUIRED | M → **S** | Partial: the Pole-21 / R-330Zh split and the verification §5 corrections to other entries fix **UR-09** citations, not the AoE → SUPPORTING, separate data PR. **[rev]** id kept; `affects_rx_classes` on every entry (dimension 6) |
| A2 | `receivers.json` | HS-21, HS-22 | REQUIRED | S | Partial: `gnss_civil` REQUIRED; `gnss_mil` SUPPORTING; `gnss_mil_crpa`, `uhf_*` → DEFER |

#### §2.5 `apps/web`

| # | Path | Traces to | Class | Effort | Partial cut / note |
|---|---|---|---|---|---|
| W1 | `app/page.tsx` (delete `JAMMER_LOCATION`, vector) | HS-20 | REQUIRED | S | — |
| W2 | `store/hamilton.ts` | HS-21, HS-25 (stale timer) | REQUIRED | S | Partial: `aoeLayers` / `showNai` toggles and dismiss → DEFER |
| W3 | `hooks/useHamiltonMqtt.ts` | HS-21, HS-25 | REQUIRED | S | — |
| W4 | `lib/aoe.ts` | HS-22 (point-in-MultiPolygon, `contourLevelAt`) | REQUIRED | S | Partial: extent-for-fit → DEFER; footprint test → **DEFER [rev]** (footprint clip deferred) |
| W5 | `lib/aoe.test.ts` | HS-22 | REQUIRED | S | — |
| W6 | `components/cop/Spine.tsx` | HS-20, HS-21 | REQUIRED | S | Partial: `bearings?` prop → DEFER |
| W7 | `components/cop/MapSpine.tsx` | HS-20, HS-21, HS-25 | REQUIRED | M | Partial: NAI path → **DEFER [rev]** (HS-27); footprint clip → **DEFER [rev]**; ce90 and bearing wedges → DEFER |
| W8 | `components/cop/CesiumSpine.tsx` | HS-20 (remove ring), HS-21 | REQUIRED | M | **[rev]** Unconditional: `Spine.tsx` `pickRenderer()` defaults to Cesium, so the Cesium AoE is in M1 |
| W9 | `components/cop/spine-symbols.ts` | HS-20 (remove solid `jammer`) | REQUIRED | S | Partial: status-1 `J1?` → DEFER (HS-26) |
| W10 | `components/cop/SpineOverlay.tsx` (chip row, Fit to NAI) | HS-27 / COULD | DEFER | S | With civil (+ DAGR) only, there is nothing to toggle; disabled UHF / FPV chips advertise WON'T layers |
| W11 | `components/cop/AoeLegend.tsx` | HS-21 (confidence + estimate statement) | REQUIRED | M → **S** | Partial: keep a two-swatch key (90% fill, 50% dash); the label already carries method / level / age / counts. Dashed-symbol rule → DEFER; radius-band provenance → SUPPORTING |
| W12 | `lib/camera-fit.ts` (+ test) | — (8 units sit inside the current fit and bbox; the far AoE edge is extrapolated) | DEFER | S | — |
| W13 | `lib/cop-symbols.ts`, `lib/display-names.ts` (units d…h) | HS-21 (8 units) | REQUIRED | S | — |
| W14 | `lib/link-trust-rating.ts` (+ test) | HS-20 (positions mirror) | REQUIRED | M → **S** | Partial: method-aware `SPATIAL_RADIUS_M` → UNNECESSARY; beats stay pinned. Risk High → Med |
| W15 | `components/panel/CandidateCards.tsx` (AoE block) | HS-21, HS-22 | REQUIRED | S | **[rev]** The "Emitter not located (90% region ~N km²)" line is kept (HS-20 / HS-21 honesty, cheap); "not assessed" and "edge not observed" states added |
| W16 | `lib/tss.ts` (+ test) `advisories[]` | HS-23 | **DEFER [rev]** | M | Not cheap; the HS-22 card line carries the fact; ground-only advisory at a GPS round's target understates in-flight exposure |
| W17 | `components/fires/MissionRow.tsx` | HS-23 | **DEFER [rev]** | S | With W16 |
| W18 | `components/terminal/EventTerminal.tsx`, `display-names.ts` | HS-24 | REQUIRED | S | Partial: "task DF on NAI J1" wording → SUPPORTING (HS-27) |
| W19 | `styles/tokens.css` (AoE palette, D2) | FR-06a (4) | REQUIRED | S | Partial: `--aoe-uhf`, `--aoe-fpv` → DEFER |
| W20 | `scripts/basemap/contrast-check.mjs` | FR-06a (4) | REQUIRED | S | — |
| W21 | `scripts/fetch-tiles.sh` (bbox → 31 MB) | — (all 8 units and B's 1:50 waypoint fall inside the current bbox) | DEFER | S | Also avoids +27 MB of NFR-01 assets |
| W22 | `stories/fixtures/avdiivka.ts` (delete truth) | HS-20 | REQUIRED | S | — |
| W23 | `stories/fixtures/aoe-preview.{ts,json}` | HS-21 | REQUIRED | done | Seed for production fixtures |
| W24 | `stories/support/AoeOverlay.tsx`, `AoePanels.tsx`, `aoe-palette.ts` | preview only | SUPPORTING | done | Delete when production layers land |
| W25 | `stories/previews/JammerAoe.stories.tsx` | HS-20..HS-25 | REQUIRED | done | Convert only the 1:15, 2:15 and colour stories (see §3.2) |
| W26 | Spine / page / decision / archive stories (prop switch) | HS-20 (old props removed) | REQUIRED | M | — |

#### §2.6 Docs

| # | Path | Traces to | Class | Effort | Note |
|---|---|---|---|---|---|
| DOC1 | `docs/FRS.md` | all | REQUIRED | S | **Done in this commit**, differently from the plan: no radius change, FR-04a unchanged, FR-06a / FR-07a added |
| DOC2 | `docs/System Design.md` | HS-21 (§5.4) | REQUIRED | S | **Done** |
| DOC3 | `docs/URS.md` "notes the 1:35 beat" | HS-26 (COULD) | DEFER | S | URS got HS-20..28 instead; 1:35 is v3 |
| DOC4 | Vault storyboard | HS-20..25 beats | REQUIRED | S | See §6. The DF beat with B + H → DEFER |

### 3.2 Plan §1, §3–§7 (other components, stories and decisions; 40 items)

| # | Item (plan section) | Traces to | Class |
|---|---|---|---|
| G1 | §1 per-receiver-class AoE, 50% / 90% contours | HS-21, HS-22 | REQUIRED |
| G2 | §1 90% emitter region drawn as NAI | HS-27 | **DEFER [rev]** (region stays in the payload) |
| G3 | §1 status-1 hostile EW symbol under the gate | HS-26 | DEFER |
| G4 | §1 advisory TSS geometry term | HS-23 | **DEFER [rev]** |
| G5 | §1 soft set-based grid estimator | HS-21 | REQUIRED |
| G6 | §1 link-budget radius band per method × class | HS-21 | REQUIRED |
| G7 | §1 engine computes polygons (no web deps) | HS-21, NFR-07 | REQUIRED |
| G8 | §1 receiver classes civil + military GNSS | HS-22 (civil MUST, DAGR SHOULD) | REQUIRED |
| G9 | §3.1 graded telemetry fields (C/N0, AGC, jam_ind, SNR, noise, RLQ) | v2 | DEFER |
| G10 | §3.2 reserved estimate fields (`mode`, `bearings_used`, `ref_link_km`, AOA / ITM enums) | HS-26 / v2–v3 | DEFER |
| G11 | §2.3 publish gate "IoU < 0.9 or mode moves > 250 m" | — (redundant under binary evidence) | UNNECESSARY |
| G12 | §5.1 performance test < 50 ms | FR-04b (5) (MUST acceptance) | **REQUIRED [rev]** |
| G13 | §5.2 CI grep for `JAMMER_LOCATION` / `AOE_TRUTH` | HS-20 | REQUIRED |
| T1 | §5.4 story 1:15 | HS-20, HS-21 | REQUIRED |
| T2 | §5.4 story 1:35 | HS-26 | DEFER |
| T3 | §5.4 story 1:50 ("earlier" mark) | moving-unit history, v2 | DEFER |
| T4 | §5.4 story 2:15 (stale) | HS-25 | REQUIRED |
| T5 | §5.4 story Receiver layers (disabled UHF chip) | WON'T layers | DEFER |
| T6 | §5.4 story Mission row | HS-23 | **DEFER [rev]** |
| T7 | §5.4 story Evaluation (truth contained) | HS-24 SHOULD (golden.rs carries the MUST) | SUPPORTING |
| T8 | §5.4 story Colour vision | FR-06a (4) | REQUIRED |
| B1 | §6 0:00 — 8 units, no EW layers | HS-20, HS-21 | REQUIRED |
| B2 | §6 0:45 / 0:55 — same beats, now EIRP-driven | HS-20; FR-01 / 02 | REQUIRED |
| B3 | §6 1:05 — "localized" at 500 m | UR-04 (open item §5) | REQUIRED |
| B4 | §6 1:12 — AB1001 unchanged | HS-05 | REQUIRED |
| B5 | §6 1:15 — civil AoE + label, no symbol (NAI and row advisory are SUPPORTING, FFIR-2 line SUPPORTING) | HS-20, HS-21, HS-22, HS-24 | REQUIRED |
| B6 | §6 1:20 — FFIR "task DF on NAI J1" | HS-27 | **DEFER [rev]** |
| B7 | §6 1:35 — DF bearings B + H, `J1?` | HS-26, v3 | DEFER |
| B8 | §6 1:50 — B moves, estimate updates | HS-21 (publish on evidence change) | REQUIRED |
| B9 | §6 2:15 — stale, retire (AAR truth vs estimate SUPPORTING) | HS-25, HS-24 | REQUIRED |
| D1 | Spread units to km scale (bbox growth DEFER; Fit to NAI DEFER) | HS-20, HS-21 | REQUIRED |
| D2 | Violet / teal / magenta palette | FR-06a (4) | REQUIRED |
| D3 | Symbol threshold ≤ 25 km² or ≥ 2 bearings ≥ 30° (as a constraint) | HS-20, HS-26 | REQUIRED |
| D4 | Hidden emitter Pole-21E-class 300 W / 10 m | HS-20, HS-21 (edge must be observable) | REQUIRED |
| D5 | Altitude-band AoE (only the "ground rx" caveat text is needed now) | v2; caveat → HS-22 | DEFER |
| D6 | GNSS-only first | HS-22 | REQUIRED |
| D7 | IoU target 0.4 binary | FR-04b (2) | REQUIRED |
| D8 | Sector fitting | v2 | DEFER |
| D9 | Hand-rolled marching squares | NFR-07 | REQUIRED |
| D10 | TSS advisory uses the AoE level | HS-23 | **DEFER [rev]** (the "never changes the verdict" rule stays binding when built) |

### 3.3 Counts

| Class | §2 file rows (70) | Other items (40) | **Total (110)** |
|---|---|---|---|
| REQUIRED | 58 | 24 | **82** |
| SUPPORTING | 1 | 1 | **2** |
| DEFER | 8 | 14 | **22** |
| UNNECESSARY | 3 | 1 | **4** |

*Before review: 81 / 10 / 15 / 4. Moves: G12 SUPPORTING → REQUIRED; W16, W17, G2, G4, T6, B6, D10 SUPPORTING → DEFER. The two SUPPORTING items left are W24 (preview support files) and T7 (Evaluation story).*

Most REQUIRED rows carry a **partial cut** (column above): 27 of the 58 REQUIRED file rows contain a deferrable or unnecessary part.

**Sequencing (plan §4) mapped:** M1 is REQUIRED throughout, except the symbol gate inside its "spine-symbols gate" step (DEFER). M2: method-aware radius UNNECESSARY; dimension 6, library v0.2 (envelope only), re-baseline, 1:50 / 2:15 and Cesium polygons REQUIRED; TSS advisory SUPPORTING; fit rule + bbox DEFER. M3: docs (done), storyboard, palette + contrast, terminal line REQUIRED; preview → production stories REQUIRED for 1:15 / 2:15 / colour only.

---

## 4. Candidate scope cuts

Row estimates in the plan sum to ~48 upper-bound dev-days (S = ½ d, M = 1½ d), against the plan's own 11–14 d total, so S rows are clearly well under ½ d in practice. Savings are given in plan units and as a share of the row sum; scale the share to the 11–14 d total.

| # | Cut | Rows | Saving (plan units) | Why it is safe |
|---|---|---|---|---|
| 1 | **Do not adopt the method-aware spatial radius** | E19 (S) gone; E23 M → S; W14 M → S | ~2½ d; **two High-risk rows → Med** | No MUST needs it; keeping B "localized" (0.6) and 6/6 keeps the pinned trust beats |
| 2 | Fold `AoeLegend` into a two-swatch key + the label | W11 M → S | ~1 d | Label already states method, level, age, evidence counts |
| 3 | Library v0.2: add the Pole-21E envelope only; move the split and verification corrections to a separate data PR | A1 M → S | ~1 d off the AoE path | Those corrections serve UR-09 citations, not the AoE |
| 4 | Evidence-hash publish gate instead of IoU / mode gate | E15 M → S–M; G11 | ~½ d | Binary evidence changes only when the evidence set changes |
| 5 | Defer camera-fit, basemap bbox growth, layer chips, Fit to NAI | W12, W21, W10 (3 × S) | ~1½ d; **+27 MB NFR-01 assets avoided** | Units and B's waypoint are inside today's fit and bbox |
| 6 | Defer the emitter-symbol gate, `J1?`, ce90, DF contract | E10, K3, W9 part, G3 / G10 | ~1 d | Gate is unreachable with binary evidence (D3) |
| 7 | Drop `GET /api/emitter/estimate`, defer dismiss | E18 (S) | ~½ d | Retained MQTT already serves late joiners |
| 8 | Skip `missions.py` and the URS 1:35 note | C6, DOC3 (2 × S) | ~1 d (upper bound) | No requirement |
| 9 | Trim telemetry v2 to `rx_class` + `gnss_fix`; drop the state history ring; binary-only `evidence.rs` | C4 / K1 / K7 parts, E13 part, E6 S–M → S | ~1 d | Graded and moving-unit evidence is v2 |
| | **Firm cuts subtotal** | | **~10 of ~48 row-days (≈ 21%) → ≈ 2½–3 dev-days of the 11–14** | |
| 10 | *If needed:* defer the TSS advisory (HS-23 SHOULD) | W16 (M), W17 (S), T6 | ~2 d (≈ ½ dev-day scaled) | Verdict already FAILs on measured reliability at 1:15 |
| 11 | *If needed:* defer the NAI graphic and FFIR wording (HS-27 SHOULD) | W7 / W15 / W18 parts, B6 | ~½ d | Not in stated intent |
| 12 | *Conditional:* Cesium AoE drawing if MapLibre is the stage spine | W8 (M) | ~1½ d | Removal of the hard-coded ring stays REQUIRED |
| 13 | *Reviewer option:* replay a generated per-beat J/S schedule instead of runtime `propagation.py` | C2 S–M → S | ~½ d | Truth still drives degradation; trades runtime fidelity for simplicity |

**Review outcome (`jammer-aoe.md` §0.2):**
- **Applied:** cuts 1–9, 10 (R1, TSS advisory) and 11 (R2, NAI graphic), plus R3 (footprint clip) and R4 (eval table out of the engine).
- **Not applied:** cut 12, because Cesium is the default renderer. Option 13 is rejected, because a runtime model also has to drive the co-located comms module and B's 1:50 move.
- **Re-estimate:** reduced MVP ≈ 16 dev-days expected (19.75 raw); the plan as written ≈ 24 (≈ 30 raw).

---

## 5. Open discrepancies for the reviewer

1. **FR-03 1:05 wording.** *Resolved (plan §0.3 a): reword to "Degradation localized at B — no degrading unit within 500 m. A, C healthy."* With the 8-unit layout no unit is within 500 m of B (C is ~3.4 km away), so "Neighbors A, C unaffected" becomes vacuous. Either keep a healthy unit within 500 m of B in the layout or reword UR-04 / FR-03 / README to what the engine measures.
2. **GNSS-only method vs link symptoms.** *Resolved (plan §0.3 b): one hidden site with a co-located GNSS module (Pole-21E-class) and comms module (R-934B-class); GNSS evidence from `gnss_fix` only.* The plan makes the demo emitter Pole-21-class (GNSS only), yet B's FR-01 / FR-02 beats are link cadence and CRC, and `runner.py` maps J/S to cadence / CRC through g(·). A GNSS jammer does not raise CRC on a UHF link. Either the method keeps a UHF component, or the link symptom must come from position-report gating, and the mapping should say which.
3. **Method-id ripple.** *Resolved (plan §0.3 c): keep the id; no split, no alias in the MVP.* Splitting `ground_based_gps_uhf_barrage` renames the 1:15 top match that FR-04, FR-04a, UR-09, the README and System Design §2 / §5.2 quote verbatim. If cut 3 is taken, keep the id and label the envelope "Pole-21-class".
4. **Model match between sim and estimator.** *Resolved (plan §0.3 d): sector and shadowing stay hidden from the estimator; a 20-seed sweep and an off-node truth are added (measured 17/20, 19/19); the back-lobe case (9/20) is recorded as the D8 limitation.* `estimator/propagation.rs` must match `comms-sim/propagation.py` to 0.01 dB. Containment is then partly self-fulfilling; the sim's sector antenna and σ 4 dB shadowing (absent from the estimator) are what keep the test honest. Keep them.
5. **Presumed-location leftovers outside this plan:** *Resolved (plan §0.3 e): Branding §10.3 and README marked superseded; the 1:05 text changes with the layout (row X1).* Branding §10.3 directional vector; README "Known gaps" (procedural jammer stand-ins, glTF jammer models); System Design §4 LOS overlay and glTF cells (now marked superseded by HS-20).
6. **Design vs plan on the TSS tie-in.** *Confirmed; the advisory itself is deferred (R1).* The AoE design §3.4 adds `CAUTION` and recommends `AT MY COMMAND` at P ≥ 0.9; the plan and FR-07a say advisory only. FR-07a governs.
7. **Reserved numbering.** HS-10..HS-19 and FR-09..FR-13 are proposed by the decision-workflow assessment but not adopted; do not reuse them.

---

## 6. Vault sync needed (read-only here; not edited)

| Vault file | Action |
|---|---|
| `03 - Strategy/Specs/URS.md` | Replace with branch `docs/URS.md` (TSS rework + HS-20..HS-28) once PR #6 merges into `review/combined` |
| `03 - Strategy/Specs/FRS.md` | Replace with branch copy (TSS FR-07 + FR-04 revision, FR-04b, FR-06a, FR-07a, R14 amendment) |
| `03 - Strategy/Specs/System Design.md` | Replace with branch copy (§2 beats 5–7, §4 rows, §5.2a, §5.4, §6c.1, §7 R14 amendment) |
| `03 - Strategy/Specs/Tech Stack.md` | Replace with branch copy (basemap row; modal item struck) |
| `03 - Strategy/Specs/Branding and Frontend Design.md` | Replace with branch copy, **after** §10.3's directional vector is removed (HS-20) |
| `05 - Build Plan/Demo and Pitch.md` | Rewrite the storyboard table: FRS numbers (1.17 s / 6% / 6.1 s / 14% / 1.00), TSS row at 1:12–1:20 instead of the modal, "matcher" not "classifier"; add the AoE at 1:15 (civil GNSS, no jammer point), the 1:50 update and the 2:15 stale / retire. No 1:35 DF beat in the MVP. Delete "A subtle directional vector" and "B repositions out of the jammer lobe" phrasing that implies a known lobe |
| `06 - Research/Signal Interference/Jammer Area-of-Effect Design.md` | Add a header note: parameters superseded by `docs/plans/jammer-aoe.md` §7.1; §3.4 CAUTION rule superseded by FR-07a; requirements now in URS HS-20..28 |
