---
tags: [strategy, specs, frs, v5.1.1, demo-bounding]
status: draft (freeze at scope lock)
authored-on: 2026-05-02
build-state: ~80% at authoring
freeze-at: 2026-05-02 Saturday scope lock (11:30 PT)
parent: [[00 - Index]]
related:
  - [[URS]]
  - [[../Capability Selection]]
  - [[../Tech Stack]]
  - [[../Risk Register]]
  - [[../../05 - Build Plan/Demo and Pitch]]
---

# FRS — Functional Requirements Specification

> **Scope boundary:** this FRS bounds **what the system must do for the 5-minute live demo at xTech 2026-05-03**. It is not a product spec. Out-of-scope items are listed explicitly in §6 so judge Q&A has a defensible answer for "does it do X?" — *no, by design — see path-forward (§7).*
>
> **Phrasing discipline (R16 mitigation):** the wedge is **continuous trust scoring feeding the TSS check on each fire mission** — never *"we render link health."* Every FR statement must preserve that framing.
>
> **ML discipline (R14 mitigation):** jamming-fingerprint detection in the demo path is **threshold-based deterministic matching**, not ML classification. Any narration that drifts toward "trained model" is incorrect.
>
> **AoE amendment (`FR-04b`):** the area-of-effect estimator reports closed-form probability levels (50% / 90%) over a fixed grid. That is still R14-safe — no training, no learned weights, no sampling, byte-identical output for identical input — but the old line *"no probability distribution anywhere"* no longer holds literally; use the `FR-04b` R14 answer for the estimator.

---

## 1. System context

The system is a **comms-integrity evaluation layer** that consumes per-source telemetry and emits a continuous trust score per source, feeding the reliability and report-age terms of the target selection standards (TSS) on each fire mission. It drops onto any C2 surface (MapLibre primary spine; Palantir AIP additive secondary surface, conditional on 1300 Saturday go/no-go gate).

**Architecture (already wired in the ~80%-built state):**

| Layer | Implementation | Role |
|---|---|---|
| Trust engine | Rust async (Tokio + Axum) | Source of truth — produces continuous trust score |
| Transport | MQTT — topic `integrity/trust/{source_id}` | Score publication; consumers subscribe |
| Storage | RocksDB / DuckDB / SQLite | Single-binary, no external infra |
| Comms simulator | Python module (CHAOS-owned) | Drives both rendering layers — RSSI, packet loss, jamming events |
| Primary render | Next.js + MapLibre GL (offline via PMTiles) | Track-level icon decay + decision-level trust trace |
| Secondary render | Palantir AIP ontology objects (conditional) | Same score, different surface — proves *"drops onto any C2"* |
| LLM | Anthropic Claude (function-calling) primary, Llama 3.2 3B local fallback | Trust trace narration (never the TSS verdict) |
| Phone client | PWA over the Next.js app | Operator-on-phone story, no native Android |
| Container | Single `docker compose up` | Reproducible across team laptops |

**Hardware bound:** laptops + Androids only. No drones, SDR, Jetson, Pi.

**Network bound:** demo runs **fully offline**. No live external API calls during the 5-minute slot.

---

## 2. Functional requirements — detection bounds (4 in-scope)

### 2.1 Temporal anomaly detection

| Field | Value |
|---|---|
| **ID** | `FR-01` |
| **Statement** | The system shall flag a per-source temporal anomaly when inter-arrival time exceeds 3σ above the source's baseline cadence. |
| **Input** | Per-source message timestamp stream from MQTT ingest |
| **Output** | Anomaly event published to trust engine; contributes to source's trust score |
| **Acceptance** | Demo: Unit B inter-arrival stretches from ~1.0s baseline to 1.17s (3.4σ) → temporal anomaly fires within 1 frame; trust score begins to decay (≈0.70, WATCH band, at/above the GPS-guided TSS minimum C). The gap widens to 6.1s at `B-1:15` |
| **Traces to** | `UR-02`, `UR-03`, `B-0:45` |
| **Demo-scope** | Yes — Beat 0:45 |

### 2.2 Network-stability detection

| Field | Value |
|---|---|
| **ID** | `FR-02` |
| **Statement** | The system shall flag a per-source network-stability degradation when CRC error rate exceeds threshold (>5% rolling window) or duplicate-frame rate climbs above baseline. |
| **Input** | Per-source CRC counters + duplicate-frame counters from comms simulator |
| **Output** | Stability event into trust engine; further trust-score decay |
| **Acceptance** | Demo: Unit B CRC rises 0.2% → 6% (past the 5% threshold); trust trace updates with *"B-link: 6% corrupted frames, cadence 1.17s"*; trust ≈0.65, still at/above the GPS-guided TSS minimum (C). CRC peaks at 14% at `B-1:15` |
| **Traces to** | `UR-03`, `B-0:55` |
| **Demo-scope** | Yes — Beat 0:55 |

### 2.3 Spatial-correlation discrimination

| Field | Value |
|---|---|
| **ID** | `FR-03` |
| **Statement** | The system shall localize a degradation event by checking whether neighbors within a configurable radius (default 500m) experience correlated degradation. If neighbors are healthy, the event is classified as **directional/localized**, not blanket atmospheric/EMI. |
| **Input** | Reported position (`lat`/`lon` on every telemetry payload) and **engine-measured** degradation of every source within radius. A source counts as degrading when its own `FR-01` temporal anomaly (> 3σ) or `FR-02` stability flag fires. A self-reported flag from the source is never used. Radius: `TRUST_ENGINE_SPATIAL_RADIUS_M`, default 500. |
| **Output** | Spatial classification (`nominal` / `localized` / `blanket`) attached to the degradation event. Into `FR-05` as **spatial trust**: `1.0` when the source itself is not degrading (`nominal`), `0.6` when it degrades and every neighbour in radius is healthy (`localized`), `0.3` when it degrades and ≥ 1 neighbour in radius degrades too (`blanket`). A healthy source is never penalised for a neighbour's degradation. |
| **Acceptance** | Demo: Unit B degrades; A (~7.0 km W of B) and C (~3.4 km SW) remain healthy, and no unit is within 500 m of B → B is `localized` (0.6) and the side panel renders *"Degradation localized at B — no degrading unit within 500 m. A, C healthy."* |
| **Traces to** | `UR-04`, `B-1:05` |
| **Demo-scope** | Yes — Beat 1:05 |
| **AoE note** | The method-aware radius proposed in `docs/plans/jammer-aoe.md` is **not adopted**: no AoE MUST (`HS-20..HS-25`) requires it, and the default 500 m keeps the trust beats. **Resolved (plan review 2026-10-04, `jammer-aoe.md` §0.3 a):** when the km-scale layout lands, the 1:05 text becomes *"Degradation localized at B — no degrading unit within 500 m. A, C healthy."* ("A, C healthy" comes from their own `FR-05` scores, not from the spatial check), and this acceptance row changes with it. Known limitation: at km spacing no neighbour falls inside 500 m, so *blanket* cannot fire in the demo. |

### 2.4 Jamming-fingerprint detection (threshold-based)

| Field | Value |
|---|---|
| **ID** | `FR-04` |
| **Statement** | The system shall match the active degradation pattern against a **deterministic threshold-based fingerprint library** (noise-floor band + frequency-hop spread + GPS L1/L2 overlap booleans), emitting a match score and named profile when threshold criteria are met. |
| **Input** | Composite of `FR-01`, `FR-02`, `FR-03` outputs + RF telemetry from comms simulator |
| **Output** | Named jammer profile (e.g., `ground_based_gps_uhf_barrage`) + match score (**match strength**: higher = more like that jammer; only matches ≥ 0.5 count). Into `FR-05` it enters as **fingerprint trust** = `1 − match strength`, or `1.0` when nothing matches. |
| **Acceptance** | Demo: Unit B's pattern matches `ground_based_gps_uhf_barrage` profile at match strength 1.00 (6/6 dimensions), so fingerprint trust = 0.00; banner reads *"Suspected ground-based GPS+UHF barrage jammer, vicinity B's corridor."* |
| **Observability (AoE revision)** | Every dimension is computed from what a friendly receiver or spectrum monitor can observe (band occupancy, hop spread, L1 / L2 impact, time-domain pattern, **affected receiver classes**). Dimension 6, *effective range*, tests an emitter property the C2 cannot observe and is **replaced** by *"affected receiver classes consistent"* (e.g. civil GNSS degraded and UHF healthy matches GNSS-only methods). The simulator's RF observation is derived from the hidden emitter, not copied from the library. Acceptance unchanged: 6/6 at `B-1:15` with the replaced dimension; no telemetry field carries an emitter range. **Dimension 6 rule:** the receiver classes observed degraded at the source are non-empty and ⊆ the method's `affects_rx_classes`. The 2nd / 3rd `FR-04a` candidate scores may move by 1/6 and are re-pinned at implementation; the lead is compared on integer matched-dimension counts. **Demo emitter (plan review, `jammer-aoe.md` §0.3 b):** one hidden site with a co-located GNSS module (Pole-21E-class, drives loss of GNSS fix) and a UHF comms module (R-934B-class 100–400 MHz, drives B's cadence / CRC), so the observation stays GPS + UHF and the `ground_based_gps_uhf_barrage` id and banner are kept. |
| **Traces to** | `UR-04`, `UR-05`, `HS-20`, `HS-21`, `B-1:15` |
| **Demo-scope** | Yes — Beat 1:15. **NOT** ML classification. R14 mitigation: if a judge probes, answer is *"deterministic threshold detection — Army's data-volume problem on time-series ML informed this choice"* |
| **Path-forward** | ML-based fingerprint classification — explicitly out-of-scope for the demo (§6, §7) |

### 2.4a Munitions-impact fingerprint mapping (ranked, deterministic)

| Field | Value |
|---|---|
| **ID** | `FR-04a` |
| **Statement** | The system shall emit a **ranked top-3** list of candidate jamming methods with normalized match scores in `[0.0, 1.0]` and, **per candidate**, the list of munitions whose guidance package is known to be affected by that method — derived deterministically from a threshold-boolean overlap function over a publicly-sourced fingerprint library. |
| **Wedge framing** | FR-04 answers *"what is jamming us?"* — a single named profile. FR-04a answers *"and which rounds in our inventory does that jammer deny?"* — the operator-actionable next step. The two are siblings sharing one input stream. |
| **Input** | Same degradation-pattern stream consumed by `FR-04` (composite of `FR-01..03` + RF telemetry) + the static fingerprint library described below |
| **Fingerprint-library schema (per entry)** | `method_id` (e.g., `ground_based_gps_uhf_barrage`); `named_systems[]` (e.g., `R-330Zh Zhitel`, `Pole-21`); `frequency_band_mhz` (range or set); `hop_spread_hz` (threshold); `gps_l1_overlap` (boolean threshold); `gps_l2_overlap` (boolean threshold); `time_domain_pattern` (enum: `continuous` \| `pulsed` \| `barrage` \| `swept`); `effective_range_km` (threshold); `munitions_affected[]` (e.g., `Excalibur`, `JDAM-ER`, `Switchblade 300`, `GMLRS-U`, `Lancet`, `Shahed`, `ATAK position-share`, `FPV C2 link`); `source_citation` (e.g., `Bronk RUSI 2024`, `JAPCC 2023`, `WaPo 2024`) |
| **Match function (R14-safe)** | `score = (count of fingerprint-dimension threshold booleans matched) / (total fingerprint dimensions for that entry)`. Each dimension is a discrete threshold check; with the 6-dimension schema, scores are `k/6` (0, 0.17, 0.33, 0.50, 0.67, 0.83, 1.00). Scores sorted descending; top 3 returned. Avdiivka demo jammer: `ground_based_gps_uhf_barrage` 1.00, `pulsed_uhf_wide` 0.50, `cellular_uhf_barrage` 0.17. **No training, no softmax, no learned weights.** Pure function — same input → same output. |
| **Output** | `{ "candidates": [ { "method_id", "named_systems[]", "score", "munitions_affected[]", "source_citation" }, …×3 ] }` published on MQTT topic `integrity/fingerprint/candidates` |
| **Inventory scope** | US/NATO **and** adversary munitions (Excalibur, JDAM-ER, Switchblade, GMLRS, Lancet, Shahed, FPV, ATAK CoT, etc.) — proves the layer is sensor-/munition-class-agnostic; R15 discipline preserved because the *seat* (FDC) does not change. |
| **Acceptance** | Demo: at Beat 1:15, side panel renders three ranked candidates with normalized scores and per-candidate munitions-affected lists; per-candidate `source_citation` is visible on hover. Reinforces the TSS mission row — Adam picks branch `[1]` *"Shift → M795 HE, adjust fire"* with grounded knowledge of which rounds are denied. |
| **Traces to** | `UR-04`, `UR-05`, `UR-07`, `UR-09`, `B-1:15`, `B-1:20` |
| **Demo-scope** | **Conditional.** If the existing FR-04 matcher already returns top-N internally → demo-path (~25–35 min UI surface work, zero new deps; defer to Joseph/Evan, NOT Kristian per R13/R18 discipline). If matcher is hard-coded top-1 → spec lands as written but `Demo-scope` flips to **NO** and the feature is documented as path-forward (§7); pitch lead may still cite FR-04a verbatim as a stage Q&A defense. **Tech lead confirms before Sunday rehearsal block.** |
| **Library source** | Upstream fingerprint catalog: [[../../06 - Research/White Paper/_evidence/prompts/P4 - Jammer Fingerprint Catalog]]. Underlying open characterizations cite Bronk RUSI 2024, JAPCC 2023, *WaPo* 2024. The library is data, not code — additions post-Sunday-6AM are documentation, not new dependencies (NFR-06 safe). |
| **R14 defensive answer (verbatim, for judge Q&A)** | *"The score is a normalized count of matched threshold booleans over a fingerprint library publicly characterized by Bronk RUSI 2024 and JAPCC 2023. There is no model, no training, no probability distribution — it's a deterministic overlap ratio. The 'likelihood' framing is operator-readable shorthand for that ratio."* |
| **Path-forward** | (a) ML-based ranked classifier with calibrated confidence intervals — explicitly out-of-scope per R14; (b) live ingest from a fielded waveform — CHAOS-side moat, see §7; (c) per-unit inventory binding so munitions-affected filters to *Adam's* loadout, not the global catalog. |

### 2.4b Area-of-effect estimation (deterministic, no presumed emitter)

| Field | Value |
|---|---|
| **ID** | `FR-04b` |
| **Statement** | When the jamming fingerprint is a high, unambiguous match, the system shall estimate — from friendly observations only — the area in which the matched method denies each modelled receiver class, as 50% and 90% contours, plus the 90% region that contains the emitter. It shall publish the estimate as data the C2 can draw, keep it current, mark it stale and retire it, and log every state change for after-action. It shall never place an emitter point in any payload unless the `HS-26` evidence gate is met. |
| **Wedge framing** | `FR-04` names the method; `FR-04a` names the rounds it denies; `FR-04b` says **where** it is estimated to deny them — without claiming to know where the jammer is. |
| **Trigger ("high match")** | All of: the top `FR-04` match ≥ **5/6**; it leads the second candidate by ≥ **2/6** (else *method ambiguous*: no area); ≥ 1 unit measured degraded (`FR-01`/`FR-02` verdict, or loss of GNSS fix) for ≥ 3 s. If no healthy unit of the same receiver class lies within the method's maximum radius of a degraded unit, the state is `unbounded` and no polygon is published (*"edge not observed"*). |
| **Input** | Per unit: reported position, receiver class (`rx_class`), engine-measured degraded / healthy state **per receiver class** and its age (telemetry `rx_class` and `gnss_fix`, both optional fields). GNSS-class evidence is `gnss_fix` only (`3d` healthy, otherwise degraded), never the `FR-01`/`FR-02` link verdict, which is UHF-class evidence. Per method: the library's emitter envelope (EIRP and mast ranges, provenance-tagged) and affected receiver classes; per receiver class: the J/S threshold (`receivers.json`). **No emitter position, power or range from the simulator.** |
| **Method (R14-safe)** | A fixed 250 m local grid; a fixed 3 × 3 EIRP × mast hypothesis set per method; a two-ray + radio-horizon link budget; a binary probit likelihood per unit (σ 6 dB, closed-form Φ); log-domain sums in a fixed order. The AoE is P(denied \| x) per receiver class; contours are marching squares simplified to ≤ 64 vertices, computed in the engine. **No training, no learned weights, no sampling.** Same input → same bytes. |
| **Output** | Retained MQTT `integrity/emitter/estimate` (System Design §5.4): state (`active` / `stale` / `unbounded` / `retired`), method and match, per-class 50% / 90% contours with areas, the 90% emitter region, the evidence list with ages, `computed_at`, `valid_until`. An empty retained payload on retirement. |
| **Cadence and staleness** | Recompute when the evidence set changes (positions quantised to the grid), at most every 5 s; heartbeat every 10 s. Held 10 s after the trigger drops, then `stale`; retired 120 s after the trigger drops. `valid_until` = publish time + 20 s (two heartbeats). |
| **AAR log** | One `events` row per open / update / stale / retire (`DetectionKind::EmitterEstimate`) and the full payload with an evidence hash. Simulator runs may also store truth distance, truth-in-90% and AoE IoU in a **sim-only** table (`HS-24`, SHOULD). |
| **Acceptance** | Scenario test on the hidden demo emitter (Pole-21E-class, 300 W / 10 m, jammer-aoe.md §5.1): **(1) containment** — the true emitter lies inside the 90% emitter region at every beat with an active estimate (`B-1:15`, `B-1:50`); and, so the test is not self-fulfilling, over 20 shadowing seeds containment is ≥ 15/20 at the demo truth and at one off-node truth (420 W / 20 m, off the grid centres). The simulator's sector antenna and shadowing stay hidden from the estimator; **(2) AoE accuracy** — civil-GNSS 50% contour vs the true denial area, IoU **≥ 0.4** measured inside the evidence footprint with binary evidence (measured 0.46 / 0.49; 0.6 deferred to graded evidence, v2); **(3) regression** — 90% region area ≤ 1.1 × the recorded golden value; **(4) determinism** — identical inputs (including the input tick time) give a byte-identical payload; permuting evidence order changes nothing; adding a healthy unit never enlarges the 90% emitter region; **(5) latency** — published ≤ **6 s** after an evidence change; compute < 50 ms per update (20k cells × 9 hypotheses × 10 units); **(6) no leak** — over a full run, no topic body or HTTP response contains the truth lat/lon (to 4 dp), EIRP or mast, and no estimate carries an emitter point (`mode`) while the `HS-26` gate is unmet (MVP: never); **(7) trigger** — no estimate at top match ≤ 4/6 or lead < 2/6; `unbounded` with no polygon when no same-class healthy unit bounds the edge; **(8) staleness** — `stale` 10 s after the trigger drops, retired (empty retained payload, logged) 120 s after the trigger drops; **(9) AAR** — each state change appears once in `events`; **(10) dependencies** — no new web runtime dependency; the estimator crate adds no third-party crate beyond `serde` (`NFR-07`). |
| **Traces to** | `HS-20`, `HS-21`, `HS-22`, `HS-24`, `HS-25`, `HS-26`, `B-1:15`, `B-1:50`, `B-2:15` |
| **Demo-scope** | **Planned** — `docs/plans/jammer-aoe.md` (plan + Storybook previews only on `feat/aoe-preview`). |
| **R14 defensive answer (verbatim)** | *"It's a fixed-grid evidence map. Each cell's value is a product of published link-budget tests against what our own receivers reported — no training, no learned weights, same input gives the same bytes. The 90% is the share of that closed-form evidence mass inside the contour, and we never draw the jammer itself unless bearings pin it down."* |
| **Path-forward** | Graded C/N0 / AGC likelihoods and moving-unit history (v2); military-CRPA and in-flight bands (v2); DF bearings / AOA and the emitter symbol (v3, `HS-26`); CoT `u-d-f` export (`HS-28`); terrain / ITM. |

---

## 3. Functional requirements — trust score publication

### 3.1 Continuous trust score

| Field | Value |
|---|---|
| **ID** | `FR-05` |
| **Statement** | The system shall publish a continuous trust score in `[0.0, 1.0]` per source, updated at least once per second per active source, on MQTT topic `integrity/trust/{source_id}`. |
| **Input** | Aggregated outputs of `FR-01..04` |
| **Output** | JSON payload `{source_id, score, components: [temporal, stability, spatial, fingerprint], timestamp}` to MQTT. Every component is a **trust** value in `[0.0, 1.0]` (1 = healthy, 0 = bad); `fingerprint` = `1 − match strength` of the best `FR-04` match, `1.0` when nothing matches (inverse of the `FR-04a` candidate `score`). |
| **Acceptance** | Demo: numeric score visible on hover (≤10-min UI label sharpening per v5.1.1); score behavior is monotonic-down during degradation, monotonic-up during recovery |
| **Traces to** | `UR-01`, `UR-06`, all demo beats |
| **Demo-scope** | Yes — engine already publishing in 80%-built state |

---

## 4. Functional requirements — rendering layers (2 in-scope)

### 4.1 Track-level icon decay (Layer A)

| Field | Value |
|---|---|
| **ID** | `FR-06` |
| **Statement** | The system shall render each track icon with opacity proportional to its source's current trust score, with a pulsing halo at `score < 0.6` and full fade at `score < 0.3`. |
| **Input** | MQTT trust-score stream (`FR-05`) |
| **Output** | MapLibre layer updates per frame; same payload feeds the conditional AIP secondary surface |
| **Acceptance** | Demo: Unit B icon visibly fades during 0:45 → 1:50 (≈0.70 at 0:45, ≈0.65 at 0:55, 0.13 at 1:15, 0.22 at 1:50); snaps back to full opacity (1.00) at 2:15 recovery. A and C stay at 1.00 throughout |
| **Traces to** | `UR-01`, `UR-02`, `B-0:45` through `B-2:15` |
| **Demo-scope** | Yes — load-bearing visual |

### 4.1a Area-of-effect layer and panel (Layer A, AoE)

| Field | Value |
|---|---|
| **ID** | `FR-06a` |
| **Statement** | The system shall draw the `FR-04b` estimate on the COP — on whichever spine is on stage, from the same payload — as a 90% area (fill + edge) and a 50% area (dashed outline) per published receiver class, each labelled as an estimate with method, level, age and evidence counts, and shall add an **Area of effect** block to the top candidate card listing the evidence units and the friendly units and mission points inside each area. It shall not draw a jammer point, a bearing line without a bearing observation, or a fixed-radius ring. |
| **Input** | `integrity/emitter/estimate` (`FR-04b`); tracks; open fire missions |
| **Output** | Map layers on both spines; label `Est. GPS denial · <method>-class · 90% · <age> · <n> degraded / <m> healthy`; a two-swatch key (90% fill, 50% dash); the card block (evidence ✕ / ○ with ages; *"Inside: OBS B (AB1001 observer) — 90%"*, GPS-dependent first; *"not assessed — ground receivers only"* for unmodelled classes); stale rendering (outline only, *"Last est. HHMMZ"*); removal on retirement. |
| **Acceptance** | **(1)** At `B-1:15` the civil-GNSS 90% and 50% areas, the label and the card block render on MapLibre and on Cesium from the same fixture. **(2)** No solid hostile EW symbol, no bearing line and no jammer ring anywhere in the COP; a CI grep finds no `JAMMER_LOCATION` / truth import outside sim-evaluation stories. **(3)** `stale` → outline only + *"Last est."*; empty retained payload → nothing drawn; the C2 also goes stale on its own after 2 missed heartbeats. **(4)** Every AoE edge ≥ 3:1 against 99% of AO basemap pixels and no AoE colour confusable with the trust or gating hues under deuteranopia / protanopia (Branding T5 method). **(5)** No flashing; one fade-in ≤ 300 ms, none under reduced motion. **(6)** Zero new web runtime dependencies (deck.gl `PolygonLayer` / `PathStyleExtension`, Cesium entities). |
| **SHOULD** | Areas beyond the evidence footprint drawn outline-only, *"extrapolated"*; the military-GNSS (DAGR) layer; the emitter region as a dashed NAI `J1` (`HS-27`). |
| **COULD** | The `J1?` status-1 symbol under the `HS-26` gate; layer toggle chips; "Fit to NAI". |
| **Traces to** | `HS-20`, `HS-21`, `HS-22`, `HS-25`, `HS-26`, `HS-27`, `B-1:15`, `B-1:50`, `B-2:15` |
| **Demo-scope** | **Planned** (previews only: Storybook *Previews/Jammer AoE*). If the §6c gate leaves only one spine on stage, the other spine's AoE drawing may slip; removing its hard-coded jammer may not. Cesium is the default renderer (`Spine.tsx`), so its AoE drawing is in the MVP. MVP per the plan review: civil GNSS drawn; DAGR listed in the card only; the SHOULD items (outline-only extrapolation, DAGR map layer, NAI) are deferred. |

### 4.2 TSS mission check (Layer B)

| Field | Value |
|---|---|
| **ID** | `FR-07` |
| **Statement** | The system shall evaluate the target selection standards (TSS) link-reliability and report-age checks for each fire mission whose dependency set (observer link, target-location source, firing-unit nav/GPS link) includes a rated source, against the TSS table in force for the mission's munition class, and render the result inline in the mission row with the recommended method of control and pre-planned branches. It shall not render a modal, scrim or blur, nor move focus. It recommends to the FDC and never issues a fire command. |
| **Input** | Trust-score stream (`integrity/trust/+`) + fire missions (`fires/mission/{id}`, retained, `FireMissionSchema`) + the TSS table in force (version, DTG, approver, rows) |
| **Output** | Per mission: per-check results (reliability = J letter vs the class minimum; report age vs the class maximum; accuracy "n/a — no TLE source"), PASS / FAIL, failing sources, recommended method of control (`DO NOT LOAD` for a gated munition; `AT MY COMMAND` while a re-rate runs; `CHECK FIRING / CEASE LOADING` if the mission is already firing; none for unguided). Branches `[1]` shift → M795 HE (re-run TSS), `[2]` confirm via alternate means (credibility → 1), `[3]` AT MY COMMAND — re-rate in 60 s, `[4]` accept risk (FSO / CDR, HPT exception row). Every branch is logged with mission id, TSS result, J, report age, role / initials and DTG. |
| **Acceptance** | Defaults (TSS-1): GPS-guided C (≥ 0.60) / 10 s; laser-guided C / 30 s; unguided never gated; HPT exception D / 10 s with risk acceptance. Hysteresis: fail at once, pass after ≥ minimum for 5 s. Demo: AB1001 (OBS B, M982) arrives at 1:12 TSS PASS (B C3) and shows `TSS: FAIL — RELIABILITY E5 (min C)` · `Rec. method of control: DO NOT LOAD (M982)` from 1:15; the operator presses `1` → M795 HE, TSS PASS, logged. No open mission → no gate UI. |
| **Traces to** | `HS-05` (was `UR-05`), `UR-06`, `UR-07`/`HS-07`, `B-1:12`, `B-1:15`, `B-1:20` |
| **Demo-scope** | **Yes — load-bearing beat. The 30 seconds that win the demo (1:15 → 1:50).** |

### 4.2a TSS geometry advisory (AoE)

| Field | Value |
|---|---|
| **ID** | `FR-07a` |
| **Statement** | For each open fire mission, the system *should* test each dependency point against the `FR-04b` estimate for the receiver class that matters there (observer link → the observer's class; target of a GPS-guided round → military GNSS; firing-unit nav → DAGR) and show the result as an **advisory** after the TSS headline. The advisory shall never change the TSS verdict, the recommended method of control or the branch set. |
| **Input** | `FR-07` mission evaluation; `integrity/emitter/estimate` |
| **Output** | `advisories[]` per mission: point, class, level (90% or 50%); row text `ADVISORY OBS B in est. GPS denial (90%)` |
| **Acceptance** | At `B-1:15` AB1001 reads `TSS: FAIL — RELIABILITY E5 (min C) · ADVISORY OBS B in est. GPS denial (90%)`. Over every mission fixture, verdict, method of control and branches are identical with and without an estimate. No estimate, or no point inside the 50% area → no advisory. `aria-live` behaviour unchanged. |
| **Traces to** | `HS-23` (SHOULD) |
| **Demo-scope** | **Planned, SHOULD — deferred from the AoE MVP** (plan review 2026-10-04: not cheap, and the `HS-22` card line carries the same fact at 1:15). Supersedes the AoE design's "CAUTION → AT MY COMMAND" rule: reliability stays the only hard gate (`HS-05`). |

### 4.3 Trust-trace LLM narration

| Field | Value |
|---|---|
| **ID** | `FR-08` |
| **Statement** | The system shall generate human-readable trust-trace bullets via LLM function-calling, using deterministic detection events as structured inputs (no free-form generation about facts not in the input). |
| **Input** | Detection event payloads from `FR-01..04` |
| **Output** | 3-bullet trust trace strings rendered next to the affected track |
| **Acceptance** | Demo: trust traces appear at 0:45, 0:55, 1:05, 1:15 with content matching the detection event payloads |
| **Traces to** | `UR-06`, `UR-07`, all detection beats |
| **Demo-scope** | Yes. **Local-fallback path:** Llama 3.2 3B answers on the laptop if Anthropic API is unreachable — offline guarantee preserved |

---

## 5. Non-functional requirements

| ID | Statement | Acceptance |
|---|---|---|
| `NFR-01` | The demo shall run **fully offline** on a single laptop. | No external HTTP calls during 5-minute slot; MapLibre tiles served from PMTiles; LLM falls back to local Llama 3.2 3B if API unreachable |
| `NFR-02` | The demo shall start with a single `docker compose up`. | Fresh laptop reproduces the demo state in ≤5 minutes |
| `NFR-03` | The system shall run on **laptops + Androids only.** | No drones, SDR, Jetson, Pi anywhere in the demo path |
| `NFR-04` | The system shall expose a **pre-recorded fallback video** one keystroke away on the demo laptop (R2 mitigation). | `~/demo-fallback.mp4` exists; tested before stage time |
| `NFR-05` | The system shall preserve the MapLibre demo path as **non-negotiable spine** even if AIP integration fails. | AIP is additive only; failure of AIP plumbing does not regress MapLibre demo |
| `NFR-06` | The system shall freeze scope at **Saturday 11:30 PT** and accept no new dependencies after **Sunday 6:00 AM PT**. | R4 mitigation enforced by tech lead |
| `NFR-07` | The dependency budget for the demo path shall be ≤25 direct dependencies. | Each new dep needs a 30-second justification. `FR-04b` / `FR-06a` add **zero** web runtime deps and no third-party Rust crate beyond `serde` (hand-rolled contours, jammer-aoe.md D9) |

---

## 6. Out-of-scope (explicit, demo-bounding)

The following are **deliberately out-of-scope for the demo.** They are not bugs, gaps, or oversights — they are scope discipline. If asked, the answer is *"no, by design — see §7 path-forward."*

| Out-of-scope | Why excluded | Defensive answer |
|---|---|---|
| Sensor **payload validity** (is the bit pattern correct?) | We score the **transport**, not the payload. Different layer. | *"By design — payload validation is a different layer. Our discipline is what makes us interoperable."* |
| Sensor **coverage arbitration** (which sensor should we trust for this region?) | Multi-source fusion is a different problem. | *"Out of scope for this build. Path-forward — §7."* |
| **ML-based** classification of any kind in the demo path | SME-corroborated brittleness on time-series ML; threshold-based detection is sufficient for the demo. | *"Threshold-based deterministic detection. Army's data-volume problem on time-series ML informed this choice — see SME interview."* |
| **Cross-domain** anomaly detection (drones, cyber, ISR generality) | SME repeatedly emphasized "stay domain-specific." We are FDC-anchored. | *"FDC is the demo. Cross-domain is path-forward — see §7."* |
| **Real-radio ingest** from a fielded waveform | CHAOS-side moat; out of hackathon hardware bound. | *"Synthetic radio simulator on stage. Real-radio is the 6-month follow-on."* |
| **ATAK plugin / Maven track ingest** | Integration contract specified, but not built for the 5-minute slot. | *"Transport-agnostic engine — same model fits ATAK CoT, Maven track ingest, Lattice mesh. Pilot is a path-forward ask."* |
| **Multi-user / auth / billing** | Hackathon demos a single signed-in operator. | *"Out of scope for hackathon."* |
| **Drones, SDR, Jetson, Pi** | Hardware bound (laptops + Androids only). | *"By constraint — see Tech Stack."* |
| **Emitter localization** from friendly power-only evidence (a jammer point, bearing line or ring) | Received-power evidence cannot separate a strong distant jammer from a weak close one; the 90% emitter region stays ~800–900 km² (`FR-04b`). | *"We show where it denies you, not where it is. A point needs bearings — that's the DF follow-on."* |
| **CoT / TAK export of the AoE** (`HS-28`, COULD) | ATAK ingest is out of scope above; the jammed-link map is EEFI and needs handling rules first. | *"The estimate is a retained MQTT payload; a CoT `u-d-f` bridge is a small path-forward adapter."* |
| **Outbound-asset trust scoring** (Palantir's lane) | Clean competitive carve-out; we score inbound. | *"Palantir scores outbound drones. We score inbound sensor data. Different population."* |

---

## 7. Path-forward (post-hackathon, for pitch slide 6)

A 6-month follow-on funded engagement would deliver, in priority order:

1. **Real-radio ingest** from a fielded waveform — exercises the CHAOS-side moat (HIL + sensor emulation + error injection)
2. **Extended fingerprint library** validated against open EW datasets — keeps detection threshold-based but expands coverage
3. **ATAK plugin pilot** with a willing unit — proves the *"drops onto any C2"* claim in the field
4. **Coverage arbitration** layer — multi-source trust composition for fused tracks
5. **ML-based fingerprint classification** — only after ground-truth EW dataset volume problem is solved (cited SME constraint)
6. **AoE v2 / v3** — graded C/N0 / AGC evidence (IoU target 0.6), in-flight munition band, DF bearings and the earned emitter symbol (`HS-26`), CoT export (`HS-28`), NAI tasking (`HS-27`)

---

## 8. Traceability matrix

| FR | Statement (short) | Satisfies UR | Demo beat |
|---|---|---|---|
| `FR-01` | Temporal anomaly | `UR-02`, `UR-03` | `B-0:45` |
| `FR-02` | Network stability | `UR-03` | `B-0:55` |
| `FR-03` | Spatial correlation | `UR-04` | `B-1:05` |
| `FR-04` | Jamming fingerprint (threshold) | `UR-04`, `UR-05` | `B-1:15` |
| `FR-04a` | Munitions-impact mapping (top-3 ranked + affected rounds) | `UR-04`, `UR-05`, `UR-07`, `UR-09` | `B-1:15`, `B-1:20` |
| `FR-04b` | AoE estimation, no presumed emitter | `HS-20`, `HS-21`, `HS-22`, `HS-24`, `HS-25`, `HS-26` | `B-1:15`, `B-1:50`, `B-2:15` |
| `FR-05` | Continuous trust score (MQTT) | `UR-01`, `UR-06` | all beats |
| `FR-06` | Track-level icon decay | `UR-01`, `UR-02` | `B-0:45..2:15` |
| `FR-06a` | AoE layer + card block (both spines) | `HS-20`, `HS-21`, `HS-22`, `HS-25`, `HS-26`, `HS-27` | `B-1:15`..`B-2:15` |
| `FR-07` | TSS mission check in the mission row (no modal) | `HS-05`, `UR-06`, `UR-07` | `B-1:12`..`B-1:20` |
| `FR-07a` | TSS geometry advisory (never changes the verdict) | `HS-23` | `B-1:15`..`B-1:20` |
| `FR-08` | Trust-trace LLM narration | `UR-06`, `UR-07` | detection beats |
| `NFR-01..07` | Non-functional | `UR-08` | demo-wide |

> **Demo beat key:** `B-T:SS` corresponds to the storyboard timestamps in [[../../05 - Build Plan/Demo and Pitch]] §"Demo storyboard — Fire & Maneuver vignette."

---

## 9. Cross-references

- [[URS]] — operator-voice requirements that this FRS satisfies
- [[../Capability Selection]] — v5.1.1 thesis and detection-bound discipline
- [[../Tech Stack]] — implementation surface decisions
- [[../Risk Register]] — R13 (AIP), R14 (ML brittleness), R15 (generality drift), R16 (Lattice partial overlap)
- [[../../05 - Build Plan/Demo and Pitch]] — beat-by-beat storyboard
- [[../../06 - Research/SME Interviews/2026-05-02 - SME Interview]] — SME-driven threshold-not-ML scope trim and FDC anchor reinforcement
- [[../../06 - Research/White Paper/01 - PS3+PS1-comms-aware-cop]] — v5 white paper
