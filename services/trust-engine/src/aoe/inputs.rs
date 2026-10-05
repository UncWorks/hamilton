//! Estimator inputs built from engine state: per-class evidence (K2), its
//! hash, the method's hypothesis set, the receiver table and the grid.

use std::collections::BTreeSet;

use hamilton_contracts as wire;
use trust_detectors::fingerprint::{FingerprintEntry, RfFingerprint};
use trust_library::ReceiverTable;

use super::estimator as est;
use crate::state::{ClassObservation, ClassState, GnssTrack};

/// Projection used by the sim, the preview generator and the estimator.
pub const KM_PER_DEG_LAT: f64 = 111.32;
/// Evidence positions are quantised to the estimator grid step (plan E15).
pub const QUANTUM_KM: f64 = 0.25;
/// Likelihood σ, dB [DES].
pub const SIGMA_DB: f64 = 6.0;

/// Area-of-operations frame: the local plane origin and the FLOT.
#[derive(Debug, Clone, PartialEq)]
pub struct AoFrame {
    pub origin: est::LatLon,
    pub flot: Option<est::Flot>,
}

impl AoFrame {
    /// The Avdiivka demo frame: origin at B's start (48.14, 37.745), FLOT a
    /// north–south line 1 km east of it with the enemy to the east (preview
    /// generator `FLOT_X`, golden-cases.json `model.prior`).
    pub fn avdiivka() -> Self {
        let origin = est::LatLon {
            lat: 48.14,
            lon: 37.745,
        };
        let frame = Self { origin, flot: None };
        let south = frame.to_latlon(1.0, -12.0);
        let north = frame.to_latlon(1.0, 12.0);
        Self {
            flot: Some(est::Flot {
                points: vec![south, north],
                // Walking south → north, the right-hand side is east.
                enemy_side: est::Side::Right,
            }),
            ..frame
        }
    }

    fn km_per_deg_lon(&self) -> f64 {
        KM_PER_DEG_LAT * self.origin.lat.to_radians().cos()
    }

    /// (east, north) km of a WGS-84 position on the local plane.
    pub fn to_xy(&self, lat: f64, lon: f64) -> (f64, f64) {
        (
            (lon - self.origin.lon) * self.km_per_deg_lon(),
            (lat - self.origin.lat) * KM_PER_DEG_LAT,
        )
    }

    pub fn to_latlon(&self, x_km: f64, y_km: f64) -> est::LatLon {
        est::LatLon {
            lat: self.origin.lat + y_km / KM_PER_DEG_LAT,
            lon: self.origin.lon + x_km / self.km_per_deg_lon(),
        }
    }

    /// Position quantised to the 250 m grid (evidence hash).
    pub fn quantise(&self, lat: f64, lon: f64) -> (i64, i64) {
        let (x, y) = self.to_xy(lat, lon);
        (
            (x / QUANTUM_KM).round() as i64,
            (y / QUANTUM_KM).round() as i64,
        )
    }
}

/// Hard cap on grid cells (FR-04b (5): compute < 50 ms; β measured 14 ms at
/// ~20k cells and ~58 ms at ~82k).
pub const MAX_GRID_CELLS: usize = 40_000;
/// Base grid step, m.
pub const BASE_CELL_M: f64 = 250.0;

/// Estimator grid: the DEGRADED units' bounding box ± R_max (the method's
/// largest denial radius over the published classes), centred on that box
/// (`trust_estimator::grid::fit_grid`). If it would exceed
/// [`MAX_GRID_CELLS`], the cell doubles (250 → 500 → 1000 m) until it fits;
/// the step used is echoed in `model.grid_m`. With nothing degraded the box
/// covers every observation.
pub fn fit_grid(
    evidence: &est::Evidence,
    method: &est::MethodModel,
    receivers: &est::Receivers,
    flot: Option<est::Flot>,
) -> Option<est::Grid> {
    let degraded: Vec<est::Observation> = evidence
        .observations
        .iter()
        .filter(|o| o.state == est::UnitState::Degraded)
        .cloned()
        .collect();
    let box_obs = if degraded.is_empty() {
        &evidence.observations
    } else {
        &degraded
    };
    let r_max = receivers
        .classes
        .iter()
        .map(|c| est::r_max_km(method, receivers, c.js_threshold_db))
        .fold(0.0, f64::max);
    let mut cell_m = BASE_CELL_M;
    loop {
        let g = est::grid::fit_grid(
            box_obs,
            r_max,
            cell_m,
            flot.clone(),
            est::PriorModel::default(),
        )?;
        if grid_cells(&g) <= MAX_GRID_CELLS || cell_m >= 4_000.0 {
            return Some(g);
        }
        cell_m *= 2.0;
    }
}

/// Cell count of a grid (centres from `x_km[0]` to `x_km[1]` inclusive).
pub fn grid_cells(g: &est::Grid) -> usize {
    let res = g.cell_m / 1000.0;
    let n = |r: [f64; 2]| ((r[1] - r[0]) / res).round() as usize + 1;
    n(g.x_km) * n(g.y_km)
}

/// One binary GNSS observation used as estimator evidence.
#[derive(Debug, Clone, PartialEq)]
pub struct EvidenceItem {
    pub source_id: String,
    pub rx_class: wire::RxClass,
    pub state: ClassState,
    pub lat: f64,
    pub lon: f64,
    /// When the unit last reported this state here (Unix ms); ages derive from it.
    pub observed_ms: i64,
}

/// The engine's per-unit view at one tick.
#[derive(Debug, Clone)]
pub struct UnitView {
    pub source_id: String,
    pub gnss: Option<GnssTrack>,
    /// FR-01 / FR-02 link verdict (`spatial::is_degrading`). UHF-class
    /// evidence: dimension 6 and the trigger only, never the GNSS contours (K2).
    pub link_degraded: bool,
    pub rf: Option<RfFingerprint>,
}

impl UnitView {
    /// Receiver classes observed degraded at this unit (dimension 6 input):
    /// its GNSS class when `gnss_fix` is degraded, plus `uhf_comms` when the
    /// link verdict is degraded.
    pub fn degraded_classes(&self) -> BTreeSet<wire::RxClass> {
        let mut out = BTreeSet::new();
        if let Some(g) = &self.gnss {
            if g.current.state == ClassState::Degraded {
                out.insert(g.rx_class);
            }
        }
        if self.link_degraded {
            out.insert(wire::RxClass::UhfComms);
        }
        out
    }
}

/// GNSS evidence (K2: from `gnss_fix` only). Each GNSS unit contributes its
/// current state at its current position; its previous opposite-state
/// observation is kept as well while it is younger than `retention_ms` and was
/// made at a different (quantised) position — e.g. B's degraded 1:15 report
/// after B moved out and recovered at 1:50. Canonical order.
pub fn build_evidence(
    units: &[UnitView],
    frame: &AoFrame,
    now_ms: i64,
    retention_ms: i64,
) -> Vec<EvidenceItem> {
    let mut out = Vec::new();
    for u in units {
        let Some(g) = &u.gnss else { continue };
        let item = |o: &ClassObservation| EvidenceItem {
            source_id: u.source_id.clone(),
            rx_class: g.rx_class,
            state: o.state,
            lat: o.lat,
            lon: o.lon,
            observed_ms: o.last_ms,
        };
        out.push(item(&g.current));
        if let Some(prev) = &g.previous {
            let moved =
                frame.quantise(prev.lat, prev.lon) != frame.quantise(g.current.lat, g.current.lon);
            if moved && now_ms - prev.last_ms <= retention_ms {
                out.push(item(prev));
            }
        }
    }
    out.sort_by(|a, b| {
        (&a.source_id, a.rx_class, b.observed_ms).cmp(&(&b.source_id, b.rx_class, a.observed_ms))
    });
    out
}

/// Evidence hash: method + (source, class, state, quantised position), so
/// ages and sub-cell jitter never trigger a recompute. FNV-1a 64, 16 hex.
pub fn evidence_hash(method_id: &str, evidence: &[EvidenceItem], frame: &AoFrame) -> String {
    let mut keys: Vec<String> = evidence
        .iter()
        .map(|e| {
            let (qx, qy) = frame.quantise(e.lat, e.lon);
            format!("{}|{:?}|{:?}|{qx}|{qy}", e.source_id, e.rx_class, e.state)
        })
        .collect();
    keys.sort();
    let mut h: u64 = 0xcbf2_9ce4_8422_2325;
    for byte in std::iter::once(method_id)
        .chain(keys.iter().map(String::as_str))
        .flat_map(|k| k.bytes().chain(std::iter::once(b'\n')))
    {
        h ^= u64::from(byte);
        h = h.wrapping_mul(0x0100_0000_01b3);
    }
    format!("{h:016x}")
}

pub fn to_est_class(c: wire::RxClass) -> est::RxClass {
    match c {
        wire::RxClass::GnssCivil => est::RxClass::GnssCivil,
        wire::RxClass::GnssMil => est::RxClass::GnssMil,
        wire::RxClass::GnssMilCrpa => est::RxClass::GnssMilCrpa,
        wire::RxClass::UhfComms => est::RxClass::UhfComms,
        wire::RxClass::FpvLink => est::RxClass::FpvLink,
    }
}

pub fn to_wire_class(c: est::RxClass) -> wire::RxClass {
    match c {
        est::RxClass::GnssCivil => wire::RxClass::GnssCivil,
        est::RxClass::GnssMil => wire::RxClass::GnssMil,
        est::RxClass::GnssMilCrpa => wire::RxClass::GnssMilCrpa,
        est::RxClass::UhfComms => wire::RxClass::UhfComms,
        est::RxClass::FpvLink => wire::RxClass::FpvLink,
    }
}

pub fn to_est_evidence(evidence: &[EvidenceItem], now_ms: i64) -> est::Evidence {
    est::Evidence {
        now_ms,
        observations: evidence
            .iter()
            .map(|e| est::Observation {
                source_id: e.source_id.clone(),
                rx_class: to_est_class(e.rx_class),
                state: match e.state {
                    ClassState::Degraded => est::UnitState::Degraded,
                    ClassState::Healthy => est::UnitState::Healthy,
                },
                lat: e.lat,
                lon: e.lon,
            })
            .collect(),
    }
}

fn dbm_of_watts(w: f64) -> f64 {
    (10.0 * (w * 1000.0).log10() * 10.0).round() / 10.0
}

/// The method's 3 × 3 EIRP × mast hypothesis set, from its library v0.2 GNSS
/// module envelope: EIRP {lo, log-midpoint rounded to 50 W, hi}, mast {lo,
/// midpoint rounded down to 10 m, hi}. For the Pole-21E-class envelope
/// (300–1000 W, 10–60 m) this is 54.8 / 57.4 / 60.0 dBm × 10 / 30 / 60 m,
/// the set in golden-cases.json. `None` when the method has no GNSS module.
pub fn method_model(entry: &FingerprintEntry) -> Option<est::MethodModel> {
    let m = entry.gnss_module()?;
    let [w_lo, w_hi] = m.eirp_w_claimed?;
    let [h_lo, h_hi] = m.emitter_height_m?;
    let w_mid = ((w_lo * w_hi).sqrt() / 50.0).round() * 50.0;
    let h_mid = (((h_lo + h_hi) / 2.0) / 10.0).floor() * 10.0;
    Some(est::MethodModel {
        method_id: entry.method_id.clone(),
        erp_dbm: vec![dbm_of_watts(w_lo), dbm_of_watts(w_mid), dbm_of_watts(w_hi)],
        mast_m: vec![h_lo, h_mid, h_hi],
        sigma_db: SIGMA_DB,
        affects_rx_classes: entry
            .affects_rx_classes
            .iter()
            .copied()
            .map(to_est_class)
            .collect(),
    })
}

/// GNSS receiver classes published in the MVP (civil drawn, military in the card).
pub const MVP_AOE_CLASSES: [wire::RxClass; 2] = [wire::RxClass::GnssCivil, wire::RxClass::GnssMil];

pub fn receivers(table: &ReceiverTable) -> est::Receivers {
    est::Receivers {
        signal_dbm: table.signal_dbm,
        rx_gain_dbi: table.rx_gain_dbi,
        rx_height_m: table.rx_height_m,
        freq_mhz: table.freq_mhz,
        classes: table
            .classes
            .iter()
            .filter(|c| MVP_AOE_CLASSES.contains(&c.rx_class))
            .map(|c| est::ReceiverClass {
                rx_class: to_est_class(c.rx_class),
                js_threshold_db: c.threshold_js_db,
            })
            .collect(),
    }
}
