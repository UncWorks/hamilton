# Hamilton

> The commander's aide-de-camp for the comms channel.

Hamilton is a comms-integrity evaluation layer that drops onto any C2 surface,
emits a continuous trust score per inbound source on MQTT, and feeds it into the
**target selection standards (TSS)** check of each fire mission: a call for fire
that depends on a source failing TSS for its munition class shows **TSS FAIL** and
a recommended method of control (DO NOT LOAD) **in its mission row** — no modal,
monitoring never interrupted.

The demo is the Avdiivka Excalibur counterfactual: GPS-guided round, jammer
densifying in the target's grid, FDC officer at the COP screen — the system
fades Unit B's icon, names the candidate jamming method, and gates the strike
35 seconds before commit.

## Architecture (single sentence per layer)

| Layer | Lives in | Job |
|---|---|---|
| **Trust engine** | `services/trust-engine/` (Rust + Tokio + Axum) | Source of truth — runs four deterministic detectors + FR-04a overlap matcher; publishes ≥1 Hz on MQTT |
| **Comms simulator** | `services/comms-sim/` (Python) | Drives the Avdiivka scenario beats, publishes raw telemetry on `telemetry/+/raw` |
| **LLM narrator** | `services/llm-narrator/` (Node) | Function-calling provider chain (Claude → Llama → deterministic strings) — emits 3-bullet trust traces |
| **Frontend** | `apps/web/` (Next.js 14 + CesiumJS primary / MapLibre fallback + deck.gl + Zustand) | The COP — track symbols, candidate cards, fire-mission queue with inline TSS status, after-action terminal. Renderer toggle: `NEXT_PUBLIC_RENDERER=cesium\|maplibre` per System Design §6c |
| **Contracts** | `packages/contracts/` (TS) + `packages/contracts-rs/` (Rust) | Single source of truth for MQTT payload shapes; mirrored field-for-field with `deny_unknown_fields` |
| **Broker** | `infra/docker/` (Eclipse Mosquitto) | MQTT spine — TCP on 1883, WebSockets on 9001 for the browser client |

## Disciplines (non-negotiable)

- **R14** — deterministic boundary. All detection is threshold-based. The LLM is
  function-calling-only over the structured `components` payload.
- **R15** — FDC anchor. One operator seat. Brand bar shows `FDC · Adam`. No persona switcher.
- **R16** — gradient + gating wedge. Continuous score on `integrity/trust/{source_id}` +
  TSS mission check at FR-07 (reliability + report age per dependency source, per mission).
- **NFR-01** — fully offline. No CDN. No Google Fonts. No Cesium ion. Self-hosted everything.

## Bring-up

```bash
# 1. Start the broker + Ollama + service containers
make up

# 2. Pre-pull the local Llama model (once, ~2 GB)
docker exec hamilton-ollama ollama pull llama3.2:3b

# 3. Run the demo (uses MapLibre spine — Cesium swap deferred per §6c gate)
make demo
# open http://localhost:3000
```

For dev iteration with the scenario running 10× faster:

```bash
COMMS_SIM_SPEED=10 make demo
```

To force the verified MapLibre fallback path:

```bash
make demo-fallback
```

## Demo flow (5 minutes)

| Beat | What you see |
|---|---|
| `B-0:00` | Three healthy units (A, B, C) at full opacity |
| `B-0:45` | Unit B's icon begins to fade: cadence 1.0s → 1.17s, temporal anomaly fires, trust ≈0.70 (WATCH, at/above the 0.60 GPS-guided TSS minimum) |
| `B-0:55` | Trust trace: "B-link: 6% corrupted frames, cadence 1.17s" (stability fault; trust ≈0.65, still WATCH) |
| `B-0:30` | Call for fire AB1002 (OBS C, M795 HE) enters the fire-mission queue — `NOT GATED` (unguided) |
| `B-1:05` | Side panel: "Degradation directional, vicinity B's flank corridor. Neighbors A, C unaffected." |
| `B-1:12` | Call for fire AB1001 (OBS B (FO), M982 Excalibur) enters the queue — `TSS: PASS — RELIABILITY C3 (min C)` |
| `B-1:15` | Jammer at full power (6.1s gap, 14% CRC). Top-3 candidate cards reveal — `ground_based_gps_uhf_barrage (1.00)` → Excalibur, JDAM-ER, Switchblade 300, GMLRS-U. Trust 0.13 (E5): AB1001 flips in its row to `TSS: FAIL — RELIABILITY E5 (min C)` · `Rec. method of control: DO NOT LOAD (M982)`, with branches [1]–[4]. No modal |
| `B-1:20` | **Call for fire at B fails TSS in-row.** Operator presses `1` on the focused row: Shift → M795 HE, adjust fire; TSS PASS; the branch is logged (mission, TSS result, J, report age, role, DTG). Other branches: [2] confirm via alt channel, [3] AT MY COMMAND — re-rate in 60 s, [4] accept risk (FSO) |
| `B-1:50 → B-2:15` | B still below the TSS minimum at 0.22 while recovering, back to 1.00 at 2:15; brand-bar hairline rule (any TSS FAIL this session) stays on |

## Verify

```bash
make verify           # asset checks + phosphor lint + dep budget
cargo test --workspace
cargo clippy --workspace --all-targets -- -D warnings
cd services/comms-sim && .venv/bin/pytest -q
pnpm --filter @hamilton/web build
bash scripts/airplane-mode-test.sh   # NFR-01 live verification (needs docker)
```

## Open items (deliberate scope)

- **Cesium 3D Tiles for Avdiivka AO** — the spine ships with the default ellipsoid globe (no terrain) and procedural jammer stand-ins (labeled translucent ellipses at named coordinates; *superseded by `HS-20`: the stand-ins and the hard-coded jammer point are removed by the AoE MVP, `docs/plans/jammer-aoe.md`*). Drop a 3D Tiles tileset under `apps/web/public/cesium/tiles/` and a `CesiumTerrainProvider` swap is a one-line change in `CesiumSpine.tsx`.
- **Photoreal glTF jammer models** — *superseded by `HS-20`*: the C2 does not know where the jammer is, so no model is placed. The AoE MVP draws the estimated area of effect instead (`docs/plans/jammer-aoe.md`).
- **Anthropic API key** — leave `ANTHROPIC_API_KEY` blank in `.env` to skip the Claude provider entirely. The chain auto-falls-back: Claude → Llama → deterministic strings.
- **Self-hosted .woff2 fonts** — `Inter Tight` and `JetBrains Mono` files belong in `apps/web/public/fonts/`. The fallback stack carries the design until they land.
- **Pre-recorded `~/demo-fallback.mp4`** — NFR-04 fallback. Record after stage rehearsal.

## Repo map

```
hamilton/
├── apps/web/                    # Next.js 14 frontend
├── services/
│   ├── trust-engine/            # Rust workspace (5 crates)
│   ├── comms-sim/               # Python scenario engine
│   └── llm-narrator/            # Node function-calling narrator
├── packages/
│   ├── contracts/               # TypeScript MQTT contracts (Zod)
│   └── contracts-rs/            # Rust mirror (serde)
├── infra/docker/                # docker-compose + mosquitto.conf
├── assets/fingerprints/         # FR-04a library JSON
├── scripts/                     # verify-assets, lint-phosphor, count-deps, airplane-mode
└── docs/                        # URS, FRS, System Design, Tech Stack, Branding
```

## License

Proprietary.
