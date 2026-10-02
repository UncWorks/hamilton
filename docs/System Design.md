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

> **Wedge:** continuous trust score → gates kill-chain action. Not link-health rendering (Lattice does that). Not ML classification (R14 forbids it in the demo path). Not cross-domain anomaly detection (R15 binds the FDC seat).
>
> **Synthesis discipline:** this note **synthesizes** [[URS]] §3 + [[FRS]] §1 — it does not restate them. Authoritative architecture table lives in `[[FRS]]` §1; authoritative UR↔FR↔beat matrix lives in `[[FRS]]` §8. This doc adds the data-flow diagram, MQTT contract, build-state confidence, and the three-discipline annotation overlay that the source specs do not carry.
>
> **Three views, one note:** §2 operator (judges/SMEs), §3 system (judge architecture interrogation), §5 implementation (teammates Sunday rehearsal block).

---

## 1. Thesis

The system is a **comms-integrity evaluation layer** that drops onto any C2 surface. It produces a **continuous trust score in `[0.0, 1.0]` per inbound source**, updated ≥1Hz, published on MQTT, consumed by two parallel renderers (**CesiumJS primary 3D spine**; Palantir AIP conditional secondary; **MapLibre retained as Cesium-fail fallback per §6c gate**). When any source's score crosses the rules-of-engagement floor for a kill-chain action class, the system **interrupts** the recommendation flow with a 3-option modal — *delay, shift munition, confirm via alt channel.*

Three architectural disciplines bind every component:

- **R14 — deterministic boundary.** Detection (`FR-01..04`, `FR-04a`) is threshold-based deterministic matching. LLM (`FR-08`) is function-calling over structured detection events — no free-form generation about facts not in the input.
- **R15 — FDC anchor.** The demo-scope rendering surface is the Battalion Fires Cell COP screen. AEGIS TAO, MSS, UAF, Force Employment are path-forward only.
- **R16 — gradient + gating wedge.** The two load-bearing edges are (a) the continuous score on `integrity/trust/{source_id}` (gradient) and (b) the modal-interrupt at `FR-07` (gating). If those two edges aren't visible end-to-end on stage, the wedge isn't demonstrated.

> If a sentence in this doc could describe Lattice without modification, it's too generic — rewrite.

---

## 2. Operator view — what Adam sees

> **Anchor:** Officer Adam, Battalion Fires Cell, Avdiivka counterfactual. Full persona at [[../../Real Life Situational Context/Personas/P1 - Battalion Fires Officer]]; counterfactual at [[../../Real Life Situational Context/Brief 3 (MAIN) - Excalibur in Avdiivka]]; storyboard at [[../../05 - Build Plan/Demo and Pitch]].

The 5-minute demo flow Adam triggers, beat by beat:

1. **`B-0:00`** — COP renders Units A, B, C with full-opacity icons. Each carries a continuous trust score visible on hover. *(`UR-01`, `FR-05`, `FR-06`)*
2. **`B-0:45`** — Unit B's inter-arrival time jumps from ~1.0s to 6.1s. Temporal anomaly fires; B's icon begins to fade; trust trace beside it reads *"B-link cadence degraded 18s ago — investigating."* *(`UR-02`, `UR-03`, `FR-01`, `FR-06`, `FR-08`)*
3. **`B-0:55`** — CRC error rate climbs 0.2% → 14% in <10s. Trust trace updates: *"B-link: 14% corrupted frames, 6.2s gap."* *(`UR-03`, `FR-02`, `FR-08`)*
4. **`B-1:05`** — Spatial discrimination clears blanket-EMI hypothesis. Side panel: *"Degradation directional, vicinity B's flank corridor. Neighbors A, C unaffected."* *(`UR-04`, `FR-03`)*
5. **`B-1:15`** — Fingerprint matcher names the candidate jammer profiles, ranked: `ground_based_gps_uhf_barrage (1.00) → affected: Excalibur, JDAM-ER, Switchblade 300, GMLRS-U`. Two more candidates shown with their munitions-affected lists; per-candidate citations on hover. *(`UR-04`, `UR-09`, `FR-04`, `FR-04a`)*
6. **`B-1:20` (the wedge)** — AI **declines** the GPS-guided strike. Modal: *"Kill-chain gated below ROE floor."* Three options: `delay 60s` / `shift to non-GPS munition` / `confirm via alt channel.` Adam picks (b); decision logged with full trust state. *(`UR-05`, `UR-06`, `UR-07`, `FR-07`)*

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
    end

    subgraph RENDER["Renderers — parallel fan-out"]
        CESIUM["CesiumJS + Next.js<br/>(local 3D Tiles + terrain server)<br/>PRIMARY 3D SPINE — Sunday gate"]
        ML["MapLibre + Next.js<br/>(PMTiles offline)<br/>FALLBACK — verified, gated by §6c"]
        AIP["Palantir AIP ontology object<br/>CONDITIONAL — 1300 gate"]
        LLM["LLM narrator<br/>Anthropic primary / Llama 3.2 3B fallback"]
    end

    subgraph SURFACE["Operator surface — FDC seat"]
        ADAM["Officer Adam — COP screen"]
        MODAL["Kill-chain modal<br/>3 named options"]
    end

    CS -- "FR-01..04 inputs" --> RUST
    RUST <--> STORE
    RUST -- "FR-05" ==> T1
    RUST -- "FR-04a" --> T2
    T1 -- "FR-06 (entity alpha)" --> CESIUM
    T1 -. "FR-06 (fallback path)" .-> ML
    T1 -. "FR-06 (same payload)" .-> AIP
    T2 -- "glTF models @ candidate sites" --> CESIUM
    T1 -- "FR-08 inputs" --> LLM
    LLM -- "FR-08 (3-bullet trace)" --> CESIUM
    CESIUM --> ADAM
    ML -. fallback surface .-> ADAM
    AIP -. additive surface .-> ADAM
    T1 == "FR-07 — gating below ROE floor" ==> MODAL
    MODAL --> ADAM
```

**Legend:**
- **Solid edges** — verified at authoring (~80%)
- **Dashed edges** — conditional (AIP 1300 gate, LLM fallback path)
- **Bold edges (`==>`)** — R16 wedge: continuous score (gradient) + kill-chain interrupt (gating)

**Spine narration.** The Rust trust engine is the single source of truth. It consumes per-source telemetry from the comms simulator, runs four deterministic detectors plus the FR-04a overlap-ratio matcher, and publishes the continuous score on MQTT. **CesiumJS is the primary rendering spine** — chosen for true 3D terrain, line-of-sight on the Avdiivka counterfactual, geolocated glTF jammer-system models from `FR-04a` candidates, and a CZML-driven scrubbable timeline that hardens demo recovery. MapLibre + PMTiles is **retained as a verified fallback** per §6c — if the Sunday Cesium spike does not gate green, the demo falls back to MapLibre with no architecture change (the MQTT contract in §5 is renderer-agnostic by design). Storage is single-binary (RocksDB/DuckDB/SQLite); no external database in the demo path. `NFR-05` (something must render on stage) is satisfied by the Cesium-or-MapLibre dual path, not by Cesium alone.

**Conditional wing.** Palantir AIP is an **additive secondary surface** that consumes the same MQTT trust score via a ~50-line REST/webhook shim. AIP renders the score on a Palantir ontology object representing each emitting unit. The AIP edge in the diagram is dashed because it is gated by the 1300 Saturday go/no-go (see §6a). The LLM narrator path has its own conditional fallback — Anthropic Claude function-calling primary, Llama 3.2 3B local fallback — gated by network reachability at demo time per `NFR-01`.

**Where the disciplines live in the diagram.** R14 binds the `RUST` and `LLM` nodes — detection is deterministic, narration is function-calling-only over structured inputs. R15 binds the `SURFACE` subgraph — there is exactly one demo-scope operator seat, and it is FDC. R16 binds the two bold edges — `T1 → MODAL` is the gating; `RUST → T1` is the gradient. **The Cesium swap does not move any of these disciplines** — it changes the renderer node only. The MQTT contract is the discipline boundary, not the frontend.

---

## 4. Master traceability — UR → FR → component → owner → build state → risk

> Extends `[[FRS]]` §8 (which is UR↔FR↔beat only) with stack component, ownership, and build-state confidence. Build state values are strict: **`verified`** = wired and confirmed at authoring; **`scoped`** = present in spec, not yet end-to-end confirmed; **`conditional`** = gated (AIP / LLM fallback / FR-04a top-N).

| UR | FR | Component (stack layer) | Owner | Build state | Risk hooks |
|---|---|---|---|---|---|
| `UR-01` continuous trust per track | `FR-05` | Rust engine score aggregator → MQTT `integrity/trust/{source_id}` | Tech lead | verified | R16 gradient edge |
| `UR-02` visible icon fade on jam | `FR-06` | Cesium `Entity.billboard.color.alpha` bound to score via `CallbackProperty`; pulsing halo at <0.6, full fade <0.3 (MapLibre fallback path retained) | Frontend (Joseph/Evan) | scoped — Sunday Cesium spike | R18 (judge dismisses if novelty isn't visible early); **R-NEW Cesium unfamiliarity** |
| `UR-03` plain-English degradation reason | `FR-01`, `FR-02`, `FR-08` | Rust detectors → MQTT → LLM narrator (function-calling) | Tech lead + LLM owner | verified | R14 narration drift |
| `UR-04` localized vs. blanket; named jammer | `FR-03`, `FR-04` | Spatial correlation discriminator; threshold-based fingerprint matcher; **Cesium terrain-masked LOS overlay from candidate jammer site → Unit B's flank corridor** | Tech lead | scoped — detector verified, LOS overlay Sunday | R14 (must read as deterministic, not classifier) |
| `UR-04`, `UR-09` ranked candidates + munitions affected | `FR-04a` | Overlap-ratio matcher; MQTT `integrity/fingerprint/candidates`; **Cesium `Cesium3DTileset` glTF models geolocated at candidate sites (R-330Zh Zhitel, Pole-21)** | Tech lead (UI: Joseph/Evan) | scoped — depends on FR-04 top-N + Sunday Cesium spike + glTF asset prep | R14 verbatim defense; R15 inventory-list discipline; **R-NEW glTF asset bundling** |
| `UR-05` kill-chain interrupt below ROE | `FR-07` | ROE-floor comparator + DOM modal anchored over Cesium viewport (screen-space pin to Unit B); same modal on AIP secondary | Frontend + tech lead | scoped — Sunday verify on Cesium | R16 gating edge (load-bearing 30s); R18 on-screen subtitle |
| `UR-06` 3-bullet trust trace per AI rec | `FR-07`, `FR-08` | LLM function-calling over structured detection events | LLM owner | verified | R14 (no free-form generation) |
| `UR-07` three named operator options | `FR-07` | Modal options: delay / shift / confirm-alt-channel | Frontend | verified | R16 (options must be concrete, not yes/no) |
| `UR-08` offline single-laptop guarantee | `NFR-01..03` | docker compose; **local Cesium 3D Tiles + terrain server (~2–4GB bundle)**; Llama 3.2 3B local fallback; **MapLibre + PMTiles retained as Cesium-fail fallback (~200MB)** | Tech lead | scoped — bundle size + offline cold-start verification Sunday | R6 API rate limits; **R2 demo failure (raised by spine swap)**; **R-NEW demo-laptop SSD/RAM headroom** |
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

*(Engine output for Unit B at `B-1:15`: 6.1 s gap, 14% CRC, localized, jammer matched 6/6.)*

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
      "source_citation": "Bronk RUSI 2024"
    },
    {
      "method_id": "pulsed_uhf_wide",
      "named_systems": ["Lorandit"],
      "score": 0.5,
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

### 5.3 Consumer contracts

| Consumer | Subscribes to | Status | Notes |
|---|---|---|---|
| **CesiumJS renderer (`FR-06`, `FR-07`) — primary** | both topics | scoped — Sunday gate (§6c) | entity `color.alpha` binding via `CallbackProperty`; DOM modal anchored over viewport; `Cesium3DTileset` glTF jammer models from `integrity/fingerprint/candidates` |
| MapLibre renderer (`FR-06`, `FR-07`) — fallback | both topics | verified — held in reserve | activated only if §6c Cesium gate fails; preserves `NFR-05` |
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
| **Trigger to commit** | All four conditions green by **1100 Sunday 2026-05-03**: (1) Cesium viewer rendering with local terrain + imagery offline (no Cesium ion network calls), (2) at least one entity's `color.alpha` bound to live MQTT trust score via `CallbackProperty` and visibly fading on jam event, (3) DOM kill-chain modal correctly anchored over Cesium viewport when score crosses ROE floor, (4) demo laptop disk + RAM headroom verified with full 3D Tiles bundle loaded |
| **Kill criterion** | If any condition red by 1100 Sunday → **fall back to MapLibre + PMTiles** (verified). No mid-stage swaps. Decision is final at 1100; no extending the gate |
| **Owner** | Frontend (Joseph/Evan) on Cesium spike; tech lead on MQTT contract — unchanged either way |
| **Why this gate exists** | Cesium swap was committed Sunday morning; the verified MapLibre path was the prior spine. NFR-05 ("something renders on stage") is satisfied by the dual-path option, not by Cesium alone. The MQTT contract (§5) is renderer-agnostic, so the fallback is a frontend swap, not an architecture change |
| **What we lose on fallback** | Terrain-masked LOS overlay (FR-03 visual), geolocated glTF jammer models (FR-04a visual punch), CZML scrubbable timeline. **The wedge (R16 gradient + gating) is preserved on MapLibre** — that's what matters for judges |
| **What we keep on Cesium success** | All of the above, plus the 3D credibility jump in front of military judges |
| **Risk** | **R2 (demo failure) — raised** by mid-rehearsal spine swap; **R-NEW Cesium unfamiliarity**; mitigated by maintaining MapLibre fallback through the 1100 gate |

---

## 7. Discipline annotations — where R14 / R15 / R16 sit in the architecture

### R14 — deterministic boundary

The threshold-based components are `FR-01` (3σ inter-arrival), `FR-02` (>5% CRC), `FR-03` (neighbor-radius spatial discriminator), `FR-04` (fingerprint threshold-boolean overlap), and `FR-04a` (ranked top-3 by deterministic overlap ratio). The LLM-touched component is `FR-08` only — and it is constrained to function-calling over structured detection events, not free generation. **No model, no training, no probability distribution anywhere in the demo path.**

> **Verbatim defensive answer for judge Q&A** (memorize): *"The score is a normalized count of matched threshold booleans over a fingerprint library publicly characterized by Bronk RUSI 2024 and JAPCC 2023. There is no model, no training, no probability distribution — it's a deterministic overlap ratio. The 'likelihood' framing is operator-readable shorthand for that ratio."*

### R15 — FDC anchor

The demo-scope rendering surface is exactly one operator screen: the FDC COP. AEGIS TAO, MSS Analyst, UAF Artillery Commander, Force Employment Authority are **out-of-architecture** for the demo (URS §5). The munitions-affected list in `FR-04a` does not violate the FDC anchor — the **seat** is unchanged; only the **output** widens to be sensor-/munition-class-agnostic. If a judge asks *"does this work for [other persona]?"* the answer is *"yes, transport-agnostic. The demo is FDC because it's the narrowest, most provable seat. See path-forward."*

### R16 — gradient + gating wedge

Two architecturally load-bearing edges, both rendered bold in §3's diagram:

1. **Gradient** — `RUST → T1` (`integrity/trust/{source_id}`, ≥1Hz continuous score). Lattice surfaces sensor health binary; we surface the **gradient**, which is what makes "are you sure?" actionable.
2. **Gating** — `T1 → MODAL` (`FR-07` ROE-floor interrupt). This is the *kill-chain action gating on the score*. The 30 seconds that win the demo are this edge firing on stage.

If both edges aren't visible end-to-end during the 5-minute slot, the wedge isn't demonstrated — the system reduces to "another COP with link health." The on-screen subtitle *"Kill-chain gated below ROE floor"* at Beat 1:20 (R18 mitigation) ensures the load-bearing 30 seconds **says the words.**

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
