---
tags: [strategy, specs, system-design, architecture/spine, discipline/r14, discipline/r15, discipline/r16, demo-bounding, v5.1.2]
status: draft (event-day, ~80% built)
authored-on: 2026-05-03
build-state: ~80% at authoring; build-state column in §4 governs per-component confidence
parent: [[00 - Index]]
related:
  - [[URS]]
  - [[FRS]]
  - [[../Capability Selection]]
  - [[../Tech Stack]]
  - [[../Risk Register]]
  - [[../../05 - Build Plan/Demo and Pitch]]
---

# System Design — Stack Overview (Demo Bounding)

> **Wedge:** continuous trust score → the live reliability and report-age terms of the target selection standards (TSS) on each fire mission. Not link-health rendering (Lattice does that). Not ML classification (R14 forbids it in the demo path). Not cross-domain anomaly detection (R15 binds the FDC seat).
>
> **Synthesis discipline:** this note **synthesizes** [[URS]] §3 + [[FRS]] §1 — it does not restate them. Authoritative architecture table lives in `[[FRS]]` §1; authoritative UR↔FR↔beat matrix lives in `[[FRS]]` §8. This doc adds the data-flow diagram, MQTT contract, build-state confidence, and the three-discipline annotation overlay that the source specs do not carry.
>
> **Three views, one note:** §2 operator (judges/SMEs), §3 system (judge architecture interrogation), §5 implementation (teammates Sunday rehearsal block).

---

## 1. Thesis

The system is a **comms-integrity evaluation layer** that drops onto any C2 surface. It produces a **continuous trust score in `[0.0, 1.0]` per inbound source**, updated ≥1Hz, published on MQTT, consumed by two parallel renderers (**CesiumJS primary 3D spine**; Palantir AIP conditional secondary; **MapLibre retained as Cesium-fail fallback per §6c gate**). When a fire mission depends on a source that fails the TSS for its munition class, the system shows **TSS FAIL in that mission's row** with a recommended method of control (DO NOT LOAD) and pre-planned branches — *shift munition, confirm via alternate means, AT MY COMMAND, accept risk (FSO).* No modal; monitoring is never interrupted.

Three architectural disciplines bind every component:

- **R14 — deterministic boundary.** Detection (`FR-01..04`, `FR-04a`) is threshold-based deterministic matching. LLM (`FR-08`) is function-calling over structured detection events — no free-form generation about facts not in the input.
- **R15 — FDC anchor.** The demo-scope rendering surface is the Battalion Fires Cell COP screen. AEGIS TAO, MSS, UAF, Force Employment are path-forward only.
- **R16 — gradient + gating wedge.** The two load-bearing edges are (a) the continuous score on `integrity/trust/{source_id}` (gradient) and (b) the TSS mission check at `FR-07` (gating, in the mission row). If those two edges aren't visible end-to-end on stage, the wedge isn't demonstrated.

> If a sentence in this doc could describe Lattice without modification, it's too generic — rewrite.

---

## 2. Operator view — what Adam sees

> **Anchor:** Officer Adam, Battalion Fires Cell, Avdiivka counterfactual. Full persona at [[../../Real Life Situational Context/Personas/P1 - Battalion Fires Officer]]; counterfactual at [[../../Real Life Situational Context/Brief 3 (MAIN) - Excalibur in Avdiivka]]; storyboard at [[../../05 - Build Plan/Demo and Pitch]].

The 5-minute demo flow Adam triggers, beat by beat:

1. **`B-0:00`** — COP renders Units A, B, C with full-opacity icons. Each carries a continuous trust score visible on hover. *(`UR-01`, `FR-05`, `FR-06`)*
2. **`B-0:45`** — Unit B's inter-arrival time stretches from ~1.0s to 1.17s (3.4σ). Temporal anomaly fires; trust drops to ≈0.70 (WATCH band, still at/above the 0.60 GPS-guided TSS minimum, C); B's icon begins to fade; trust trace beside it reads *"B-link cadence degraded 18s ago — investigating."* *(`UR-02`, `UR-03`, `FR-01`, `FR-06`, `FR-08`)*
3. **`B-0:55`** — CRC error rate climbs 0.2% → 6% (past the 5% threshold). Trust ≈0.65, still WATCH. Trust trace updates: *"B-link: 6% corrupted frames, cadence 1.17s."* *(`UR-03`, `FR-02`, `FR-08`)*
4. **`B-1:05`** — Spatial discrimination clears blanket-EMI hypothesis. Side panel: *"Degradation localized at B — no degrading unit within 500 m. A, C healthy."* A and C hold at 1.00 on their own `FR-05` scores; B's spatial component reads localized (0.60): no unit sits within 500 m of B in the km-scale layout. *(`UR-04`, `FR-03`)*
5. **`B-1:15`** — The jammer reaches full power: cadence 1.0s → 6.1s gap, CRC 0.2% → 14%, and the fingerprint matcher names the candidate jammer profiles, ranked: `ground_based_gps_uhf_barrage (1.00) → affected: Excalibur, JDAM-ER, Switchblade 300, GMLRS-U`. Two more candidates shown with their munitions-affected lists; per-candidate citations on hover. B's trust falls to 0.13, its first score below the 0.60 GPS-guided TSS minimum (C → E5). *(`UR-04`, `UR-09`, `FR-04`, `FR-04a`)* **AoE (planned, `FR-04b` / `FR-06a`):** the high match (6/6, leading by ≥ 2/6) triggers the first estimate. The COP shows the civil-GNSS area of effect — 90% fill, 50% dashed outline — labelled `Est. GPS denial · Pole-21-class · 90% · 3 s ago · 4 degraded / 4 healthy`, and the card lists *"Inside: OBS B (AB1001 observer) — 90%"*. **No jammer point, no bearing line, no ring:** the emitter's position is known only to the simulator. *(`HS-20`, `HS-21`, `HS-22`, `HS-24`)*
6. **`B-1:20` (the wedge) — call for fire at B fails TSS in-row.** At `B-1:12` OBS B (FO) sends a call for fire, AB1001, for M982 Excalibur (`fires/mission/AB1001`); it enters the mission queue as TSS PASS (B C3). At `B-1:15` B drops to E5 and the row — not the screen — changes: `FM AB1001 | OBS B (FO) | M982 (GPS) | TSS: FAIL — RELIABILITY E5 (min C) · AGE 1s OK`, `Rec. method of control: DO NOT LOAD (M982)`, branches `[1] Shift → M795 HE, adjust fire` / `[2] Confirm via alt channel` / `[3] AT MY COMMAND — re-rate in 60 s` / `[4] Accept risk… (FSO)`. No modal, no scrim, focus unchanged. Adam presses `1`: the mission re-plans to M795 HE, TSS PASS (unguided is not gated); the branch is logged with mission id, TSS result, J, report age, role and DTG. *(`HS-05`, `UR-06`, `UR-07`, `FR-07`)* **SHOULD (`FR-07a`), deferred from the AoE MVP:** the row adds `ADVISORY OBS B in est. GPS denial (90%)`; the verdict and branches do not change. *(`HS-23`)*
7. **`B-1:50` → `B-2:15` — the estimate follows its evidence (planned).** B repositions and reports healthy; the estimate recomputes within 6 s and the area edge moves. At `B-2:15` the jammer is off: 10 s later the area is outline-only, *"Last est. HHMMZ"*; at +120 s it is retired. Each change is an after-action line. *(`HS-21`, `HS-24`, `HS-25`, `FR-04b`, `FR-06a`)*

> **Simulator decisions behind these beats ([ASM], `services/comms-sim/src/comms_sim/scenarios/avdiivka.py`).** Every symptom comes from one hidden two-module EW site through a stated link budget; nothing is scripted per unit. Two modelling decisions are assumptions, calibrated on B:
> - **Per-net control stations.** Each unit's comms signal is its own net control station's signal at the unit (fire-support, command and battery nets; 50 W, 10 m masts). The jammer-to-signal ratio is formed per unit against that station.
> - **Net-sync latch.** A link has two states. In sync, any positive margin costs about one retry in six frames (1.17 s). Once the margin reaches 9 dB the radio loses net sync and falls back to a robust mode whose cadence grows with the margin, and it re-syncs only when the margin drops below 0 dB. This hysteresis is why B at 1:50 shows a lower CRC than at 0:55 (4% vs 6%) but a longer cadence (1.8 s vs 1.17 s).
> - **Side effect:** the observers D and H share B's fire-support net, so their comms also degrade from `B-0:45`. These values are recorded as goldens, not pinned; the beats above pin only A, B and C.

The **30 seconds that win the demo are 1:15 → 1:50.** Everything else is setup or recovery.

---

## 3. System view — layered architecture

```mermaid
flowchart LR
    subgraph SIM["Synthetic comms layer"]
        CS["Comms Simulator<br/>(Python, CHAOS-owned)<br/>RSSI / packet loss / jamming events"]
    end

    subgraph ENGINE["Trust engine — source of truth"]
        RUST["Rust async (Tokio + Axum)<br/>FR-01 temporal · FR-02 stability<br/>FR-03 spatial · FR-04 fingerprint<br/>FR-04a ranked candidates + munitions"]
        STORE[("RocksDB / DuckDB / SQLite<br/>single-binary, no external infra")]
    end

    subgraph BUS["Transport spine — MQTT"]
        T1["integrity/trust/{source_id}<br/>continuous score @ ≥1Hz"]
        T2["integrity/fingerprint/candidates<br/>top-3 + munitions affected"]
        T3["integrity/emitter/estimate<br/>AoE contours (retained) — planned"]
    end

    subgraph RENDER["Renderers — parallel fan-out"]
        CESIUM["CesiumJS + Next.js<br/>(local 3D Tiles + terrain server)<br/>PRIMARY 3D SPINE — Sunday gate"]
        ML["MapLibre + Next.js<br/>(PMTiles offline)<br/>FALLBACK — verified, gated by §6c"]
        AIP["Palantir AIP ontology object<br/>CONDITIONAL — 1300 gate"]
        LLM["LLM narrator<br/>Anthropic primary / Llama 3.2 3B fallback"]
    end

    subgraph SURFACE["Operator surface — FDC seat"]
        ADAM["Officer Adam — COP screen"]
        ROW["Fire-mission row<br/>TSS verdict + branches (no modal)"]
    end

    CS -- "FR-01..04 inputs" --> RUST
    RUST <--> STORE
    RUST -- "FR-05" ==> T1
    RUST -- "FR-04a" --> T2
    RUST -. "FR-04b (planned)" .-> T3
    T3 -. "FR-06a AoE layer" .-> CESIUM
    T3 -. "FR-06a AoE layer" .-> ML
    T1 -- "FR-06 (entity alpha)" --> CESIUM
    T1 -. "FR-06 (fallback path)" .-> ML
    T1 -. "FR-06 (same payload)" .-> AIP
    T2 -- "glTF models @ candidate sites" --> CESIUM
    T1 -- "FR-08 inputs" --> LLM
    LLM -- "FR-08 (3-bullet trace)" --> CESIUM
    CESIUM --> ADAM
    ML -. fallback surface .-> ADAM
    AIP -. additive surface .-> ADAM
    FM["fires/mission/{id}<br/>calls for fire"] --> ROW
    T1 == "FR-07 — TSS check (reliability, report age)" ==> ROW
    ROW --> ADAM
```

**Legend:**
- **Solid edges** — verified at authoring (~80%)
- **Dashed edges** — conditional (AIP 1300 gate, LLM fallback path)
- **Bold edges (`==>`)** — R16 wedge: continuous score (gradient) + TSS mission check (gating)

**Spine narration.** The Rust trust engine is the single source of truth. It consumes per-source telemetry from the comms simulator, runs four deterministic detectors plus the FR-04a overlap-ratio matcher, and publishes the continuous score on MQTT. **CesiumJS is the primary rendering spine** — chosen for true 3D terrain, line-of-sight on the Avdiivka counterfactual, geolocated glTF jammer-system models from `FR-04a` candidates, and a CZML-driven scrubbable timeline that hardens demo recovery. MapLibre + PMTiles is **retained as a verified fallback** per §6c — if the Sunday Cesium spike does not gate green, the demo falls back to MapLibre with no architecture change (the MQTT contract in §5 is renderer-agnostic by design). Storage is single-binary (RocksDB/DuckDB/SQLite); no external database in the demo path. `NFR-05` (something must render on stage) is satisfied by the Cesium-or-MapLibre dual path, not by Cesium alone.

**Conditional wing.** Palantir AIP is an **additive secondary surface** that consumes the same MQTT trust score via a ~50-line REST/webhook shim. AIP renders the score on a Palantir ontology object representing each emitting unit. The AIP edge in the diagram is dashed because it is gated by the 1300 Saturday go/no-go (see §6a). The LLM narrator path has its own conditional fallback — Anthropic Claude function-calling primary, Llama 3.2 3B local fallback — gated by network reachability at demo time per `NFR-01`.

**Where the disciplines live in the diagram.** R14 binds the `RUST` and `LLM` nodes — detection is deterministic, narration is function-calling-only over structured inputs. R15 binds the `SURFACE` subgraph — there is exactly one demo-scope operator seat, and it is FDC. R16 binds the two bold edges — `T1 → ROW` (TSS evaluator → mission row) is the gating; `RUST → T1` is the gradient. **The Cesium swap does not move any of these disciplines** — it changes the renderer node only. The MQTT contract is the discipline boundary, not the frontend.

---

## 4. Master traceability — UR → FR → component → owner → build state → risk

> Extends `[[FRS]]` §8 (which is UR↔FR↔beat only) with stack component, ownership, and build-state confidence. Build state values are strict: **`verified`** = wired and confirmed at authoring; **`scoped`** = present in spec, not yet end-to-end confirmed; **`conditional`** = gated (AIP / LLM fallback / FR-04a top-N).

| UR | FR | Component (stack layer) | Owner | Build state | Risk hooks |
|---|---|---|---|---|---|
| `UR-01` continuous trust per track | `FR-05` | Rust engine score aggregator → MQTT `integrity/trust/{source_id}` | Tech lead | verified | R16 gradient edge |
| `UR-02` visible icon fade on jam | `FR-06` | Cesium `Entity.billboard.color.alpha` bound to score via `CallbackProperty`; pulsing halo at <0.6, full fade <0.3 (MapLibre fallback path retained) | Frontend (Joseph/Evan) | scoped — Sunday Cesium spike | R18 (judge dismisses if novelty isn't visible early); **R-NEW Cesium unfamiliarity** |
| `UR-03` plain-English degradation reason | `FR-01`, `FR-02`, `FR-08` | Rust detectors → MQTT → LLM narrator (function-calling) | Tech lead + LLM owner | verified | R14 narration drift |
| `UR-04` localized vs. blanket; named jammer | `FR-03`, `FR-04` | Spatial correlation discriminator; threshold-based fingerprint matcher; **Cesium terrain-masked LOS overlay from candidate jammer site → Unit B's flank corridor** *(superseded by `HS-20`: no candidate jammer site exists to draw from; LOS from an emitter point only after the `HS-26` gate)* | Tech lead | scoped — detector verified, LOS overlay Sunday | R14 (must read as deterministic, not classifier) |
| `UR-04`, `UR-09` ranked candidates + munitions affected | `FR-04a` | Overlap-ratio matcher; MQTT `integrity/fingerprint/candidates`; **Cesium `Cesium3DTileset` glTF models geolocated at candidate sites (R-330Zh Zhitel, Pole-21)** *(superseded by `HS-20`: no geolocated jammer models; the AoE layer `FR-06a` replaces them)* | Tech lead (UI: Joseph/Evan) | scoped — depends on FR-04 top-N + Sunday Cesium spike + glTF asset prep | R14 verbatim defense; R15 inventory-list discipline; **R-NEW glTF asset bundling** |
| `HS-05` (was `UR-05`) TSS FAIL in the mission row | `FR-07` | `lib/tss.ts` evaluator + versioned TSS table + `components/fires` mission queue/row in the side column (no modal) | Frontend | implemented (feat/tss-mission-row) | R16 gating edge; text-first status (R18) |
| `UR-06` 3-bullet trust trace per AI rec | `FR-07`, `FR-08` | LLM function-calling over structured detection events | LLM owner | verified | R14 (no free-form generation) |
| `UR-07` (`HS-07`) pre-planned branches | `FR-07` | Row branches: shift → M795 / confirm via alternate means / AT MY COMMAND / accept risk (FSO) — keys 1–4 | Frontend | implemented | R16 (options must be concrete, not yes/no) |
| `UR-08` offline single-laptop guarantee | `NFR-01..03` | docker compose; **local Cesium 3D Tiles + terrain server (~2–4GB bundle)**; Llama 3.2 3B local fallback; **MapLibre + PMTiles retained as Cesium-fail fallback (~200MB)** | Tech lead | scoped — bundle size + offline cold-start verification Sunday | R6 API rate limits; **R2 demo failure (raised by spine swap)**; **R-NEW demo-laptop SSD/RAM headroom** |
| `HS-20` jammer location never presumed (MUST) | `FR-04`, `FR-04b`, `FR-06a` | comms-sim hidden `EmitterTruth` + link budget; engine no-leak test; delete `JAMMER_LOCATION`, the B→jammer vector and the 120 m ring from both spines | Sim + frontend | planned (feat/aoe-preview: plan + previews) | R14; scenario re-calibration of the trust beats |
| `HS-21` estimated AoE on a high match (MUST) | `FR-04b`, `FR-06a` | `estimator` crate (grid, two-ray, binary probit, contours) → `integrity/emitter/estimate` → AoE layers on both spines | Tech lead + frontend | planned | R14 wording (§7); Cesium ground-polygon outline gotcha |
| `HS-22` who is inside the AoE (MUST, civil GNSS) | `FR-04b`, `FR-06a` | `lib/aoe.ts` point-in-MultiPolygon → candidate-card AoE block | Frontend | planned | false "denied" claims for unmodelled classes |
| `HS-23` TSS advisory (SHOULD) | `FR-07a` | `evaluateTss` `advisories[]` → `MissionRow` chip | Frontend | deferred (plan review 2026-10-04) | must never change the verdict |
| `HS-24` AAR record (MUST) | `FR-04b` | DuckDB `emitter_estimates` + `events` kind `emitter_estimate` → event terminal line | Tech lead | planned | — |
| `HS-25` stale / retire (MUST) | `FR-04b`, `FR-06a` | ticker hold 10 s → `stale`, retire 120 s; web stale timer | Tech lead + frontend | planned | — |
| `HS-26` earned emitter symbol (COULD), `HS-27` NAI (SHOULD), `HS-28` CoT (COULD) | `FR-04b`, `FR-06a`, path-forward | symbol gate; NAI graphic; CoT bridge | — | deferred | EEFI (CoT) |
| (all UR) AIP secondary surface | `FR-06` (same payload) | REST/webhook shim → Palantir AIP ontology object | Joseph or Evan (NOT Kristian) | conditional — 1300 Saturday gate | R13 AIP bandwidth; R19 vendor-neutral erosion |
| (all UR) **MapLibre fallback spine** | `FR-06`, `FR-07` (same payload) | MapLibre + PMTiles renderer; activated only if §6c Cesium gate fails Sunday | Frontend | verified — held in reserve | R2 mitigation; preserves `NFR-05` |

**Sunday rehearsal block obligation:** flip any rows whose state has changed since authoring. NOT Kristian — Joseph or Evan walks the table (R13/R18 discipline).

---

## 5. MQTT contract — integration spine

> The Rust engine is source of truth. AIP and LLM are **consumers**. We do not port the trust engine into AIP Logic primitives. (Synthesized from `[[../Tech Stack]]` §"Optional secondary rendering surface.")

### 5.1 Topic — `integrity/trust/{source_id}` (per `FR-05`)

**Payload:**

```json
{
  "source_id": "unit_b",
  "score": 0.13,
  "components": {
    "temporal": 0.00,
    "stability": 0.31,
    "spatial": 0.60,
    "fingerprint": 0.00
  },
  "timestamp": "2026-05-03T18:42:14.221Z"
}
```

*(Engine output for Unit B at `B-1:15`: 6.1 s gap, 14% CRC, localized, jammer matched 6/6. Healthy units publish 1.00 on every component. The engine also echoes the source's reported `lat`/`lon` as optional fields.)*

**Properties:**
- Publication rate ≥1Hz per active source
- `score` ∈ `[0.0, 1.0]`
- Every component is **trust-oriented**: 1.0 = healthy, 0.0 = bad. `fingerprint` = `1 − match strength` of the best `FR-04` match (≥ 0.5), `1.0` when nothing matches. Do not confuse it with the §5.2 candidate `score`, which is match strength.
- Monotonic-down during degradation; monotonic-up during recovery
- `components` is the per-detector breakdown that feeds the LLM narrator (`FR-08`) — judges may probe the per-detector contribution; this surface is the answer

### 5.2 Topic — `integrity/fingerprint/candidates` (per `FR-04a`)

**Payload:**

```json
{
  "source_id": "unit_b",
  "candidates": [
    {
      "method_id": "ground_based_gps_uhf_barrage",
      "named_systems": ["R-330Zh Zhitel", "Pole-21"],
      "score": 1.0,
      "munitions_affected": ["Excalibur", "JDAM-ER", "Switchblade 300", "GMLRS-U"],
      "source_citation": "Bronk, Reynolds & Watling, RUSI \"The Russian Air War and Ukrainian Requirements for Air Defence\" (Nov 2022); NTC REB Pole-21E manufacturer page (archived 2018-01-15)"
    },
    {
      "method_id": "pulsed_uhf_wide",
      "named_systems": ["Lorandit"],
      "score": 0.6666666666666666,
      "munitions_affected": ["FPV C2 link", "Switchblade 300"],
      "source_citation": "JAPCC 2023"
    },
    {
      "method_id": "cellular_uhf_barrage",
      "named_systems": ["R-934B Sinitsa"],
      "score": 0.16666666666666666,
      "munitions_affected": ["ATAK position-share", "FPV C2 link"],
      "source_citation": "JAPCC 2023"
    }
  ],
  "timestamp": "2026-05-03T18:42:14.221Z"
}
```

**Properties:**
- Top-3 always; pad with score 0.0 entries if matcher returns fewer
- `score = (count of fingerprint-dimension threshold booleans matched) / (total fingerprint dimensions)` — **deterministic overlap ratio, no model**. With 6 dimensions, values are `k/6`. This is **match strength** (higher = more like that jammer), not trust; see §5.1 `components.fingerprint`
- `source_citation` rendered on hover — reinforces R14 public-characterization defense

### 5.2a Topic — `fires/mission/{mission_id}` (per `FR-07`)

Calls for fire, **retained**, `FireMissionSchema` (`packages/contracts/src/fire-mission.ts`; TS only — the engine does not consume it): `mission_id` (e.g. `AB1001`), `observer {source_id, label}`, `target {grid, lat, lon, description, class: standard|hpt}`, `munition {designation, name, class: gps_guided|laser_guided|unguided}`, `firing_unit`, `dependencies [{source_id, role: observer_link|target_location|firing_unit_nav}]`, `status`, `method_of_control`, `received_at`. An empty retained payload closes the mission. Demo producer: comms-sim (`missions.py`) — AB1002 (OBS C, M795) at 0:30, AB1001 (OBS B, M982) at 1:12; each run clears the previous run's retained missions first. TSS is evaluated in the web client (`apps/web/src/lib/tss.ts`); see `docs/plans/tss-mission-row.md`.

### 5.4 Topic — `integrity/emitter/estimate` (per `FR-04b`; planned, `docs/plans/jammer-aoe.md`)

Needed by `HS-21` (MUST): the engine owns the estimate and the C2 only draws it. **Retained, QoS 1.** An empty retained payload retires the estimate. `EmitterEstimatePayloadSchema` (zod, strict) / `EmitterEstimatePayload` (`contracts-rs`, `deny_unknown_fields`).

**MVP fields:** `schema: "emitter-estimate/1"`, `estimate_id` (stable per episode, e.g. `J1-…Z`), `state` (`active` | `stale` | `unbounded` | `retired`), `method_id`, `method_match`, `method_ambiguous`, `aoe[] {rx_class, contours[{p: 0.5|0.9, polygon: MultiPolygon, area_km2}], radius_km_range}`, `emitter {region90: MultiPolygon, area90_km2, erp_dbm_range}`, `evidence[] {source_id, state: degraded|healthy, rx_class, age_s, lat, lon}`, `model {kind: "set", propagation: "two_ray", grid_m, hypotheses, sigma_db}`, `evidence_hash`, `computed_at` (from the input tick time), `valid_until` (= publish time + 20 s, two heartbeats). About 4–8 KB per publish.

**Reserved, absent from the MVP schema:** `emitter.mode {lat, lon, ce90_m}` — only when the `HS-26` gate is met (≤ 25 km² or ≥ 2 bearings crossing ≥ 30°); `bearings_used` and `df/bearing/{sensor_id}` (v3). Both schemas are strict, so a payload carrying `mode` is rejected (enforces `HS-20`); v3 adds it under `schema: "emitter-estimate/2"`.

**Properties:**
- Recompute on evidence change (positions quantised to the 250 m grid), at most every 5 s; 10 s heartbeat; `stale` 10 s after the trigger drops; retired 120 s after the trigger drops. GNSS-class evidence comes from `gnss_fix` only (`FR-04b`).
- Deterministic: identical inputs → byte-identical payload (R14, §7).
- **No ground truth.** The simulator's emitter position, EIRP and mast never appear on this or any topic (`HS-20`; no-leak test over a full run).
- Inputs ride on telemetry as two optional fields, `rx_class` and `gnss_fix` (`telemetry/2`); graded C/N0 / AGC fields are v2.
- Every state change is an `events` row of kind `emitter_estimate` plus the stored payload with an evidence hash (`HS-24`).

### 5.3 Consumer contracts

| Consumer | Subscribes to | Status | Notes |
|---|---|---|---|
| **CesiumJS renderer (`FR-06`, `FR-06a`, `FR-07`) — primary** | trust + candidates; `integrity/emitter/estimate` (planned) | scoped — Sunday gate (§6c) | entity `color.alpha` binding via `CallbackProperty`; fire-mission row beside the viewport (no modal); `Cesium3DTileset` glTF jammer models from `integrity/fingerprint/candidates` *(superseded by `HS-20`: no jammer models at candidate sites)* |
| MapLibre renderer (`FR-06`, `FR-06a`, `FR-07`) — fallback | trust + candidates; `integrity/emitter/estimate` (planned) | verified — held in reserve | activated only if §6c Cesium gate fails; preserves `NFR-05` |
| Palantir AIP shim | `integrity/trust/{source_id}` only | conditional (1300 gate) | ~50 LOC REST/webhook bridge → AIP ontology object property |
| LLM narrator (`FR-08`) | `integrity/trust/{source_id}` (uses `components`) | verified | function-calling input shape; **no free-form generation about facts not in payload** |

---

## 6. Conditional surfaces — kill criteria

### 6a. Palantir AIP secondary render

| Field | Value |
|---|---|
| **Trigger to enable** | Trust score successfully publishing into an AIP ontology object property by **1300 Saturday 2026-05-02** |
| **Kill criterion** | If not green by 1300, AIP path **abandoned**. MapLibre demo continues unchanged per `NFR-05` |
| **Owner** | Joseph or Evan — **NOT Kristian** (R13/R18 discipline; integrator stays on the spine) |
| **Demo ordering** | CesiumJS **first** as vendor-neutral 3D spine; AIP **second** as *"and here it is again, on Palantir AIP — same engine, different surface, that's the portability proof"* (R19 mitigation). If §6c gate fails, demo opens on MapLibre; AIP framing unchanged. |
| **Risk** | R13 (bandwidth), R19 (vendor-neutral erosion if framed wrong) |

### 6b. LLM trust-trace narration

| Field | Value |
|---|---|
| **Primary path** | Anthropic Claude function-calling over structured detection events |
| **Fallback path** | Llama 3.2 3B local on the demo laptop |
| **Kill criterion** | Anthropic API unreachable at demo time → **automatic local fallback** per `NFR-01` (offline guarantee) |
| **Discipline** | Function-calling input shape only. **No free-form generation about facts not in the input.** Trace bullets must be derivable from `components` payload alone |
| **Risk** | R6 (API limits); R14 (narration drift if function-calling discipline slips) |

### 6c. CesiumJS primary spine — Sunday gate

| Field | Value |
|---|---|
| **Trigger to commit** | All four conditions green by **1100 Sunday 2026-05-03**: (1) Cesium viewer rendering with local terrain + imagery offline (no Cesium ion network calls), (2) at least one entity's `color.alpha` bound to live MQTT trust score via `CallbackProperty` and visibly fading on jam event, (3) [historical; the modal is superseded by the TSS mission row] DOM modal anchored over the Cesium viewport, (4) demo laptop disk + RAM headroom verified with full 3D Tiles bundle loaded |
| **Kill criterion** | If any condition red by 1100 Sunday → **fall back to MapLibre + PMTiles** (verified). No mid-stage swaps. Decision is final at 1100; no extending the gate |
| **Owner** | Frontend (Joseph/Evan) on Cesium spike; tech lead on MQTT contract — unchanged either way |
| **Why this gate exists** | Cesium swap was committed Sunday morning; the verified MapLibre path was the prior spine. NFR-05 ("something renders on stage") is satisfied by the dual-path option, not by Cesium alone. The MQTT contract (§5) is renderer-agnostic, so the fallback is a frontend swap, not an architecture change |
| **What we lose on fallback** | Terrain-masked LOS overlay (FR-03 visual), geolocated glTF jammer models (FR-04a visual punch), CZML scrubbable timeline. **The wedge (R16 gradient + gating) is preserved on MapLibre** — that's what matters for judges |
| **What we keep on Cesium success** | All of the above, plus the 3D credibility jump in front of military judges |
| **Risk** | **R2 (demo failure) — raised** by mid-rehearsal spine swap; **R-NEW Cesium unfamiliarity**; mitigated by maintaining MapLibre fallback through the 1100 gate |

#### 6c.1 Basemap — both spines (2026-10-03, plan: `docs/plans/cop-basemap.md`)

One data source, one style, two renderings — so the 2D fallback and the 3D primary show the same map, and neither leaves the origin (`NFR-01`).

| Field | Value |
|---|---|
| **Source** | Protomaps daily planet build (OpenStreetMap + Natural Earth, basemap schema v4), extracted with `pmtiles extract` for the Avdiivka AO: bbox 37.60–37.90 E, 48.05–48.23 N, z0–15 → `apps/web/public/tiles/avdiivka.pmtiles` (~4 MB) |
| **Style** | Generated from `@protomaps/basemaps` "dark" flavor (BSD-3-Clause) by `scripts/basemap/build-style.mjs`, re-coloured with the Branding §3 tokens: land within ~2.5 L of `--surface-base`, roads neutral grey ≤ L 40%, place labels `--text-secondary` / `--text-tertiary` on a `--surface-base` halo. No sprite (POI icons, shields, one-way arrows dropped); English labels falling back to the local name. Committed output: `apps/web/src/lib/basemap-layers.json` |
| **Glyphs** | Noto Sans Regular / Medium / Italic PBFs (OFL-1.1) from `protomaps/basemaps-assets` (pinned commit), Latin + Latin Ext + Cyrillic + punctuation ranges only → `/tiles/glyphs` (~1.6 MB). No CDN |
| **MapLibre spine** | `maplibre-gl` map with the `pmtiles://` protocol (`pmtiles` npm, +1 runtime dep); deck.gl area/line layers through `@deck.gl/mapbox` `MapboxOverlay` (overlaid); MapLibre owns the camera and each move is mirrored synchronously into the controlled view state that positions the SVG symbol overlay |
| **Cesium spine** | Cesium cannot draw vector tiles, so `scripts/basemap/render-raster.mjs` renders the same extract + style with MapLibre Native into a 512 px PNG pyramid, z10–15 (labels z14+ only) → `/tiles/raster/{z}/{x}/{y}.png` (~10 MB), served by `UrlTemplateImageryProvider` restricted to the bbox. Still no Cesium ion; globe outside the AO stays `--surface-base` |
| **Modes** | `NEXT_PUBLIC_BASEMAP=offline` (default when the assets exist) · `none` (default otherwise; the pre-basemap look) · `online` — **dev only, not NFR-01**: OSM standard raster tiles, dimmed, CSP opened for `tile.openstreetmap.org` in that mode only |
| **Provisioning** | Assets are gitignored (`apps/web/public/tiles/*`); `make fetch-tiles` (`scripts/fetch-tiles.sh`) reproduces them (~25 s, online, once). `scripts/verify-assets.sh` fails when the mode is offline (explicit or defaulted) and any piece is missing |
| **Licences / attribution** | Data © OpenStreetMap contributors (ODbL 1.0); Protomaps basemap tiles and style (ODbL data / BSD-3-Clause code); Noto Sans (OFL-1.1); MapLibre Native (BSD-2-Clause, build-time only). Both spines show "© OpenStreetMap contributors, Protomaps" bottom-right |
| **Legibility** | T5 grayscale contrast re-run against the real basemap pixels (`scripts/basemap/contrast-check.mjs`): every symbol colour stays ≥ 3:1 against 99 % of AO pixels; the bearing line (40 % opacity by Branding §10.3) was already below 3:1 on the flat surface and is unchanged by the basemap |

---

## 7. Discipline annotations — where R14 / R15 / R16 sit in the architecture

### R14 — deterministic boundary

The threshold-based components are `FR-01` (3σ inter-arrival), `FR-02` (>5% CRC), `FR-03` (neighbor-radius spatial discriminator), `FR-04` (fingerprint threshold-boolean overlap), and `FR-04a` (ranked top-3 by deterministic overlap ratio). The LLM-touched component is `FR-08` only — and it is constrained to function-calling over structured detection events, not free generation. **No model, no training, no probability distribution anywhere in the demo path.** *Amendment (planned `FR-04b`):* the AoE estimator reports closed-form 50% / 90% levels over a fixed grid — deterministic, no learned weights, no sampling, byte-identical for identical input. It is R14-safe, but the "no probability distribution" sentence is then literally false; use the `FR-04b` answer for the estimator.

> **Verbatim defensive answer for judge Q&A** (memorize): *"The score is a normalized count of matched threshold booleans over a fingerprint library publicly characterized by Bronk RUSI 2024 and JAPCC 2023. There is no model, no training, no probability distribution — it's a deterministic overlap ratio. The 'likelihood' framing is operator-readable shorthand for that ratio."*

### R15 — FDC anchor

The demo-scope rendering surface is exactly one operator screen: the FDC COP. AEGIS TAO, MSS Analyst, UAF Artillery Commander, Force Employment Authority are **out-of-architecture** for the demo (URS §5). The munitions-affected list in `FR-04a` does not violate the FDC anchor — the **seat** is unchanged; only the **output** widens to be sensor-/munition-class-agnostic. If a judge asks *"does this work for [other persona]?"* the answer is *"yes, transport-agnostic. The demo is FDC because it's the narrowest, most provable seat. See path-forward."*

### R16 — gradient + gating wedge

Two architecturally load-bearing edges, both rendered bold in §3's diagram:

1. **Gradient** — `RUST → T1` (`integrity/trust/{source_id}`, ≥1Hz continuous score). Lattice surfaces sensor health binary; we surface the **gradient**, which is what makes "are you sure?" actionable.
2. **Gating** — `T1 → ROW` (`FR-07` TSS mission check). The live reliability and report-age terms decide TSS PASS / FAIL on the fire mission that depends on the source. The 30 seconds that win the demo are this edge firing on stage — in the row, not as an interrupt.

If both edges aren't visible end-to-end during the 5-minute slot, the wedge isn't demonstrated — the system reduces to "another COP with link health." The row text *"TSS: FAIL — RELIABILITY E5 (min C)"* and *"Rec. method of control: DO NOT LOAD"* at Beat 1:15–1:20 (R18 mitigation) ensures the load-bearing 30 seconds **says the words.** Stage subtitle: *"Target selection standard not met — source E5."*

---

## 8. Out-of-architecture (explicit, demo-bounding)

These items are **deliberately out-of-architecture for the demo**, not bugs. Defensive answers and full reasoning live in `[[FRS]]` §6 — do not restate.

- Sensor payload validity (different layer)
- Sensor coverage arbitration / multi-source fusion
- ML-based classification of any kind
- Cross-domain anomaly detection (drones, cyber, ISR generality)
- Real-radio ingest from a fielded waveform (CHAOS-side moat, path-forward)
- ATAK plugin / Maven track ingest (transport-agnostic engine; pilot is path-forward)
- Multi-user / auth / billing
- Drones / SDR / Jetson / Pi (hardware-bound to laptops + Androids)
- Outbound-asset trust scoring (Palantir's lane; we score inbound)

---

## 9. Cross-references

- [[URS]] — operator-voice requirements (UR-01..09)
- [[FRS]] — system-voice functional requirements; §1 architecture table; §6 out-of-scope; §8 traceability matrix
- [[../Capability Selection]] — v5.1.1 / v5.1.2 thesis and SME validation
- [[../Tech Stack]] — locked stack table; AIP discipline; dependency budget freeze
- [[../Risk Register]] — R13 (AIP bandwidth), R14 (ML brittleness), R15 (generality drift), R16 (Lattice partial overlap), R18 (judge dismissal), R19 (vendor-neutral erosion)
- [[../../05 - Build Plan/Demo and Pitch]] — Fire & Maneuver storyboard with beat timestamps
- [[../../Real Life Situational Context/Brief 3 (MAIN) - Excalibur in Avdiivka]] — operational counterfactual
- [[../../Real Life Situational Context/Personas/P1 - Battalion Fires Officer]] — full persona reference
- [[../../06 - Research/SME Interviews/2026-05-02 - SME Interview]] — SME-driven discipline anchors
