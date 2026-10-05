//! `trust-estimator`: the jammer area-of-effect estimator (FR-04b, `docs/plans/jammer-aoe.md` §1).
//!
//! A soft set-based grid estimator: a fixed 250 m grid, a fixed EIRP × mast
//! hypothesis set, a two-ray + horizon link budget, a binary probit likelihood
//! per unit (σ 6 dB), log-domain sums in a fixed order. No training, no learned
//! weights, no sampling; the same input gives the same bytes.

pub mod types;

pub use types::*;

/// Estimate the per-class area of effect and the 90% emitter region.
///
/// Pure: no clock, no I/O, no global state; `evidence.now_ms` is echoed.
pub fn estimate(
    evidence: &Evidence,
    method: &MethodModel,
    receivers: &Receivers,
    grid: &Grid,
) -> Estimate {
    // Signature commit: a stub so the engine wiring can compile against the API.
    let _ = (receivers, grid);
    Estimate {
        state: EstimateState::Unbounded,
        method_id: method.method_id.clone(),
        computed_at_ms: evidence.now_ms,
        model: ModelSummary {
            grid_m: grid.cell_m,
            erp_dbm: method.erp_dbm.clone(),
            mast_m: method.mast_m.clone(),
            sigma_db: method.sigma_db,
        },
        aoe: Vec::new(),
        emitter: EmitterRegion {
            region90: Vec::new(),
            area90_km2: 0.0,
            erp_dbm_range: [0.0, 0.0],
        },
        degraded_count: 0,
        healthy_count: 0,
    }
}
