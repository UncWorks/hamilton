//! Plain input / output types of the estimator.
//!
//! These are deliberately *not* the `hamilton-contracts` types: the crate stays
//! pure (serde only, NFR-07). The engine wiring (C-wire) maps
//! `EmitterEstimatePayload` <-> [`Estimate`] and telemetry state -> [`Evidence`].

use serde::{Deserialize, Serialize};

/// Receiver class (mirrors the `RxClass` enum of the telemetry v2 contract).
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum RxClass {
    GnssCivil,
    GnssMil,
    GnssMilCrpa,
    UhfComms,
    FpvLink,
}

/// Engine-measured per-class state of one unit (K2: GNSS state = `gnss_fix`).
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum UnitState {
    Degraded,
    Healthy,
}

/// WGS-84 position in decimal degrees.
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub struct LatLon {
    pub lat: f64,
    pub lon: f64,
}

/// One unit's binary observation for one receiver class.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Observation {
    pub source_id: String,
    pub rx_class: RxClass,
    pub state: UnitState,
    pub lat: f64,
    pub lon: f64,
}

/// Everything the estimator learns from friendly units. Time is an input
/// (determinism, FR-04b (4)): the estimator never reads a clock.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Evidence {
    /// The tick time the estimate is computed for (Unix ms). Echoed only.
    pub now_ms: i64,
    /// Order does not matter: observations are canonically sorted inside.
    /// Observations whose `rx_class` has no entry in [`Receivers::classes`] are ignored.
    pub observations: Vec<Observation>,
}

/// The matched method's emitter envelope as a fixed hypothesis set
/// (library v0.2 `emitter.modules[]` GNSS module).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct MethodModel {
    pub method_id: String,
    /// EIRP hypotheses, dBm (demo: Pole-21E-class 300 / 550 / 1000 W = 54.8 / 57.4 / 60.0 dBm [VMC]).
    pub erp_dbm: Vec<f64>,
    /// Mast-height hypotheses, m (demo: 10 / 30 / 60 m [VMC range]).
    pub mast_m: Vec<f64>,
    /// Likelihood σ, dB (6 dB [DES]).
    pub sigma_db: f64,
    /// Receiver classes the method affects. AoE layers are produced for every class in
    /// [`Receivers::classes`] that is listed here (all of them if this is empty).
    pub affects_rx_classes: Vec<RxClass>,
}

/// J/S threshold of one receiver class (`receivers.json`).
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub struct ReceiverClass {
    pub rx_class: RxClass,
    /// Loss-of-service J/S threshold, dB (civil 36 [RC], mil 41 [DES]).
    pub js_threshold_db: f64,
}

/// Receiver-side link budget shared by the GNSS classes.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Receivers {
    /// Wanted-signal power, dBm (GPS L1 C/A nominal −125 [RC]).
    pub signal_dbm: f64,
    /// Receiver antenna gain toward a horizon jammer, dBi (−5 [DES/RC]).
    pub rx_gain_dbi: f64,
    /// Receiver antenna height, m (2 [DES]).
    pub rx_height_m: f64,
    /// Carrier frequency, MHz (L1 1575.42).
    pub freq_mhz: f64,
    pub classes: Vec<ReceiverClass>,
}

/// Which side of the FLOT polyline (walking from the first to the last point) is enemy.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Side {
    Left,
    Right,
}

/// Forward line of own troops as a polyline; its end segments are extended to infinity.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Flot {
    pub points: Vec<LatLon>,
    pub enemy_side: Side,
}

/// Location prior weights (plan §1, design §2.4, standoff band [ASM]).
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub struct PriorModel {
    /// Weight on the enemy side inside the standoff band (1.0).
    pub enemy_weight: f64,
    /// Weight on the friendly side (soft floor 0.02).
    pub friendly_weight: f64,
    /// Standoff band behind the FLOT, km ([2, 25], RUSI-anchored [ASM]).
    pub standoff_km: [f64; 2],
    /// Weight on the enemy side outside the standoff band (0.1).
    pub outside_standoff_weight: f64,
}

impl Default for PriorModel {
    fn default() -> Self {
        Self {
            enemy_weight: 1.0,
            friendly_weight: 0.02,
            standoff_km: [2.0, 25.0],
            outside_standoff_weight: 0.1,
        }
    }
}

/// The fixed evaluation grid: a local plane at `origin` (equirectangular,
/// 111.32 km/deg, the same projection as the sim and the preview generator),
/// cell centres at `x_km[0] + i·cell`, `y_km[0] + j·cell` up to and including `x_km[1]` / `y_km[1]`.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Grid {
    pub origin: LatLon,
    /// Cell size, m (250).
    pub cell_m: f64,
    /// East extent relative to `origin`, km.
    pub x_km: [f64; 2],
    /// North extent relative to `origin`, km.
    pub y_km: [f64; 2],
    /// `None` = uniform location prior.
    pub flot: Option<Flot>,
    pub prior: PriorModel,
}

/// Output state of one estimator run. `stale` / `retired` are lifecycle states owned by the ticker.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum EstimateState {
    /// Polygons published.
    Active,
    /// No healthy same-class unit lies within R_max of a degraded unit (or nothing is
    /// degraded): the edge is not observed, so no polygon is produced.
    Unbounded,
}

/// `[lon, lat]`, 5 dp (GeoJSON order).
pub type Position = [f64; 2];
/// Closed ring (first point repeated last).
pub type Ring = Vec<Position>;
/// `[shell, hole, hole, …]`.
pub type Polygon = Vec<Ring>;
/// GeoJSON `MultiPolygon` coordinates.
pub type MultiPolygon = Vec<Polygon>;

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Contour {
    /// 0.5 or 0.9.
    pub p: f64,
    /// ≤ 64 vertices in total (closing points counted).
    pub polygon: MultiPolygon,
    /// Area of `polygon`, km², 0.1 km² resolution.
    pub area_km2: f64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct AoeLayer {
    pub rx_class: RxClass,
    /// `[p = 0.5, p = 0.9]`; empty when unbounded.
    pub contours: Vec<Contour>,
    /// Min / max denial radius over the hypothesis set, km (0.1 km).
    pub radius_km_range: [f64; 2],
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct EmitterRegion {
    /// HPD 90% emitter region on the enemy side of the FLOT; empty when unbounded.
    pub region90: MultiPolygon,
    /// HPD 90% area (cell count × cell area), km², 0.1 km²; 0 when unbounded.
    pub area90_km2: f64,
    /// Min / max EIRP hypothesis with ≥ 5% marginal posterior mass, dBm.
    pub erp_dbm_range: [f64; 2],
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ModelSummary {
    pub grid_m: f64,
    pub erp_dbm: Vec<f64>,
    pub mast_m: Vec<f64>,
    pub sigma_db: f64,
}

/// The estimator's result. C-wire adds `schema`, `estimate_id`, method match, the
/// evidence list with ages, `evidence_hash`, `computed_at` / `valid_until`.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Estimate {
    pub state: EstimateState,
    pub method_id: String,
    /// Echo of [`Evidence::now_ms`].
    pub computed_at_ms: i64,
    pub model: ModelSummary,
    /// One layer per modelled receiver class, in [`RxClass`] order.
    pub aoe: Vec<AoeLayer>,
    pub emitter: EmitterRegion,
    /// Observations used (classes with a threshold), by state.
    pub degraded_count: u32,
    pub healthy_count: u32,
}
