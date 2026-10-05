# Jammer AoE MVP: integration status

Integration branch `feat/aoe-mvp`. Plan: `docs/plans/jammer-aoe.md`, cleared with conditions (§0). Parallel execution: `docs/plans/aoe-parallelization.md`.

## Decisions

The K1 condition was resolved on 2026-10-04. The user accepted all D1–D10 defaults in plan §7.2.

## Streams

| Stream | Branch | Owner | Status |
|---|---|---|---|
| WS-A contracts | `feat/aoe-contracts` | agent α | started |
| WS-C estimator | `feat/aoe-engine` | agent β | started |
| WS-B simulator | `feat/aoe-sim` | agent γ | started (contract-free C1/C2 first) |
| WS-D web | `feat/aoe-web` | agent δ | started (contract-free W-rows first) |
| WS-C wiring | `feat/aoe-engine-wire` | agent α (after CP1) | waiting on CP1 |
| WS-E integration | `feat/aoe-integrate` | coordinator (after CP2) | waiting on CP2 |

## Checkpoints

| Checkpoint | Gate | Status |
|---|---|---|
| CP1 | Contracts frozen | pending |
| CP2 | Real estimate on MQTT from the simulator and engine | pending |
| CP3 | Web renders the live estimate at 1:15 | pending |
| CP4 | Full beat run, trust pins unchanged (K5) | pending |
| CP5 | Docs and vault sync | pending |
