//! AoE lifecycle tests: replay of the contract fixture telemetry
//! (`packages/contracts/fixtures/aoe/telemetry-beats*.jsonl`) through
//! `telemetry::apply_payload` → `ticker::unit_views` → [`AoeTracker`] with a
//! fake clock, collecting the actions (in-memory publisher), plus trigger,
//! unbounded, K2, DuckDB and latency checks (plan §5.2).

use std::collections::BTreeMap;
use std::path::PathBuf;

use hamilton_contracts::{self as wire, EmitterEstimatePayload, EMITTER_ESTIMATE_MAX_BYTES};
use serde_json::Value;
use trust_detectors::{
    fingerprint::{FingerprintEntry, RfFingerprint, TimeDomainPattern},
    temporal::detect_temporal,
};
use trust_library::{load_bundled, load_bundled_receivers};
use trust_transport::{AfterActionLog, LogConfig};

use super::estimator::{self as est, AoeEstimator, GridEstimator};
use super::inputs::{self, UnitView};
use super::*;
use crate::state::{ClassObservation, EngineState, GnssTrack};
use crate::telemetry::apply_payload;
use crate::ticker::{record_aoe, unit_views};

/// Scenario clock → engine time, as the fixtures (avdiivka.ts clockIso):
/// T0 = 2024-02-15T18:42:00Z, wall = T0 + (t − 39) s, so 1:15 = 18:42:36Z.
fn ms(t: i64) -> i64 {
    (1_708_022_520 + t - 39) * 1000
}

fn fixture_path(name: &str) -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../../packages/contracts/fixtures/aoe")
        .join(name)
}

fn beats(name: &str) -> BTreeMap<i64, Vec<wire::TelemetryPayload>> {
    let text = std::fs::read_to_string(fixture_path(name)).unwrap();
    let mut out: BTreeMap<i64, Vec<wire::TelemetryPayload>> = BTreeMap::new();
    for line in text.lines() {
        let v: Value = serde_json::from_str(line).unwrap();
        let p: wire::TelemetryPayload = serde_json::from_value(v["payload"].clone()).unwrap();
        out.entry(v["t"].as_i64().unwrap()).or_default().push(p);
    }
    out
}

struct Replay {
    state: EngineState,
    actions: Vec<(i64, AoeAction)>,
}

/// Replay `name` up to and including scenario second `until`.
fn replay(name: &str, until: i64, estimator: &dyn AoeEstimator) -> Replay {
    let library = load_bundled().unwrap();
    let receivers = load_bundled_receivers().unwrap();
    let mut state = EngineState::default();
    let mut tracker = AoeTracker::new(AoeConfig::default());
    let mut actions = Vec::new();
    for (t, payloads) in beats(name) {
        if t > until {
            break;
        }
        for p in &payloads {
            apply_payload(&mut state, p, ms(t));
        }
        let units = unit_views(&state);
        for a in tracker.tick(ms(t), &units, &library, &receivers, estimator) {
            actions.push((t, a));
        }
    }
    Replay { state, actions }
}

fn publishes(r: &Replay) -> Vec<(i64, &EmitterEstimatePayload, Option<Transition>)> {
    r.actions
        .iter()
        .filter_map(|(t, a)| match a {
            AoeAction::Publish {
                payload,
                transition,
            } => Some((*t, payload.as_ref(), *transition)),
            AoeAction::Retire { .. } => None,
        })
        .collect()
}

fn transitions(r: &Replay) -> Vec<(i64, Transition)> {
    r.actions
        .iter()
        .filter_map(|(t, a)| match a {
            AoeAction::Publish {
                transition: Some(x),
                ..
            } => Some((*t, *x)),
            AoeAction::Retire { .. } => Some((*t, Transition::Retire)),
            _ => None,
        })
        .collect()
}

/// Full-run lifecycle on a telemetry replay (the real estimator).
fn check_lifecycle(name: &str) -> Replay {
    let r = replay(name, 265, &GridEstimator);
    let tr = transitions(&r);
    let pubs = publishes(&r);

    // Opens at 1:15, the beat where B's RF fingerprint (6/6, lead 2) arrives.
    assert_eq!(tr.first(), Some(&(75, Transition::Open)), "{name}: {tr:?}");
    let (_, open, _) = pubs[0];
    assert_eq!(open.estimate_id, "J1-20240215T184236Z");
    assert_eq!(open.method_id, "ground_based_gps_uhf_barrage");
    assert_eq!(open.method_match, 1.0);
    assert!(!open.method_ambiguous);
    assert_eq!(
        open.state,
        wire::EstimateState::Active,
        "{name}: bounded at 1:15"
    );
    let degraded: Vec<&str> = open
        .evidence
        .iter()
        .filter(|e| e.state == wire::EvidenceState::Degraded)
        .map(|e| e.source_id.as_str())
        .collect();
    assert_eq!(degraded, ["unit_b", "unit_d", "unit_e", "unit_h"], "{name}");

    // 1:50: B's GNSS recovers after its move → republish within 6 s, with
    // B healthy now and its earlier degraded report kept (K2 evidence).
    let upd = pubs
        .iter()
        .find(|(t, p, x)| {
            *t >= 110 && *x == Some(Transition::Update) && {
                p.evidence
                    .iter()
                    .any(|e| e.source_id == "unit_b" && e.state == wire::EvidenceState::Healthy)
            }
        })
        .unwrap_or_else(|| panic!("{name}: no 1:50 update in {tr:?}"));
    assert!(upd.0 <= 116, "{name}: 1:50 update at {}", upd.0);
    let b: Vec<_> = upd
        .1
        .evidence
        .iter()
        .filter(|e| e.source_id == "unit_b")
        .map(|e| (e.state, e.age_s))
        .collect();
    assert_eq!(
        b.iter().map(|x| x.0).collect::<Vec<_>>(),
        [wire::EvidenceState::Healthy, wire::EvidenceState::Degraded],
        "{name}"
    );
    assert!(b[0].1 < b[1].1, "{name}: newest first {b:?}");
    assert!(
        upd.1.emitter.area90_km2 < open.emitter.area90_km2,
        "{name}: healthy B shrinks region90"
    );

    // Jammer off at 2:15 (135 s): stale at +10 s, retired at +120 s.
    assert!(tr.contains(&(145, Transition::Stale)), "{name}: {tr:?}");
    assert_eq!(
        tr.last(),
        Some(&(255, Transition::Retire)),
        "{name}: {tr:?}"
    );
    assert!(pubs.iter().all(|(t, _, _)| *t < 255));

    // Cadence: heartbeat ≤ 10 s; a recompute never < 5 s after the last publish.
    for w in pubs.windows(2) {
        let gap = w[1].0 - w[0].0;
        assert!(gap <= 10, "{name}: {gap} s without a publish at {}", w[1].0);
        if w[1].2 == Some(Transition::Update) {
            assert!(gap >= 5, "{name}: recompute {gap} s after the last publish");
        }
    }
    let stale: Vec<_> = pubs.iter().filter(|(t, _, _)| *t >= 145).collect();
    assert!(stale
        .iter()
        .all(|(_, p, _)| p.state == wire::EstimateState::Stale));

    // Every payload: valid_until = +20 s, strict contract round-trip, F7 size,
    // no forbidden key.
    for (t, p, _) in &pubs {
        assert_eq!(p.computed_at.timestamp_millis(), ms(*t));
        assert_eq!((p.valid_until - p.computed_at).num_seconds(), 20);
        let body = trust_transport::encode_emitter_estimate(p).unwrap();
        assert!(
            body.len() <= EMITTER_ESTIMATE_MAX_BYTES,
            "{name} t={t}: {} B",
            body.len()
        );
        let text = String::from_utf8(body).unwrap();
        for k in [
            "\"mode\"",
            "bearings_used",
            "area50_km2",
            "footprint_radius_km",
        ] {
            assert!(!text.contains(k), "{name} t={t}: {k}");
        }
        let back: EmitterEstimatePayload = serde_json::from_str(&text).unwrap();
        assert_eq!(&back, *p);
    }
    r
}

#[test]
fn replay_synthetic_beats_full_lifecycle() {
    check_lifecycle("telemetry-beats.jsonl");
}

#[test]
fn replay_recorded_sim_beats_full_lifecycle() {
    check_lifecycle("telemetry-beats.recorded.jsonl");
}

#[test]
fn replay_is_deterministic() {
    let a = replay("telemetry-beats.recorded.jsonl", 120, &GridEstimator);
    let b = replay("telemetry-beats.recorded.jsonl", 120, &GridEstimator);
    assert_eq!(a.actions, b.actions);
}

/// K2: B at 1:50 is GNSS-healthy (`gnss_fix` 3d after its move) while its
/// link is still FR-01-anomalous (1.8 s cadence).
#[test]
fn k2_unit_b_at_150_gnss_healthy_while_link_anomalous() {
    for name in ["telemetry-beats.jsonl", "telemetry-beats.recorded.jsonl"] {
        let r = replay(name, 115, &est_none());
        let b = &r.state.sources["unit_b"];
        let g = b.gnss.expect("B reports gnss_fix");
        assert_eq!(g.current.state, ClassState::Healthy, "{name}");
        assert_eq!(g.previous.map(|p| p.state), Some(ClassState::Degraded));
        let arrivals: Vec<_> = b.recent_arrivals.iter().copied().collect();
        assert!(detect_temporal(&arrivals, &b.baseline).anomaly, "{name}");
        let u = unit_views(&r.state)
            .into_iter()
            .find(|u| u.source_id == "unit_b")
            .unwrap();
        assert!(u.link_degraded);
        assert_eq!(
            u.degraded_classes().into_iter().collect::<Vec<_>>(),
            [wire::RxClass::UhfComms],
            "{name}: dimension 6 sees the link only"
        );
    }
}

#[test]
fn transitions_are_logged_to_duckdb() {
    let r = replay("telemetry-beats.recorded.jsonl", 265, &GridEstimator);
    let log = AfterActionLog::open(LogConfig {
        db_path: PathBuf::from(":memory:"),
    })
    .unwrap();
    for (_, a) in &r.actions {
        record_aoe(&log, a).unwrap();
    }
    let rows = log.emitter_estimates().unwrap();
    let want: Vec<&str> = transitions(&r).iter().map(|(_, t)| t.as_str()).collect();
    let got: Vec<&str> = rows.iter().map(|r| r.state.as_str()).collect();
    assert_eq!(got, want);
    assert_eq!(got.first(), Some(&"open"));
    assert_eq!(got.last(), Some(&"retire"));
    assert!(got.contains(&"stale"));
    assert!(rows.last().unwrap().payload.is_empty());
    let first: EmitterEstimatePayload = serde_json::from_str(&rows[0].payload).unwrap();
    assert_eq!(rows[0].evidence_hash, first.evidence_hash);
    let events = log.recent(100).unwrap();
    assert_eq!(events.len(), rows.len());
    assert!(events
        .iter()
        .all(|e| e.kind == wire::DetectionKind::EmitterEstimate));
}

// --- trigger / unbounded unit tests (synthetic units) ----------------------

/// Never called: an estimator for tests that only need the trigger.
fn est_none() -> impl AoeEstimator {
    GridEstimator
}

fn jammer_rf() -> RfFingerprint {
    RfFingerprint {
        frequency_band_mhz: [100.0, 1610.0],
        hop_spread_hz: 50_000.0,
        gps_l1_overlap: true,
        gps_l2_overlap: true,
        time_domain_pattern: TimeDomainPattern::Barrage,
        effective_range_km: 0.0,
    }
}

fn track(
    class: wire::RxClass,
    degraded: bool,
    lat: f64,
    lon: f64,
    since_ms: i64,
    now_ms: i64,
) -> GnssTrack {
    GnssTrack {
        rx_class: class,
        current: ClassObservation {
            state: if degraded {
                ClassState::Degraded
            } else {
                ClassState::Healthy
            },
            lat,
            lon,
            last_ms: now_ms,
        },
        since_ms,
        previous: None,
    }
}

/// The 1:15 demo layout (golden-cases.json units), degraded set {B, D, E, H}.
fn demo_units(
    since_ms: i64,
    now_ms: i64,
    rf: Option<RfFingerprint>,
    link_b: bool,
) -> Vec<UnitView> {
    let g: Value =
        serde_json::from_str(&std::fs::read_to_string(fixture_path("golden-cases.json")).unwrap())
            .unwrap();
    g["units"]
        .as_array()
        .unwrap()
        .iter()
        .map(|u| {
            let id = u["source_id"].as_str().unwrap().to_string();
            let class: wire::RxClass = serde_json::from_value(u["rx_class"].clone()).unwrap();
            let degraded = ["unit_b", "unit_d", "unit_e", "unit_h"].contains(&id.as_str());
            UnitView {
                gnss: Some(track(
                    class,
                    degraded,
                    u["lat"].as_f64().unwrap(),
                    u["lon"].as_f64().unwrap(),
                    since_ms,
                    now_ms,
                )),
                link_degraded: id == "unit_b" && link_b,
                rf: if id == "unit_b" { rf.clone() } else { None },
                source_id: id,
            }
        })
        .collect()
}

fn run_once(units: &[UnitView], library: &[FingerprintEntry], now_ms: i64) -> Vec<AoeAction> {
    let receivers = load_bundled_receivers().unwrap();
    AoeTracker::new(AoeConfig::default()).tick(now_ms, units, library, &receivers, &GridEstimator)
}

#[test]
fn trigger_opens_at_six_of_six_with_lead_two() {
    let lib = load_bundled().unwrap();
    let now = ms(75);
    let a = run_once(
        &demo_units(now - 3_000, now, Some(jammer_rf()), true),
        &lib,
        now,
    );
    assert!(matches!(
        a.as_slice(),
        [AoeAction::Publish {
            transition: Some(Transition::Open),
            ..
        }]
    ));
}

#[test]
fn no_estimate_when_top_match_is_at_most_four_of_six() {
    let lib = load_bundled().unwrap();
    let now = ms(75);
    // Swept, out-of-band: band and pattern fail → ≤ 4/6.
    let rf = RfFingerprint {
        frequency_band_mhz: [50.0, 3000.0],
        time_domain_pattern: TimeDomainPattern::Swept,
        ..jammer_rf()
    };
    let mut tracker = AoeTracker::new(AoeConfig::default());
    let units = demo_units(now - 10_000, now, Some(rf), true);
    let reading = tracker.trigger(&units, &lib, now).unwrap();
    assert!(reading.top_matched <= 4, "{reading:?}");
    assert!(run_once(&units, &lib, now).is_empty());
}

#[test]
fn no_estimate_when_lead_is_under_two_dimensions() {
    let mut lib = load_bundled().unwrap();
    // A rival that matches 5/6 (only dimension 2 fails): lead 1.
    let mut rival = lib[0].clone();
    rival.method_id = "rival_close_match".into();
    rival.hop_spread_hz = 1.0;
    lib.push(rival);
    let now = ms(75);
    let units = demo_units(now - 10_000, now, Some(jammer_rf()), true);
    let reading = AoeTracker::new(AoeConfig::default())
        .trigger(&units, &lib, now)
        .unwrap();
    assert_eq!((reading.top_matched, reading.lead), (6, 1));
    assert!(run_once(&units, &lib, now).is_empty());
}

#[test]
fn no_estimate_before_three_seconds_of_degradation() {
    let lib = load_bundled().unwrap();
    let receivers = load_bundled_receivers().unwrap();
    let t0 = ms(75);
    let mut tracker = AoeTracker::new(AoeConfig::default());
    // GNSS degraded from t0, link healthy: nothing until t0 + 3 s.
    for dt in [0, 1_000, 2_000] {
        let units = demo_units(t0, t0 + dt, Some(jammer_rf()), false);
        let a = tracker.tick(t0 + dt, &units, &lib, &receivers, &GridEstimator);
        assert!(a.is_empty(), "opened {dt} ms after degradation");
    }
    let units = demo_units(t0, t0 + 3_000, Some(jammer_rf()), false);
    let a = tracker.tick(t0 + 3_000, &units, &lib, &receivers, &GridEstimator);
    assert_eq!(a.len(), 1);
}

#[test]
fn unbounded_without_a_healthy_same_class_unit_within_r_max() {
    let lib = load_bundled().unwrap();
    let now = ms(75);
    let mut units = demo_units(now - 10_000, now, Some(jammer_rf()), true);
    for u in &mut units {
        if let Some(g) = &mut u.gnss {
            g.current.state = ClassState::Degraded;
        }
    }
    let a = run_once(&units, &lib, now);
    let [AoeAction::Publish { payload, .. }] = a.as_slice() else {
        panic!("{a:?}")
    };
    assert_eq!(payload.state, wire::EstimateState::Unbounded);
    assert!(payload.aoe.iter().all(|l| l.contours.is_empty()));
    assert!(payload.emitter.region90.coordinates.is_empty());
}

#[test]
fn evidence_hash_ignores_ages_and_sub_cell_jitter() {
    let frame = AoFrame::avdiivka();
    let now = ms(75);
    let a = inputs::build_evidence(
        &demo_units(now - 3_000, now, None, false),
        &frame,
        now,
        120_000,
    );
    let mut b = a.clone();
    for e in &mut b {
        e.observed_ms -= 4_000;
        e.lat += 0.0002; // ~22 m
    }
    let h = |e: &[inputs::EvidenceItem]| inputs::evidence_hash("m", e, &frame);
    assert_eq!(h(&a), h(&b));
    b[0].state = match b[0].state {
        ClassState::Healthy => ClassState::Degraded,
        ClassState::Degraded => ClassState::Healthy,
    };
    assert_ne!(h(&a), h(&b));
    assert_ne!(h(&a), inputs::evidence_hash("other", &a, &frame));
}

#[test]
fn method_model_reproduces_the_golden_hypothesis_set() {
    let lib = load_bundled().unwrap();
    let m = inputs::method_model(&lib[0]).unwrap();
    let g: Value =
        serde_json::from_str(&std::fs::read_to_string(fixture_path("golden-cases.json")).unwrap())
            .unwrap();
    let want = |k: &str| -> Vec<f64> {
        g["model"]["hypotheses"][k]
            .as_array()
            .unwrap()
            .iter()
            .map(|v| v.as_f64().unwrap())
            .collect()
    };
    assert_eq!(m.erp_dbm, want("erp_dbm"));
    assert_eq!(m.mast_m, want("mast_m"));
    assert_eq!(m.sigma_db, 6.0);
    // Methods without a characterised GNSS module cannot be estimated.
    assert!(lib[1..].iter().all(|e| inputs::method_model(e).is_none()));
}

/// FR-04b (5) on the engine's own grid: the recorded sim's 1:15 evidence
/// through `fit_grid` + `estimate()` stays ≤ 40k cells and < 50 ms (timing
/// asserted in the release profile: `cargo test -p trust-engine --release
/// fit_grid`), and the chosen grid does not clip the hidden emitter (golden
/// demo truth inside region90).
#[test]
fn fit_grid_at_115_is_fast_and_contains_the_truth() {
    let r = replay("telemetry-beats.recorded.jsonl", 75, &est_none());
    let units = unit_views(&r.state);
    let evidence = inputs::build_evidence(&units, &AoFrame::avdiivka(), ms(75), 120_000);
    let ev = inputs::to_est_evidence(&evidence, ms(75));
    let lib = load_bundled().unwrap();
    let method = inputs::method_model(&lib[0]).unwrap();
    let receivers = inputs::receivers(&load_bundled_receivers().unwrap());
    let grid = inputs::fit_grid(&ev, &method, &receivers, AoFrame::avdiivka().flot).unwrap();
    let cells = inputs::grid_cells(&grid);
    assert!(cells <= inputs::MAX_GRID_CELLS, "{cells} cells");

    let _warm = est::estimate(&ev, &method, &receivers, &grid);
    let n = 5;
    let t = std::time::Instant::now();
    for _ in 0..n {
        std::hint::black_box(est::estimate(&ev, &method, &receivers, &grid));
    }
    let per_ms = t.elapsed().as_secs_f64() * 1000.0 / f64::from(n);
    println!(
        "fit_grid: {cells} cells at {} m, estimate {per_ms:.1} ms",
        grid.cell_m
    );
    if !cfg!(debug_assertions) {
        assert!(
            per_ms < 50.0,
            "estimate took {per_ms:.1} ms at {cells} cells"
        );
    }

    let g: Value =
        serde_json::from_str(&std::fs::read_to_string(fixture_path("golden-cases.json")).unwrap())
            .unwrap();
    let (lat, lon) = (
        g["demo_truth"]["lat"].as_f64().unwrap(),
        g["demo_truth"]["lon"].as_f64().unwrap(),
    );
    let a = est::analyze(&ev, &method, &receivers, &grid);
    assert_eq!(a.state, est::EstimateState::Active);
    assert!(
        a.in_region90(lat, lon),
        "truth outside region90 on the engine grid"
    );
}

#[test]
#[ignore = "diagnostic: prints the replay timeline"]
fn print_replay_timeline() {
    for name in ["telemetry-beats.jsonl", "telemetry-beats.recorded.jsonl"] {
        let r = replay(name, 265, &GridEstimator);
        for (t, p, x) in publishes(&r) {
            let n = trust_transport::encode_emitter_estimate(p).unwrap().len();
            println!(
                "{name} t={t} {x:?} {:?} area90={} civil={:?} bytes={n}",
                p.state,
                p.emitter.area90_km2,
                p.aoe
                    .first()
                    .map(|l| l.contours.iter().map(|c| c.area_km2).collect::<Vec<_>>())
            );
        }
        println!("{name} transitions {:?}", transitions(&r));
    }
}
