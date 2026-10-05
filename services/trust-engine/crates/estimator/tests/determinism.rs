//! E12: determinism, permutation invariance, monotonicity, latency and wire size
//! (FR-04b (4)(5), aoe-parallelization §3.1 F7).
//!
//! Timing is asserted only in the release profile:
//! `cargo test -p trust-estimator --release --test determinism`.
//!
//! Input: `packages/contracts/fixtures/aoe/golden-cases.json` (see `common`).

mod common;

use std::time::Instant;

use common::*;
use serde_json::{json, Value};
use trust_estimator::*;

/// FR-04b (5): compute < 50 ms per update (20k cells × 9 hypotheses × 10 units).
const MAX_COMPUTE_MS: f64 = 50.0;
/// F7: serialized estimate ≤ 7168 B (Mosquitto `message_size_limit` 8192 B).
const MAX_PAYLOAD_BYTES: usize = 7168;

fn bytes(e: &Estimate) -> String {
    serde_json::to_string(e).unwrap()
}

#[test]
fn identical_input_gives_identical_bytes() {
    let g = golden();
    let s = scenario(&g);
    for beat in ["demo_b115", "demo_b150"] {
        let ev = evidence(demo_run(&g, beat), 1_707_000_000_000);
        let a = bytes(&estimate(&ev, &s.method, &s.receivers, &s.grid));
        let b = bytes(&estimate(
            &ev.clone(),
            &s.method.clone(),
            &s.receivers.clone(),
            &s.grid.clone(),
        ));
        assert_eq!(a, b, "{beat}: output differs between identical runs");
        assert!(
            a.contains("1707000000000"),
            "time is an input and is echoed"
        );
    }
}

#[test]
fn permutation_invariant() {
    let g = golden();
    let s = scenario(&g);
    let ev = evidence(demo_run(&g, "demo_b150"), 7);
    let base = bytes(&estimate(&ev, &s.method, &s.receivers, &s.grid));
    let n = ev.observations.len();
    for k in [1, 3, 5] {
        let mut p = ev.clone();
        p.observations.rotate_left(k % n);
        assert_eq!(
            bytes(&estimate(&p, &s.method, &s.receivers, &s.grid)),
            base,
            "rotate {k}"
        );
    }
    let mut r = ev.clone();
    r.observations.reverse();
    assert_eq!(
        bytes(&estimate(&r, &s.method, &s.receivers, &s.grid)),
        base,
        "reverse"
    );
}

#[test]
fn adding_a_healthy_unit_never_enlarges_region90() {
    let g = golden();
    let s = scenario(&g);
    let method = MethodModel {
        affects_rx_classes: vec![RxClass::UhfComms],
        ..s.method.clone()
    };
    for beat in ["demo_b115", "demo_b150"] {
        let ev = evidence(demo_run(&g, beat), 0);
        let base = analyze(&ev, &method, &s.receivers, &s.grid).area90_km2();
        // Positions around and beyond the friendly layout, and toward the enemy side.
        let spots = [
            (-5.0, 0.0),
            (-12.0, 0.0),
            (-3.0, 8.0),
            (-4.0, -9.0),
            (-15.0, 10.0),
            (-8.0, -12.0),
            (0.5, 10.0),
            (0.5, -10.0),
            (3.0, 15.0),
            (4.0, -15.0),
            (-20.0, 0.0),
            (-1.0, 3.0),
        ];
        for rc in [RxClass::GnssCivil, RxClass::GnssMil] {
            for (x, y) in spots {
                let (lat, lon) = s.to_latlon(x, y);
                let mut e2 = ev.clone();
                e2.observations.push(Observation {
                    source_id: "probe".into(),
                    rx_class: rc,
                    state: UnitState::Healthy,
                    lat,
                    lon,
                });
                let a2 = analyze(&e2, &method, &s.receivers, &s.grid).area90_km2();
                println!(
                    "{beat} + healthy {rc:?} at ({x}, {y}) km: area90 {base:.1} → {a2:.1} km²"
                );
                assert!(
                    a2 <= base + 1e-9,
                    "{beat}: healthy {rc:?} at ({x}, {y}) enlarged region90 {base} → {a2}"
                );
            }
        }
    }
}

/// 141 × 141 = 19 881 cells (≈ 20k), 9 hypotheses, 10 units (the 8-unit layout,
/// B's 1:50 position, and one more healthy civil unit).
fn perf_input() -> (Scenario, Evidence) {
    let g = golden();
    let mut s = scenario(&g);
    s.grid.x_km = [-15.0, 20.0];
    s.grid.y_km = [-17.5, 17.5];
    let mut ev = evidence(demo_run(&g, "demo_b150"), 0);
    let (lat, lon) = s.to_latlon(-11.0, -2.0);
    ev.observations.push(Observation {
        source_id: "unit_i".into(),
        rx_class: RxClass::GnssCivil,
        state: UnitState::Healthy,
        lat,
        lon,
    });
    (s, ev)
}

fn median_ms(mut f: impl FnMut()) -> f64 {
    f(); // warm-up (builds the Φ table once per process)
    let mut t: Vec<f64> = (0..9)
        .map(|_| {
            let t0 = Instant::now();
            f();
            t0.elapsed().as_secs_f64() * 1000.0
        })
        .collect();
    t.sort_by(f64::total_cmp);
    t[t.len() / 2]
}

#[test]
fn compute_under_50ms_at_20k_cells_9_hyp_10_units() {
    let (s, ev) = perf_input();
    let geom = trust_estimator::grid::GridGeom::new(&s.grid);
    assert!(
        (19_000..=21_000).contains(&geom.len()),
        "{} cells",
        geom.len()
    );
    assert_eq!(ev.observations.len(), 10);
    assert_eq!(s.method.erp_dbm.len() * s.method.mast_m.len(), 9);
    let mut out = None;
    let ms = median_ms(|| out = Some(estimate(&ev, &s.method, &s.receivers, &s.grid)));
    assert_eq!(out.unwrap().state, EstimateState::Active);
    // For the record: the preview generator's wider demo grid (341 × 241 = 82k cells).
    let g = golden();
    let d = scenario(&g);
    let dev = evidence(demo_run(&g, "demo_b115"), 0);
    let demo_ms = median_ms(|| {
        estimate(&dev, &d.method, &d.receivers, &d.grid);
    });
    let profile = if cfg!(debug_assertions) {
        "debug (not asserted)"
    } else {
        "release"
    };
    println!(
        "estimate(): {ms:.1} ms median at {} cells × 9 hyp × 10 units; {demo_ms:.1} ms at the 82k-cell demo grid × 8 units [{profile}]",
        geom.len()
    );
    if !cfg!(debug_assertions) {
        assert!(
            ms < MAX_COMPUTE_MS,
            "estimate() took {ms:.1} ms ≥ {MAX_COMPUTE_MS} ms"
        );
    }
}

/// The `emitter-estimate/1` payload C-wire publishes, built from the estimate plus
/// the fields the engine adds (ids, method match, evidence list, hash, times).
fn payload(e: &Estimate, ev: &Evidence) -> Value {
    let mp = |m: &MultiPolygon| json!({"type": "MultiPolygon", "coordinates": m});
    json!({
        "schema": "emitter-estimate/1",
        "estimate_id": "J1-20240215T184236Z",
        "state": e.state,
        "method_id": e.method_id,
        "method_match": 1.0,
        "method_ambiguous": false,
        "model": {"kind": "set", "propagation": "two_ray", "grid_m": e.model.grid_m,
                  "hypotheses": {"erp_dbm": e.model.erp_dbm, "mast_m": e.model.mast_m}, "sigma_db": e.model.sigma_db},
        "aoe": e.aoe.iter().map(|l| json!({
            "rx_class": l.rx_class,
            "contours": l.contours.iter().map(|c| json!({"p": c.p, "polygon": mp(&c.polygon), "area_km2": c.area_km2})).collect::<Vec<_>>(),
            "radius_km_range": l.radius_km_range,
        })).collect::<Vec<_>>(),
        "emitter": {"region90": mp(&e.emitter.region90), "area90_km2": e.emitter.area90_km2, "erp_dbm_range": e.emitter.erp_dbm_range},
        "evidence": ev.observations.iter().map(|o| json!({
            "source_id": o.source_id, "state": o.state, "rx_class": o.rx_class, "age_s": 12.5,
            "lat": (o.lat * 1e5).round() / 1e5, "lon": (o.lon * 1e5).round() / 1e5,
        })).collect::<Vec<_>>(),
        "evidence_hash": "9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08",
        "computed_at": "2024-02-15T18:42:36.000Z",
        "valid_until": "2024-02-15T18:42:56.000Z",
    })
}

#[test]
fn serialized_size_within_budget() {
    let g = golden();
    let s = scenario(&g);
    for beat in ["demo_b115", "demo_b150"] {
        let ev = evidence(demo_run(&g, beat), 0);
        let e = estimate(&ev, &s.method, &s.receivers, &s.grid);
        let est = bytes(&e).len();
        let wire = serde_json::to_string(&payload(&e, &ev)).unwrap().len();
        let verts: usize = e
            .aoe
            .iter()
            .flat_map(|l| l.contours.iter())
            .map(|c| c.polygon.iter().flatten().map(Vec::len).sum::<usize>())
            .sum::<usize>()
            + e.emitter
                .region90
                .iter()
                .flatten()
                .map(Vec::len)
                .sum::<usize>();
        println!("{beat}: Estimate {est} B; full emitter-estimate/1 payload {wire} B (limit {MAX_PAYLOAD_BYTES}); {verts} vertices");
        assert!(
            wire <= MAX_PAYLOAD_BYTES,
            "{beat}: payload {wire} B > {MAX_PAYLOAD_BYTES} B"
        );
    }
}
