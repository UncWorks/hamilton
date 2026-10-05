//! Shared test inputs.
//!
//! TEMPORARY: the inputs come from `tests/fixtures/temp-*.json`, derived from
//! `scripts/aoe-preview/gen_fixtures.py` by `tests/fixtures/gen_temp_fixtures.py`,
//! until WS-A's `packages/contracts/fixtures/aoe/{golden-cases,propagation-vectors}.json`
//! land at CP1.
#![allow(dead_code)]

use std::path::PathBuf;

use serde_json::Value;
use trust_estimator::*;

pub fn fixture(name: &str) -> Value {
    let p = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("tests/fixtures")
        .join(name);
    let s = std::fs::read_to_string(&p).unwrap_or_else(|e| panic!("read {}: {e}", p.display()));
    serde_json::from_str(&s).expect("fixture JSON")
}

pub fn golden() -> Value {
    fixture("temp-golden-cases.json")
}

pub fn f(v: &Value) -> f64 {
    v.as_f64().expect("number")
}

pub fn rx_class(s: &str) -> RxClass {
    serde_json::from_value(Value::String(s.to_string())).expect("rx_class")
}

pub struct Scenario {
    pub method: MethodModel,
    pub receivers: Receivers,
    pub grid: Grid,
    pub lat0: f64,
    pub lon0: f64,
    pub km_per_deg_lon: f64,
}

impl Scenario {
    pub fn to_latlon(&self, x: f64, y: f64) -> (f64, f64) {
        (self.lat0 + y / 111.32, self.lon0 + x / self.km_per_deg_lon)
    }
}

/// Method, receivers (civil + mil; CRPA is deferred) and the preview generator's
/// grid (x −25..60 km, y −30..30 km, 250 m) with the FLOT at x = 1 km, enemy east.
pub fn scenario(g: &Value) -> Scenario {
    let m = &g["model"];
    let fr = &g["frame"];
    let (lat0, lon0) = (f(&fr["lat0"]), f(&fr["lon0"]));
    let km_per_deg_lon = 111.32 * lat0.to_radians().cos();
    let flot_x = f(&g["flot_x_km"]);
    let ll = |x: f64, y: f64| LatLon {
        lat: lat0 + y / 111.32,
        lon: lon0 + x / km_per_deg_lon,
    };
    let th = &m["thresholds_db"];
    Scenario {
        method: MethodModel {
            method_id: "ground_based_gps_uhf_barrage".into(),
            erp_dbm: m["erp_dbm"].as_array().unwrap().iter().map(f).collect(),
            mast_m: m["mast_m"].as_array().unwrap().iter().map(f).collect(),
            sigma_db: f(&m["sigma_db"]),
            affects_rx_classes: vec![RxClass::GnssCivil, RxClass::GnssMil, RxClass::UhfComms],
        },
        receivers: Receivers {
            signal_dbm: f(&m["signal_dbm"]),
            rx_gain_dbi: f(&m["rx_gain_dbi"]),
            rx_height_m: f(&m["rx_height_m"]),
            freq_mhz: f(&m["freq_mhz"]),
            classes: vec![
                ReceiverClass {
                    rx_class: RxClass::GnssCivil,
                    js_threshold_db: f(&th["gnss_civil"]),
                },
                ReceiverClass {
                    rx_class: RxClass::GnssMil,
                    js_threshold_db: f(&th["gnss_mil"]),
                },
            ],
        },
        grid: Grid {
            origin: LatLon {
                lat: lat0,
                lon: lon0,
            },
            cell_m: f(&g["grid"]["cell_m"]),
            x_km: [f(&g["grid"]["x_km"][0]), f(&g["grid"]["x_km"][1])],
            y_km: [f(&g["grid"]["y_km"][0]), f(&g["grid"]["y_km"][1])],
            flot: Some(Flot {
                points: vec![ll(flot_x, -12.0), ll(flot_x, 12.0)],
                enemy_side: Side::Right,
            }),
            prior: PriorModel::default(),
        },
        lat0,
        lon0,
        km_per_deg_lon,
    }
}

pub fn evidence(case: &Value, now_ms: i64) -> Evidence {
    Evidence {
        now_ms,
        observations: case["observations"]
            .as_array()
            .unwrap()
            .iter()
            .map(|o| Observation {
                source_id: o["source_id"].as_str().unwrap().into(),
                rx_class: rx_class(o["rx_class"].as_str().unwrap()),
                state: if o["state"] == "degraded" {
                    UnitState::Degraded
                } else {
                    UnitState::Healthy
                },
                lat: f(&o["lat"]),
                lon: f(&o["lon"]),
            })
            .collect(),
    }
}

pub fn case<'a>(g: &'a Value, name: &str) -> &'a Value {
    g["cases"]
        .as_array()
        .unwrap()
        .iter()
        .find(|c| c["name"] == name)
        .unwrap_or_else(|| panic!("case {name}"))
}

pub fn cases<'a>(g: &'a Value, kind: &str) -> Vec<&'a Value> {
    g["cases"]
        .as_array()
        .unwrap()
        .iter()
        .filter(|c| c["kind"] == kind)
        .collect()
}
