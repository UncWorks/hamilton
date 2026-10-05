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
    /// Jammer AoE estimate (FR-04b, System Design §5.4): retained, QoS 1.
    /// Retire = an empty retained payload on this topic.
    pub const EMITTER_ESTIMATE: &str = "integrity/emitter/estimate";

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
/// is a trust value in `[0.0, 1.0]` where 1.0 = healthy, 0.0 = bad.
///
/// `fingerprint` is fingerprint TRUST = `1 - match_strength` of the best
/// library match (>= 0.5 threshold), or 1.0 when nothing matches. It is the
/// inverse of the FR-04a candidate `score`, which is match strength.
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
    /// Last reported source position (WGS-84 decimal degrees), echoed from
    /// telemetry so the COP need not hard-code positions. Optional on the wire.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub lat: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub lon: Option<f64>,
}

/// One ranked candidate jamming method (FR-04a). `score` is match strength: a
/// deterministic overlap ratio (matched threshold booleans / total dimensions,
/// so k/6), higher = more like this jammer. Not a probability, not a model
/// output, and not a trust value (see `TrustComponents::fingerprint`).
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
    /// An FDC branch choice on a fire mission (`POST /api/missions/decision`).
    /// Logs written before the rename stored it as `modal_selection`.
    #[serde(alias = "modal_selection")]
    MissionDecision,
    Recovery,
    /// Jammer AoE estimate opened / updated / stale / retired (HS-24).
    EmitterEstimate,
}

/// The FDC branches the engine logs (`POST /api/missions/decision`): [1]
/// shift to a non-GPS round, [2] confirm via an alternate channel, [3] AT MY
/// COMMAND re-rate. Validated as an enum to reject garbage strings at the
/// request boundary.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum BranchOption {
    Delay60s,
    ShiftNonGps,
    ConfirmAltChannel,
}

/// Wire shape that the comms simulator (Phase 2) publishes on
/// `telemetry/{source_id}/raw`. The Rust trust engine subscribes; the Python
/// publisher must mirror this struct field-for-field. `deny_unknown_fields`
/// catches drift early.
///
/// `lat`/`lon` are the source's reported position (WGS-84 decimal degrees),
/// required: the spatial discriminator (FR-03) needs real positions.
/// There is deliberately no self-reported `degrading` flag: the engine
/// derives degradation from its own detectors.
///
/// telemetry/2 (plan `jammer-aoe.md` §3.1) adds three optional fields,
/// `schema` (absent = v1), `rx_class` and `gnss_fix`. v1 payloads still parse.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct TelemetryPayload {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub schema: Option<TelemetrySchema>,
    pub source_id: String,
    pub lat: f64,
    pub lon: f64,
    pub inter_arrival_seconds: f64,
    pub crc_error_rate: f64,
    pub duplicate_rate: f64,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub rx_class: Option<RxClass>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub gnss_fix: Option<GnssFix>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub rf: Option<RfObservation>,
}

/// The telemetry `schema` tag. Only `"telemetry/2"` exists; v1 omits the field.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum TelemetrySchema {
    #[serde(rename = "telemetry/2")]
    V2,
}

/// Receiver class of a reporting unit. The AoE MVP estimates and publishes
/// `GnssCivil` and `GnssMil` only; the others are reserved.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, PartialOrd, Ord, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum RxClass {
    GnssCivil,
    GnssMil,
    GnssMilCrpa,
    UhfComms,
    FpvLink,
}

impl RxClass {
    pub fn is_gnss(self) -> bool {
        matches!(
            self,
            RxClass::GnssCivil | RxClass::GnssMil | RxClass::GnssMilCrpa
        )
    }
}

/// GNSS fix state reported by the unit. GNSS-class AoE evidence (condition
/// K2): `ThreeD` = healthy, `TwoD` / `NoFix` = degraded. Never derived from the
/// FR-01 / FR-02 link verdict.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum GnssFix {
    #[serde(rename = "3d")]
    ThreeD,
    #[serde(rename = "2d")]
    TwoD,
    #[serde(rename = "none")]
    NoFix,
}

impl GnssFix {
    pub fn is_degraded(self) -> bool {
        !matches!(self, GnssFix::ThreeD)
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct RfObservation {
    pub frequency_band_mhz: [f64; 2],
    pub hop_spread_hz: f64,
    pub gps_l1_overlap: bool,
    pub gps_l2_overlap: bool,
    pub time_domain_pattern: TimeDomainPattern,
    /// Deprecated since telemetry/2 (FRS FR-04 rev): not observable by a
    /// friendly receiver, never sent by the simulator. v1 payloads that carry
    /// it still parse.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub effective_range_km: Option<f64>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum TimeDomainPattern {
    Continuous,
    Pulsed,
    Barrage,
    Swept,
}

// ---------------------------------------------------------------------------
// integrity/emitter/estimate (plan jammer-aoe.md §3.2, System Design §5.4)
// ---------------------------------------------------------------------------

/// Schema tag value of the MVP estimate.
pub const EMITTER_ESTIMATE_SCHEMA: &str = "emitter-estimate/1";

/// Wire-size budget (F7): a serialized estimate must stay <= 7168 B, under the
/// broker's 8192 B `message_size_limit`. Coordinates at 5 dp, rings <= 64
/// vertices.
pub const EMITTER_ESTIMATE_MAX_BYTES: usize = 7168;

/// Maximum vertices per ring (Douglas–Peucker target, F7).
pub const EMITTER_ESTIMATE_MAX_RING_VERTICES: usize = 64;

/// The jammer area-of-effect estimate, published retained on
/// [`topics::EMITTER_ESTIMATE`]. Mirrors `EmitterEstimatePayloadSchema`
/// (zod, strict).
///
/// Every struct is `deny_unknown_fields`, so a payload carrying
/// `emitter.mode`, `bearings_used`, `ref_link_km`, `footprint_radius_km` or
/// `area50_km2` is rejected (condition K4, HS-20). Retire = an EMPTY retained
/// payload, not a payload with `state: retired`.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct EmitterEstimatePayload {
    pub schema: EstimateSchema,
    /// Stable per episode, e.g. `"J1-20240215T184236Z"`.
    pub estimate_id: String,
    pub state: EstimateState,
    pub method_id: String,
    #[serde(deserialize_with = "de_unit_interval")]
    pub method_match: f64,
    pub method_ambiguous: bool,
    pub model: EstimateModel,
    pub aoe: Vec<AoeLayer>,
    pub emitter: EmitterRegion,
    pub evidence: Vec<EvidenceItem>,
    pub evidence_hash: String,
    /// From the input tick time (determinism).
    pub computed_at: DateTime<Utc>,
    /// `computed_at` + 20 s (two missed 10 s heartbeats).
    pub valid_until: DateTime<Utc>,
}

/// The estimate `schema` tag. Only `"emitter-estimate/1"` exists in the MVP.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum EstimateSchema {
    #[serde(rename = "emitter-estimate/1")]
    V1,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum EstimateState {
    Active,
    Stale,
    Unbounded,
    Retired,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct EstimateModel {
    pub kind: EstimateModelKind,
    pub propagation: PropagationModel,
    pub grid_m: f64,
    pub hypotheses: EstimateHypotheses,
    pub sigma_db: f64,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum EstimateModelKind {
    Set,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum PropagationModel {
    TwoRay,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct EstimateHypotheses {
    pub erp_dbm: Vec<f64>,
    pub mast_m: Vec<f64>,
}

/// AoE of one receiver class.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct AoeLayer {
    pub rx_class: RxClass,
    pub contours: Vec<AoeContour>,
    pub radius_km_range: [f64; 2],
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct AoeContour {
    /// Contour level: exactly 0.5 or 0.9 (zod `z.literal(0.5) | z.literal(0.9)`).
    #[serde(deserialize_with = "de_contour_level")]
    pub p: f64,
    pub polygon: MultiPolygon,
    pub area_km2: f64,
}

/// The 90% emitter region, as data only. No `mode` (K4).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct EmitterRegion {
    pub region90: MultiPolygon,
    pub area90_km2: f64,
    pub erp_dbm_range: [f64; 2],
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct EvidenceItem {
    pub source_id: String,
    pub state: EvidenceState,
    pub rx_class: RxClass,
    pub age_s: f64,
    pub lat: f64,
    pub lon: f64,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum EvidenceState {
    Degraded,
    Healthy,
}

/// GeoJSON MultiPolygon: polygons → rings (outer first, then holes) →
/// `[lon, lat]`.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct MultiPolygon {
    pub r#type: MultiPolygonType,
    pub coordinates: Vec<Vec<Vec<[f64; 2]>>>,
}

impl MultiPolygon {
    pub fn new(coordinates: Vec<Vec<Vec<[f64; 2]>>>) -> Self {
        Self {
            r#type: MultiPolygonType::MultiPolygon,
            coordinates,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum MultiPolygonType {
    MultiPolygon,
}

fn de_contour_level<'de, D: serde::Deserializer<'de>>(d: D) -> Result<f64, D::Error> {
    let p = f64::deserialize(d)?;
    if p == 0.5 || p == 0.9 {
        Ok(p)
    } else {
        Err(serde::de::Error::custom(format!(
            "contour level must be 0.5 or 0.9, got {p}"
        )))
    }
}

fn de_unit_interval<'de, D: serde::Deserializer<'de>>(d: D) -> Result<f64, D::Error> {
    let v = f64::deserialize(d)?;
    if (0.0..=1.0).contains(&v) {
        Ok(v)
    } else {
        Err(serde::de::Error::custom(format!(
            "value must be in [0, 1], got {v}"
        )))
    }
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
            lat: None,
            lon: None,
        };
        let json = serde_json::to_string(&payload).unwrap();
        let back: TrustScorePayload = serde_json::from_str(&json).unwrap();
        assert_eq!(back.source_id, "unit_b");
        assert!((back.score - 0.42).abs() < f64::EPSILON);
        assert!(!json.contains("\"lat\""), "absent position is omitted");
    }

    #[test]
    fn trust_score_payload_carries_optional_position() {
        let json = r#"{"source_id":"unit_b","score":1.0,
            "components":{"temporal":1,"stability":1,"spatial":1,"fingerprint":1},
            "timestamp":"2026-05-03T18:42:14.221Z","lat":48.14,"lon":37.745}"#;
        let p: TrustScorePayload = serde_json::from_str(json).unwrap();
        assert_eq!(p.lat, Some(48.14));
        assert_eq!(p.lon, Some(37.745));
        let back: TrustScorePayload =
            serde_json::from_str(&serde_json::to_string(&p).unwrap()).unwrap();
        assert_eq!(back.lat, Some(48.14));
    }

    // Exactly what comms-sim emits (services/comms-sim payloads.py).
    const SIM_TELEMETRY: &str = r#"{"source_id":"unit_b","lat":48.14,"lon":37.745,
        "inter_arrival_seconds":1.0,"crc_error_rate":0.002,"duplicate_rate":0.0}"#;

    #[test]
    fn telemetry_position_roundtrips() {
        let p: TelemetryPayload = serde_json::from_str(SIM_TELEMETRY).unwrap();
        assert!((p.lat - 48.14).abs() < f64::EPSILON);
        assert!((p.lon - 37.745).abs() < f64::EPSILON);
        let back: TelemetryPayload =
            serde_json::from_str(&serde_json::to_string(&p).unwrap()).unwrap();
        assert!((back.lat - p.lat).abs() < f64::EPSILON);
        assert!((back.lon - p.lon).abs() < f64::EPSILON);
        assert!(back.rf.is_none());
    }

    #[test]
    fn telemetry_without_position_is_rejected() {
        let json = r#"{"source_id":"unit_b","inter_arrival_seconds":1.0,
            "crc_error_rate":0.002,"duplicate_rate":0.0}"#;
        assert!(serde_json::from_str::<TelemetryPayload>(json).is_err());
    }

    #[test]
    fn telemetry_self_reported_degrading_flag_is_rejected() {
        let json = r#"{"source_id":"unit_b","lat":48.14,"lon":37.745,
            "inter_arrival_seconds":1.0,"crc_error_rate":0.002,
            "duplicate_rate":0.0,"degrading":true}"#;
        assert!(serde_json::from_str::<TelemetryPayload>(json).is_err());
    }

    #[test]
    fn topic_helpers_match_typescript_format() {
        assert_eq!(topics::trust("unit_b"), "integrity/trust/unit_b");
        assert_eq!(topics::narration("unit_b"), "integrity/narration/unit_b");
        assert_eq!(topics::telemetry("unit_b"), "telemetry/unit_b/raw");
        assert_eq!(topics::EMITTER_ESTIMATE, "integrity/emitter/estimate");
    }

    #[test]
    fn telemetry_v1_with_effective_range_still_parses() {
        let json = r#"{"source_id":"unit_b","lat":48.14,"lon":37.745,
            "inter_arrival_seconds":6.1,"crc_error_rate":0.14,"duplicate_rate":0.0,
            "rf":{"frequency_band_mhz":[100,2000],"hop_spread_hz":50000,
            "gps_l1_overlap":true,"gps_l2_overlap":true,
            "time_domain_pattern":"barrage","effective_range_km":30}}"#;
        let p: TelemetryPayload = serde_json::from_str(json).unwrap();
        assert!(p.schema.is_none() && p.rx_class.is_none() && p.gnss_fix.is_none());
        assert_eq!(p.rf.unwrap().effective_range_km, Some(30.0));
    }

    #[test]
    fn gnss_fix_degraded_mapping_k2() {
        assert!(!GnssFix::ThreeD.is_degraded());
        assert!(GnssFix::TwoD.is_degraded());
        assert!(GnssFix::NoFix.is_degraded());
        assert!(RxClass::GnssCivil.is_gnss() && !RxClass::UhfComms.is_gnss());
    }

    #[test]
    fn detection_kind_emitter_estimate_wire_name() {
        assert_eq!(
            serde_json::to_string(&DetectionKind::EmitterEstimate).unwrap(),
            "\"emitter_estimate\""
        );
    }

    #[test]
    fn mission_decision_wire_name_reads_pre_rename_logs() {
        assert_eq!(
            serde_json::to_string(&DetectionKind::MissionDecision).unwrap(),
            "\"mission_decision\""
        );
        // After-action logs written before the rename hold `modal_selection`.
        let old: DetectionKind = serde_json::from_str("\"modal_selection\"").unwrap();
        assert_eq!(old, DetectionKind::MissionDecision);
        assert!(serde_json::from_str::<DetectionKind>("\"modal_gated\"").is_err());
    }
}

/// Round-trips over the AoE fixture spine `packages/contracts/fixtures/aoe/`
/// (docs/plans/aoe-parallelization.md §3.2), generated by
/// `scripts/aoe-preview/gen_fixtures.py --contract-out`. The zod side is
/// `packages/contracts/test/aoe-contracts.test.mjs`.
#[cfg(test)]
mod aoe_fixture_tests {
    use super::*;
    use serde_json::Value;
    use std::path::PathBuf;

    fn fixture_dir() -> PathBuf {
        PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../contracts/fixtures/aoe")
    }

    fn read(name: &str) -> String {
        std::fs::read_to_string(fixture_dir().join(name))
            .unwrap_or_else(|e| panic!("read fixture {name}: {e}"))
    }

    fn assets(name: &str) -> Value {
        let p = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("../../assets/fingerprints")
            .join(name);
        serde_json::from_str(&std::fs::read_to_string(p).unwrap()).unwrap()
    }

    /// Value equality with every number compared as f64 (serde writes `250.0`
    /// where a JSON writer may have written `250`).
    fn norm(v: Value) -> Value {
        match v {
            Value::Number(n) => serde_json::json!(n.as_f64().unwrap()),
            Value::Array(a) => Value::Array(a.into_iter().map(norm).collect()),
            Value::Object(o) => Value::Object(o.into_iter().map(|(k, v)| (k, norm(v))).collect()),
            other => other,
        }
    }

    const ESTIMATES: [&str; 4] = [
        "emitter-estimate.b115.json",
        "emitter-estimate.b150.json",
        "emitter-estimate.b215-stale.json",
        "emitter-estimate.unbounded.json",
    ];
    const FORBIDDEN: [&str; 5] = [
        "mode",
        "bearings_used",
        "ref_link_km",
        "footprint_radius_km",
        "area50_km2",
    ];

    #[test]
    fn every_estimate_fixture_round_trips_equal() {
        for name in ESTIMATES {
            let text = read(name);
            let p: EmitterEstimatePayload =
                serde_json::from_str(&text).unwrap_or_else(|e| panic!("{name}: {e}"));
            let out = serde_json::to_string(&p).unwrap();
            let original: Value = serde_json::from_str(&text).unwrap();
            let back: Value = serde_json::from_str(&out).unwrap();
            assert_eq!(
                norm(back),
                norm(original),
                "{name}: serde round-trip changed the payload"
            );
            // and serde → serde is stable
            let again: EmitterEstimatePayload = serde_json::from_str(&out).unwrap();
            assert_eq!(again, p, "{name}");
            assert_eq!(
                serde_json::to_string(&again).unwrap(),
                out,
                "{name}: not byte-stable"
            );
        }
    }

    #[test]
    fn every_estimate_fixture_fits_the_wire_budget_f7() {
        for name in ESTIMATES {
            let text = read(name);
            let file_bytes = text.trim_end().len();
            assert!(
                file_bytes <= EMITTER_ESTIMATE_MAX_BYTES,
                "{name}: file {file_bytes} B"
            );
            let p: EmitterEstimatePayload = serde_json::from_str(&text).unwrap();
            let wire = serde_json::to_vec(&p).unwrap().len();
            assert!(wire <= EMITTER_ESTIMATE_MAX_BYTES, "{name}: serde {wire} B");
            let polys = p
                .aoe
                .iter()
                .flat_map(|l| l.contours.iter().map(|c| &c.polygon))
                .chain(std::iter::once(&p.emitter.region90));
            for mp in polys {
                for ring in mp.coordinates.iter().flatten() {
                    assert!(
                        ring.len() <= EMITTER_ESTIMATE_MAX_RING_VERTICES,
                        "{name}: ring {}",
                        ring.len()
                    );
                    for [lon, lat] in ring {
                        assert_eq!((lon * 1e5).round() / 1e5, *lon, "{name}: lon > 5 dp");
                        assert_eq!((lat * 1e5).round() / 1e5, *lat, "{name}: lat > 5 dp");
                    }
                }
            }
        }
    }

    #[test]
    fn estimate_fixtures_carry_no_forbidden_key() {
        for name in ESTIMATES {
            let text = read(name);
            for k in FORBIDDEN {
                assert!(!text.contains(&format!("\"{k}\"")), "{name} carries {k}");
            }
        }
    }

    #[test]
    fn reject_mode_fixture_is_rejected_k4() {
        let text = read("emitter-estimate.reject-mode.json");
        let err = serde_json::from_str::<EmitterEstimatePayload>(&text).unwrap_err();
        assert!(err.to_string().contains("mode"), "{err}");
    }

    #[test]
    fn forbidden_and_unknown_fields_are_rejected_at_every_level_k4() {
        let base: Value = serde_json::from_str(&read("emitter-estimate.b115.json")).unwrap();
        type Mutation = fn(&mut Value);
        let cases: [(&str, Mutation); 12] = [
            ("bearings_used", |e| e["bearings_used"] = 2.into()),
            (
                "emitter.mode",
                |e| {
                    e["emitter"]["mode"] =
                        serde_json::json!({"lat":48.15,"lon":37.87,"ce90_m":35000})
                },
            ),
            ("emitter.area50_km2", |e| {
                e["emitter"]["area50_km2"] = 277.5.into()
            }),
            ("aoe.ref_link_km", |e| e["aoe"][0]["ref_link_km"] = 5.into()),
            ("aoe.footprint_radius_km", |e| {
                e["aoe"][0]["footprint_radius_km"] = 13.2.into()
            }),
            ("contour.extra", |e| {
                e["aoe"][0]["contours"][0]["extra"] = 1.into()
            }),
            ("evidence.superseded", |e| {
                e["evidence"][0]["superseded"] = true.into()
            }),
            ("model.kind", |e| e["model"]["kind"] = "grid+aoa".into()),
            ("schema v2", |e| e["schema"] = "emitter-estimate/2".into()),
            ("p = 0.7", |e| e["aoe"][0]["contours"][0]["p"] = 0.7.into()),
            ("state", |e| e["state"] = "clear".into()),
            ("polygon type", |e| {
                e["emitter"]["region90"]["type"] = "Polygon".into()
            }),
        ];
        assert!(serde_json::from_value::<EmitterEstimatePayload>(base.clone()).is_ok());
        for (label, mutate) in cases {
            let mut e = base.clone();
            mutate(&mut e);
            assert!(
                serde_json::from_value::<EmitterEstimatePayload>(e).is_err(),
                "{label} was accepted"
            );
        }
    }

    #[test]
    fn telemetry_samples_round_trip() {
        for (name, v2) in [
            ("telemetry-v1.sample.json", false),
            ("telemetry-v2.sample.json", true),
        ] {
            let samples: Vec<Value> = serde_json::from_str(&read(name)).unwrap();
            let mut classes = std::collections::BTreeSet::new();
            for s in samples {
                let p: TelemetryPayload =
                    serde_json::from_value(s.clone()).unwrap_or_else(|e| panic!("{name}: {e}"));
                let back = serde_json::to_value(&p).unwrap();
                assert_eq!(norm(back), norm(s), "{name}");
                assert_eq!(p.schema.is_some(), v2, "{name}");
                if v2 {
                    classes.insert(p.rx_class.expect("v2 sample carries rx_class"));
                    assert!(p
                        .rf
                        .as_ref()
                        .is_none_or(|rf| rf.effective_range_km.is_none()));
                    if let Some(fix) = p.gnss_fix {
                        assert!(p.rx_class.unwrap().is_gnss());
                        let _ = fix.is_degraded();
                    }
                } else {
                    assert!(p.rf.unwrap().effective_range_km.is_some());
                }
            }
            if v2 {
                assert_eq!(classes.len(), 5, "one v2 sample per RxClass");
            }
        }
    }

    #[test]
    fn telemetry_v2_rejects_unknown_and_bad_values() {
        let samples: Vec<Value> = serde_json::from_str(&read("telemetry-v2.sample.json")).unwrap();
        let base = samples[0].clone();
        type Mutation = fn(&mut Value);
        let cases: [Mutation; 4] = [
            |t| t["degrading"] = true.into(),
            |t| t["gnss_fix"] = "1d".into(),
            |t| t["schema"] = "telemetry/3".into(),
            |t| t["rx_class"] = "vhf".into(),
        ];
        for mutate in cases {
            let mut t = base.clone();
            mutate(&mut t);
            assert!(serde_json::from_value::<TelemetryPayload>(t).is_err());
        }
    }

    #[test]
    fn telemetry_beats_replay_parses() {
        let text = read("telemetry-beats.jsonl");
        let mut n = 0;
        for line in text.lines() {
            let v: Value = serde_json::from_str(line).unwrap();
            assert!(v["t"].is_number());
            let p: TelemetryPayload = serde_json::from_value(v["payload"].clone()).unwrap();
            assert_eq!(v["topic"], topics::telemetry(&p.source_id).as_str());
            assert_eq!(p.schema, Some(TelemetrySchema::V2));
            assert!(p.rx_class.is_some() && p.gnss_fix.is_some());
            n += 1;
        }
        assert!(n > 0);
    }

    #[test]
    fn library_v0_2_has_modules_and_affected_classes_on_every_entry_a1() {
        let lib = assets("library.json");
        assert_eq!(lib["version"], "0.2.0");
        let entries = lib["entries"].as_array().unwrap();
        let ids: Vec<&str> = entries
            .iter()
            .map(|e| e["method_id"].as_str().unwrap())
            .collect();
        assert_eq!(
            ids,
            [
                "ground_based_gps_uhf_barrage",
                "cellular_uhf_barrage",
                "swept_uhf_low_power",
                "directional_gps_l1_spot",
                "pulsed_uhf_wide"
            ],
            "every v0.1 id is kept, in order"
        );
        for e in entries {
            let classes: Vec<RxClass> = serde_json::from_value(e["affects_rx_classes"].clone())
                .expect("affects_rx_classes");
            assert!(!classes.is_empty(), "{}", e["method_id"]);
            assert!(e["emitter"]["modules"].is_array(), "{}", e["method_id"]);
        }
        let demo = &entries[0]["emitter"]["modules"];
        assert_eq!(demo.as_array().unwrap().len(), 2, "GNSS + comms module");
    }

    #[test]
    fn receivers_thresholds_a2() {
        let r = assets("receivers.json");
        assert_eq!(r["receivers"]["gnss_civil"]["threshold_js_db"], 36.0);
        assert_eq!(r["receivers"]["gnss_mil"]["threshold_js_db"], 41.0);
        assert_eq!(r["receivers"]["uhf_comms"]["threshold_js_db"], 10.0);
        assert_eq!(r["gnss_signal"]["l1_ca_received_dbm"]["nominal"], -125.0);
        assert_eq!(r["gnss_signal"]["l1_ca_received_dbm"]["minimum"], -128.5);
        for k in r["receivers"].as_object().unwrap().keys() {
            let _: RxClass = serde_json::from_value(Value::String(k.clone())).unwrap();
        }
    }
}
