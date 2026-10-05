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
        lat: None,
        lon: None,
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
    // jitter) through the real detectors + bundled fingerprint library, for
    // all three units. "Degrading" is measured by the engine's own detectors
    // (spatial::is_degrading), exactly as src/ticker.rs does.
    mod avdiivka {
        use super::super::*;
        use hamilton_contracts::RxClass;
        use std::collections::BTreeSet;
        use trust_detectors::{
            fingerprint::{
                match_fingerprint_with, Dimension6, FingerprintEntry, RfFingerprint,
                TimeDomainPattern,
            },
            spatial::{classify_spatial, is_degrading, NeighborState, Position, SourceLocation},
            stability::{detect_stability, StabilityWindow},
            temporal::{detect_temporal, InterArrival, TemporalBaseline},
        };

        pub const ROE_FLOOR: f64 = 0.6;

        /// One unit's telemetry at a beat: (inter_arrival_s, crc, jammer RF?).
        #[derive(Clone, Copy)]
        pub struct Tel(pub f64, pub f64, pub bool);
        pub const HEALTHY: Tel = Tel(1.0, 0.002, false);

        fn library() -> Vec<FingerprintEntry> {
            let raw = include_str!("../../../../../assets/fingerprints/library.json");
            let parsed: serde_json::Value = serde_json::from_str(raw).unwrap();
            parsed["entries"]
                .as_array()
                .unwrap()
                .iter()
                .map(|e| serde_json::from_value(e.clone()).unwrap())
                .collect()
        }

        fn jammer() -> RfFingerprint {
            RfFingerprint {
                frequency_band_mhz: [100.0, 2000.0],
                hop_spread_hz: 50_000.0,
                gps_l1_overlap: true,
                gps_l2_overlap: true,
                time_domain_pattern: TimeDomainPattern::Barrage,
            }
        }

        /// Receiver classes observed degraded at the source when the jammer
        /// RF is seen (FR-04 rev dimension 6). These beats model B's link
        /// telemetry (cadence, CRC), so the UHF link class: degraded at 1:15
        /// and at 1:50 (B's GNSS recovers after the move; the link does not).
        fn observed_classes() -> BTreeSet<RxClass> {
            [RxClass::UhfComms].into()
        }

        /// comms-sim `scenarios/avdiivka.py` `UNITS` start positions for A, B
        /// and C (= apps/web SEED_TRACKS). A is ~7.0 km west of B and C
        /// ~3.4 km south-west: no neighbour inside the 500 m radius, so a
        /// lone degrading B is localized (FRS FR-03 note).
        pub fn positions() -> [(&'static str, Position); 3] {
            [
                (
                    "unit_a",
                    Position {
                        lat: 48.14449,
                        lon: 37.65077,
                    },
                ),
                (
                    "unit_b",
                    Position {
                        lat: 48.14,
                        lon: 37.745,
                    },
                ),
                (
                    "unit_c",
                    Position {
                        lat: 48.12653,
                        lon: 37.70462,
                    },
                ),
            ]
        }

        /// Run one engine tick over A, B, C telemetry. Returns [A, B, C].
        pub fn tick(units: [Tel; 3]) -> [TrustScorePayload; 3] {
            tick_at(units, positions())
        }

        /// [`tick`] at explicit positions.
        pub fn tick_at(
            units: [Tel; 3],
            pos: [(&'static str, Position); 3],
        ) -> [TrustScorePayload; 3] {
            let library = library();
            let jammer = jammer();
            let classes = observed_classes();
            let baseline = TemporalBaseline {
                mean_seconds: 1.0,
                stddev_seconds: 0.05,
            };
            let readings: Vec<_> = units
                .iter()
                .map(|&Tel(ia, crc, _)| {
                    (
                        detect_temporal(&[InterArrival { seconds: ia }], &baseline),
                        detect_stability(&StabilityWindow {
                            crc_error_rate: crc,
                            duplicate_rate: 0.0,
                            baseline_duplicate_rate: 0.0,
                        }),
                    )
                })
                .collect();
            let degrading: Vec<bool> = readings.iter().map(|(t, s)| is_degrading(t, s)).collect();
            std::array::from_fn(|i| {
                let (id, p) = pos[i];
                let neighbors: Vec<NeighborState> = (0..3)
                    .filter(|&j| j != i)
                    .map(|j| NeighborState {
                        id: pos[j].0.into(),
                        position: pos[j].1,
                        degrading: degrading[j],
                    })
                    .collect();
                let sp = classify_spatial(
                    &SourceLocation {
                        id: id.into(),
                        position: p,
                    },
                    degrading[i],
                    &neighbors,
                    500.0,
                );
                let fp = units[i]
                    .2
                    .then(|| {
                        match_fingerprint_with(
                            &jammer,
                            Dimension6::ObservedClasses(&classes),
                            &library,
                        )
                    })
                    .flatten();
                aggregate(
                    id,
                    DetectorReadings {
                        temporal: &readings[i].0,
                        stability: &readings[i].1,
                        spatial: &sp,
                        fingerprint: fp.as_ref(),
                    },
                    &AggregatorWeights::default(),
                    Utc::now(),
                )
            })
        }

        pub fn print(label: &str, abc: &[TrustScorePayload; 3]) {
            for p in abc {
                eprintln!(
                    "{label} {}: score={:.3} temporal={:.2} stability={:.2} spatial={:.2} fingerprint={:.2}",
                    p.source_id,
                    p.score,
                    p.components.temporal,
                    p.components.stability,
                    p.components.spatial,
                    p.components.fingerprint
                );
            }
        }
    }

    #[test]
    fn healthy_units_score_one() {
        use avdiivka::{tick, HEALTHY};
        for p in tick([HEALTHY; 3]) {
            assert!(
                (p.score - 1.0).abs() < 1e-12,
                "{}: {}",
                p.source_id,
                p.score
            );
            assert!((p.components.spatial - 1.0).abs() < f64::EPSILON);
        }
    }

    // B degrades alone: B is localized (0.6); A and C are NOT dragged into a
    // false "blanket" and stay at full trust.
    #[test]
    fn localized_b_leaves_a_and_c_at_full_trust() {
        use avdiivka::{tick, Tel, HEALTHY};
        let [a, b, c] = tick([HEALTHY, Tel(6.1, 0.14, true), HEALTHY]);
        assert!((b.components.spatial - 0.6).abs() < f64::EPSILON);
        for p in [&a, &c] {
            assert!(
                (p.score - 1.0).abs() < 1e-12,
                "{}: {}",
                p.source_id,
                p.score
            );
        }
    }

    // Everyone degraded within 500 m → every unit takes the blanket penalty
    // (0.3). The demo layout has km spacing, so FR-03 never sees a neighbour
    // there (FRS FR-03 note); this test keeps a 245 m N/S cluster around B.
    #[test]
    fn all_degraded_gives_blanket_penalty() {
        use avdiivka::{tick_at, Tel};
        use trust_detectors::spatial::Position;
        let at = |lat| Position { lat, lon: 37.745 };
        let cluster = [
            ("unit_a", at(48.1422)),
            ("unit_b", at(48.140)),
            ("unit_c", at(48.1378)),
        ];
        let d = Tel(1.2, 0.08, false);
        for p in tick_at([d; 3], cluster) {
            assert!((p.components.spatial - 0.3).abs() < f64::EPSILON);
        }
    }

    // Storyboard gate timing (System Design §2, Branding §10): WATCH band
    // (0.60–0.85) from 0:45, first crossing below the ROE floor when the
    // jammer lands at 1:15 (modal at 1:20), still gated at 1:50, recovered
    // (≥ 0.85) at 2:15. A and C stay at full trust throughout.
    #[test]
    fn avdiivka_beats_end_to_end() {
        use avdiivka::{print, tick, Tel, HEALTHY, ROE_FLOOR};
        const WATCH_TOP: f64 = 0.85;

        // comms-sim scenarios/avdiivka.py beat values (jitter-free).
        let watch = Tel(1.17, 0.002, false);
        let watch_crc = Tel(1.17, 0.06, false);
        let jammed = Tel(6.1, 0.14, true);
        let recovering = Tel(1.8, 0.04, true);
        let beats = [
            ("B-0:00", tick([HEALTHY, HEALTHY, HEALTHY])),
            ("B-0:45", tick([HEALTHY, watch, HEALTHY])),
            ("B-0:55", tick([HEALTHY, watch_crc, HEALTHY])),
            ("B-1:05", tick([HEALTHY, watch_crc, HEALTHY])),
            ("B-1:15", tick([HEALTHY, jammed, HEALTHY])),
            ("B-1:20", tick([HEALTHY, jammed, HEALTHY])),
            ("B-1:50", tick([HEALTHY, recovering, HEALTHY])),
            ("B-2:15", tick([HEALTHY, HEALTHY, HEALTHY])),
        ];
        for (label, abc) in &beats {
            print(label, abc);
        }
        let b = |i: usize| &beats[i].1[1];
        let score = |i: usize| b(i).score;

        // A and C stay at full trust at every beat: no false blanket.
        for (label, [a, _, c]) in &beats {
            assert!((a.score - 1.0).abs() < 1e-12, "{label} A {}", a.score);
            assert!((c.score - 1.0).abs() < 1e-12, "{label} C {}", c.score);
        }
        // 0:00 healthy.
        assert!((score(0) - 1.0).abs() < 1e-12);
        // 0:45..1:05: WATCH band, investigating, not gated. Localized.
        for (label, [_, b, _]) in &beats[1..=3] {
            assert!(
                (ROE_FLOOR..WATCH_TOP).contains(&b.score),
                "{label} B {} not in WATCH band",
                b.score
            );
            assert!((b.components.spatial - 0.6).abs() < f64::EPSILON);
            assert!((b.components.fingerprint - 1.0).abs() < f64::EPSILON);
        }
        assert!(score(1) < score(0) && score(2) < score(1));
        // 1:15: jammer lands; FIRST crossing below the floor, held at 1:20.
        assert!(b(4).components.fingerprint.abs() < 1e-10);
        assert!(score(4) < ROE_FLOOR && score(5) < ROE_FLOOR);
        let first_below = beats.iter().position(|(_, abc)| abc[1].score < ROE_FLOOR);
        assert_eq!(first_below, Some(4), "B must first cross at 1:15");
        // 1:50: recovering but still gated; 2:15: recovered.
        assert!(score(6) > score(5) && score(6) < ROE_FLOOR);
        assert!(score(7) >= WATCH_TOP);
        assert!((b(7).components.fingerprint - 1.0).abs() < f64::EPSILON);
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
