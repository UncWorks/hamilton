---
tags: [strategy, specs, urs, v5.1.1, demo-bounding]
status: draft (freeze at scope lock)
authored-on: 2026-05-02
build-state: ~80% at authoring
freeze-at: 2026-05-02 Saturday scope lock (11:30 PT)
parent: [[00 - Index]]
related:
  - [[FRS]]
  - [[../Capability Selection]]
  - [[../../05 - Build Plan/Demo and Pitch]]
  - [[../../Real Life Situational Context/Personas/P1 - Battalion Fires Officer]]
  - [[../../Real Life Situational Context/Brief 3 (MAIN) - Excalibur in Avdiivka]]
---

# URS — User Requirements Specification

> **Scope boundary:** this URS bounds **what the operator (P1 Battalion Fires Officer / FDC) needs the system to do for them on stage at xTech 2026-05-03**. It is operator-voice, anchored on the Excalibur-in-Avdiivka counterfactual, and scoped to the 5-minute live demo.
>
> **Anchor discipline (R15 mitigation):** every UR is grounded in the FDC seat first. Generalization to other personas (AEGIS TAO, MSS analyst, UAF artillery, force employment) is **path-forward only** (§5).
>
> **Wedge discipline (R16 mitigation):** what the operator needs is **a continuous trust score that gates kill-chain decisions** — not a binary sensor health indicator and not a link-health badge.

---

## 1. Persona — Officer Adam, Battalion Fires Cell (FDC)

| Attribute | Value |
|---|---|
| **Role** | Fire Direction Center officer in a Battalion Fires Cell |
| **Seat** | A Common Operational Picture (COP) screen showing live track feeds from organic sensors and friendly elements |
| **Authority** | Clears / declines GPS-guided precision artillery rounds (Excalibur class) under rules-of-engagement |
| **Time pressure** | Seconds-to-minutes between target nomination and trigger pull |
| **Information available today** | Mission picture (target grid, charge, fuze, time of flight) — **no signal of GPS-link state of the round in flight, even when adversary jamming has densified in the target's grid** |
| **Information missing today** | Per-track radio-link health at the engagement moment; per-recommendation trust trace; kill-chain confidence below ROE floor |
| **Real-life anchor** | [[../../Real Life Situational Context/Brief 3 (MAIN) - Excalibur in Avdiivka|Brief 3 — Excalibur in Avdiivka]] — UAF Excalibur effectiveness collapsed under Russian EW. The FDC seat had no signal that the GPS link was being jammed. |
| **Persona reference** | [[../../Real Life Situational Context/Personas/P1 - Battalion Fires Officer|P1 — Battalion Fires Officer]] |

### What "good" looks like from Adam's seat

1. He sees, **at the engagement moment**, that one of the elements feeding his picture is degrading — not after-action.
2. He understands **why** in plain English (cadence, network stability, spatial localization, named jammer profile) — not as a wall of metrics.
3. The system **interrupts** him before he commits a GPS-dependent strike under low confidence, and **offers him three concrete options** — not just a warning popup.
4. The decision and trust state are **logged for after-action** without any extra effort from him.

---

## 2. Operational context — the Excalibur-in-Avdiivka counterfactual

> **Today (without the layer):** Unit B's GPS-guided round misses, the flank fails, casualties, withdrawal — and the after-action review is when the jammer is named.
>
> **With the layer:** the jammer is named **35 seconds before the trigger pull.** Adam swaps to a non-GPS munition; the objective is taken.

This counterfactual is the operational basis for every UR below. It is **one Fires Officer, one round, one moment in Avdiivka** — the demo Beat 1 verbal opener (per `R15` mitigation).

---

## 3. User requirements

### UR-01 — See trust as a continuous, live property of every track

| Field | Value |
|---|---|
| **ID** | `UR-01` |
| **Statement** | *"As Adam, I need every track on my COP to carry a continuous, live trust score, so I never confuse a confidently rendered icon with a confidently sourced one."* |
| **Success criterion** | At any moment during the engagement, Adam can identify the trust state of every track on the screen at a glance, and confirm a numeric score on hover. |
| **Why continuous (R16)** | Binary up/down is insufficient — Adam needs to see the score **trending** so he can act before it crosses the ROE floor. |
| **Satisfied by** | `FR-05`, `FR-06` |
| **Demo beat** | All beats; visible from `B-0:00` |
| **Priority** | P0 — load-bearing |

### UR-02 — See a track degrade visibly when its feeding sensor is jammed

| Field | Value |
|---|---|
| **ID** | `UR-02` |
| **Statement** | *"As Adam, I need a track to fade visibly on my COP as its feeding sensor's link is jammed, and snap back when the link recovers — so I can read trust at the speed of glance."* |
| **Success criterion** | Unit B's icon visibly fades during 0:45 → 1:50 of the demo and snaps back to full opacity at 2:15 recovery, with no operator interaction required. |
| **Satisfied by** | `FR-06`, indirectly `FR-01..04` driving the score |
| **Demo beat** | `B-0:45` through `B-2:15` |
| **Priority** | P0 — load-bearing |

### UR-03 — Be told, in plain English, why a track is degrading

| Field | Value |
|---|---|
| **ID** | `UR-03` |
| **Statement** | *"As Adam, I need to read why a track is degrading without needing to be a comms engineer — cadence, error rate, gap duration — so I can decide, not just observe."* |
| **Success criterion** | Trust trace beside the affected track reads like an operator brief, not a log line. Demo example: *"B-link cadence degraded 18s ago — investigating"* → *"B-link: 6% corrupted frames, cadence 1.17s."* (WATCH band, before the 1:15 jammer peak of 6.1s gap / 14% CRC) |
| **Satisfied by** | `FR-01`, `FR-02`, `FR-08` |
| **Demo beat** | `B-0:45`, `B-0:55` |
| **Priority** | P0 |

### UR-04 — Distinguish a localized degradation from a blanket atmospheric one

| Field | Value |
|---|---|
| **ID** | `UR-04` |
| **Statement** | *"As Adam, I need the system to tell me whether a degradation is localized to one corridor or affecting everything, and to name the suspected jammer profile when criteria are met — so I'm not flying blind on attribution."* |
| **Success criterion** | At `B-1:05`, side panel reads *"Degradation directional, vicinity B's flank corridor. Neighbors A, C unaffected."* At `B-1:15`, banner reads *"Suspected ground-based GPS+UHF barrage jammer."* |
| **Satisfied by** | `FR-03`, `FR-04` |
| **Demo beat** | `B-1:05`, `B-1:15` |
| **Priority** | P0 |
| **Discipline** | Detection is **threshold-based deterministic**, not ML-classified (R14). |

### UR-05 — Be interrupted before committing a GPS-dependent strike below ROE confidence

| Field | Value |
|---|---|
| **ID** | `UR-05` |
| **Statement** | *"As Adam, I need the system to refuse to recommend a kill-chain action when sensor confidence is below the rules-of-engagement floor for that action class — and to interrupt me with a modal — so a confident-looking icon never causes a confident-looking commit."* |
| **Success criterion** | B stays above the 0.60 ROE floor through 0:45–1:05 (WATCH) and first crosses it at `B-1:15` (0.13). At `B-1:20`, AI **declines** to recommend the GPS-guided strike. Modal renders three options: `delay 60s`, `shift to non-GPS munition`, `confirm via alt channel`. |
| **Satisfied by** | `FR-07` |
| **Demo beat** | `B-1:20` (the load-bearing beat) |
| **Priority** | P0 — **the 30 seconds that win the demo are 1:15 → 1:50** |
| **Discipline** | The wedge is **continuous score + kill-chain gating** (R16). The interruption is grounded in the score crossing the ROE floor, not in a generic warning. |

### UR-06 — Read a 3-bullet trust trace beside every AI recommendation

| Field | Value |
|---|---|
| **ID** | `UR-06` |
| **Statement** | *"As Adam, every AI recommendation on my screen needs to come with a 3-bullet trust trace I can read in seconds, so I know what the recommendation is grounded on and what it isn't."* |
| **Success criterion** | Every AI kill-chain recommendation on stage carries exactly 3 bullets, generated from deterministic detection events (no LLM hallucination of facts not in the input). |
| **Satisfied by** | `FR-07`, `FR-08` |
| **Demo beat** | `B-1:20` (and any prior recommendations rendered in baseline state) |
| **Priority** | P0 |

### UR-07 — Pick from three concrete operator options when the kill chain is interrupted

| Field | Value |
|---|---|
| **ID** | `UR-07` |
| **Statement** | *"As Adam, when the system interrupts a kill chain, I need three named, concrete options — not a yes/no — so I have something to do, not just something to read."* |
| **Success criterion** | Beat 1:20 modal: `(a) delay <N>s for link recovery`, `(b) shift to non-GPS munition`, `(c) confirm via alt channel before commit`. Operator selects (b); flow continues. |
| **Satisfied by** | `FR-07` |
| **Demo beat** | `B-1:20` → `B-1:50` |
| **Priority** | P0 |

### UR-08 — Run on Adam's actual hardware, fully offline

| Field | Value |
|---|---|
| **ID** | `UR-08` |
| **Statement** | *"As Adam, I need this to run on the laptop in front of me, with no cloud dependency at decision time — because operations teams don't get to assume connectivity."* |
| **Success criterion** | Demo runs **fully offline** on a single laptop. No external HTTP calls during the 5-minute slot. LLM falls back to local Llama 3.2 3B if the API is unreachable. |
| **Satisfied by** | `NFR-01..03` |
| **Why** | SME-corroborated (2026-05-02 ex-Army contractor): *"Operations teams don't use AI tools because of hardware/power constraints — they prefer running locally on their own systems."* |
| **Demo beat** | All beats; Beat 1 verbal opener says *"Everything you're about to see runs on this laptop, offline."* |
| **Priority** | P0 |

### UR-09 — See ranked candidate jamming methods with the munitions each one denies

| Field | Value |
|---|---|
| **ID** | `UR-09` |
| **Statement** | *"As Adam, when the trust layer detects a jamming-pattern degradation, I need to see (a) the top three named jamming methods most likely responsible, ranked by match strength, and (b) for each candidate, the list of munitions in my inventory whose guidance package is known to be affected — so I can decide whether to switch round type, delay, or proceed."* |
| **Success criterion** | At `B-1:15`, side panel renders: *"Top match: ground_based_gps_uhf_barrage (1.00) — affected: Excalibur, JDAM-ER, Switchblade 300, GMLRS-U. Second: pulsed_uhf_wide (0.50) — affected: FPV C2 link, Switchblade 300. Third: cellular_uhf_barrage (0.17) — affected: ATAK position-share, FPV C2 link."* Adam can name the round he'd switch to in <10s. |
| **Why (operator)** | Naming the jammer is necessary but insufficient — Adam in Avdiivka would still need to know *which rounds in his inventory are denied by that jammer class*. The munitions-affected link is what turns attribution into a decision substrate inside the engagement window. |
| **Why (R14 discipline)** | "Likelihood" here is operator-readable shorthand for a deterministic normalized overlap score — count of matched fingerprint-dimension threshold booleans / total dimensions. **Not** a trained probabilistic classifier. See `FR-04a`. |
| **Satisfied by** | `FR-04` (detection), `FR-04a` (ranked mapping + munitions-affected) |
| **Demo beat** | `B-1:15` (extends the existing jamming-fingerprint beat); reinforces `B-1:20` modal options |
| **Priority** | P0 — sharpens the wedge from *"name the jammer"* to *"name the jammer **and** the affected rounds"* |
| **Inventory scope** | US/NATO + adversary munitions per catalog (Excalibur, JDAM-ER, Switchblade 300, GMLRS-U, Lancet, Shahed, FPV C2, ATAK position-share, etc.) — proves the layer is sensor-/munition-class-agnostic |
| **Source citations** | Per-candidate hover citations to upstream catalog (Bronk RUSI 2024, JAPCC 2023, *WaPo* 2024) — strengthens R14 defense |

---

## 4. Operator success criteria — overall

The demo satisfies the URS if, on stage in the 5-minute slot, Adam (or the operator stand-in narrating) can:

1. **See trust degrade live** on Unit B without anyone telling him — the screen tells him (`UR-01`, `UR-02`).
2. **Read why** in plain English without engineering jargon (`UR-03`).
3. **Get attribution** — directional vs. blanket, named jammer profile (`UR-04`).
4. **Be interrupted** before he commits the strike, with three named options (`UR-05`, `UR-07`).
5. **Verify the trust trace** behind the AI's refusal in three bullets (`UR-06`).
6. **Demonstrate the offline guarantee** — at any point during the demo, the laptop's wifi can be disabled and nothing breaks (`UR-08`).

If all six are visible in the 5-minute slot, the URS is satisfied.

---

## 5. Out-of-scope personas (path-forward, not demo-scope)

The following personas are **out-of-scope for the demo URS.** They are real and the platform applies, but they are explicitly not in the 5-minute slot. R15 mitigation: *the FDC anchor leads; generality is path-forward.*

| Persona | Why not in demo | Where it lives |
|---|---|---|
| AEGIS TAO / OOD (P2) | Naval ADA — different pace, different ROE, different threat. Same engine, different rendering. | Pitch slide 6 path-forward |
| MSS Analyst (P3) | Politically sensitive (read brief §5 before any Q&A). Demo-distracting. | Brief 5 — Maven Smart System |
| UAF Artillery Commander (P4) | Architectural inversion — useful for Q&A, not for demo seat. | Brief 4 — UAF artillery |
| Force Employment Authority (P5) | Cross-brief — strategic seat, not tactical. | Brief 7 — Red Sea AEGIS |

> If a judge asks *"does this work for [other persona]?"* — answer is *"yes, transport-agnostic. The demo is FDC because it's the narrowest, most provable seat. See path-forward."*

---

## 6. Traceability — UR → FR

| UR | Statement (short) | Satisfied by | Demo beat |
|---|---|---|---|
| `UR-01` | Continuous trust per track | `FR-05`, `FR-06` | All beats |
| `UR-02` | Visible icon fade on jam | `FR-06` | `B-0:45..2:15` |
| `UR-03` | Plain-English degradation reason | `FR-01`, `FR-02`, `FR-08` | `B-0:45`, `B-0:55` |
| `UR-04` | Localized vs. blanket; named jammer | `FR-03`, `FR-04` | `B-1:05`, `B-1:15` |
| `UR-05` | Kill-chain interrupt below ROE | `FR-07` | `B-1:20` |
| `UR-06` | 3-bullet trust trace per AI recommendation | `FR-07`, `FR-08` | `B-1:20` |
| `UR-07` | Three named operator options | `FR-07` | `B-1:20..1:50` |
| `UR-08` | Offline single-laptop guarantee | `NFR-01..03` | All beats |
| `UR-09` | Ranked candidate methods + munitions affected | `FR-04`, `FR-04a` | `B-1:15`, `B-1:20` |

> **Beat key:** `B-T:SS` aligns to the storyboard in [[../../05 - Build Plan/Demo and Pitch]].

---

## 7. Cross-references

- [[FRS]] — system functional requirements that satisfy these URs
- [[../Capability Selection]] — v5.1.1 thesis and SME validation
- [[../../05 - Build Plan/Demo and Pitch]] — Fire & Maneuver storyboard with beat timestamps
- [[../../Real Life Situational Context/Brief 3 (MAIN) - Excalibur in Avdiivka]] — operational counterfactual
- [[../../Real Life Situational Context/Personas/P1 - Battalion Fires Officer]] — full persona reference
- [[../Risk Register]] — R14 (ML), R15 (generality drift), R16 (Lattice partial overlap)
- [[../../06 - Research/SME Interviews/2026-05-02 - SME Interview]] — SME-driven anchor and offline-first sharpening
