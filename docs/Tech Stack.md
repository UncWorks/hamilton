---
tags: [strategy, stack, tooling, sme-validated, render-spine/cesium]
status: c2-leaning
hardware: laptops + Android phones only
spine-swap-2026-05-03: Render spine swapped from MapLibre → CesiumJS, gated by 1100 Sunday spike (see §"Render-spine swap" + [[Specs/System Design]] §6c). MapLibre + PMTiles retained as verified fallback. MQTT contract is renderer-agnostic; engine unchanged.
sme-validation-2026-05-02: Confirmed local-first/laptop-only stack matches operator constraints (no cloud, no GPU farm). SME volunteered that "operations teams don't use AI tools because of hardware/power constraints — they prefer running locally on their own systems." No tech-stack change required; pitch should make local-first more visible. See [[../06 - Research/SME Interviews/2026-05-02 - SME Interview|SME Interview]] §2 claim 4.
---

# Tech Stack

> **Principle:** at a hackathon, the stack is whatever your team is fastest in **right now**. Don't learn a new framework Saturday morning. Pick on velocity, not novelty.

## Locked context
- **Hardware: laptops + Androids only.** No drones, SDR, Jetson/Pi, hardware kits.
- **Capability lean: C2 with comms-aware angle** (see [[Capability Selection]]).
- **Demo must run offline** on a single laptop (judging slot has no guaranteed internet).

## Recommended stack for the comms-aware C2 build

| Layer | Pick | Why |
|---|---|---|
| **Frontend framework** | Next.js | Web-native, fast iteration, PWA-capable for the Android operator surface |
| **Render spine — primary** | **CesiumJS** (local 3D Tiles + terrain server, no Cesium ion network calls) | True 3D globe + terrain-masked LOS for FR-03 spatial discriminator; `Cesium3DTileset` glTF jammer models for FR-04a candidates; CZML-driven scrubbable timeline hardens demo recovery; reads as defense-grade, not consumer-mapping. **Sunday 1100 gate per [[Specs/System Design]] §6c** |
| **Render spine — fallback** | MapLibre GL + PMTiles (≈200MB bundle) | Verified-state held in reserve; activates only if §6c gate fails. Same MQTT subscription shape, only the renderer changes |
| **Basemap (both spines)** | Protomaps vector extract of the AO (`avdiivka.pmtiles`, ~4 MB, OSM ODbL) + self-hosted Noto Sans glyphs; Hamilton dark style generated from `@protomaps/basemaps` "dark". Cesium gets a raster pyramid (~10 MB) rendered locally from the same extract + style with MapLibre Native. `NEXT_PUBLIC_BASEMAP=offline\|online\|none`; `make fetch-tiles` provisions. Details: [[Specs/System Design]] §6c.1 | Identical 2D / 3D map, no CDN, no ion, ~17 MB total instead of the planned ≈200 MB bundle. Runtime deps +1 (`pmtiles`); the style generator and renderer are build-time tools outside the app |
| **3D assets / tiles** | Local Cesium 3D Tiles tileset + local terrain tile server (~2–4GB bundle); glTF stand-ins (or photoreal models) for R-330Zh Zhitel + Pole-21 jammer systems | Offline-safe per `NFR-01`; satisfies the "named system, geolocated" judge defense |
| **Backend trust engine** | Rust async (Tokio + Axum) | Source of truth for FR-01..04 + FR-04a; deterministic detectors per R14 |
| **Comms simulator** | Python module — link health, RSSI, packet loss, jamming events | CHAOS-owned differentiator |
| **Stream / pub-sub** | MQTT (single broker, in-process is fine) | Renderer-agnostic spine — Cesium, MapLibre, AIP all subscribe to the same topics |
| **DB** | RocksDB / DuckDB / SQLite (single-binary) | No external infra; embeds in the binary |
| **Geospatial** | DuckDB spatial extension + h3 | Avoid PostGIS unless absolutely needed |
| **LLM** | Anthropic Claude (function-calling) primary; Llama 3.2 3B local fallback | API for quality, local for offline demo guarantee |
| **Phone client (Android)** | PWA over the same Next.js app | "Operator on a phone" story without writing native Android |
| **Containerization** | Single `docker compose up` for the whole stack | Reproducible across team laptops |

## Render-spine swap — MapLibre → CesiumJS (2026-05-03)

> Committed Sunday morning during the rehearsal block. Authoritative gate criteria + kill conditions live in [[Specs/System Design]] §6c. This section captures the stack-level rationale and demo-day discipline.

**What changed:** the primary 2D MapLibre+PMTiles spine is replaced by CesiumJS (local 3D Tiles + terrain server). MapLibre is retained as a verified fallback, gated by the 1100 Sunday spike.

**Why the swap is worth the risk:**
- **Terrain-masked LOS** — FR-03 (spatial discriminator) becomes a true line-of-sight calculation from a candidate jammer site to Unit B's flank corridor. MapLibre cannot model this honestly; Cesium can.
- **Geolocated glTF jammer models** — FR-04a (top-3 ranked candidates + munitions affected) gets `Cesium3DTileset` models for R-330Zh Zhitel and Pole-21 placed at named coordinates. Reads as "we know what this system is and where it lives."
- **CZML scrubbable timeline** — the entire 5-minute demo can run off a CZML document with a real clock. Judges can rewind to "show me 1:15 again." MapLibre cannot do this without rolling our own.
- **Defense-grade visual register** — Cesium is the de facto C2/geospatial 3D engine (used inside Palantir, Maven, ATAK derivatives). MapLibre reads as consumer mapping at a defense judging table.

**What the swap costs:**
- Bundle size: ~200MB (MapLibre + PMTiles) → ~2–4GB (Cesium + 3D Tiles + terrain + glTF). SSD/RAM headroom must be verified on the demo laptop Sunday.
- Build state: five `verified` rows in [[Specs/System Design]] §4 demote to `scoped`. The MapLibre fallback path keeps NFR-05 satisfied.
- **R-NEW Cesium unfamiliarity** — the team has not built in Cesium before this hackathon. The 1100 Sunday gate is the mitigation.

**Discipline:** the swap **does not move R14 / R15 / R16**. The MQTT contract is the discipline boundary; the renderer is interchangeable. The Rust trust engine, the deterministic detectors, the FDC anchor, and the gradient+gating wedge are unchanged.

## Optional secondary rendering surface — Palantir AIP

> Released event-day 2026-05-02 by organizers. Adopted **conditionally** with a 1300 Saturday go/no-go gate. See [[../06 - Research/Partner Resources Evaluation|Partner Resources Evaluation]] and [[../05 - Build Plan/Saturday Plan|Saturday Plan]] for the gate logic.

**Discipline:** the Rust trust engine is the source of truth. AIP is a **consumer**, not a rewrite target. We do not port the trust engine into AIP Logic primitives.

**Integration contract:**

| Direction | Mechanism | Notes |
|---|---|---|
| Rust → AIP | Trust score JSON published to MQTT topic `integrity/trust/{source_id}` (already in v5 build) → REST shim or webhook bridge → AIP Logic node | Shim is ~50 lines; doesn't touch the engine |
| AIP rendering | Trust score becomes a property on a Palantir ontology object representing each emitting unit / sensor | AIP renders on its own COP surface |

**Demo positioning:** **CesiumJS is shown first** (vendor-neutral 3D spine — falls back to MapLibre if §6c gate fails). AIP is shown **second** as *"and here it is again, on Palantir AIP"* — proving the *"drops onto any C2"* thesis. Vendor-neutral framing rationale and Q&A defenses against the *"aren't you just building on Palantir?"* line of attack: [[Competitive Positioning]] §3 axis 4 + R19.

**Kill criteria:** if AIP plumbing is not publishing a trust score by 1300 Saturday, abandon the AIP path. The primary spine demo (Cesium or MapLibre per §6c) is non-negotiable.

## Why these choices given our constraints
- **No PostGIS / Postgres** — DuckDB handles analytical geospatial fine for hackathon scale, single binary, no setup
- **No Kafka** — MQTT single broker is plenty for one demo machine and the renderer-agnostic contract is the architectural point
- **No Kubernetes / cloud** — `docker compose` plus localhost; demo must run offline anyway
- **PWA for the Android client** — turns "we have phones" into "operator-grade tactical interface" without an Android dev sprint
- **CesiumJS over MapLibre (revised 2026-05-03)** — Cesium is heavier but the FR-03 / FR-04a visual case (terrain-masked LOS, geolocated glTF jammer models) is uniquely available on Cesium and is the highest-leverage upgrade to judge defensibility. MapLibre is held as the verified fallback per §6c gate; we are not betting the demo on Cesium working — we are betting *up to* the 1100 gate on Cesium working

## Decision boundaries
- **Original lock:** Saturday 11:30 AM PT (held — Cesium swap is a renderer-only change, MQTT contract unchanged)
- **Render-spine final lock:** **1100 Sunday 2026-05-03** — Cesium go/no-go per [[Specs/System Design]] §6c. After 1100 the spine is frozen for the demo
- **No new dependencies after:** Sunday 6:00 AM PT (Cesium + glTF assets must be staged before this)
- **Dependency budget:** target ≤ 25 direct deps for the demo path; every new dep needs a 30-second justification. Cesium counts as a single dep but bundles 3D Tiles + terrain assets that count against bundle-size budget, not dep count

## Defaults to consider per capability

| Capability | Likely strong picks |
|---|---|
| [[02 - Problem Statements/01 - Sensor Analysis and Integration\|Sensor]] | Python (NumPy/Polars), DuckDB, deck.gl/Cesium, FastAPI |
| [[02 - Problem Statements/02 - Edge Deployments and Drone Operation\|Edge / Drones]] | PX4 SITL + Gazebo, ROS 2, ONNX Runtime, Jetson Orin Nano (if available) |
| [[02 - Problem Statements/03 - Mission Command and Control\|C2]] | Next.js + CesiumJS (MapLibre fallback), Rust trust engine, MQTT, Anthropic function-calling |
| [[02 - Problem Statements/04 - Digital Defense and Cybersecurity\|Cyber]] | Go for the scanner, eBPF (Cilium tooling) for runtime, Sigstore tools, Python for the ML side |
| [[02 - Problem Statements/05 - General National Security\|Wildcard]] | Whatever ships fastest |

## Infra constraints to plan for
- **No reentry after 10 PM Saturday** → assume venue Wi-Fi only after that, possibly congested
- **Demo on a laptop** — assume HDMI to a stage screen, no internet guarantees during judging
  - **Demo must run fully offline-capable** if at all possible
- **Power** — bring a multi-port USB-C charger + extension cable; venue power is often scarce
- **API budgets** — if we use a hosted LLM, set a hard $ ceiling and a fallback to a local quantized model (Llama 3.2 3B / Phi-4-mini)

## Pre-event provisioning checklist
- [ ] Repo created (suggest: `army-x-tech-hackathon` or capability-specific name)
- [ ] CI lane that runs lint + a single end-to-end smoke test
- [ ] `.env.example` committed; secrets in 1Password / Bitwarden vault, not in repo
- [ ] Single-command `make demo` (or equivalent) so anyone on the team can recover the demo state
- [ ] At least one **dummy data fixture** so we can demo without internet
- [ ] Vendor accounts pre-created with API keys: OpenAI / Anthropic, any datasets needing auth

## Render-spine swap — Sunday provisioning checklist (new 2026-05-03)
- [ ] Cesium 3D Tiles tileset for Avdiivka AO bundled locally (terrain + imagery)
- [x] Offline basemap for both spines — `make fetch-tiles` (vector PMTiles + glyphs + Cesium raster pyramid, ~17 MB); `make verify` fails if `NEXT_PUBLIC_BASEMAP=offline` and it is missing (2026-10-03)
- [ ] Local terrain tile server running offline; `CesiumTerrainProvider` pointed at `localhost`
- [ ] glTF stand-ins (or photoreal) for **R-330Zh Zhitel** + **Pole-21** on disk; geocoordinates set
- [ ] Cesium viewer renders with **zero Cesium ion network calls** (verified by airplane-mode test)
- [ ] One entity's `color.alpha` bound to live MQTT trust score via `CallbackProperty` — visible fade on jam event
- [ ] ~~DOM kill-chain modal anchored over Cesium viewport~~ — superseded by the non-modal TSS fire-mission row (`docs/plans/tss-mission-row.md`)
- [ ] Demo laptop SSD ≥ 10GB free; RAM headroom verified with full bundle loaded
- [ ] **MapLibre + PMTiles fallback path remains runnable** — `make demo-fallback` swaps the renderer in one command
- [ ] **1100 Sunday gate decision recorded** in [[Specs/System Design]] §6c notes

## What NOT to do
- ❌ Adopt a framework anyone is using for the first time
- ❌ Start with Kubernetes / multi-service architectures — single binary wins at hackathons
- ❌ Custom auth / billing / multi-user — judges don't care; demo a single signed-in operator
- ❌ Spend Saturday writing tests for new code — write tests for the **demo path** only
