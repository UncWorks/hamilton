use serde::{Deserialize, Serialize};

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
    /// True when this neighbor is experiencing active degradation.
    pub degrading: bool,
}

/// Whether the degradation is localized to one source or blanket across neighbors.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub enum SpatialClassification {
    /// Only the target is degraded; neighbors within radius are healthy.
    Localized,
    /// At least one neighbor within radius is also degrading.
    Blanket,
}

/// Output of the spatial correlation classifier.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct SpatialResult {
    /// Localized or Blanket classification.
    pub classification: SpatialClassification,
    /// IDs of all neighbors that were within radius and evaluated.
    pub evaluated_neighbors: Vec<String>,
    /// IDs of neighbors within radius that are also degrading.
    pub degrading_neighbors: Vec<String>,
    /// Component score: Localized → 0.6, Blanket → 0.3.
    pub score: f64,
}

/// Classify spatial extent of a degradation event.
///
/// Neighbors outside `radius_m` are ignored. If any neighbor within `radius_m`
/// is degrading, the event is classified `Blanket`; otherwise `Localized`.
///
/// Score mapping per FRS §2.3:
///   Localized → 0.6
///   Blanket   → 0.3
pub fn classify_spatial(
    target: &SourceLocation,
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

    let classification = if degrading.is_empty() {
        SpatialClassification::Localized
    } else {
        SpatialClassification::Blanket
    };

    let score = match classification {
        SpatialClassification::Localized => 0.6,
        SpatialClassification::Blanket => 0.3,
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

        let result = classify_spatial(&target, &neighbors, 500.0);

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

        let result = classify_spatial(&target, &neighbors, 500.0);

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

        let result = classify_spatial(&target, &[far_neighbor], 500.0);

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
        let result = classify_spatial(&target, &[], 500.0);
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
        let result = classify_spatial(&target, &[neighbor], 500.0);
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
        let r_local = classify_spatial(&target, &[], 500.0);
        assert!((r_local.score - 0.6).abs() < f64::EPSILON);

        // Blanket case
        let degrading_neighbor = NeighborState {
            id: "N".into(),
            position: offset(&unit_b_pos(), 0.0, 10.0),
            degrading: true,
        };
        let r_blanket = classify_spatial(&target, &[degrading_neighbor], 500.0);
        assert!((r_blanket.score - 0.3).abs() < f64::EPSILON);
    }
}
