//! Hamilton MQTT contracts (Rust mirror of @hamilton/contracts).
//!
//! Wire format must match `packages/contracts/src/*` exactly. The MQTT broker
//! is the architectural boundary (System Design §5); divergence here breaks
//! every consumer.

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

pub mod topics {
    pub const TRUST_PREFIX: &str = "integrity/trust";
    pub const FINGERPRINT_CANDIDATES: &str = "integrity/fingerprint/candidates";
    pub const NARRATION_PREFIX: &str = "integrity/narration";
    pub const TELEMETRY_PREFIX: &str = "telemetry";

    pub fn trust(source_id: &str) -> String {
        format!("{TRUST_PREFIX}/{source_id}")
    }

    pub fn narration(source_id: &str) -> String {
        format!("{NARRATION_PREFIX}/{source_id}")
    }

    pub fn telemetry(source_id: &str) -> String {
        format!("{TELEMETRY_PREFIX}/{source_id}/raw")
    }
}

/// Per-detector breakdown that feeds the LLM narrator (FR-08). Each component
/// is in `[0.0, 1.0]`.
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub struct TrustComponents {
    pub temporal: f64,
    pub stability: f64,
    pub spatial: f64,
    pub fingerprint: f64,
}

/// Continuous trust score per source (FR-05). Published on
/// `integrity/trust/{source_id}` at >=1Hz.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TrustScorePayload {
    pub source_id: String,
    pub score: f64,
    pub components: TrustComponents,
    pub timestamp: DateTime<Utc>,
}

/// One ranked candidate jamming method (FR-04a). `score` is a deterministic
/// overlap ratio (matched threshold booleans / total dimensions). Not a
/// probability, not a model output.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FingerprintCandidate {
    pub method_id: String,
    pub named_systems: Vec<String>,
    pub score: f64,
    pub munitions_affected: Vec<String>,
    pub source_citation: String,
}

/// Top-3 candidates payload (FR-04a). Always padded to 3 with score-0
/// entries if matcher returns fewer (System Design §5.2).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FingerprintCandidatesPayload {
    pub source_id: String,
    pub candidates: Vec<FingerprintCandidate>,
    pub timestamp: DateTime<Utc>,
}

/// One row of the after-action log. Persisted to DuckDB, streamed to the
/// event terminal in the COP.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DetectionEvent {
    pub source_id: String,
    pub kind: DetectionKind,
    pub message: String,
    pub values: Option<serde_json::Value>,
    pub timestamp: DateTime<Utc>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum DetectionKind {
    TemporalAnomaly,
    Stability,
    Spatial,
    Fingerprint,
    ModalGated,
    ModalSelection,
    Recovery,
}

/// Three concrete options shown in the kill-chain modal at Beat 1:20
/// (URS UR-07). Validated as an enum to reject garbage strings at the
/// request boundary.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ModalOption {
    Delay60s,
    ShiftNonGps,
    ConfirmAltChannel,
}

/// Wire shape that the comms simulator (Phase 2) publishes on
/// `telemetry/{source_id}/raw`. The Rust trust engine subscribes; the Python
/// publisher must mirror this struct field-for-field. `deny_unknown_fields`
/// catches drift early.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct TelemetryPayload {
    pub source_id: String,
    pub inter_arrival_seconds: f64,
    pub crc_error_rate: f64,
    pub duplicate_rate: f64,
    #[serde(default)]
    pub rf: Option<RfObservation>,
    #[serde(default)]
    pub degrading: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct RfObservation {
    pub frequency_band_mhz: [f64; 2],
    pub hop_spread_hz: f64,
    pub gps_l1_overlap: bool,
    pub gps_l2_overlap: bool,
    pub time_domain_pattern: TimeDomainPattern,
    pub effective_range_km: f64,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum TimeDomainPattern {
    Continuous,
    Pulsed,
    Barrage,
    Swept,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn trust_score_payload_roundtrips_through_json() {
        let payload = TrustScorePayload {
            source_id: "unit_b".into(),
            score: 0.42,
            components: TrustComponents {
                temporal: 0.65,
                stability: 0.31,
                spatial: 0.78,
                fingerprint: 0.19,
            },
            timestamp: "2026-05-03T18:42:14.221Z".parse().unwrap(),
        };
        let json = serde_json::to_string(&payload).unwrap();
        let back: TrustScorePayload = serde_json::from_str(&json).unwrap();
        assert_eq!(back.source_id, "unit_b");
        assert!((back.score - 0.42).abs() < f64::EPSILON);
    }

    #[test]
    fn topic_helpers_match_typescript_format() {
        assert_eq!(topics::trust("unit_b"), "integrity/trust/unit_b");
        assert_eq!(topics::narration("unit_b"), "integrity/narration/unit_b");
        assert_eq!(topics::telemetry("unit_b"), "telemetry/unit_b/raw");
    }
}
