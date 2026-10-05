//! E4: the link budget matches the shared propagation vectors to 0.01 dB.
//!
//! TEMPORARY input: `fixtures/temp-propagation-vectors.json` until WS-A's
//! `packages/contracts/fixtures/aoe/propagation-vectors.json` lands.

mod common;

use common::{f, fixture};
use trust_estimator::propagation::{denial_radius_km, js_db, path_loss_db};
use trust_estimator::Receivers;

const TOL_DB: f64 = 0.01;

fn receivers(v: &serde_json::Value) -> Receivers {
    let l = &v["link"];
    Receivers {
        signal_dbm: f(&l["signal_dbm"]),
        rx_gain_dbi: f(&l["rx_gain_dbi"]),
        rx_height_m: f(&l["rx_height_m"]),
        freq_mhz: f(&l["freq_mhz"]),
        classes: Vec::new(),
    }
}

#[test]
fn path_loss_matches_vectors() {
    let v = fixture("temp-propagation-vectors.json");
    let rows = v["path_loss"].as_array().unwrap();
    assert!(rows.len() > 100);
    for r in rows {
        let got = path_loss_db(
            f(&r["d_km"]),
            f(&r["h_tx_m"]),
            f(&r["h_rx_m"]),
            f(&r["f_mhz"]),
        );
        let want = f(&r["path_loss_db"]);
        assert!((got - want).abs() <= TOL_DB, "{r}: got {got}");
    }
}

#[test]
fn js_matches_vectors() {
    let v = fixture("temp-propagation-vectors.json");
    let rx = receivers(&v);
    for r in v["js"].as_array().unwrap() {
        let got = js_db(f(&r["d_km"]), f(&r["erp_dbm"]), f(&r["h_tx_m"]), &rx);
        let want = f(&r["js_db"]);
        assert!((got - want).abs() <= TOL_DB, "{r}: got {got}");
    }
}

#[test]
fn denial_radius_matches_vectors() {
    let v = fixture("temp-propagation-vectors.json");
    let rx = receivers(&v);
    for r in v["denial_radius"].as_array().unwrap() {
        let got = denial_radius_km(
            f(&r["erp_dbm"]),
            f(&r["h_tx_m"]),
            f(&r["threshold_db"]),
            &rx,
        );
        let want = f(&r["radius_km"]);
        assert!((got - want).abs() < 1e-9, "{r}: got {got}");
    }
}
