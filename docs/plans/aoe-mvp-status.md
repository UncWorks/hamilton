# Jammer AoE MVP: integration status

Integration branch `feat/aoe-mvp` (PR #7). Plan: `docs/plans/jammer-aoe.md`, cleared with conditions (§0). Parallel execution: `docs/plans/aoe-parallelization.md`.

## Decisions

- **K1** was resolved on 2026-10-04: the user accepted all D1–D10 defaults in plan §7.2.
- **K3 interpretation (coordinator; pending user confirmation).** In the off-node seed sweep, a run that ends `unbounded` publishes no region, so it counts as a **miss**. The result is 15/20 contained (15/15 among bounded runs), which meets the ≥ 15/20 bar exactly. The demo-truth sweep is 17/20, with all 20 runs bounded. Recorded in FRS FR-04b and plan §5.1.

## Streams

| Stream | Branch | PR | Status |
|---|---|---|---|
| WS-A contracts | `feat/aoe-contracts` | #8 | merged (CP1, tag `aoe-contracts-v1`) |
| WS-B simulator | `feat/aoe-sim` | #10 | merged |
| WS-C estimator | `feat/aoe-engine` | #11 | merged |
| WS-C wiring | `feat/aoe-engine-wire` | #12 | merged |
| WS-D web | `feat/aoe-web` | #9 | merged |
| WS-E integration | `feat/aoe-integrate` | stream PR into `feat/aoe-mvp` | K5, W27, X1, CRs, CP3 follow-ups, CP4 done; CP5 draft ready |

## Checkpoints

| Checkpoint | Gate | Status | Evidence |
|---|---|---|---|
| CP1 | Contracts frozen | **passed** | PR #8; tag `aoe-contracts-v1`; fixtures parse in TS and Rust; the `mode` fixture is rejected on both sides (K4). |
| CP2 | Real estimate on MQTT from the sim and engine | **passed** | PR #7 comment (coordinator, `feat/aoe-mvp` @ `d4ef0df`). 1:15: civil 50/90 = **1596 / 347 km²**, region90 **934 km²**. 1:50: region90 **836 km²**. First publish **+1 s**, stale **+12 s**, retire **120 s**, max payload **6555 B**. No truth leak. |
| CP3 | Web renders the live estimate at 1:15 | **passed** | Coordinator review on both renderers. Follow-ups fixed in WS-E: the COP story clock, the citation, the archive play, and the label nudge. |
| CP4 | Full beat run, trust pins unchanged (K5) | **passed** | See below. |
| CP5 | Docs and vault sync | **in progress** | X1 and CRs applied (WS-E). Storyboard rewrite drafted for the coordinator (vault not edited). Trace §6 vault sync to be scheduled after #6 / #7 merge. |

### CP4 evidence (2026-10-04, `feat/aoe-integrate`)

**Setup.** The smoke stack used separate ports (parallelization §5.0):
- broker `aoe-cp4-mqtt` on 1884 / 9002;
- release `trust-engine` on :8081;
- `next dev` on :3001 (Cesium) and :3002 (MapLibre);
- `comms-sim` at 1× with seed 42 and a 300 s run, captured on `#`.

There were two full runs. The second one gave the headful Cesium screenshots. The app CSP pins `connect-src` to `ws://localhost:9001`, so the browser ran with CSP bypass for :9002. This is a test-harness setting only.

**Trust pins.** These are B's per-window medians on the bus, with sim jitter. A and C are 1.00 in every payload from 0:00 to 2:20 (140 each).

| Beat | B median [min..max] | Pin |
|---|---|---|
| 0:00 | 1.000 | 1.00 |
| 0:45 | 0.711 [0.702..0.718] | 0.70 |
| 0:55 | 0.641 [0.626..0.678] | 0.65 |
| 1:05 | 0.651 [0.644..0.663] | 0.65 |
| 1:15–1:20 | 0.128 [0.112..0.145] | 0.13 |
| 1:50 | 0.220 [0.218..0.222] | 0.22 |
| 2:15 | 1.000 | 1.00 |

B first drops below 0.60 at 1:15.7. D and H links degrade from 0:46 (the [ASM] fire-support net); E from 1:16; F and G stay healthy. The jitter-free pins hold exactly in `avdiivka_beats_end_to_end` and `link-trust-rating.test.ts` (K5).

**Estimate lifecycle.** Both runs are identical:

| Time | Event |
|---|---|
| 1:15.8 | Opened, active, GNSS degraded {B, D, E, H}. Civil 50 / 90 = 1596 / 347 km², region90 934 km². |
| 10–11 s cadence | Heartbeats. |
| 1:52.7 | Update after B's move: 1558 / 352 km², region90 836 km². |
| 2:26.7 | Stale, 11.7 s after the jammer went off. |
| 4:16.7 | Retired (empty retained payload), 120 s after the trigger dropped. |

The largest payload was 6555 B. No `mode` or `bearings_used` key appeared. The candidates on the bus were 1.00 / 0.67 / 0.17.

**UI (both renderers).**
- 0:00–1:05: no AoE.
- 1:15: AoE `active` with fill90 + edge90 + edge50. Label `Est. GPS denial · Pole-21-class · 90% · 4 s ago · 4 degraded / 4 healthy`. Card: "Inside: OBS B (AB1001 observer) — 90%", "Emitter not located (90% region ~934 km²)", "UHF links: not assessed — ground GNSS only", "M982 in flight: not assessed — ground receivers only".
- 1:15: AB1001 row `TSS FAIL — RELIABILITY E5 (min C)`, `DO NOT LOAD`, with **no modal**. AB1001 arrived at 1:12 as PASS C3.
- 1:50: `4 degraded / 5 healthy`.
- 2:15 + 15 s: `stale`, outline only, label "Last est. HHMMZ · … · outline only".
- After retire: nothing drawn.
- Terminal: opened → stale → "retired — evidence stopped".
- Throughout: no jammer symbol and no "clear" / "window open" text. Zero console errors.

**Leak check.** `scripts/check-no-truth.sh` (sim bus) is OK. On the full-stack bus, no truth coordinate appears at 4 / 5 dp outside the estimate, and no truth keyword appears anywhere. The AoE contour vertices match the truth latitude or longitude at 4 dp on single axes only (~5 per payload, never a pair). That is expected for rings that span the site, not a point leak.

**Screenshots** (`~/.claude/jobs/610837f7/tmp/cp4/`):
- `maplibre-1m15s.png`, `cesium-headful-1m15s.png`;
- `maplibre-retired.png`, `cesium-headful-retired.png`;
- `*-2m15s-stale.png`, `cesium-headful-1m50s.png`;
- all beats for both renderers. The headless Cesium frames show no globe or polygons (SwiftShader), so use the headful ones.

**Suites.**
- `cargo test --workspace`: 128 passed.
- clippy `-D warnings` and fmt: clean.
- web: `test` 109/109, typecheck, `next build` and `build-storybook` all OK; story play functions 52/52.
- comms-sim: pytest 485 passed; ruff check and format clean.
- contracts: test 24/24 and lint OK.
- `make verify` (incl. `check-no-truth.sh`) OK.
- K5 diff heuristic empty; K6 grep empty.
- `pnpm -r lint` cannot run: the web has no ESLint config and `next lint` prompts. This is pre-existing.

## Open

- **K3 counting rule:** user confirmation.
- **"Bronk RUSI 2024":** still cited in docs prose (FRS FR-04a library source and R14 verbatim answer, URS UR-09 citations, System Design R14 answer, Branding token note). Only `library.json` was in the approved CR.
- **Stale card block:** after B recovers at 2:15, the side panel returns to Unit A and the AoE card block is not on screen. The map label carries "Last est.".
- **Late joiner:** a page that joins mid-run evaluates AB1001 against the seed track (1.00) for about 1 s before B's trust payload arrives. The terminal logs a transient PASS B2 line.
