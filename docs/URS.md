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
> **Wedge discipline (R16 mitigation):** what the operator needs is **a continuous trust score that feeds the target selection standards (TSS) check on each fire mission** — not a binary sensor health indicator and not a link-health badge.

---

## 1. Persona — Officer Adam, Battalion Fires Cell (FDC)

| Attribute | Value |
|---|---|
| **Role** | Fire Direction Center officer in a Battalion Fires Cell |
| **Seat** | A Common Operational Picture (COP) screen showing live track feeds from organic sensors and friendly elements |
| **Authority** | Clears / declines GPS-guided precision artillery rounds (Excalibur class) under rules-of-engagement |
| **Time pressure** | Seconds-to-minutes between target nomination and trigger pull |
| **Information available today** | Mission picture (target grid, charge, fuze, time of flight) — **no signal of GPS-link state of the round in flight, even when adversary jamming has densified in the target's grid** |
| **Information missing today** | Per-track radio-link health at the engagement moment; per-recommendation trust trace; whether a fire mission's sources meet the TSS |
| **Real-life anchor** | [[../../Real Life Situational Context/Brief 3 (MAIN) - Excalibur in Avdiivka|Brief 3 — Excalibur in Avdiivka]] — UAF Excalibur effectiveness collapsed under Russian EW. The FDC seat had no signal that the GPS link was being jammed. |
| **Persona reference** | [[../../Real Life Situational Context/Personas/P1 - Battalion Fires Officer|P1 — Battalion Fires Officer]] |

### What "good" looks like from Adam's seat

1. He sees, **at the engagement moment**, that one of the elements feeding his picture is degrading — not after-action.
2. He understands **why** in plain English (cadence, network stability, spatial localization, named jammer profile) — not as a wall of metrics.
3. The system **flags the mission** — TSS FAIL in the fire-mission row, never a modal — before he clears a GPS-dependent round on a degraded source, and **offers pre-planned branches** in that row.
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
| **Why continuous (R16)** | Binary up/down is insufficient — Adam needs to see the score **trending** so he can act before it drops below the TSS minimum. |
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
| **Success criterion** | At `B-1:05`, side panel reads *"Degradation localized at B — no degrading unit within 500 m. A, C healthy."* At `B-1:15`, banner reads *"Suspected ground-based GPS+UHF barrage jammer."* |
| **Satisfied by** | `FR-03`, `FR-04` |
| **Demo beat** | `B-1:05`, `B-1:15` |
| **Priority** | P0 |
| **Discipline** | Detection is **threshold-based deterministic**, not ML-classified (R14). |

### HS-05 — See TSS FAIL in the fire-mission row (replaces UR-05)

| Field | Value |
|---|---|
| **ID** | `HS-05` (was `UR-05`, dropped: its modal / "AI declines to recommend" clause is superseded) |
| **Statement** | *"As the FDC officer, I want a call for fire that depends on a source failing the target selection standards (TSS) to show **TSS FAIL** and a recommended method of control in its mission row, so I never clear a GPS round on a source I couldn't see was degraded — while my monitoring is never interrupted."* (TSS; method of control.) |
| **Success criterion** | **G** B at D4 (or E5) and a call for fire from B for M982; **W** the mission enters the queue; **T** the row shows `TSS: FAIL — RELIABILITY D4 (min C)` and `Rec. method of control: DO NOT LOAD (M982)`; no modal, no scrim, focus unchanged. **G** no mission open; **T** no gate UI appears. Demo: AB1001 arrives at `B-1:12` TSS PASS (B C3) and flips to FAIL in-row at `B-1:15` (B E5, 0.13). |
| **Satisfied by** | `FR-07` |
| **Demo beat** | `B-1:12` → `B-1:20` |
| **Priority** | P0 |
| **Discipline** | The wedge is a **continuous, evidence-based reliability and report-age term in the TSS check** (R16), per source and per mission. Thresholds are the commander-approved TSS table (GPS-guided C / 10 s), not an ROE floor. Hamilton recommends; it never issues a fire command. Source: decision-workflow assessment §3–§4; `docs/plans/tss-mission-row.md`. |

### UR-06 — Read a 3-bullet trust trace beside every AI recommendation

| Field | Value |
|---|---|
| **ID** | `UR-06` |
| **Statement** | *"As Adam, every AI recommendation on my screen needs to come with a 3-bullet trust trace I can read in seconds, so I know what the recommendation is grounded on and what it isn't."* |
| **Success criterion** | Every TSS verdict and recommendation on stage carries exactly 3 bullets, generated from deterministic detection events (no LLM hallucination of facts not in the input). |
| **Satisfied by** | `FR-07`, `FR-08` |
| **Demo beat** | `B-1:20` (and any prior recommendations rendered in baseline state) |
| **Priority** | P0 |

### UR-07 (HS-07) — Pick a pre-planned branch inline when a mission fails TSS

| Field | Value |
|---|---|
| **ID** | `UR-07` → `HS-07` |
| **Statement** | *"As the FDC officer, I want the pre-planned branches inline in the mission row, so I have something to do, not just something to read."* |
| **Success criterion** | **G** TSS FAIL; **W** I press `1`; **T** the mission re-plans to M795 HE, TSS re-runs and passes, and the choice is logged. **W** `3`; **T** method of control = AT MY COMMAND and a 60 s re-rate timer is shown. Branches: `[1] Shift → M795 HE, adjust fire`, `[2] Confirm via alt channel`, `[3] AT MY COMMAND — re-rate in 60 s`, `[4] Accept risk… (FSO)`. |
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
| **Success criterion** | At `B-1:15`, side panel renders: *"Top match: ground_based_gps_uhf_barrage (1.00) — affected: Excalibur, JDAM-ER, Switchblade 300, GMLRS-U. Second: pulsed_uhf_wide (0.67) — affected: FPV C2 link, Switchblade 300. Third: cellular_uhf_barrage (0.17) — affected: ATAK position-share, FPV C2 link."* Adam can name the round he'd switch to in <10s. |
| **Why (operator)** | Naming the jammer is necessary but insufficient — Adam in Avdiivka would still need to know *which rounds in his inventory are denied by that jammer class*. The munitions-affected link is what turns attribution into a decision substrate inside the engagement window. |
| **Why (R14 discipline)** | "Likelihood" here is operator-readable shorthand for a deterministic normalized overlap score — count of matched fingerprint-dimension threshold booleans / total dimensions. **Not** a trained probabilistic classifier. See `FR-04a`. |
| **Satisfied by** | `FR-04` (detection), `FR-04a` (ranked mapping + munitions-affected) |
| **Demo beat** | `B-1:15` (extends the existing jamming-fingerprint beat); reinforces the `B-1:20` mission-row branches |
| **Priority** | P0 — sharpens the wedge from *"name the jammer"* to *"name the jammer **and** the affected rounds"* |
| **Inventory scope** | US/NATO + adversary munitions per catalog (Excalibur, JDAM-ER, Switchblade 300, GMLRS-U, Lancet, Shahed, FPV C2, ATAK position-share, etc.) — proves the layer is sensor-/munition-class-agnostic |
| **Source citations** | Per-candidate hover citations to upstream catalog (Bronk RUSI 2024, JAPCC 2023, *WaPo* 2024) — strengthens R14 defense |

---

### 3a. Suspected-jammer area of effect (AoE) — HS-20..HS-28

> **User intent (verbatim, 2026-10-04):** *"Make the scenario more real: the origin of the jammer would not be known to us. I want to communicate through the C2 by showing a visualization of the estimated area of effect of the suspected jammer if the fingerprint is a high match."* These stories are also the **necessity filter** for `docs/plans/jammer-aoe.md`: a component that traces to no MUST here is not built for the MVP (`docs/plans/aoe-requirements-trace.md`).
>
> **Numbering.** `HS-10..HS-19` are reserved by the decision-workflow assessment (§4) and not yet adopted here, so the AoE stories start at `HS-20`. **MoSCoW** is for the MVP; every MUST names the intent or doctrine that makes it one.

### HS-20 — The jammer's location is never presumed

| Field | Value |
|---|---|
| **ID** | `HS-20` |
| **Statement** | *"As the FDC officer, I want the COP never to show a jammer's position as fact, so I don't plan fires, clearance or movement around a location nobody measured."* (Decision supported: clearance of fires; the jammer-location PIR stays open until it is collected.) |
| **Success criterion** | **G** any moment in the demo; **T** the COP shows no hostile EW symbol in status *present* (solid), no bearing line unless a real bearing observation was received, and no fixed-radius jammer ring. **G** the demo scenario; **T** the emitter's position, power and mast exist only inside the simulator and its sim-only evaluation output; no MQTT topic, HTTP response or web bundle the C2 receives carries them. **G** the scenario runs; **T** each unit's degraded / healthy state follows from that hidden emitter through a stated link budget, not from per-unit scripted symptoms (otherwise any estimate is circular). |
| **Satisfied by** | `FR-04` (observable dimensions only), `FR-04b` (no-leak), `FR-06a` |
| **Demo beat** | All beats; supersedes the hard-coded jammer point, the B→jammer vector and the 120 m ring at `B-1:05` / `B-1:15` |
| **Priority** | **MUST** |
| **Why MUST** | User intent: *"the origin of the jammer would not be known to us."* Doctrine: a hostile unit that is not confirmed is drawn *anticipated / suspected* (dashed), never *present* (FM 1-02 / MCRP 5-12A Ch 4); the emitter location is an S2 PIR (FM 1-02 p. 1-150), not a given. |

### HS-21 — See the estimated area of effect when the fingerprint is a high match

| Field | Value |
|---|---|
| **ID** | `HS-21` |
| **Statement** | *"As the FDC officer, when the jamming fingerprint is a high match, I want the area where the suspected method is estimated to deny my receivers drawn on the COP, with its confidence, the evidence it rests on and the word* Est.*, so I can see where in my sector GPS is likely denied without anyone claiming to know where the jammer is."* (Decision supported: FFIR — GPS integrity of observers and firing units.) |
| **Success criterion** | **G** a high, unambiguous fingerprint match (as defined in `FR-04b`), ≥ 1 unit measured degraded and ≥ 1 healthy unit of the same receiver class; **W** the estimate is computed; **T** the COP shows a 90% area (fill + edge) and a 50% area (dashed outline) for civil GNSS, labelled `Est. GPS denial · <method>-class · 90% · <age> · <n> degraded / <m> healthy`, and the panel lists each contributing unit as degraded ✕ / healthy ○ with its age. **G** the match is not high or is ambiguous; **T** no area is drawn and the candidate cards are unchanged. **G** every reporting unit of the class is degraded; **T** no area is drawn and the panel reads *"edge not observed"*. |
| **Satisfied by** | `FR-04b`, `FR-06a` |
| **Demo beat** | `B-1:15` (first estimate); `B-1:50` (update when B moves) |
| **Priority** | **MUST** |
| **Why MUST** | User intent: *"showing a visualization of the estimated area of effect of the suspected jammer if the fingerprint is a high match."* |

### HS-22 — Know which of my receivers and missions are inside the estimate

| Field | Value |
|---|---|
| **ID** | `HS-22` |
| **Statement** | *"As the FDC officer, I want the estimate to name which friendly units and open-mission points (observer, target, firing unit) lie inside it, per receiver class and GPS-dependent first, so I know whether the threat is to the round or to the targeting chain."* (Decision supported: munition selection; whether to confirm via alternate means.) |
| **Success criterion** | **G** the 1:15 estimate; **T** the panel lists the units and mission points inside the civil-GNSS 90% and 50% areas, e.g. *"OBS B (AB1001 observer) — 90%"*, GPS-dependent receivers first. **G** a munition or receiver class the estimate does not model (CRPA-class guidance, a round in flight, UHF, FPV); **T** it reads *"not assessed — ground receivers only"*, never *"denied"*. |
| **Scope** | Civil GNSS: **MUST**. Military GNSS (DAGR, firing-unit nav): **SHOULD**. CRPA / in-flight band, UHF, FPV: **WON'T** (MVP). |
| **Satisfied by** | `FR-04b` (per-class areas), `FR-06a` (panel block) |
| **Demo beat** | `B-1:15` |
| **Priority** | **MUST** (civil GNSS) |
| **Why MUST** | User intent: the AoE is shown so it can be acted on; an area that does not say who is inside it leaves the operator to eyeball the map. Doctrine: route information to the mission it affects (information management, FM 1-02 p. 1-99; assessment HS-09). Worked example: the hidden emitter threatens OBS B's fix and link, not necessarily the M982 at the target. |

### HS-23 — See the estimate as an advisory on the affected mission row

| Field | Value |
|---|---|
| **ID** | `HS-23` |
| **Statement** | *"As the FDC officer, I want a mission whose observer, target or firing unit lies inside the estimate to say so in its row as an advisory, so I see the geometric risk where I process the mission — while the estimate never changes the TSS verdict."* (Decision supported: TSS; method of control.) |
| **Success criterion** | **G** AB1001 open and OBS B inside the 90% civil area; **T** the row reads `TSS: FAIL — RELIABILITY E5 (min C) · ADVISORY OBS B in est. GPS denial (90%)`. **G** any mission, with or without an estimate; **T** the TSS verdict, the recommended method of control and the branch set are identical. **G** no estimate, or no mission point inside the 50% area; **T** no advisory. |
| **Satisfied by** | `FR-07a` |
| **Demo beat** | `B-1:15` → `B-1:20` |
| **Priority** | **SHOULD** — at 1:15 AB1001 already fails on *measured* reliability, so the advisory adds context but no new decision in the demo. The "never changes the verdict" clause is binding whenever it is built (reliability stays the only hard gate, `HS-05`). |

### HS-24 — Every estimate is in the after-action record

| Field | Value |
|---|---|
| **ID** | `HS-24` |
| **Statement** | *"As the commander / S2, I want every estimate that is opened, updated, made stale or retired to be in the after-action record with the evidence it rested on, so the AAR shows what we believed, when, and why."* (Decision supported: AAR; audit of the jammer PIR.) |
| **Success criterion** | **G** an estimate opens; **T** the after-action terminal shows one line (e.g. *"Est. GPS denial opened · Pole-21-class · OBS B inside (90%)"*) and the log stores the estimate id, state, method and match, contour areas, the evidence list and its hash, and the DTG. **W** it updates, goes stale or retires; **T** one line each. **G** a simulator run; **T** truth-vs-estimate is available after the run from a sim-only store, never on a live topic (**SHOULD**). |
| **Satisfied by** | `FR-04b` (log) |
| **Demo beat** | `B-1:15`, `B-2:15`, AAR |
| **Priority** | **MUST** (the record); **SHOULD** (sim-only truth comparison) |
| **Why MUST** | User intent: *"communicate through the C2"* — the after-action record is the minimum C2 channel. Doctrine: engagement / risk-decision records (FM 1-02 p. 1-164; assessment HS-18). Counterfactual: *"the after-action review is when the jammer is named"* — the record must show the estimate existed before the trigger pull. |

### HS-25 — Estimates go stale and retire

| Field | Value |
|---|---|
| **ID** | `HS-25` |
| **Statement** | *"As the FDC officer, I want an estimate whose evidence has stopped to look stale and then disappear, so I never act on an old denial area as if it were current."* (Decision supported: TSS report age.) |
| **Success criterion** | **G** the trigger drops (jammer off at `B-2:15`); **W** 10 s pass; **T** the area is outline-only with no fill and reads *"Last est. HHMMZ"*. **W** 120 s pass; **T** it is removed from the COP and the retirement is logged. **G** the C2 receives no estimate refresh for longer than the heartbeat window; **T** the C2 marks it stale on its own clock. |
| **Satisfied by** | `FR-04b`, `FR-06a` |
| **Demo beat** | `B-2:15` |
| **Priority** | **MUST** |
| **Why MUST** | An estimate drawn after its evidence has gone is a presumption (`HS-20`). Doctrine: report age is a TSS term (FM 3-09.12 Ch 1); status charts use white for "no information" (FM 1-02 p. D-2); sources already go STALE → F6. |

### HS-26 — A suspected emitter symbol only when the evidence earns it

| Field | Value |
|---|---|
| **ID** | `HS-26` |
| **Statement** | *"As the S2 / EWO, I want a suspected-emitter symbol only when the evidence localizes it, so a symbol on my COP always means more than 'somewhere in a few hundred km²'."* (Decision supported: PIR; DF tasking.) |
| **Success criterion** | **G** the 90% emitter region is ≤ 25 km², or ≥ 2 real bearings cross at ≥ 30°; **T** a status-1 (dashed) hostile EW symbol `J1?` is drawn at the estimate with its ce90. **G** otherwise; **T** no emitter symbol and no emitter point in any payload (enforced by `HS-20`). |
| **Satisfied by** | `FR-04b` (gate), `FR-06a` |
| **Demo beat** | `B-1:35` (optional, needs DF) |
| **Priority** | **COULD** — with friendly binary evidence the region stays ≥ ~800 km² (jammer-aoe.md D3), so the gate is unreachable until bearings (v3). The prohibition half is a MUST and lives in `HS-20`. |

### HS-27 — Raise the emitter region as an NAI for collection

| Field | Value |
|---|---|
| **ID** | `HS-27` |
| **Statement** | *"As the S2 / EWO, I want the estimated emitter region drawn as a dashed NAI with a DTG, and a PIR / FFIR line 'NAI J1 opened — task DF', so the jammer PIR becomes a collection task."* (Decision supported: PIR; collection.) |
| **Success criterion** | **G** an active estimate; **T** a dashed NAI `J1` with W = DTG is drawn (MCRP 5-12A NAI graphic) and the after-action terminal line names it. |
| **Satisfied by** | `FR-06a` |
| **Demo beat** | `B-1:15`, `B-1:20` |
| **Priority** | **SHOULD** — doctrinal (NAI, FM 1-02 p. 1-130 / 7-35; assessment HS-04) but outside the stated intent, which is the area of effect; it serves the S2, not the FDC decision, and the region is ~900 km² with binary evidence. |

### HS-28 — Share the estimate with other C2 systems

| Field | Value |
|---|---|
| **ID** | `HS-28` |
| **Statement** | *"As the FSO, I want the estimate exported to TAK (CoT drawing shapes) and other C2 adapters, so units off my COP see the same denial area."* |
| **Success criterion** | **G** an active estimate; **T** each contour leaves as a CoT `u-d-f` polygon with `stale` = estimate time + 120 s and remarks carrying method, level and *"estimate"*; no emitter point unless `HS-26` is met. |
| **Satisfied by** | path-forward (FRS §7) |
| **Priority** | **COULD** — the FRS keeps ATAK / Maven ingest out of scope (§6); and a live map of which friendly links are jammed is EEFI, so the export needs handling rules first. |

**WON'T (MVP)** — DF bearings and emitter localization (v3); graded C/N0 / AGC likelihoods (v2); the in-flight munition band (v2); UHF and FPV layers; terrain / ITM; spoofing; heat surfaces; sector fitting. The *"more real"* intent is met by the hidden emitter and an honest estimate, not by these.

---

## 4. Operator success criteria — overall

The demo satisfies the URS if, on stage in the 5-minute slot, Adam (or the operator stand-in narrating) can:

1. **See trust degrade live** on Unit B without anyone telling him — the screen tells him (`UR-01`, `UR-02`).
2. **Read why** in plain English without engineering jargon (`UR-03`).
3. **Get attribution** — directional vs. blanket, named jammer profile (`UR-04`).
4. **See the mission fail TSS in its row** before he clears the round, with pre-planned branches — and no interruption of monitoring (`HS-05`, `UR-07`/`HS-07`).
5. **Verify the trust trace** behind the TSS verdict in three bullets (`UR-06`).
6. **Demonstrate the offline guarantee** — at any point during the demo, the laptop's wifi can be disabled and nothing breaks (`UR-08`).
7. **See an estimated area of effect, never a presumed jammer position** — with its confidence, evidence and who is inside it, going stale when its evidence stops, and logged for after-action (`HS-20`, `HS-21`, `HS-22`, `HS-24`, `HS-25`). *(Planned: `docs/plans/jammer-aoe.md`.)*

If all seven are visible in the 5-minute slot, the URS is satisfied. (Items 1–6 are built; item 7 is the AoE MVP.)

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
| `HS-05` (was `UR-05`) | TSS FAIL in the mission row, no modal | `FR-07` | `B-1:12..1:20` |
| `UR-06` | 3-bullet trust trace per AI recommendation | `FR-07`, `FR-08` | `B-1:20` |
| `UR-07` (`HS-07`) | Branches inline in the mission row | `FR-07` | `B-1:20..1:50` |
| `UR-08` | Offline single-laptop guarantee | `NFR-01..03` | All beats |
| `UR-09` | Ranked candidate methods + munitions affected | `FR-04`, `FR-04a` | `B-1:15`, `B-1:20` |
| `HS-20` (MUST) | Jammer location never presumed; hidden truth | `FR-04`, `FR-04b`, `FR-06a` | all beats |
| `HS-21` (MUST) | Estimated AoE on a high fingerprint match | `FR-04b`, `FR-06a` | `B-1:15`, `B-1:50` |
| `HS-22` (MUST, civil GNSS) | Units / mission points inside the AoE | `FR-04b`, `FR-06a` | `B-1:15` |
| `HS-23` (SHOULD) | AoE advisory in the mission row; verdict unchanged | `FR-07a` | `B-1:15..1:20` |
| `HS-24` (MUST) | Estimates in the after-action record | `FR-04b` | `B-1:15`, `B-2:15`, AAR |
| `HS-25` (MUST) | Stale and retire | `FR-04b`, `FR-06a` | `B-2:15` |
| `HS-26` (COULD) | Emitter symbol only under the evidence gate | `FR-04b`, `FR-06a` | `B-1:35` (v3) |
| `HS-27` (SHOULD) | Emitter region as NAI + PIR line | `FR-06a` | `B-1:15..1:20` |
| `HS-28` (COULD) | CoT / TAK export | FRS §7 | — |

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
