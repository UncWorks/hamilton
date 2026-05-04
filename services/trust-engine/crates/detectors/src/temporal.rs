use serde::{Deserialize, Serialize};

/// A single observed inter-arrival interval in seconds.
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub struct InterArrival {
    pub seconds: f64,
}

/// Baseline cadence statistics derived from the historical message stream.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct TemporalBaseline {
    pub mean_seconds: f64,
    pub stddev_seconds: f64,
}

/// Output of the temporal anomaly detector.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct TemporalReading {
    /// Observed latest inter-arrival in seconds (for LLM narrator FR-08).
    pub latest_seconds: f64,
    /// How many standard deviations above baseline the latest reading is.
    pub sigma_deviation: f64,
    /// True when latest exceeds 3σ above mean.
    pub anomaly: bool,
    /// Health score in [0.0, 1.0]: 1.0 within 1σ, 0.0 at >=6σ, linear between.
    pub score: f64,
}

/// Detect temporal anomaly given a slice of inter-arrival samples and a baseline.
///
/// Score mapping per FRS §2.1:
///   sigma_deviation <= 1 → score = 1.0
///   sigma_deviation >= 6 → score = 0.0
///   otherwise            → linear interpolation over [1, 6] → [1.0, 0.0]
pub fn detect_temporal(samples: &[InterArrival], baseline: &TemporalBaseline) -> TemporalReading {
    let latest = match samples.last() {
        Some(s) => s.seconds,
        None => baseline.mean_seconds,
    };

    let sigma_deviation = if baseline.stddev_seconds > 0.0 {
        (latest - baseline.mean_seconds) / baseline.stddev_seconds
    } else {
        0.0
    };

    let anomaly = sigma_deviation > 3.0;
    let score = compute_score(sigma_deviation);

    TemporalReading {
        latest_seconds: latest,
        sigma_deviation,
        anomaly,
        score,
    }
}

fn compute_score(sigma_deviation: f64) -> f64 {
    const SIGMA_FULL: f64 = 1.0;
    const SIGMA_ZERO: f64 = 6.0;

    if sigma_deviation <= SIGMA_FULL {
        1.0
    } else if sigma_deviation >= SIGMA_ZERO {
        0.0
    } else {
        // Linear interpolation: 1.0 at SIGMA_FULL, 0.0 at SIGMA_ZERO
        1.0 - (sigma_deviation - SIGMA_FULL) / (SIGMA_ZERO - SIGMA_FULL)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn baseline_1s() -> TemporalBaseline {
        TemporalBaseline {
            mean_seconds: 1.0,
            stddev_seconds: 0.05,
        }
    }

    // FRS §2.1 acceptance test: 6.1s with baseline ~1.0s (stddev 0.05) → anomaly fires
    #[test]
    fn frs_acceptance_6_1s_fires_anomaly() {
        let samples = vec![
            InterArrival { seconds: 1.0 },
            InterArrival { seconds: 1.02 },
            InterArrival { seconds: 6.1 },
        ];
        let reading = detect_temporal(&samples, &baseline_1s());

        assert!(reading.anomaly, "expected anomaly to fire at 6.1s");
        assert!(reading.score < 1.0, "degraded score expected");
        assert!((reading.latest_seconds - 6.1).abs() < f64::EPSILON);
        // sigma = (6.1 - 1.0) / 0.05 = 102.0 → well above 3σ
        assert!(reading.sigma_deviation > 3.0);
    }

    // Score is exactly 1.0 when at mean (0σ deviation)
    #[test]
    fn score_is_one_at_nominal() {
        let samples = vec![InterArrival { seconds: 1.0 }];
        let reading = detect_temporal(&samples, &baseline_1s());
        assert!(!reading.anomaly);
        assert!((reading.score - 1.0).abs() < 1e-10);
    }

    // Score is exactly 1.0 at exactly 1σ
    #[test]
    fn score_is_one_at_one_sigma() {
        // 1σ = mean + 1 * stddev = 1.0 + 0.05 = 1.05
        let samples = vec![InterArrival { seconds: 1.05 }];
        let reading = detect_temporal(&samples, &baseline_1s());
        assert!(!reading.anomaly);
        assert!((reading.score - 1.0).abs() < 1e-10);
    }

    // Score is exactly 0.0 at exactly 6σ
    #[test]
    fn score_is_zero_at_six_sigma() {
        // 6σ = 1.0 + 6 * 0.05 = 1.3
        let samples = vec![InterArrival { seconds: 1.3 }];
        let reading = detect_temporal(&samples, &baseline_1s());
        assert!((reading.score - 0.0).abs() < 1e-10);
    }

    // Score is strictly monotone decreasing as sigma grows
    #[test]
    fn score_is_monotone_decreasing_with_sigma() {
        let deviations_s = [1.0_f64, 1.1, 1.2, 1.5, 2.0, 4.0, 6.0, 7.0];
        let scores: Vec<f64> = deviations_s
            .iter()
            .map(|&s| {
                let reading = detect_temporal(
                    &[InterArrival { seconds: s }],
                    &TemporalBaseline {
                        mean_seconds: 0.0,
                        stddev_seconds: 1.0,
                    },
                );
                reading.score
            })
            .collect();

        for window in scores.windows(2) {
            assert!(
                window[0] >= window[1],
                "expected monotone: {} >= {}",
                window[0],
                window[1]
            );
        }
    }

    // Empty sample slice → no anomaly, score 1.0 (fall back to baseline mean)
    #[test]
    fn empty_samples_returns_nominal() {
        let reading = detect_temporal(&[], &baseline_1s());
        assert!(!reading.anomaly);
        assert!((reading.score - 1.0).abs() < 1e-10);
    }

    // Anomaly boundary: exactly 3σ is NOT an anomaly (must exceed 3σ)
    #[test]
    fn exactly_three_sigma_is_not_anomaly() {
        // 3σ = 1.0 + 3 * 0.05 = 1.15
        let samples = vec![InterArrival { seconds: 1.15 }];
        let reading = detect_temporal(&samples, &baseline_1s());
        assert!(
            !reading.anomaly,
            "exactly 3σ should not fire; sigma={}",
            reading.sigma_deviation
        );
    }

    // Just above 3σ is an anomaly
    #[test]
    fn just_above_three_sigma_is_anomaly() {
        // 3.001σ ≈ 1.0 + 3.001 * 0.05 = 1.15005
        let samples = vec![InterArrival { seconds: 1.15005 }];
        let reading = detect_temporal(&samples, &baseline_1s());
        assert!(reading.anomaly, "sigma={}", reading.sigma_deviation);
    }

    // Zero stddev baseline: no division by zero; deviation treated as 0
    #[test]
    fn zero_stddev_baseline_does_not_panic() {
        let baseline = TemporalBaseline {
            mean_seconds: 1.0,
            stddev_seconds: 0.0,
        };
        let samples = vec![InterArrival { seconds: 999.0 }];
        let reading = detect_temporal(&samples, &baseline);
        // sigma_deviation clipped to 0 → no anomaly, score 1.0
        assert!(!reading.anomaly);
        assert!((reading.score - 1.0).abs() < 1e-10);
    }
}
