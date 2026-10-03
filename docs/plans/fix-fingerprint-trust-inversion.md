# Plan — fix fingerprint trust inversion (FR-04 → FR-05)

Status: implemented on `fix/fingerprint-trust-inversion`.

## 1. Reproduction

**Root cause.** `services/trust-engine/crates/aggregator/src/lib.rs:55` (pre-fix):

```rust
let fingerprint_score = readings.fingerprint.map(|m| m.score).unwrap_or(1.0);
```

`FingerprintMatch.score` (`crates/detectors/src/fingerprint.rs:51`) is the FR-04a
overlap ratio `k/6`, i.e. **match strength** (higher = more like a jammer). The
aggregator feeds it straight into `components.fingerprint`, which FR-05 and the
narrator treat as **trust** (1 = healthy). Consequences:

| Observed RF | match strength | `components.fingerprint` (pre-fix) |
|---|---|---|
| nothing / below 0.5 threshold | — (None) | 1.00 |
| weak match 3/6 | 0.50 | 0.50 |
| strong match 6/6 (the demo jammer) | 1.00 | **1.00** |

So a strong match is indistinguishable from no match, a weak match is penalised
more than a strong one (non-monotonic), and a value like 0.19 (§5.1 example) is
unreachable.

Failing test written first:
`aggregator::tests::strong_match_lowers_fingerprint_component_and_score` → fails
pre-fix with `strong match must lower fingerprint trust: 1 vs 1`.

**Second defect on the same path (stale match).** `services/trust-engine/src/telemetry.rs`
only *sets* `last_rf` when `payload.rf` is `Some`, never clears it. comms-sim
omits `rf` from B-2:15 onward, so the engine keeps matching the jammer forever.
Pre-fix this was invisible (a match read as 1.0). Post-inversion it would pin
fingerprint trust at 0.0 and hold B at 0.37 after recovery, so it must be fixed in the
same change: an absent `rf` means "no current RF observation", so `last_rf = None`.

### Consumers of `components.fingerprint` / candidates topic

| Consumer | Reads | Assumption | Action |
|---|---|---|---|
| `crates/aggregator` | `FingerprintMatch.score` | raw ratio used as trust | **fix** |
| `src/ticker.rs` | `match_fingerprint`, `rank_candidates` | candidates = match strength | none (still correct) |
| `src/telemetry.rs` | `payload.rf` | sticky `last_rf` | **fix** (clear on absence) |
| `packages/contracts{,-rs}` | `TrustComponents.fingerprint` | "[0,1]" with no direction | doc comment only; shape unchanged |
| `services/llm-narrator` deterministic provider | `components.fingerprint < 0.7` | trust-oriented threshold (correct) but labels the value "overlap ratio" | **fix label** (report trust and implied match strength) |
| `services/llm-narrator` anthropic/local prompts | components | "1.0 = healthy" (correct post-fix) | none |
| `apps/web` `CandidateCards` | `candidate.score` | match strength coloured with trust gradient (intentional per Branding §10.4) | none |
| `apps/web` `page.tsx` | `topCandidate.score >= 0.5` | match strength | none |
| `apps/web` store/TrustPanel | `score`, `components` passthrough | — | none |
| comms-sim tests | telemetry only | — | none |
| docs: FRS FR-04/FR-04a/FR-05, System Design §5.1/§5.2, README, URS UR-09, Branding §10.4 | example values 0.81/0.42/0.18, 0.19 | k/6-impossible values | **fix values / wording** |
| `feat/storybook-branding` fixtures + `support/OptionBPrime.tsx` | reads fingerprint as `1 − overlap` | workaround for this bug | **do not edit**; remove after merge (see §5) |

## 2. Semantics

- `match_strength` = best library entry's overlap ratio `k/6`, **only if ≥ 0.5**
  (`MIN_MATCH_THRESHOLD`, same as `PUBLISH_CANDIDATES_THRESHOLD`); otherwise no match.
- `fingerprint_trust = 1 − match_strength`; no match → `1.0` (no evidence of jamming).
- Reachable values: `{1.0, 0.5, 0.33, 0.17, 0.0}`.
- Candidate topic `score` (FR-04a) stays **match strength**. Only the trust
  component is inverted. Wire field names are unchanged (no payload shape change,
  `deny_unknown_fields` unaffected); semantics documented in both contracts.
- In Rust, `FingerprintMatch.score` is renamed to `match_strength` and a pure
  `fingerprint_trust(Option<&FingerprintMatch>) -> f64` is added in the detectors crate.

Justification: FR-05 says components are aggregated outputs of FR-01..04 feeding a
trust score, and every other detector (temporal, stability) is health-oriented
(1 = healthy). The narrator prompts already state "1.0 = healthy". FR-04 emits a
*match score*, so it must be converted to trust before aggregation, and that
conversion is the only thing that changes.

Considered:
- **Noise floor.** Almost any RF observation shares 1–2 booleans with some entry
  (1/6–2/6). Without the existing 0.5 threshold that noise would shave trust off
  every source reporting RF. Keep the threshold. Side effect: there is a step from
  1.0 to 0.5 at the threshold, which is acceptable for a discrete matcher.
- **k/6 quantisation.** The 0.81/0.42/0.18 doc values cannot come out of a 6-dimension
  matcher. Docs are corrected to what the engine emits for the Avdiivka jammer
  RF: `ground_based_gps_uhf_barrage 1.00 (6/6)`, `pulsed_uhf_wide 0.50 (3/6)`,
  `cellular_uhf_barrage 0.17 (1/6)`.
- **Corroboration gating** (only let fingerprint lower trust when temporal or
  stability also degrades). Not implemented, to keep the mapping simple. Today RF is only
  reported while a source is degrading, so the gating would change nothing in the demo.
  Alternative noted for later: `fingerprint_trust = 1 − match_strength·[any other component < 1]`.

## 3. Demo beats (Unit B, deterministic replay of comms-sim beats through the real detectors)

| Beat | temporal | stability | spatial | fp before | score before | fp after | score after |
|---|---|---|---|---|---|---|---|
| B-0:00 healthy | 1.00 | 1.00 | 0.60 | 1.00 | 0.79 | 1.00 | 0.79 |
| B-0:45 temporal | 0.00 | 1.00 | 0.60 | 1.00 | 0.43 | 1.00 | 0.43 |
| B-0:55 stability | 0.00 | 0.31 | 0.60 | 1.00 | 0.31 | 1.00 | 0.31 |
| B-1:15 jammer RF | 0.00 | 0.31 | 0.60 | **1.00** | **0.31** | **0.00** | **0.13** |
| B-1:50 recovery starts | 0.00 | 0.82 | 0.60 | 1.00 | 0.40 | 0.00 | 0.22 |
| B-2:15 recovered | 1.00 | 1.00 | 0.60 | 1.00 | 0.79 | 1.00 (needs `last_rf` clear; 0.37 without) | 0.79 |

- Below the 0.60 ROE floor at 1:20: yes, both before and after.
- Recovery at 2:15: yes after the `last_rf` fix.
- "≈0.42 at 1:15": not produced before (0.31) or after (0.13). The 0.42 in
  System Design §5.1 is an illustrative payload, and its components do not even
  reproduce 0.42 under the documented formula. The Branding storyboard's recovery
  readout "0.18 → 1.00" is closer to the post-fix trough. **No telemetry or weight
  change proposed for the fingerprint fix.** §5.1 example is replaced with the
  engine's actual B-1:15 output.

> **Superseded numbers.** This table predates the spatial and gate-timing fixes.
> Both follow-ups below are now fixed on the same branch; see
> [`fix-spatial-trust-and-gate-timing.md`](./fix-spatial-trust-and-gate-timing.md)
> for the current A/B/C beat table.

Pre-existing, **not caused by this change and out of scope** (flagged as follow-ups,
since fixed: see the sibling plan):
1. **Spatial is not trust-oriented.** `classify_spatial` returns 0.6 (localized) for any
   source, healthy or not, and 0.3 (blanket) for healthy neighbours of a degraded
   source. All units idle at 0.79 instead of 1.0. While B degrades, A and C drop to 0.64.
   That is a separate root cause: the detector maps the classification label to a score without
   gating on whether the target is degraded. The engine also places every source at (0,0),
   because telemetry carries no position, so all sources count as within radius. Suggested fix
   (separate PR): spatial trust = 1.0 when target not degrading; localized → 0.6, blanket → 0.3
   only while degrading, and feed real positions.
2. **Gate fires at B-0:45, not B-1:20.** Temporal alone (6.1 s → 102σ → 0.0) drags the
   min-biased score to 0.43. If the storyboard requires the crossing at 1:20, minimal
   option is scenario telemetry (e.g. 0:45 inter-arrival ≈1.2 s → σ=4 → temporal 0.4),
   not weights. Not changed here.

## 4. Files to change

- `services/trust-engine/crates/detectors/src/fingerprint.rs`: rename `score`→`match_strength`, add `fingerprint_trust`, tests.
- `services/trust-engine/crates/aggregator/src/lib.rs`: use `fingerprint_trust`, tests (regression, no-match, full match, monotonic, demo beats end-to-end).
- `services/trust-engine/src/telemetry.rs`: clear `last_rf` when `rf` absent.
- `packages/contracts-rs/src/lib.rs`, `packages/contracts/src/trust-score.ts`, `packages/contracts/src/fingerprint-candidates.ts`: doc comments on direction (no shape change).
- `services/llm-narrator/src/providers/deterministic.ts`: bullet wording.
- `docs/FRS.md` (FR-04, FR-04a, FR-05), `docs/System Design.md` (§2 beat 5, §5.1, §5.2), `README.md`, `docs/URS.md` (UR-09), `docs/Branding and Frontend Design.md` (§10.4 candidate values).

`crates/server` is **not** touched, so no conflict with the uncommitted CORS work.

## 5. Follow-up — Storybook workaround

Branch `feat/storybook-branding` (`apps/web/src/stories/fixtures/avdiivka.ts`,
`apps/web/src/stories/support/OptionBPrime.tsx`) reads the fingerprint component
as `1 − overlap` to work around this bug. **Once this PR merges, remove that
workaround** and consume `components.fingerprint` directly as trust. Its fixtures
also use the impossible 0.81/0.42/0.18 values.
