use serde::{Deserialize, Serialize};

use crate::{stability::StabilityReading, temporal::TemporalReading};

/// Default neighbour radius (FRS FR-03: "configurable radius (default 500m)").
pub const DEFAULT_RADIUS_M: f64 = 500.0;

/// Spatial trust while the target is degrading and every neighbour in radius
/// is healthy (directional / localized event).
pub const LOCALIZED_TRUST: f64 = 0.6;
/// Spatial trust while the target AND at least one neighbour in radius are
/// degrading (blanket, area-wide event).
pub const BLANKET_TRUST: f64 = 0.3;

/// Geographic position in decimal degrees.
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub struct Position {
    pub lat: f64,
    pub lon: f64,
}

/// Location of the source under evaluation.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct SourceLocation {
    pub id: String,
    pub position: Position,
}

/// State of a neighboring source, used for spatial correlation.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct NeighborState {
    pub id: String,
    pub position: Position,
    /// True when the ENGINE measured this neighbour as degrading
    /// (see [`is_degrading`]). Never the source's self-report.
    pub degrading: bool,
}

/// Spatial extent of a degradation event, if there is one.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub enum SpatialClassification {
    /// The target itself is not degrading: there is no event to localize.
    Nominal,
    /// Only the target is degraded; neighbors within radius are healthy.
    Localized,
    /// At least one neighbor within radius is also degrading.
    Blanket,
}

/// Output of the spatial correlation classifier.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct SpatialResult {
    /// Nominal, Localized or Blanket classification.
    pub classification: SpatialClassification,
    /// IDs of all neighbors that were within radius and evaluated.
    pub evaluated_neighbors: Vec<String>,
    /// IDs of neighbors within radius that are also degrading.
    pub degrading_neighbors: Vec<String>,
    /// Trust component (1.0 = healthy): Nominal → 1.0, Localized → 0.6,
    /// Blanket → 0.3.
    pub score: f64,
}

/// Engine-measured "is this source degrading?" predicate used for spatial
/// correlation. A source is degrading when its own temporal detector fires
/// (> 3σ, FR-01) or its stability detector flags degradation (CRC > 5% or
/// duplicate spike, FR-02). Derived from measurements only; the telemetry
/// contract carries no self-reported flag.
pub fn is_degrading(temporal: &TemporalReading, stability: &StabilityReading) -> bool {
    temporal.anomaly || stability.degraded
}

/// Classify the spatial extent of a degradation event (FRS FR-03) and map it
/// to a trust component.
///
/// - `target_degrading == false` → `Nominal`, score 1.0. A healthy source is
///   not penalised for where it is, nor for its neighbours' problems.
/// - target degrading, no degrading neighbour within `radius_m` → `Localized`,
///   score 0.6 (directional event near this unit).
/// - target degrading, ≥1 degrading neighbour within `radius_m` → `Blanket`,
///   score 0.3 (area-wide event, no healthy neighbour to corroborate).
///
/// Neighbors outside `radius_m` are ignored.
pub fn classify_spatial(
    target: &SourceLocation,
    target_degrading: bool,
    neighbors: &[NeighborState],
    radius_m: f64,
) -> SpatialResult {
    let mut evaluated = Vec::new();
    let mut degrading = Vec::new();

    for neighbor in neighbors {
        let dist = haversine_m(&target.position, &neighbor.position);
        if dist <= radius_m {
            evaluated.push(neighbor.id.clone());
            if neighbor.degrading {
                degrading.push(neighbor.id.clone());
            }
        }
    }

    let classification = if !target_degrading {
        SpatialClassification::Nominal
    } else if degrading.is_empty() {
        SpatialClassification::Localized
    } else {
        SpatialClassification::Blanket
    };

    let score = match classification {
        SpatialClassification::Nominal => 1.0,
        SpatialClassification::Localized => LOCALIZED_TRUST,
        SpatialClassification::Blanket => BLANKET_TRUST,
    };

    SpatialResult {
        classification,
        evaluated_neighbors: evaluated,
        degrading_neighbors: degrading,
        score,
    }
}

/// Haversine distance in metres between two WGS-84 positions.
fn haversine_m(a: &Position, b: &Position) -> f64 {
    const R: f64 = 6_371_000.0;
    let lat1 = a.lat.to_radians();
    let lat2 = b.lat.to_radians();
    let dlat = (b.lat - a.lat).to_radians();
    let dlon = (b.lon - a.lon).to_radians();
    let h = (dlat / 2.0).sin().powi(2) + lat1.cos() * lat2.cos() * (dlon / 2.0).sin().powi(2);
    2.0 * R * h.sqrt().asin()
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Produce a position offset from `base` by approximately `dx_m` east and `dy_m` north.
    fn offset(base: &Position, dy_m: f64, dx_m: f64) -> Position {
        let lat = base.lat + dy_m / 111_319.9;
        let lon = base.lon + dx_m / (111_319.9 * base.lat.to_radians().cos());
        Position { lat, lon }
    }

    fn unit_b_pos() -> Position {
        Position {
            lat: 48.0,
            lon: 37.0,
        }
    }

    // FRS §2.3 acceptance: Unit B degraded; A and C at 240m within 500m → Localized
    #[test]
    fn frs_acceptance_healthy_neighbors_localized() {
        let target = SourceLocation {
            id: "B".into(),
            position: unit_b_pos(),
        };
        let neighbors = vec![
            NeighborState {
                id: "A".into(),
                position: offset(&unit_b_pos(), 0.0, 240.0),
                degrading: false,
            },
            NeighborState {
                id: "C".into(),
                position: offset(&unit_b_pos(), 0.0, -240.0),
                degrading: false,
            },
        ];

        let result = classify_spatial(&target, true, &neighbors, 500.0);

        assert_eq!(result.classification, SpatialClassification::Localized);
        assert!(result.evaluated_neighbors.contains(&"A".to_string()));
        assert!(result.evaluated_neighbors.contains(&"C".to_string()));
        assert!(result.degrading_neighbors.is_empty());
        assert!((result.score - 0.6).abs() < f64::EPSILON);
    }

    // At least one degrading neighbor → Blanket
    #[test]
    fn one_degrading_neighbor_within_radius_gives_blanket() {
        let target = SourceLocation {
            id: "B".into(),
            position: unit_b_pos(),
        };
        let neighbors = vec![
            NeighborState {
                id: "A".into(),
                position: offset(&unit_b_pos(), 0.0, 240.0),
                degrading: true,
            },
            NeighborState {
                id: "C".into(),
                position: offset(&unit_b_pos(), 0.0, -240.0),
                degrading: false,
            },
        ];

        let result = classify_spatial(&target, true, &neighbors, 500.0);

        assert_eq!(result.classification, SpatialClassification::Blanket);
        assert!((result.score - 0.3).abs() < f64::EPSILON);
        assert!(result.degrading_neighbors.contains(&"A".to_string()));
    }

    // Neighbor beyond radius is excluded even if degrading
    #[test]
    fn neighbor_beyond_radius_is_excluded() {
        let target = SourceLocation {
            id: "B".into(),
            position: unit_b_pos(),
        };
        let far_neighbor = NeighborState {
            id: "D".into(),
            position: offset(&unit_b_pos(), 0.0, 600.0),
            degrading: true,
        };

        let result = classify_spatial(&target, true, &[far_neighbor], 500.0);

        assert_eq!(result.classification, SpatialClassification::Localized);
        assert!(
            result.evaluated_neighbors.is_empty(),
            "D should be excluded"
        );
    }

    // Empty neighbor list → Localized (nothing to correlate with)
    #[test]
    fn empty_neighbors_gives_localized() {
        let target = SourceLocation {
            id: "B".into(),
            position: unit_b_pos(),
        };
        let result = classify_spatial(&target, true, &[], 500.0);
        assert_eq!(result.classification, SpatialClassification::Localized);
        assert!((result.score - 0.6).abs() < f64::EPSILON);
    }

    // Neighbor at exactly the radius boundary is included
    #[test]
    fn neighbor_at_exact_radius_is_included() {
        let target = SourceLocation {
            id: "B".into(),
            position: unit_b_pos(),
        };
        // Place neighbor precisely 500m east
        let neighbor = NeighborState {
            id: "E".into(),
            position: offset(&unit_b_pos(), 0.0, 500.0),
            degrading: false,
        };
        let result = classify_spatial(&target, true, &[neighbor], 500.0);
        // Should be included (dist ≤ radius)
        assert!(!result.evaluated_neighbors.is_empty());
    }

    // Score values match spec exactly
    #[test]
    fn scores_match_spec_values() {
        let target = SourceLocation {
            id: "T".into(),
            position: unit_b_pos(),
        };

        // Localized case
        let r_local = classify_spatial(&target, true, &[], 500.0);
        assert!((r_local.score - 0.6).abs() < f64::EPSILON);

        // Blanket case
        let degrading_neighbor = NeighborState {
            id: "N".into(),
            position: offset(&unit_b_pos(), 0.0, 10.0),
            degrading: true,
        };
        let r_blanket = classify_spatial(&target, true, &[degrading_neighbor], 500.0);
        assert!((r_blanket.score - 0.3).abs() < f64::EPSILON);
    }

    fn neighbors_a_c(a_degrading: bool, c_degrading: bool) -> Vec<NeighborState> {
        vec![
            NeighborState {
                id: "A".into(),
                position: offset(&unit_b_pos(), 245.0, 0.0),
                degrading: a_degrading,
            },
            NeighborState {
                id: "C".into(),
                position: offset(&unit_b_pos(), -245.0, 0.0),
                degrading: c_degrading,
            },
        ]
    }

    // A healthy source scores full spatial trust, whatever its neighbours do.
    #[test]
    fn healthy_target_is_nominal_with_full_trust() {
        let target = SourceLocation {
            id: "B".into(),
            position: unit_b_pos(),
        };
        for (a, c) in [(false, false), (true, false), (true, true)] {
            let r = classify_spatial(&target, false, &neighbors_a_c(a, c), 500.0);
            assert_eq!(r.classification, SpatialClassification::Nominal);
            assert!((r.score - 1.0).abs() < f64::EPSILON);
        }
    }

    // Regression: B degrading must not drag healthy A to "blanket". A is the
    // target here, B its degrading neighbour.
    #[test]
    fn healthy_neighbor_of_degrading_source_stays_at_full_trust() {
        let a = SourceLocation {
            id: "A".into(),
            position: offset(&unit_b_pos(), 245.0, 0.0),
        };
        let b = NeighborState {
            id: "B".into(),
            position: unit_b_pos(),
            degrading: true,
        };
        let r = classify_spatial(&a, false, &[b], 500.0);
        assert_eq!(r.classification, SpatialClassification::Nominal);
        assert!((r.score - 1.0).abs() < f64::EPSILON);
        assert_eq!(r.degrading_neighbors, vec!["B".to_string()]);
    }

    // Everyone degrading → blanket penalty, stronger than localized.
    #[test]
    fn all_degraded_gives_blanket_penalty() {
        let target = SourceLocation {
            id: "B".into(),
            position: unit_b_pos(),
        };
        let r = classify_spatial(&target, true, &neighbors_a_c(true, true), 500.0);
        assert_eq!(r.classification, SpatialClassification::Blanket);
        assert!((r.score - BLANKET_TRUST).abs() < f64::EPSILON);
        const { assert!(BLANKET_TRUST < LOCALIZED_TRUST) };
    }

    // The radius is a parameter: shrink it below the A/C spacing and B's
    // event becomes localized even with degrading neighbours.
    #[test]
    fn radius_is_configurable() {
        let target = SourceLocation {
            id: "B".into(),
            position: unit_b_pos(),
        };
        let wide = classify_spatial(&target, true, &neighbors_a_c(true, true), 500.0);
        let narrow = classify_spatial(&target, true, &neighbors_a_c(true, true), 200.0);
        assert_eq!(wide.classification, SpatialClassification::Blanket);
        assert_eq!(narrow.classification, SpatialClassification::Localized);
    }

    #[test]
    fn is_degrading_uses_measured_detectors() {
        use crate::stability::{detect_stability, StabilityWindow};
        use crate::temporal::{detect_temporal, InterArrival, TemporalBaseline};
        let base = TemporalBaseline {
            mean_seconds: 1.0,
            stddev_seconds: 0.05,
        };
        let healthy_s = detect_stability(&StabilityWindow {
            crc_error_rate: 0.002,
            duplicate_rate: 0.0,
            baseline_duplicate_rate: 0.0,
        });
        let faulty_s = detect_stability(&StabilityWindow {
            crc_error_rate: 0.14,
            duplicate_rate: 0.0,
            baseline_duplicate_rate: 0.0,
        });
        let healthy_t = detect_temporal(&[InterArrival { seconds: 1.01 }], &base);
        let slow_t = detect_temporal(&[InterArrival { seconds: 6.1 }], &base);
        assert!(!is_degrading(&healthy_t, &healthy_s));
        assert!(is_degrading(&slow_t, &healthy_s));
        assert!(is_degrading(&healthy_t, &faulty_s));
    }
}
