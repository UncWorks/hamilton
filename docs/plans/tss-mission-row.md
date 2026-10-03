# TSS fire-mission row (replaces the kill-chain modal)

Branch `feat/tss-mission-row`. Source design: the decision-workflow assessment
(§3 Alternatives A and B, the escalation ladder, §4 HS-05/07/13/15/16, §5 decision
model, §6 terminology).

## Decision

The blocking kill-chain modal is deleted. Hamilton now evaluates each **fire
mission** against the **target selection standards (TSS)**. TSS check accuracy
(max TLE), report age, and observer reliability before a target is attacked
(FM 3-09.12 Ch 1). Hamilton supplies two of those terms live:

- **Reliability** is the J reliability letter from the trust score (`lib/link-trust-rating.ts`).
- **Report age** is the seconds since the source's last good update. Past 10 s the source is STALE, which rates it F6.

Hamilton has no TLE source, so the accuracy check reads "n/a — no TLE source".

The result is shown **in the mission row** and nowhere else. Hamilton
recommends a method of control and never issues a fire command.

## Data flow

- **Contract.** `FireMissionSchema` lives in `packages/contracts/src/fire-mission.ts` and is published on `fires/mission/{id}` as a retained message. It is TS only, because the engine does not consume missions (no contracts-rs mirror).
- **Producer.** The comms-sim module `missions.py` publishes two calls for fire:
  - AB1002: OBS C, M795 HE, at 0:30. It is never gated.
  - AB1001: OBS B (FO), M982 Excalibur, HPT, at 1:12. B is still C3 then, so it arrives PASS. It fails at 1:15, when B drops to E5.
  - Each run first publishes empty retained payloads, which clears the previous run's missions.
- **Dependency mapping (demo proxy).** Each mission depends on its observer link and target-location source. Unit A stands in for the firing battery's nav/GPS link.
- **Evaluator.** `apps/web/src/lib/tss.ts` exports the pure function `evaluateTss({mission, sources, table, now, hysteresis?, riskAccepted?, atMyCommand?})`.
- **Store.** `store/hamilton.ts` re-evaluates every open mission at 1 Hz. `MissionQueue` drives the tick.
- **UI.** The components live in `apps/web/src/components/fires/` (`MissionQueue`, `MissionRow`, `TssInForce`). They sit in the side column, above the trust panel.

## TSS table (configuration, not constants)

`DEFAULT_TSS_TABLE` (`lib/tss.ts`) is versioned: version `TSS-1`, a DTG, the approver role `CDR (via FSO)`, and the rows below.

| Class | Min reliability | Max report age | Notes |
|---|---|---|---|
| GPS-guided (M982, GMLRS-U) | C (score ≥ 0.60) | 10 s | |
| Laser-guided | C | 30 s | |
| Unguided HE (M795) | never gated | — | Trust is still shown |
| HPT commander-approved exception | D | 10 s | Applies only after an explicit, logged FSO/CDR risk acceptance on an HPT |

Other rules:

- **Hysteresis.** A source fails as soon as it drops below the minimum. It passes again only after holding the minimum or better for **5 s continuously**. Unguided rows hold no memory. A human decision — re-plan, risk acceptance or a received confirmation — re-runs TSS without the hold; the hold only damps the automatic rating near the minimum.
- **Confirmation.** A report confirmed via alternate means (credibility 1) satisfies the reliability check (`alt_confirmation_clears`). It does not clear a stale report.
- **Missing feed.** A source with no trust feed cannot be judged. It is rated F6 and fails.
- **Env var removed.** `NEXT_PUBLIC_ROE_FLOOR` is gone. `ROE_FLOOR` is renamed `TSS_MIN_GPS_SCORE` and is kept only as the display/band edge for C.

## Row states

- **PASS (gated):** no rule. The row reads "Rec. method of control: none — TSS met".
- **FAIL:** a 2px `--gating-primary` left rule and a `FAIL` chip. The headline reads, for example, `TSS: FAIL — RELIABILITY E5 (min C) · AGE 1s OK`, followed by `Rec. method of control: DO NOT LOAD (M982)` and branches [1]–[4]. A placeholder reads `[DP 1 · FFIR-2 (planned)]`.
- **NOT GATED (unguided):** J and age are shown. There is no rule and no recommendation.
- **Branches:**
  - [1] **Shift → M795 HE.** Re-plans the mission and re-runs TSS, which passes.
  - [2] **Confirm via alternate means.** The row shows AWAITING CONFIRMATION. On receipt, credibility goes to 1 and TSS re-runs. Today the receipt is a Storybook mock only; the S6 producer is deferred.
  - [3] **AT MY COMMAND.** The method of control changes and a 60 s countdown starts ("guns may lay"). When it reaches 0, TSS re-rates and the result is logged.
  - [4] **Accept risk.** Opens an inline form: role, initials and reason. The form is disabled unless the role is FSO or CDR, and only an HPT has an exception row.
- **Firing → collapse:** "Rec. to FDC: CHECK FIRING / CEASE LOADING" appears as text only.
- **Keyboard and screen readers:**
  - The row is focusable, and keys `1`–`4` trigger branches while focus is in the row.
  - `aria-live="polite"` is set only on the selected mission.
  - The row never steals focus and uses no motion.
- **Escalation ladder:** with no mission open, the queue renders nothing. A degraded source that no open mission depends on changes no row.

## Logging

Every branch choice, verdict change, re-rate and confirmation becomes an FDC journal entry, shown in the after-action terminal. Each entry records:

- the mission id
- the TSS verdict
- the lead J
- the report age
- the branch
- role and initials
- the DTG

Branches [1]–[3] are also sent to the engine's existing `POST /api/modal/selection`:

- **Option mapping.** `shift_munition`→`shift_non_gps`, `confirm_alt`→`confirm_alt_channel`, `at_my_command`→`delay_60s`.
- **Mission id.** The mission id rides in `source_id` as `AB1001/unit_b`.
- **Extra fields.** The extra fields are sent too, but the current engine ignores them (no `deny_unknown_fields`).
- **Accept risk.** [4] has no engine option, so it stays web-side.

The engine HTTP API sends no CORS headers, so a browser on :3000 could not reach :8080 at all. The terminal had been empty for that reason. The web app now proxies the two endpoints same-origin through `app/engine/api/[...path]/route.ts` (`ENGINE_HTTP_URL`, default `http://localhost:8080`).

## Engine changes needed (not made; no Rust touched)

- Add `POST /api/missions/{id}/decision`. It should take the full record: TSS checks, J, report age, branch (`BranchOption`: `shift_munition | confirm_alternate | at_my_command | accept_risk`), decider role/initials, override authority and DTG.
- Rename the `DetectionKind` values `modal_gated` / `modal_selection`. The terminal currently relabels them `tss_fail` / `branch` for display only.
- Optionally add CORS on the axum router, so the proxy is no longer needed.
- Optionally run TSS engine-side and publish `integrity/tss/{mission_id}`, so other fires apps (Lattice / AIP) can render the same verdict.

## Deferred

- **DP / DSM / CCIR.** Assessment Alternatives C and D: the DP star, the DSM row, the NAI polygon, and the CCIR/FFIR alert queue with Ack/Escalate. The row only carries a "DP 1 · FFIR-2 (planned)" text placeholder.
- **TSS table editor.** Neither the editor nor the commander-approval workflow (HS-10) is built. The table is read-only: the "TSS in force" strip plus the Storybook table.
- **S6 producer.** No real producer exists for the alternate-channel confirmation (HS-13).
- **PWA.** No PWA push or phone notifications for the FSO/S6 (W8).
- **Engine-side TSS.** Engine-side TSS and the mission-scoped engine decision endpoint (see above).
- **Clearance-of-fires flag.** The flag for a degraded friendly position near the target (HS-17).
- **Engagement record export.** Export with J/W/AR (HS-18).
