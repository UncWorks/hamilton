//! Trust score aggregator (FR-05).
//!
//! Composes per-source detector readings into a single continuous score in
//! `[0.0, 1.0]`. The composed score MUST be monotonic-down during degradation
//! and monotonic-up during recovery (System Design §5.1).
//!
//! R14: this is a deterministic weighted minimum-bias combiner. No model.

use chrono::{DateTime, Utc};
use hamilton_contracts::{TrustComponents, TrustScorePayload};
use trust_detectors::{
    fingerprint::FingerprintMatch, spatial::SpatialResult, stability::StabilityReading,
    temporal::TemporalReading,
};

/// Per-detector weights. Bias toward fingerprint + stability because they
/// are the strongest evidence of a real attribution event. Sum to 1.0.
pub struct AggregatorWeights {
    pub temporal: f64,
    pub stability: f64,
    pub spatial: f64,
    pub fingerprint: f64,
}

impl Default for AggregatorWeights {
    fn default() -> Self {
        Self {
            temporal: 0.20,
            stability: 0.30,
            spatial: 0.20,
            fingerprint: 0.30,
        }
    }
}

/// Snapshot of detector outputs at one tick.
pub struct DetectorReadings<'a> {
    pub temporal: &'a TemporalReading,
    pub stability: &'a StabilityReading,
    pub spatial: &'a SpatialResult,
    pub fingerprint: Option<&'a FingerprintMatch>,
}

/// Compose detector readings into a continuous TrustScorePayload.
///
/// Min-biased weighted average: composite = 0.6 * weighted_avg + 0.4 * worst_component.
/// Worst-component bias preserves the monotonic-down invariant under cascading failure.
pub fn aggregate(
    source_id: impl Into<String>,
    readings: DetectorReadings<'_>,
    weights: &AggregatorWeights,
    now: DateTime<Utc>,
) -> TrustScorePayload {
    let fingerprint_score = readings.fingerprint.map(|m| m.score).unwrap_or(1.0);

    let components = TrustComponents {
        temporal: readings.temporal.score,
        stability: readings.stability.score,
        spatial: readings.spatial.score,
        fingerprint: fingerprint_score,
    };

    let weighted_avg = components.temporal * weights.temporal
        + components.stability * weights.stability
        + components.spatial * weights.spatial
        + components.fingerprint * weights.fingerprint;

    let worst = components
        .temporal
        .min(components.stability)
        .min(components.spatial)
        .min(components.fingerprint);

    let score = (0.6 * weighted_avg + 0.4 * worst).clamp(0.0, 1.0);

    TrustScorePayload {
        source_id: source_id.into(),
        score,
        components,
        timestamp: now,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use trust_detectors::spatial::SpatialClassification;

    fn nominal() -> (TemporalReading, StabilityReading, SpatialResult) {
        (
            TemporalReading {
                latest_seconds: 1.0,
                sigma_deviation: 0.0,
                anomaly: false,
                score: 1.0,
            },
            StabilityReading {
                crc_error_rate: 0.002,
                duplicate_rate: 0.0,
                degraded: false,
                score: 1.0,
            },
            SpatialResult {
                classification: SpatialClassification::Localized,
                evaluated_neighbors: vec![],
                degrading_neighbors: vec![],
                score: 1.0,
            },
        )
    }

    #[test]
    fn nominal_inputs_yield_score_one() {
        let (t, s, sp) = nominal();
        let weights = AggregatorWeights::default();
        let payload = aggregate(
            "unit_b",
            DetectorReadings {
                temporal: &t,
                stability: &s,
                spatial: &sp,
                fingerprint: None,
            },
            &weights,
            Utc::now(),
        );
        assert!((payload.score - 1.0).abs() < f64::EPSILON);
        assert_eq!(payload.source_id, "unit_b");
    }

    #[test]
    fn cascading_degradation_is_monotonic_down() {
        let weights = AggregatorWeights::default();
        let now = Utc::now();
        let (mut t, mut s, mut sp) = nominal();
        let baseline = aggregate(
            "u",
            DetectorReadings {
                temporal: &t,
                stability: &s,
                spatial: &sp,
                fingerprint: None,
            },
            &weights,
            now,
        )
        .score;

        t.score = 0.5;
        let after_t = aggregate(
            "u",
            DetectorReadings {
                temporal: &t,
                stability: &s,
                spatial: &sp,
                fingerprint: None,
            },
            &weights,
            now,
        )
        .score;
        assert!(after_t < baseline);

        s.score = 0.3;
        let after_s = aggregate(
            "u",
            DetectorReadings {
                temporal: &t,
                stability: &s,
                spatial: &sp,
                fingerprint: None,
            },
            &weights,
            now,
        )
        .score;
        assert!(after_s < after_t);

        sp.score = 0.3;
        let after_sp = aggregate(
            "u",
            DetectorReadings {
                temporal: &t,
                stability: &s,
                spatial: &sp,
                fingerprint: None,
            },
            &weights,
            now,
        )
        .score;
        assert!(after_sp < after_s);

        let fp = FingerprintMatch {
            method_id: "x".into(),
            named_systems: vec![],
            score: 0.19,
            munitions_affected: vec![],
            source_citation: "x".into(),
        };
        let after_fp = aggregate(
            "u",
            DetectorReadings {
                temporal: &t,
                stability: &s,
                spatial: &sp,
                fingerprint: Some(&fp),
            },
            &weights,
            now,
        )
        .score;
        assert!(after_fp < after_sp);
    }

    #[test]
    fn recovery_is_monotonic_up() {
        let weights = AggregatorWeights::default();
        let now = Utc::now();
        let (mut t, mut s, mut sp) = nominal();
        t.score = 0.2;
        s.score = 0.2;
        sp.score = 0.3;
        let degraded = aggregate(
            "u",
            DetectorReadings {
                temporal: &t,
                stability: &s,
                spatial: &sp,
                fingerprint: None,
            },
            &weights,
            now,
        )
        .score;

        t.score = 0.8;
        s.score = 0.8;
        sp.score = 1.0;
        let recovered = aggregate(
            "u",
            DetectorReadings {
                temporal: &t,
                stability: &s,
                spatial: &sp,
                fingerprint: None,
            },
            &weights,
            now,
        )
        .score;
        assert!(recovered > degraded);
    }

    #[test]
    fn score_is_bounded_zero_to_one() {
        let weights = AggregatorWeights::default();
        let (mut t, mut s, mut sp) = nominal();
        t.score = 0.0;
        s.score = 0.0;
        sp.score = 0.0;
        let fp = FingerprintMatch {
            method_id: "x".into(),
            named_systems: vec![],
            score: 0.0,
            munitions_affected: vec![],
            source_citation: "x".into(),
        };
        let p = aggregate(
            "u",
            DetectorReadings {
                temporal: &t,
                stability: &s,
                spatial: &sp,
                fingerprint: Some(&fp),
            },
            &weights,
            Utc::now(),
        );
        assert!(p.score >= 0.0 && p.score <= 1.0);
    }
}
