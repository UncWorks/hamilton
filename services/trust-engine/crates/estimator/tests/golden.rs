//! E11: the estimator against the hidden truth (plan §5.1, FR-04b (1)(2)(3), K3).
//!
//! TEMPORARY input: `fixtures/temp-golden-cases.json` (from the preview model)
//! until WS-A's `packages/contracts/fixtures/aoe/golden-cases.json` lands.
//! The truth's sector antenna and shadowing never reach the estimator: only
//! the per-unit degraded / healthy states do.

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

fn truth_latlon(c: &Value) -> (f64, f64) {
    (f(&c["truth"]["lat"]), f(&c["truth"]["lon"]))
}

/// The truth's J/S at (x, y) km: omni link budget + the sector pattern, no shadowing.
fn truth_js(t: &Value, rx: &Receivers, x: f64, y: f64) -> f64 {
    let (tx, ty) = (f(&t["x_km"]), f(&t["y_km"]));
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
fn civil_iou_footprint(s: &Scenario, a: &Analysis, e: &Estimate, c: &Value) -> f64 {
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
            let tru = truth_js(&c["truth"], &s.receivers, x, y) >= civil.threshold_db;
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
    let c = case(&g, &format!("demo_{beat}"));
    let ev = evidence(c, 0);
    let a = analyze(&ev, &s.method, &s.receivers, &s.grid);
    let e = summarise(&a, &ev, &s.method);
    let gold = &g["golden"][beat];
    let (tl, tn) = truth_latlon(c);
    let area90 = a.area90_km2();
    let iou = civil_iou_footprint(&s, &a, &e, c);
    let civil = e
        .aoe
        .iter()
        .find(|l| l.rx_class == RxClass::GnssCivil)
        .unwrap();
    println!(
        "{beat}: state {:?}; truth in region90 {}; area90 {area90:.1} km² (golden {}, limit {:.1}); \
         region90 raw contour {:.1} km² ({} published vertices); civil AoE50 {} / AoE90 {} km²; civil IoU50 in footprint {iou:.3} \
         (golden {}); P(denied) civil at unit_b {:.2}; erp range {:?}",
        e.state,
        a.in_region90(tl, tn),
        f(&gold["area90_km2"]),
        AREA90_MAX_RATIO * f(&gold["area90_km2"]),
        trust_estimator::contour::area_km2(&a.region90_km()),
        e.emitter.region90.iter().flatten().map(Vec::len).sum::<usize>(),
        civil.contours[0].area_km2,
        civil.contours[1].area_km2,
        f(&gold["civil_iou50_footprint"]),
        a.p_denied_at(RxClass::GnssCivil, s.lat0, s.lon0).unwrap(),
        e.emitter.erp_dbm_range,
    );
    assert_eq!(e.state, EstimateState::Active);
    assert!(
        a.in_region90(tl, tn),
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

/// Containment of the truth cell over a 20-seed shadowing sweep; `None` = unbounded.
fn sweep(kind: &str) -> (usize, usize, Vec<Option<bool>>) {
    let g = golden();
    let s = scenario(&g);
    // The sweep needs only the emitter region: no AoE layer classes.
    let method = MethodModel {
        affects_rx_classes: vec![RxClass::UhfComms],
        ..s.method.clone()
    };
    let cs = cases(&g, kind);
    assert_eq!(cs.len(), 20, "{kind}: 20 seeds");
    let mut res = Vec::new();
    for c in &cs {
        let a = analyze(&evidence(c, 0), &method, &s.receivers, &s.grid);
        let (tl, tn) = truth_latlon(c);
        let got = match a.state {
            EstimateState::Active => Some(a.in_region90(tl, tn)),
            EstimateState::Unbounded => None,
        };
        let py = c["python"]["truth_in_region90"].as_bool();
        if got != py {
            println!(
                "  {kind} seed {}: rust {got:?} vs reference {py:?}",
                c["seed"]
            );
        }
        res.push(got);
    }
    let contained = res.iter().filter(|r| **r == Some(true)).count();
    let bounded = res.iter().filter(|r| r.is_some()).count();
    println!("{kind}: contained {contained}/20 ({bounded} bounded runs): {res:?}");
    (contained, bounded, res)
}

#[test]
fn containment_seed_sweep() {
    let (demo, _, _) = sweep("sweep_demo");
    let (off, _, _) = sweep("sweep_off_node");
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
    let (n, bounded, _) = sweep("sweep_back_lobe");
    println!("KNOWN LIMITATION (D8): back-lobe geometry contained {n}/20 ({bounded} bounded); omni MVP, sector fitting is v2");
}

#[test]
fn unbounded_when_all_civil_units_degraded() {
    let g = golden();
    let s = scenario(&g);
    let mut ev = evidence(case(&g, "demo_b115"), 0);
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
