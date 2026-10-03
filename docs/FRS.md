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
> **Phrasing discipline (R16 mitigation):** the wedge is **continuous trust scoring + kill-chain gating** — never *"we render link health."* Every FR statement must preserve that framing.
>
> **ML discipline (R14 mitigation):** jamming-fingerprint detection in the demo path is **threshold-based deterministic matching**, not ML classification. Any narration that drifts toward "trained model" is incorrect.

---

## 1. System context

The system is a **comms-integrity evaluation layer** that consumes per-source telemetry and emits a continuous trust score per source, gating kill-chain decisions on the score. It drops onto any C2 surface (MapLibre primary spine; Palantir AIP additive secondary surface, conditional on 1300 Saturday go/no-go gate).

**Architecture (already wired in the ~80%-built state):**

| Layer | Implementation | Role |
|---|---|---|
| Trust engine | Rust async (Tokio + Axum) | Source of truth — produces continuous trust score |
| Transport | MQTT — topic `integrity/trust/{source_id}` | Score publication; consumers subscribe |
| Storage | RocksDB / DuckDB / SQLite | Single-binary, no external infra |
| Comms simulator | Python module (CHAOS-owned) | Drives both rendering layers — RSSI, packet loss, jamming events |
| Primary render | Next.js + MapLibre GL (offline via PMTiles) | Track-level icon decay + decision-level trust trace |
| Secondary render | Palantir AIP ontology objects (conditional) | Same score, different surface — proves *"drops onto any C2"* |
| LLM | Anthropic Claude (function-calling) primary, Llama 3.2 3B local fallback | Trust trace narration + kill-chain interrupt prompts |
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
| **Acceptance** | Demo: Unit B inter-arrival stretches from ~1.0s baseline to 1.17s (3.4σ) → temporal anomaly fires within 1 frame; trust score begins to decay (≈0.70, WATCH band, above the ROE floor). The gap widens to 6.1s at `B-1:15` |
| **Traces to** | `UR-02`, `UR-03`, `B-0:45` |
| **Demo-scope** | Yes — Beat 0:45 |

### 2.2 Network-stability detection

| Field | Value |
|---|---|
| **ID** | `FR-02` |
| **Statement** | The system shall flag a per-source network-stability degradation when CRC error rate exceeds threshold (>5% rolling window) or duplicate-frame rate climbs above baseline. |
| **Input** | Per-source CRC counters + duplicate-frame counters from comms simulator |
| **Output** | Stability event into trust engine; further trust-score decay |
| **Acceptance** | Demo: Unit B CRC rises 0.2% → 6% (past the 5% threshold); trust trace updates with *"B-link: 6% corrupted frames, cadence 1.17s"*; trust ≈0.65, still above the ROE floor. CRC peaks at 14% at `B-1:15` |
| **Traces to** | `UR-03`, `B-0:55` |
| **Demo-scope** | Yes — Beat 0:55 |

### 2.3 Spatial-correlation discrimination

| Field | Value |
|---|---|
| **ID** | `FR-03` |
| **Statement** | The system shall localize a degradation event by checking whether neighbors within a configurable radius (default 500m) experience correlated degradation. If neighbors are healthy, the event is classified as **directional/localized**, not blanket atmospheric/EMI. |
| **Input** | Reported position (`lat`/`lon` on every telemetry payload) and **engine-measured** degradation of every source within radius. A source counts as degrading when its own `FR-01` temporal anomaly (> 3σ) or `FR-02` stability flag fires. A self-reported flag from the source is never used. Radius: `TRUST_ENGINE_SPATIAL_RADIUS_M`, default 500. |
| **Output** | Spatial classification (`nominal` / `localized` / `blanket`) attached to the degradation event. Into `FR-05` as **spatial trust**: `1.0` when the source itself is not degrading (`nominal`), `0.6` when it degrades and every neighbour in radius is healthy (`localized`), `0.3` when it degrades and ≥ 1 neighbour in radius degrades too (`blanket`). A healthy source is never penalised for a neighbour's degradation. |
| **Acceptance** | Demo: Unit B degrades; A and C (240m from B) remain healthy → side panel renders *"Degradation directional, vicinity B's flank corridor. Neighbors A, C unaffected."* |
| **Traces to** | `UR-04`, `B-1:05` |
| **Demo-scope** | Yes — Beat 1:05 |

### 2.4 Jamming-fingerprint detection (threshold-based)

| Field | Value |
|---|---|
| **ID** | `FR-04` |
| **Statement** | The system shall match the active degradation pattern against a **deterministic threshold-based fingerprint library** (noise-floor band + frequency-hop spread + GPS L1/L2 overlap booleans), emitting a match score and named profile when threshold criteria are met. |
| **Input** | Composite of `FR-01`, `FR-02`, `FR-03` outputs + RF telemetry from comms simulator |
| **Output** | Named jammer profile (e.g., `ground_based_gps_uhf_barrage`) + match score (**match strength**: higher = more like that jammer; only matches ≥ 0.5 count). Into `FR-05` it enters as **fingerprint trust** = `1 − match strength`, or `1.0` when nothing matches. |
| **Acceptance** | Demo: Unit B's pattern matches `ground_based_gps_uhf_barrage` profile at match strength 1.00 (6/6 dimensions), so fingerprint trust = 0.00; banner reads *"Suspected ground-based GPS+UHF barrage jammer, vicinity B's corridor."* |
| **Traces to** | `UR-04`, `UR-05`, `B-1:15` |
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
| **Acceptance** | Demo: at Beat 1:15, side panel renders three ranked candidates with normalized scores and per-candidate munitions-affected lists; per-candidate `source_citation` is visible on hover. Reinforces the Beat 1:20 modal — Adam picks (b) *"shift to non-GPS munition"* with grounded knowledge of which rounds are denied. |
| **Traces to** | `UR-04`, `UR-05`, `UR-07`, `UR-09`, `B-1:15`, `B-1:20` |
| **Demo-scope** | **Conditional.** If the existing FR-04 matcher already returns top-N internally → demo-path (~25–35 min UI surface work, zero new deps; defer to Joseph/Evan, NOT Kristian per R13/R18 discipline). If matcher is hard-coded top-1 → spec lands as written but `Demo-scope` flips to **NO** and the feature is documented as path-forward (§7); pitch lead may still cite FR-04a verbatim as a stage Q&A defense. **Tech lead confirms before Sunday rehearsal block.** |
| **Library source** | Upstream fingerprint catalog: [[../../06 - Research/White Paper/_evidence/prompts/P4 - Jammer Fingerprint Catalog]]. Underlying open characterizations cite Bronk RUSI 2024, JAPCC 2023, *WaPo* 2024. The library is data, not code — additions post-Sunday-6AM are documentation, not new dependencies (NFR-06 safe). |
| **R14 defensive answer (verbatim, for judge Q&A)** | *"The score is a normalized count of matched threshold booleans over a fingerprint library publicly characterized by Bronk RUSI 2024 and JAPCC 2023. There is no model, no training, no probability distribution — it's a deterministic overlap ratio. The 'likelihood' framing is operator-readable shorthand for that ratio."* |
| **Path-forward** | (a) ML-based ranked classifier with calibrated confidence intervals — explicitly out-of-scope per R14; (b) live ingest from a fielded waveform — CHAOS-side moat, see §7; (c) per-unit inventory binding so munitions-affected filters to *Adam's* loadout, not the global catalog. |

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

### 4.2 Decision-level trust trace + kill-chain gating (Layer B)

| Field | Value |
|---|---|
| **ID** | `FR-07` |
| **Statement** | The system shall attach a 3-bullet trust trace to every AI kill-chain recommendation, and shall **interrupt** the recommendation flow with a modal when any source's trust score falls below the configured ROE floor for the action class (e.g., GPS-dependent fires). |
| **Input** | Trust-score stream + AI recommendation event |
| **Output** | (a) Trust-trace UI element beside the recommendation; (b) modal with three named options: `delay <N>s`, `shift to non-GPS munition`, `confirm via alt channel` |
| **Acceptance** | Demo: B first crosses below the 0.60 ROE floor at 1:15 (0.13) when the jammer lands. Beat 1:20 — AI declines to recommend GPS-guided strike; modal renders three options; operator picks (b); decision logged with full trust state for after-action |
| **Traces to** | `UR-05`, `UR-06`, `UR-07`, `B-1:20`, `B-1:50` |
| **Demo-scope** | **Yes — load-bearing beat. The 30 seconds that win the demo (1:15 → 1:50).** |

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
| `NFR-07` | The dependency budget for the demo path shall be ≤25 direct dependencies. | Each new dep needs a 30-second justification |

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
| **Outbound-asset trust scoring** (Palantir's lane) | Clean competitive carve-out; we score inbound. | *"Palantir scores outbound drones. We score inbound sensor data. Different population."* |

---

## 7. Path-forward (post-hackathon, for pitch slide 6)

A 6-month follow-on funded engagement would deliver, in priority order:

1. **Real-radio ingest** from a fielded waveform — exercises the CHAOS-side moat (HIL + sensor emulation + error injection)
2. **Extended fingerprint library** validated against open EW datasets — keeps detection threshold-based but expands coverage
3. **ATAK plugin pilot** with a willing unit — proves the *"drops onto any C2"* claim in the field
4. **Coverage arbitration** layer — multi-source trust composition for fused tracks
5. **ML-based fingerprint classification** — only after ground-truth EW dataset volume problem is solved (cited SME constraint)

---

## 8. Traceability matrix

| FR | Statement (short) | Satisfies UR | Demo beat |
|---|---|---|---|
| `FR-01` | Temporal anomaly | `UR-02`, `UR-03` | `B-0:45` |
| `FR-02` | Network stability | `UR-03` | `B-0:55` |
| `FR-03` | Spatial correlation | `UR-04` | `B-1:05` |
| `FR-04` | Jamming fingerprint (threshold) | `UR-04`, `UR-05` | `B-1:15` |
| `FR-04a` | Munitions-impact mapping (top-3 ranked + affected rounds) | `UR-04`, `UR-05`, `UR-07`, `UR-09` | `B-1:15`, `B-1:20` |
| `FR-05` | Continuous trust score (MQTT) | `UR-01`, `UR-06` | all beats |
| `FR-06` | Track-level icon decay | `UR-01`, `UR-02` | `B-0:45..2:15` |
| `FR-07` | Decision-level trace + kill-chain interrupt | `UR-05..07` | `B-1:20`, `B-1:50` |
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
