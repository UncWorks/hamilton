# Plan — spatial trust + positions (FIX 1), kill-chain gate timing (FIX 2)

Status: implemented on `fix/fingerprint-trust-inversion` (PR #1), as two commits
after the fingerprint inversion. Both problems were pre-existing and were
exposed by that fix (see `fix-fingerprint-trust-inversion.md` §3).

Formula (unchanged): `score = 0.6·Σwᵢcᵢ + 0.4·min(c)`, weights temporal .2,
stability .3, spatial .2, fingerprint .3. ROE floor 0.60.

---

## FIX 1 — spatial factor is not trust-oriented; every source sits at (0,0)

### Root causes (file:line at `f31ef19`)

1. `services/trust-engine/crates/detectors/src/spatial.rs:74-82`.
   `classify_spatial` maps the label straight to a score (Localized → 0.6,
   Blanket → 0.3) without asking whether the target itself is degrading. A
   healthy source with healthy neighbours is "localized" and loses 0.4 of
   spatial trust, so every idle unit reads 0.79 instead of 1.0.
2. `services/trust-engine/src/telemetry.rs:74`.
   `SourceState::new(&payload.source_id, 0.0, 0.0)`: the telemetry contract
   (`packages/contracts-rs/src/lib.rs:115`, `packages/contracts/src/telemetry.ts`)
   has no position, so every source is at (0,0) and every source is inside every
   other source's 500 m radius.
3. `services/trust-engine/src/ticker.rs:90` and `src/telemetry.rs:96`.
   Neighbour degradation came from the simulator's self-reported `degrading`
   flag. When B flagged itself, A and C saw a degrading neighbour, were
   classified "blanket" (0.3) and dropped to 0.64 while healthy. That contradicts
   FRS FR-03 ("A and C unaffected → localized").

### Semantics chosen

Spatial is a **trust** component (1 = healthy), like the other three:

| Target (engine-measured) | Neighbours within radius | Classification | Spatial trust |
|---|---|---|---|
| not degrading | any | `Nominal` (new) | **1.0** |
| degrading | all healthy | `Localized` | **0.6** |
| degrading | ≥ 1 degrading | `Blanket` | **0.3** |

- **"Degrading" is measured, never self-reported.**
  `trust_detectors::spatial::is_degrading(temporal, stability) = temporal.anomaly || stability.degraded`.
  That is the FR-01 > 3σ anomaly or the FR-02 CRC > 5% / duplicate-spike flag.
  The ticker computes temporal and stability readings for every source first.
  It then classifies each source against its neighbours' measured status.
- **The `degrading` flag is removed from the telemetry contract** (TS, Rust,
  Python). It was small enough to remove: three structs plus one engine use.
  With `deny_unknown_fields` (Rust) and `.strict()` (Zod), a publisher that
  still sends it is rejected loudly. The engine's "stability transition" log
  event now fires when the measured `detect_stability(..).degraded` flips.
  comms-sim keeps a scenario-internal `degrading` field to pick its jitter
  profile only. FIX 2 removes it.
- **Fingerprint does not count toward "degrading".** RF is observed only while
  the link is already degrading in this scenario, and FR-03's input is
  FR-01/FR-02 degradation. Adding it would double-count FR-04.

#### Why blanket is penalised harder than localized (and not the reverse)

FRS FR-03 (`docs/FRS.md:81`) frames the dichotomy as *"directional/localized,
not blanket atmospheric/EMI"*, and URS UR-04 as *"localized ... from a blanket
atmospheric one"*. Read for **attribution**, that makes blanket the
*less adversarial* explanation (weather/EMI). The obvious inversion would be
localized 0.3, blanket 0.6. We did not take it, because:

1. The spatial component feeds a **trust** score that gates fires. A blanket
   outage, whatever causes it, means that **no** link within 500 m can
   corroborate the source. Wider-area degradation is less recoverable for this
   source's data, not more.
2. Adversarial attribution is FR-04's job. Its fingerprint trust already falls
   to 0.0 on a jammer match. Also penalising "localized because it looks
   targeted" would count the same evidence (a jammer near B) twice.
3. The narrator already encodes this ordering. In
   `services/llm-narrator/src/providers/deterministic.ts`, spatial < 0.45 means
   "Blanket degradation across neighbors" and 0.45–0.7 means "Localized to …;
   neighbors healthy". Keeping 0.6/0.3 needs no narrator change.
4. The demo is unaffected either way. Only the localized branch is exercised.

The FRS wording stays an attribution statement. FR-03 now also documents the
trust mapping. If the team wants blanket = "benign, less suspicious", it is a
one-constant swap (`LOCALIZED_TRUST` / `BLANKET_TRUST` in `spatial.rs`).
That is listed as an open question.

### Positions

- `TelemetryPayload` gains **required** `lat`, `lon` (WGS-84 decimal degrees)
  in `packages/contracts/src/telemetry.ts` (`.strict()`, range-checked) and
  `packages/contracts-rs/src/lib.rs` (`deny_unknown_fields`). Required, because
  defaulting to (0,0) is exactly the bug.
- comms-sim publishes `SOURCE_POSITIONS` on every payload. These are the same
  seeds as `apps/web/app/page.tsx` `SEED_TRACKS`: B 48.1400/37.745,
  A 48.1422 (~245 m N), C 48.1378 (~245 m S). This matches "C ~240 m from B,
  A within 500 m". A test pins the distances.
- The engine takes the latest reported position on every payload, so sources
  may move.
- `TrustScorePayload` gains **optional** `lat`/`lon` (skipped when absent;
  `TrustScorePayload` is not `deny_unknown_fields`, and the Zod schema is not
  strict, so old consumers are unaffected). The engine echoes the position.
  `apps/web` `applyScore` uses it and falls back to the seed. Seeds remain
  so the map renders before the first MQTT message. Removing them is a
  follow-up.
- Radius: `TRUST_ENGINE_SPATIAL_RADIUS_M` (default 500, must be finite and > 0).
  It is set in `.env.example` and `infra/docker/docker-compose.yml`.

### Tests

- detectors `spatial.rs`: healthy target → Nominal 1.0 (whatever the neighbours
  do); healthy A next to degrading B → 1.0; all degraded → Blanket 0.3 < 0.6;
  radius configurable; `is_degrading` uses measured detectors.
- aggregator: `healthy_units_score_one`, `localized_b_leaves_a_and_c_at_full_trust`,
  `all_degraded_gives_blanket_penalty`. `avdiivka_beats_end_to_end` now ticks
  A, B and C together, with measured degradation and real positions.
- contracts-rs: telemetry position round-trip; missing position rejected;
  self-reported `degrading` rejected; optional trust-payload position.
- comms-sim: payloads carry real positions; A/C distances; no `degrading` on
  the wire.
