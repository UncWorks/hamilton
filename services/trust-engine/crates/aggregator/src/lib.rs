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
    fingerprint::{fingerprint_trust, FingerprintMatch},
    spatial::SpatialResult,
    stability::StabilityReading,
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
    /// Best library match (match strength, not trust). `None` = no match.
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
    // Every component is trust-oriented (1.0 = healthy). The fingerprint
    // matcher reports match STRENGTH (higher = more like a jammer), so it is
    // inverted here; feeding the raw overlap ratio made a strong jammer match
    // read as fully healthy.
    let components = TrustComponents {
        temporal: readings.temporal.score,
        stability: readings.stability.score,
        spatial: readings.spatial.score,
        fingerprint: fingerprint_trust(readings.fingerprint),
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
            match_strength: 5.0 / 6.0,
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

    // Regression (fingerprint trust inversion): a strong jammer-profile match
    // must LOWER the fingerprint component and the composite score relative to
    // no match at all.
    #[test]
    fn strong_match_lowers_fingerprint_component_and_score() {
        let weights = AggregatorWeights::default();
        let now = Utc::now();
        let (t, s, sp) = nominal();
        let no_match = aggregate(
            "u",
            DetectorReadings {
                temporal: &t,
                stability: &s,
                spatial: &sp,
                fingerprint: None,
            },
            &weights,
            now,
        );
        let full = FingerprintMatch {
            method_id: "ground_based_gps_uhf_barrage".into(),
            named_systems: vec![],
            match_strength: 1.0,
            munitions_affected: vec![],
            source_citation: "x".into(),
        };
        let strong_match = aggregate(
            "u",
            DetectorReadings {
                temporal: &t,
                stability: &s,
                spatial: &sp,
                fingerprint: Some(&full),
            },
            &weights,
            now,
        );
        assert!(
            strong_match.components.fingerprint < no_match.components.fingerprint,
            "strong match must lower fingerprint trust: {} vs {}",
            strong_match.components.fingerprint,
            no_match.components.fingerprint
        );
        assert!(
            strong_match.score < no_match.score,
            "strong match must lower composite trust: {} vs {}",
            strong_match.score,
            no_match.score
        );
    }

    fn with_fp(m: Option<&FingerprintMatch>) -> TrustScorePayload {
        let (t, s, sp) = nominal();
        aggregate(
            "u",
            DetectorReadings {
                temporal: &t,
                stability: &s,
                spatial: &sp,
                fingerprint: m,
            },
            &AggregatorWeights::default(),
            Utc::now(),
        )
    }

    fn fp_match(match_strength: f64) -> FingerprintMatch {
        FingerprintMatch {
            method_id: "x".into(),
            named_systems: vec![],
            match_strength,
            munitions_affected: vec![],
            source_citation: "x".into(),
        }
    }

    #[test]
    fn no_match_yields_full_fingerprint_trust() {
        let p = with_fp(None);
        assert!((p.components.fingerprint - 1.0).abs() < f64::EPSILON);
    }

    #[test]
    fn full_match_yields_zero_fingerprint_trust() {
        let p = with_fp(Some(&fp_match(1.0)));
        assert!(p.components.fingerprint.abs() < f64::EPSILON);
        assert!(
            p.score < 0.6,
            "full jammer match alone must gate: {}",
            p.score
        );
    }

    // A stronger match never raises the component or the composite score.
    #[test]
    fn stronger_match_never_raises_trust() {
        let mut prev = with_fp(None);
        for k in 3..=6 {
            let m = fp_match(f64::from(k) / 6.0);
            let p = with_fp(Some(&m));
            assert!(p.components.fingerprint <= prev.components.fingerprint);
            assert!(p.score <= prev.score, "k={k}: {} > {}", p.score, prev.score);
            prev = p;
        }
    }

    // End-to-end over the Avdiivka beats (comms-sim scenario values, no
    // jitter) through the real detectors + bundled fingerprint library.
    #[test]
    fn avdiivka_beats_end_to_end() {
        use trust_detectors::{
            fingerprint::{match_fingerprint, FingerprintEntry, RfFingerprint, TimeDomainPattern},
            spatial::{classify_spatial, NeighborState, Position, SourceLocation},
            stability::{detect_stability, StabilityWindow},
            temporal::{detect_temporal, InterArrival, TemporalBaseline},
        };

        const ROE_FLOOR: f64 = 0.6;
        let raw = include_str!("../../../../../assets/fingerprints/library.json");
        let parsed: serde_json::Value = serde_json::from_str(raw).unwrap();
        let library: Vec<FingerprintEntry> = parsed["entries"]
            .as_array()
            .unwrap()
            .iter()
            .map(|e| serde_json::from_value(e.clone()).unwrap())
            .collect();
        let jammer = RfFingerprint {
            frequency_band_mhz: [100.0, 2000.0],
            hop_spread_hz: 50_000.0,
            gps_l1_overlap: true,
            gps_l2_overlap: true,
            time_domain_pattern: TimeDomainPattern::Barrage,
            effective_range_km: 30.0,
        };
        let baseline = TemporalBaseline {
            mean_seconds: 1.0,
            stddev_seconds: 0.05,
        };
        let b = SourceLocation {
            id: "unit_b".into(),
            position: Position {
                lat: 48.140,
                lon: 37.745,
            },
        };
        let neighbors = [
            NeighborState {
                id: "unit_a".into(),
                position: Position {
                    lat: 48.1422,
                    lon: 37.745,
                },
                degrading: false,
            },
            NeighborState {
                id: "unit_c".into(),
                position: Position {
                    lat: 48.1378,
                    lon: 37.745,
                },
                degrading: false,
            },
        ];
        let tick = |inter_arrival: f64, crc: f64, rf: Option<&RfFingerprint>| {
            let t = detect_temporal(
                &[InterArrival {
                    seconds: inter_arrival,
                }],
                &baseline,
            );
            let s = detect_stability(&StabilityWindow {
                crc_error_rate: crc,
                duplicate_rate: 0.0,
                baseline_duplicate_rate: 0.0,
            });
            let sp = classify_spatial(&b, &neighbors, 500.0);
            let fp = rf.and_then(|rf| match_fingerprint(rf, &library));
            aggregate(
                "unit_b",
                DetectorReadings {
                    temporal: &t,
                    stability: &s,
                    spatial: &sp,
                    fingerprint: fp.as_ref(),
                },
                &AggregatorWeights::default(),
                Utc::now(),
            )
        };

        let beats = [
            ("B-0:00", tick(1.0, 0.002, None)),
            ("B-0:45", tick(6.1, 0.002, None)),
            ("B-0:55", tick(6.1, 0.14, None)),
            ("B-1:15", tick(6.1, 0.14, Some(&jammer))),
            ("B-1:50", tick(1.8, 0.04, Some(&jammer))),
            ("B-2:15", tick(1.0, 0.002, None)),
        ];
        for (label, p) in &beats {
            eprintln!(
                "{label}: score={:.3} temporal={:.2} stability={:.2} spatial={:.2} fingerprint={:.2}",
                p.score,
                p.components.temporal,
                p.components.stability,
                p.components.spatial,
                p.components.fingerprint
            );
        }
        let score = |i: usize| beats[i].1.score;

        // Fingerprinting the jammer adds evidence: trust drops further at 1:15.
        assert!(beats[3].1.components.fingerprint.abs() < 1e-10);
        assert!(
            score(3) < score(2),
            "1:15 {} !< 0:55 {}",
            score(3),
            score(2)
        );
        // Below the ROE floor through the 1:20 gate.
        assert!(score(3) < ROE_FLOOR);
        // Monotonic down through degradation, up through recovery.
        assert!(score(1) < score(0) && score(2) < score(1));
        assert!(score(4) > score(3) && score(5) > score(4));
        // Recovered above the floor with no residual fingerprint penalty.
        assert!(score(5) >= ROE_FLOOR);
        assert!((beats[5].1.components.fingerprint - 1.0).abs() < f64::EPSILON);
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
            match_strength: 1.0,
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
