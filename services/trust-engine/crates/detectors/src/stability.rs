use serde::{Deserialize, Serialize};

/// Rolling-window statistics fed to the stability detector.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct StabilityWindow {
    /// CRC error rate as a fraction in [0.0, 1.0].
    pub crc_error_rate: f64,
    /// Observed duplicate-frame rate as a fraction in [0.0, 1.0].
    pub duplicate_rate: f64,
    /// Expected baseline duplicate-frame rate (historical normal).
    pub baseline_duplicate_rate: f64,
}

/// Output of the network-stability detector.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct StabilityReading {
    /// CRC error rate at detection time (for LLM narrator FR-08, e.g. "14% corrupted frames").
    pub crc_error_rate: f64,
    /// Duplicate-frame rate at detection time.
    pub duplicate_rate: f64,
    /// True when CRC exceeds 5% OR duplicate rate exceeds 2× baseline.
    pub degraded: bool,
    /// Health score in [0.0, 1.0]: 1.0 at CRC ≤ 0.5%, 0.0 at CRC ≥ 20%, linear between.
    pub score: f64,
}

const CRC_THRESHOLD: f64 = 0.05;
const CRC_SCORE_FULL: f64 = 0.005;
const CRC_SCORE_ZERO: f64 = 0.20;
const DUPLICATE_RATE_MULTIPLIER: f64 = 2.0;

/// Detect network-stability degradation.
///
/// Score mapping per FRS §2.2:
///   CRC ≤ 0.5%  → score = 1.0
///   CRC ≥ 20%   → score = 0.0
///   otherwise   → linear interpolation
///
/// The score is driven entirely by CRC error rate for determinism. Duplicate-rate
/// only gates the `degraded` flag; it does not shift the score independently
/// (keeping the detector a pure function with a single numeric output axis).
pub fn detect_stability(window: &StabilityWindow) -> StabilityReading {
    let crc_degraded = window.crc_error_rate > CRC_THRESHOLD;
    let dup_degraded = window.baseline_duplicate_rate > 0.0
        && window.duplicate_rate > DUPLICATE_RATE_MULTIPLIER * window.baseline_duplicate_rate;

    let degraded = crc_degraded || dup_degraded;
    let score = compute_score(window.crc_error_rate);

    StabilityReading {
        crc_error_rate: window.crc_error_rate,
        duplicate_rate: window.duplicate_rate,
        degraded,
        score,
    }
}

fn compute_score(crc_rate: f64) -> f64 {
    if crc_rate <= CRC_SCORE_FULL {
        1.0
    } else if crc_rate >= CRC_SCORE_ZERO {
        0.0
    } else {
        1.0 - (crc_rate - CRC_SCORE_FULL) / (CRC_SCORE_ZERO - CRC_SCORE_FULL)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    // FRS §2.2 acceptance: CRC rises 0.2% → 14% → score drops, degraded fires
    #[test]
    fn frs_acceptance_crc_14_percent_triggers_degradation() {
        let window_before = StabilityWindow {
            crc_error_rate: 0.002,
            duplicate_rate: 0.01,
            baseline_duplicate_rate: 0.01,
        };
        let window_after = StabilityWindow {
            crc_error_rate: 0.14,
            duplicate_rate: 0.01,
            baseline_duplicate_rate: 0.01,
        };

        let before = detect_stability(&window_before);
        let after = detect_stability(&window_after);

        assert!(!before.degraded, "0.2% CRC should not trigger degradation");
        assert!(after.degraded, "14% CRC must trigger degradation");
        assert!(after.score < before.score, "score must drop as CRC rises");
        assert!((after.crc_error_rate - 0.14).abs() < f64::EPSILON);
    }

    // Score is exactly 1.0 at CRC = 0.5%
    #[test]
    fn score_is_one_at_crc_half_percent() {
        let window = StabilityWindow {
            crc_error_rate: 0.005,
            duplicate_rate: 0.0,
            baseline_duplicate_rate: 0.0,
        };
        let reading = detect_stability(&window);
        assert!((reading.score - 1.0).abs() < 1e-10);
    }

    // Score is exactly 0.0 at CRC = 20%
    #[test]
    fn score_is_zero_at_crc_twenty_percent() {
        let window = StabilityWindow {
            crc_error_rate: 0.20,
            duplicate_rate: 0.0,
            baseline_duplicate_rate: 0.0,
        };
        let reading = detect_stability(&window);
        assert!((reading.score - 0.0).abs() < 1e-10);
    }

    // Score monotone: higher CRC → strictly lower score
    #[test]
    fn score_monotone_decreasing_with_crc() {
        let rates = [0.0, 0.005, 0.01, 0.05, 0.10, 0.14, 0.20, 0.30];
        let scores: Vec<f64> = rates
            .iter()
            .map(|&r| {
                detect_stability(&StabilityWindow {
                    crc_error_rate: r,
                    duplicate_rate: 0.0,
                    baseline_duplicate_rate: 0.0,
                })
                .score
            })
            .collect();

        for window in scores.windows(2) {
            assert!(
                window[0] >= window[1],
                "expected monotone: {:.4} >= {:.4}",
                window[0],
                window[1]
            );
        }
    }

    // Duplicate-rate spike alone triggers degraded flag (CRC remains low)
    #[test]
    fn duplicate_rate_spike_triggers_degraded_flag() {
        let window = StabilityWindow {
            crc_error_rate: 0.001,
            duplicate_rate: 0.10,
            baseline_duplicate_rate: 0.02,
        };
        let reading = detect_stability(&window);
        // 0.10 > 2 × 0.02 = 0.04 → dup degraded
        assert!(reading.degraded, "dup spike should flag degraded");
    }

    // Duplicate rate exactly at 2× baseline does not trigger (must exceed)
    #[test]
    fn duplicate_rate_at_exactly_two_x_not_degraded() {
        let window = StabilityWindow {
            crc_error_rate: 0.001,
            duplicate_rate: 0.04,
            baseline_duplicate_rate: 0.02,
        };
        let reading = detect_stability(&window);
        assert!(!reading.degraded, "exactly 2x baseline should not fire");
    }

    // CRC boundary: exactly 5% is not degraded
    #[test]
    fn crc_at_exactly_five_percent_not_degraded() {
        let window = StabilityWindow {
            crc_error_rate: 0.05,
            duplicate_rate: 0.0,
            baseline_duplicate_rate: 0.0,
        };
        let reading = detect_stability(&window);
        assert!(!reading.degraded, "exactly 5% CRC should not fire");
    }

    // CRC just above 5% is degraded
    #[test]
    fn crc_just_above_five_percent_is_degraded() {
        let window = StabilityWindow {
            crc_error_rate: 0.0501,
            duplicate_rate: 0.0,
            baseline_duplicate_rate: 0.0,
        };
        let reading = detect_stability(&window);
        assert!(reading.degraded, "CRC 5.01% should fire degraded");
    }

    // Zero baseline duplicate rate: dup-rate branch skips to avoid div-by-zero
    #[test]
    fn zero_baseline_duplicate_rate_does_not_trigger_dup_flag() {
        let window = StabilityWindow {
            crc_error_rate: 0.001,
            duplicate_rate: 0.99,
            baseline_duplicate_rate: 0.0,
        };
        let reading = detect_stability(&window);
        // dup branch skipped because baseline is 0
        assert!(!reading.degraded);
    }
}
