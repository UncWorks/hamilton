//! E4: the link budget matches `packages/contracts/fixtures/aoe/propagation-vectors.json`
//! (shared with the sim's `propagation.py`, C2) to 0.01 dB.

mod common;

use common::{f, fixture, rx_class};
use serde_json::Value;
use trust_estimator::propagation::{denial_radius_km, js_db, path_loss_db};
use trust_estimator::Receivers;

const TOL_DB: f64 = 0.01;
/// The fixture's radii come from a 0.01 km scan (its model note says compare at 0.01 km).
const TOL_RADIUS_KM: f64 = 0.01;

fn vectors() -> Value {
    let v = fixture("propagation-vectors.json");
    assert_eq!(f(&v["model"]["tolerance_db"]), TOL_DB);
    v
}

fn receivers(h_rx_m: f64, f_mhz: f64) -> Receivers {
    // The fixture's J/S model: g_r_jam = −5 dBi, S = −125 dBm (L1).
    Receivers {
        signal_dbm: -125.0,
        rx_gain_dbi: -5.0,
        rx_height_m: h_rx_m,
        freq_mhz: f_mhz,
        classes: Vec::new(),
    }
}

#[test]
fn path_loss_matches_vectors() {
    let v = vectors();
    let rows = v["vectors"].as_array().unwrap();
    assert!(rows.len() >= 100);
    let mut worst: f64 = 0.0;
    for r in rows {
        let got = path_loss_db(
            f(&r["d_km"]),
            f(&r["h_tx_m"]),
            f(&r["h_rx_m"]),
            f(&r["f_mhz"]),
        );
        let err = (got - f(&r["path_loss_db"])).abs();
        worst = worst.max(err);
        assert!(err <= TOL_DB, "{r}: got {got}");
    }
    println!(
        "path loss: {} vectors, worst |error| {worst:.2e} dB",
        rows.len()
    );
}

#[test]
fn js_matches_vectors() {
    let v = vectors();
    let mut n = 0;
    let mut worst: f64 = 0.0;
    for r in v["vectors"].as_array().unwrap() {
        let Some(js) = r["js_db"].as_object() else {
            continue;
        };
        let rx = receivers(f(&r["h_rx_m"]), f(&r["f_mhz"]));
        for (erp, want) in js {
            let got = js_db(f(&r["d_km"]), erp.parse().unwrap(), f(&r["h_tx_m"]), &rx);
            let err = (got - f(want)).abs();
            worst = worst.max(err);
            assert!(err <= TOL_DB, "{r} erp {erp}: got {got}");
            n += 1;
        }
    }
    assert!(n >= 100, "{n} J/S vectors");
    println!("J/S: {n} vectors, worst |error| {worst:.2e} dB");
}

#[test]
fn denial_radius_matches_vectors() {
    let v = vectors();
    let rows = v["denial_radii"].as_array().unwrap();
    assert!(!rows.is_empty());
    for r in rows {
        let _ = rx_class(r["rx_class"].as_str().unwrap());
        let got = denial_radius_km(
            f(&r["erp_dbm"]),
            f(&r["mast_m"]),
            f(&r["threshold_db"]),
            &receivers(2.0, 1575.42),
        );
        let want = f(&r["denial_radius_km"]);
        assert!((got - want).abs() <= TOL_RADIUS_KM + 1e-9, "{r}: got {got}");
    }
}
