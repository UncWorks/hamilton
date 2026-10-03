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

---

## FIX 2 — kill-chain gate fires at 0:45 instead of 1:20

### Beat table after FIX 1, before FIX 2 (Unit B)

| Beat | 0:00 | 0:45 | 0:55 | 1:05 | 1:15 | 1:20 | 1:50 | 2:15 |
|---|---|---|---|---|---|---|---|---|
| B | 1.00 | **0.43** | 0.31 | 0.31 | 0.13 | 0.13 | 0.22 | 1.00 |

FIX 1 fixed A, C and the healthy level, but B still crosses the floor at 0:45.

### Root causes (file:line at `f31ef19`)

- `services/comms-sim/src/comms_sim/scenarios/avdiivka.py:63`. B's cadence
  steps straight to 6.1 s at 0:45. The temporal detector
  (`crates/detectors/src/temporal.rs` `compute_score`: 1σ → 1.0, 6σ → 0.0)
  with the engine baseline 1.0 s ± 0.05 s (`src/state.rs:39`) puts 6.1 s at
  102σ, so temporal trust is 0.0. Through the `0.4·min(c)` term, a single
  zeroed component caps the score at `0.6·(1 − w) ≤ 0.48`. B is gated at 0:45.
- `avdiivka.py:68`. CRC steps to 14% at 0:55. That is stability trust 0.31,
  which alone caps B at 0.598 even if every other component were 1.0.
- `services/comms-sim/src/comms_sim/runner.py:98`. Cadence jitter while
  degrading was σ = 0.4 s, about 8 baseline σ. Any WATCH-band cadence would
  make temporal trust, and the gate, flicker at random from tick to tick.

### Feasibility: why "6.1 s by 1:05" and "14% at 0:55" cannot stay

With the documented formula and floor:

- Temporal trust 0 at time T means a score of at most 0.48 at T. So **the 6.1 s
  gap cannot appear before the gate beat.** This is true of any σ-based
  temporal detector, since 6.1 s is 6× the baseline cadence.
- CRC 14% (stability 0.31) means a score of at most 0.598. So **14% CRC cannot
  appear before the gate beat either.**
- In general, B stays ≥ 0.60 while degrading (spatial 0.6) only if temporal
  trust is ≥ 0.32 with nominal stability. The cadence must stay
  ≤ ~1.23 s until the gate.

So the *values* in the narrated evidence stay ("cadence 1.0s → 6.1s",
"CRC 0.2% → 14%"), but their **timing moves to 1:15**: the jammer reaches
full power when it is fingerprinted. 0:45 and 0:55 become WATCH-band
precursors. The docs were updated to the numbers the engine produces.

### Change (scenario telemetry only, no detector or weight change)

| Beat | B cadence | B CRC | B RF | Why |
|---|---|---|---|---|
| 0:00 | 1.0 s | 0.2% | — | healthy |
| 0:45 | **1.17 s** (3.4σ) | 0.2% | — | FR-01 anomaly fires (> 3σ); temporal 0.52 |
| 0:55 | 1.17 s | **6%** | — | FR-02 flag fires (> 5%); stability 0.72 |
| 1:05 | (unchanged) | (unchanged) | — | FR-03 narration beat: localized, A and C at 1.00 |
| 1:15 | **6.1 s** | **14%** | **jammer** | full power + fingerprint: first crossing |
| 1:50 | 1.8 s | 4% | jammer | recovering, still gated |
| 2:15 | 1.0 s | 0.2% | — | recovered |

Values are named constants in `avdiivka.py` (`WATCH_CADENCE_S`, `WATCH_CRC`,
`JAMMED_CADENCE_S`, `JAMMED_CRC`). 1.17 s was chosen over the 1.15–1.20 range
because 1.15 is exactly 3σ (no anomaly, so no spatial penalty, so 0.79), and
≥ 1.20 puts 0:55 under the floor (0.589).

Jitter (`runner.py` `_jittered`) is now proportional: cadence σ = 0.5% of the
value, CRC σ = max(0.0005, 5% of the value). It no longer depends on a
scenario "degrading" flag, which is removed. Monte Carlo over the formula:
at 0:55, P(score < 0.60) ≈ 1e-5 per tick; at 0:45 the worst of 200k draws is
0.648. A seeded test keeps B's 0:45–1:15 cadence inside (3σ, 1.20 s).

**Alternatives rejected.**
- *Detector change* (a wider temporal band, e.g. log-ratio). It does not
  rescue "6.1 s at 1:05", which gates under any sane mapping (see above). It
  would also retune FR-01 acceptance for no storyboard gain.
- *Weight change* (e.g. a smaller min-bias). The 0.4·min term is what makes a
  single failing detector gate (monotonic-down invariant, R14). Weakening it
  to fit a script would hide real single-detector failures. **Weights
  unchanged.**

### Final beat table (deterministic, `avdiivka_beats_end_to_end`)

Score (components t/s/sp/fp for B):

| Beat | A before | B before | C before | A after | B after | C after |
|---|---|---|---|---|---|---|
| 0:00 | 0.79 | 0.79 | 0.79 | 1.00 | **1.00** (1/1/1/1) | 1.00 |
| 0:45 | 0.64 | 0.43 | 0.64 | 1.00 | **0.70** (.52/1/.6/1) | 1.00 |
| 0:55 | 0.64 | 0.31 | 0.64 | 1.00 | **0.65** (.52/.72/.6/1) | 1.00 |
| 1:05 | 0.64 | 0.31 | 0.64 | 1.00 | **0.65** (.52/.72/.6/1) | 1.00 |
| 1:15 | 0.64 | 0.13 | 0.64 | 1.00 | **0.13** (0/.31/.6/0) | 1.00 |
| 1:20 | 0.64 | 0.13 | 0.64 | 1.00 | **0.13** (0/.31/.6/0) | 1.00 |
| 1:50 | 0.64 | 0.22 | 0.64 | 1.00 | **0.22** (0/.82/.6/0) | 1.00 |
| 2:15 | 0.79 | 0.79 | 0.79 | 1.00 | **1.00** (1/1/1/1) | 1.00 |

"Before" = `f31ef19`: everyone at (0,0), spatial not gated, A and C blanket
while the sim flagged B. "After" = both fixes.

Checks: 0:00 ≈ 1.0 ✓ · 0:45 WATCH (0.70) ✓ · 0:55 ≥ 0.60 (0.65) ✓ · first
crossing at 1:15, with the fingerprint, before the 1:20 modal ✓ · 1:50 < 0.60
(0.22) ✓ · 2:15 ≥ 0.85 (1.00) ✓ · A and C 1.00 throughout ✓.

### Live run (real binaries, jitter on)

Docker Desktop was not running, so a pure-Python MQTT broker (`amqtt`) stood
in for mosquitto. The real `trust-engine` binary and the `comms-sim` CLI ran
against it at `COMMS_SIM_SPEED=1` (seed 42), and a recorder captured
`integrity/trust/#` and `telemetry/+/raw`. Scenario time was taken from B's
telemetry count. Each row is the first engine tick after the beat:

| Beat | B score (t/s/sp/fp) |
|---|---|
| 0:00 | 1.000 (1/1/1/1) |
| 0:45 | 0.688 (.49/1/.6/1) |
| 0:55 | 0.636 (.49/.71/.6/1) |
| 1:05 | 0.647 (.51/.73/.6/1) |
| 1:15 | 0.128 (0/.31/.6/0) |
| 1:20 | 0.123 (0/.28/.6/0) |
| 1:50 | 0.224 (0/.85/.6/0) |
| 2:15 | 1.000 (1/1/1/1) |

- B over the WATCH window (scenario 46–74 s, 29 ticks): min 0.635, max 0.722.
  It never crossed the floor.
- B's first tick below 0.60 came at scenario t = 75 s (1:15).
- A and C: minimum 1.000 over the whole run.
- 0 telemetry payloads rejected. Every payload carried `lat`/`lon` and no
  `degrading`, and was echoed in `integrity/trust/*`.

A `COMMS_SIM_SPEED=10` run had the same shape. At that speed the 1 Hz engine
samples only every ~10 scenario seconds.

### Known follow-ups

- `apps/web/app/page.tsx` draws the directional vector when
  `unitB.score < 0.6`. It used to appear at 0:45; it now appears at 1:15.
  Branding §10.3 wants it at 1:05. Driving it from `components.spatial`
  (localized band) would show it from 0:45. Neither is exactly 1:05 without a
  scripted timer. This is a UX call for the web owner, so it was not changed.
- The Rust end-to-end test hard-codes the comms-sim beat values. A shared
  fixture (JSON exported by the sim) would stop the two drifting.
- The engine emits no `temporal_anomaly` DetectionEvent, so the event-terminal
  lines in Branding §7 are illustrative.
