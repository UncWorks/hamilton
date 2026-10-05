//! E11: the estimator against the hidden truth (plan §5.1, FR-04b (1)(2)(3), K3).
//!
//! Input: `packages/contracts/fixtures/aoe/golden-cases.json` (WS-A). The truth's
//! sector antenna and shadowing never reach the estimator: only the per-unit,
//! per-class degraded / healthy states and positions do. The fixture's
//! `preview_reference` values are references, not pins; the thresholds below are.

mod common;

use common::*;
use serde_json::Value;
use trust_estimator::contour::{point_in_polygons, KmPolygon};
use trust_estimator::propagation::js_db;
use trust_estimator::*;

/// FR-04b thresholds. An agent may not change these (aoe-parallelization §1 WS-C).
const SWEEP_MIN_CONTAINED: usize = 15;
const AREA90_MAX_RATIO: f64 = 1.1;
const IOU_MIN: f64 = 0.4;
/// Plan §5.1 measured civil IoU50 in the footprint (reference only, printed).
const IOU_PREVIEW: [(&str, f64); 2] = [("b115", 0.46), ("b150", 0.49)];

/// The truth's J/S at (x, y) km: omni link budget + the sector pattern, no shadowing.
fn truth_js(t: &Value, rx: &Receivers, x: f64, y: f64) -> f64 {
    let (tx, ty) = (f(&t["enu_km"][0]), f(&t["enu_km"][1]));
    let d = (x - tx).hypot(y - ty);
    let az = (90.0 - (y - ty).atan2(x - tx).to_degrees()).rem_euclid(360.0);
    let off = ((az - f(&t["sector_az_deg"]) + 180.0).rem_euclid(360.0) - 180.0).abs();
    let gain = if off <= f(&t["sector_width_deg"]) / 2.0 {
        0.0
    } else {
        f(&t["back_db"])
    };
    js_db(d, f(&t["erp_dbm"]), f(&t["mast_m"]), rx) + gain
}

/// Civil 50% IoU vs the true denial area, inside the evidence footprint (the union
/// of discs of the smallest positive hypothesis radius around each reporting unit;
/// beyond it the AoE is extrapolated). Rasterised on the 250 m grid: a cell counts
/// as estimated when its centre lies inside the published (simplified, rounded)
/// 50% multipolygon.
fn civil_iou_footprint(s: &Scenario, a: &Analysis, e: &Estimate, truth: &Value) -> f64 {
    let civil = a
        .classes
        .iter()
        .find(|k| k.rx_class == RxClass::GnssCivil)
        .unwrap();
    let r_fp = civil
        .radii_km
        .iter()
        .copied()
        .filter(|&r| r > 0.0)
        .fold(f64::INFINITY, f64::min);
    let g = &a.geom;
    let layer = e
        .aoe
        .iter()
        .find(|l| l.rx_class == RxClass::GnssCivil)
        .unwrap();
    let c50: Vec<KmPolygon> = layer
        .contours
        .iter()
        .find(|k| k.p == 0.5)
        .unwrap()
        .polygon
        .iter()
        .map(|poly| {
            let ring = |r: &Ring| r.iter().map(|p| g.to_enu(p[1], p[0])).collect::<Vec<_>>();
            KmPolygon {
                shell: ring(&poly[0]),
                holes: poly[1..].iter().map(ring).collect(),
            }
        })
        .collect();
    let (mut inter, mut union) = (0usize, 0usize);
    for j in 0..g.ny {
        for i in 0..g.nx {
            let (x, y) = (g.x(i), g.y(j));
            if !a.obs.iter().any(|o| (o.x - x).hypot(o.y - y) <= r_fp) {
                continue;
            }
            let est = point_in_polygons((x, y), &c50);
            let tru = truth_js(truth, &s.receivers, x, y) >= civil.threshold_db;
            inter += (est && tru) as usize;
            union += (est || tru) as usize;
        }
    }
    if union == 0 {
        0.0
    } else {
        inter as f64 / union as f64
    }
}

fn demo_beat(beat: &str) {
    let g = golden();
    let s = scenario(&g);
    let run = demo_run(&g, &format!("demo_{beat}"));
    let ev = evidence(run, 0);
    let a = analyze(&ev, &s.method, &s.receivers, &s.grid);
    let e = summarise(&a, &ev, &s.method);
    let gold = &run["preview_reference"];
    let inside = contained(&a, &g["demo_truth_cell"]);
    let area90 = a.area90_km2();
    let iou = civil_iou_footprint(&s, &a, &e, &g["demo_truth"]);
    let iou_ref = IOU_PREVIEW.iter().find(|(b, _)| *b == beat).unwrap().1;
    let civil = e
        .aoe
        .iter()
        .find(|l| l.rx_class == RxClass::GnssCivil)
        .unwrap();
    println!(
        "{beat}: state {:?}; truth in region90 {:?}; area90 {area90:.1} km² (golden preview reference {}, limit {:.1}); \
         region90 raw contour {:.1} km² ({} published vertices); civil AoE50 {} / AoE90 {} km²; civil IoU50 in footprint {iou:.3} \
         (preview {}); P(denied) civil at unit_b {:.2}; erp range {:?}",
        e.state,
        inside,
        f(&gold["area90_km2"]),
        AREA90_MAX_RATIO * f(&gold["area90_km2"]),
        trust_estimator::contour::area_km2(&a.region90_km()),
        e.emitter.region90.iter().flatten().map(Vec::len).sum::<usize>(),
        civil.contours[0].area_km2,
        civil.contours[1].area_km2,
        iou_ref,
        a.p_denied_at(RxClass::GnssCivil, s.lat0, s.lon0).unwrap(),
        e.emitter.erp_dbm_range,
    );
    assert_eq!(e.state, EstimateState::Active);
    assert_eq!(
        inside,
        Some(true),
        "{beat}: truth outside the 90% emitter region"
    );
    assert!(
        area90 <= AREA90_MAX_RATIO * f(&gold["area90_km2"]),
        "{beat}: area90 {area90} > 1.1 × golden"
    );
    assert!(
        iou >= IOU_MIN,
        "{beat}: civil IoU50 in footprint {iou} < {IOU_MIN}"
    );
    for l in &e.aoe {
        for k in &l.contours {
            let n: usize = k.polygon.iter().flatten().map(Vec::len).sum();
            assert!(n <= 64, "{:?} p{} has {n} vertices", l.rx_class, k.p);
        }
    }
}

#[test]
fn demo_truth_contained_at_1_15() {
    demo_beat("b115");
}

#[test]
fn demo_truth_contained_at_1_50() {
    demo_beat("b150");
}

/// Containment of the truth cell over a 20-seed shadowing sweep; `None` = unbounded
/// (no region is published, so it counts as *not* contained). Also returns, as a
/// diagnostic, the count if the region were computed regardless of the
/// `unbounded` rule (the preview reference does that).
fn run_sweep(id: &str) -> (usize, usize, usize, Value) {
    let g = golden();
    let s = scenario(&g);
    let sw = sweep(&g, id);
    // The sweep needs only the emitter region: no AoE layer classes.
    let method = MethodModel {
        affects_rx_classes: vec![RxClass::UhfComms],
        ..s.method.clone()
    };
    let runs = sw["runs"].as_array().unwrap();
    assert_eq!(runs.len(), 20, "{id}: 20 seeds");
    let mut res = Vec::new();
    let mut forced = 0;
    for run in runs {
        let ev = evidence(run, 0);
        let a = analyze(&ev, &method, &s.receivers, &s.grid);
        let got = contained(&a, &sw["truth_cell"]);
        let reference = run["preview_reference"]["truth_in_region90"].as_bool();
        // Diagnostic: the posterior without the `unbounded` gate.
        let geom = grid::GridGeom::new(&s.grid);
        let obs = trust_estimator::evidence::canonical(&ev, &s.receivers, &geom);
        let post = set::posterior(
            &obs,
            &method,
            &s.receivers,
            &geom,
            &grid::ln_prior(&s.grid, &geom),
        );
        let c = truth_cell(&a, &sw["truth_cell"]);
        let forced_in = post.pe[c] >= post.thr90;
        forced += forced_in as usize;
        if got.unwrap_or(forced_in) != reference.unwrap_or(false) || got.is_none() {
            println!(
                "  {id} seed {}: {:?} (ungated region: {forced_in}); preview reference {reference:?}",
                run["seed"],
                got.map(|b| if b { "contained" } else { "missed" }).unwrap_or("unbounded")
            );
        }
        res.push(got);
    }
    let n = res.iter().filter(|r| **r == Some(true)).count();
    let bounded = res.iter().filter(|r| r.is_some()).count();
    println!(
        "{id}: contained {n}/20 ({bounded} bounded runs; {n}/{bounded} of those); \
         ungated region would contain {forced}/20; preview reference {}",
        sw["preview_reference_contained"]
    );
    (n, bounded, forced, sw["assertion"].clone())
}

#[test]
fn containment_seed_sweep() {
    let (demo, _, _, a1) = run_sweep("demo_truth_seed_sweep");
    let (off, _, _, a2) = run_sweep("off_node_seed_sweep");
    // The fixture's assertion is the K3 threshold.
    for a in [a1, a2] {
        assert_eq!(a["kind"], "containment_min");
        assert_eq!(
            a["min_contained"].as_u64(),
            Some(SWEEP_MIN_CONTAINED as u64)
        );
        assert_eq!(a["of"].as_u64(), Some(20));
    }
    assert!(
        demo >= SWEEP_MIN_CONTAINED,
        "demo truth contained {demo}/20 < {SWEEP_MIN_CONTAINED}"
    );
    assert!(
        off >= SWEEP_MIN_CONTAINED,
        "off-node truth contained {off}/20 < {SWEEP_MIN_CONTAINED}"
    );
}

/// Recorded, not asserted: units behind a sector antenna (az 315°) break the omni model (D8, v2).
#[test]
fn back_lobe_recorded_not_asserted() {
    let (n, bounded, _, a) = run_sweep("back_lobe_seed_sweep");
    assert_eq!(a["kind"], "recorded_only");
    println!("KNOWN LIMITATION (D8): back-lobe geometry contained {n}/20 ({bounded} bounded); omni MVP, sector fitting is v2");
}

#[test]
fn unbounded_when_all_civil_units_degraded() {
    let g = golden();
    let s = scenario(&g);
    let mut ev = evidence(demo_run(&g, "demo_b115"), 0);
    for o in ev.observations.iter_mut() {
        if o.rx_class == RxClass::GnssCivil {
            o.state = UnitState::Degraded;
        }
    }
    let e = estimate(&ev, &s.method, &s.receivers, &s.grid);
    assert_eq!(e.state, EstimateState::Unbounded);
    assert!(e.emitter.region90.is_empty());
    assert_eq!(e.emitter.area90_km2, 0.0);
    assert!(e.aoe.iter().all(|l| l.contours.is_empty()));
    assert_eq!(e.aoe.len(), 2, "layers still carry their radius range");
}
