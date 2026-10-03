# Hamilton

> The commander's aide-de-camp for the comms channel.

Hamilton is a comms-integrity evaluation layer that drops onto any C2 surface,
emits a continuous trust score per inbound source on MQTT, and **interrupts the
kill chain** with a 3-option modal when any source crosses the rules-of-engagement
floor for an action class.

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
| **Frontend** | `apps/web/` (Next.js 14 + CesiumJS primary / MapLibre fallback + deck.gl + Zustand) | The COP — track icon decay, candidate cards, kill-chain modal, after-action terminal. Renderer toggle: `NEXT_PUBLIC_RENDERER=cesium\|maplibre` per System Design §6c |
| **Contracts** | `packages/contracts/` (TS) + `packages/contracts-rs/` (Rust) | Single source of truth for MQTT payload shapes; mirrored field-for-field with `deny_unknown_fields` |
| **Broker** | `infra/docker/` (Eclipse Mosquitto) | MQTT spine — TCP on 1883, WebSockets on 9001 for the browser client |

## Disciplines (non-negotiable)

- **R14** — deterministic boundary. All detection is threshold-based. The LLM is
  function-calling-only over the structured `components` payload.
- **R15** — FDC anchor. One operator seat. Brand bar shows `FDC · Adam`. No persona switcher.
- **R16** — gradient + gating wedge. Continuous score on `integrity/trust/{source_id}` +
  modal interrupt at FR-07 when score crosses the ROE floor.
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
| `B-0:45` | Unit B's icon begins to fade: cadence 1.0s → 1.17s, temporal anomaly fires, trust ≈0.70 (WATCH, above the 0.60 floor) |
| `B-0:55` | Trust trace: "B-link: 6% corrupted frames, cadence 1.17s" (stability fault; trust ≈0.65, still WATCH) |
| `B-1:05` | Side panel: "Degradation directional, vicinity B's flank corridor. Neighbors A, C unaffected." |
| `B-1:15` | Jammer at full power (6.1s gap, 14% CRC). Top-3 candidate cards reveal — `ground_based_gps_uhf_barrage (1.00)` → Excalibur, JDAM-ER, Switchblade 300, GMLRS-U. Trust 0.13: first crossing below the ROE floor |
| `B-1:20` | **Kill-chain modal**. Subtitle: ***"Kill-chain gated below ROE floor."*** Three options: delay 60s / shift to non-GPS munition / confirm via alt channel |
| `B-1:50 → B-2:15` | Operator selects (b); B still gated at 0.22 while recovering, back to 1.00 at 2:15; brand-bar hairline rule stays on |

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

- **Cesium 3D Tiles for Avdiivka AO** — the spine ships with the default ellipsoid globe (no terrain) and procedural jammer stand-ins (labeled translucent ellipses at named coordinates). Drop a 3D Tiles tileset under `apps/web/public/cesium/tiles/` and a `CesiumTerrainProvider` swap is a one-line change in `CesiumSpine.tsx`.
- **Photoreal glTF jammer models** — current jammer overlay is a procedural ellipse + label (`R-330Zh Zhitel`, `Pole-21`). Replace with `Cesium3DTileset` glTF models when sourced.
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
