//! Estimator seam: the engine calls the pure `trust-estimator` crate through
//! [`AoeEstimator`], so lifecycle tests can substitute a fake.

pub use trust_estimator::*;

/// `estimate(&Evidence, &MethodModel, &Receivers, &Grid) -> Estimate`, pure
/// and deterministic.
pub trait AoeEstimator: Send + Sync {
    fn estimate(
        &self,
        evidence: &Evidence,
        method: &MethodModel,
        receivers: &Receivers,
        grid: &Grid,
    ) -> Estimate;
}

/// The production estimator (`trust_estimator::estimate`).
pub struct GridEstimator;

impl AoeEstimator for GridEstimator {
    fn estimate(
        &self,
        evidence: &Evidence,
        method: &MethodModel,
        receivers: &Receivers,
        grid: &Grid,
    ) -> Estimate {
        trust_estimator::estimate(evidence, method, receivers, grid)
    }
}
