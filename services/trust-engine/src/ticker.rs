//! Trust score tick loop (FR-05 ≥1Hz publication).
//!
//! Every 1s: for each known source, run the four detectors against current
//! state, aggregate into a TrustScorePayload, publish on MQTT. When the
//! fingerprint matcher returns top candidates, also publish on
//! `integrity/fingerprint/candidates`. Then run the AoE lifecycle
//! ([`crate::aoe::AoeTracker`]) and publish / log its actions on
//! `integrity/emitter/estimate`.
//!
//! Fingerprint dimension 6 (FRS FR-04 rev) is "the receiver classes observed
//! degraded at the source ⊆ the method's `affects_rx_classes`": GNSS from
//! `gnss_fix`, UHF from the link verdict.

use std::sync::Arc;
use std::time::Duration;

use anyhow::Result;
use chrono::Utc;
use hamilton_contracts::{
    DetectionEvent, DetectionKind, FingerprintCandidate, FingerprintCandidatesPayload,
};
use tokio::sync::RwLock;
use tokio::time::interval;
use tracing::{debug, warn};
use trust_aggregator::{aggregate, AggregatorWeights, DetectorReadings};
use trust_detectors::{
    fingerprint::{match_fingerprint_with, Dimension6, FingerprintEntry},
    fingerprint_candidates::rank_candidates_with,
    spatial::{classify_spatial, is_degrading, NeighborState},
    stability::{detect_stability, StabilityReading},
    temporal::{detect_temporal, TemporalReading},
};
use trust_library::ReceiverTable;
use trust_transport::{mqtt::pad_to_three, AfterActionLog, EmitterEstimateRow, MqttPublisher};

use crate::aoe::{
    estimator::AoeEstimator, inputs::UnitView, transition_event, AoeAction, AoeTracker, Transition,
};
use crate::state::EngineState;

const TICK_INTERVAL_MS: u64 = 1000;
const PUBLISH_CANDIDATES_THRESHOLD: f64 = 0.5;

/// AoE inputs and lifecycle state carried across ticks.
pub struct AoeRuntime {
    pub tracker: AoeTracker,
    pub receivers: ReceiverTable,
    pub estimator: Box<dyn AoeEstimator>,
}

pub async fn run(
    state: Arc<RwLock<EngineState>>,
    publisher: Arc<MqttPublisher>,
    log: Arc<AfterActionLog>,
    library: Vec<FingerprintEntry>,
    spatial_radius_m: f64,
    mut aoe: AoeRuntime,
) -> Result<()> {
    let weights = AggregatorWeights::default();
    let mut tick = interval(Duration::from_millis(TICK_INTERVAL_MS));
    let mut last_match: std::collections::HashMap<String, String> =
        std::collections::HashMap::new();
    loop {
        tick.tick().await;
        if let Err(e) = publish_one_tick(
            &state,
            &publisher,
            &log,
            &weights,
            &library,
            spatial_radius_m,
            &mut last_match,
        )
        .await
        {
            warn!(error = %e, "tick publish error");
        }
        let now_ms = Utc::now().timestamp_millis();
        let actions = {
            let snapshot = state.read().await;
            let units = unit_views(&snapshot);
            aoe.tracker.tick(
                now_ms,
                &units,
                &library,
                &aoe.receivers,
                aoe.estimator.as_ref(),
            )
        };
        for action in actions {
            execute_aoe(&action, &publisher, &log).await;
        }
    }
}

/// Per-unit view for the AoE lifecycle, in source-id order: GNSS track, the measured link verdict and the RF
/// observation.
pub fn unit_views(snapshot: &EngineState) -> Vec<UnitView> {
    let mut units: Vec<UnitView> = snapshot
        .sources
        .iter()
        .map(|(id, s)| {
            let arrivals: Vec<_> = s.recent_arrivals.iter().copied().collect();
            UnitView {
                source_id: id.clone(),
                gnss: s.gnss,
                link_degraded: is_degrading(
                    &detect_temporal(&arrivals, &s.baseline),
                    &detect_stability(&s.stability),
                ),
                rf: s.last_rf.clone(),
            }
        })
        .collect();
    units.sort_by(|a, b| a.source_id.cmp(&b.source_id));
    units
}

/// Log an AoE action to DuckDB (HS-24): an `emitter_estimates` row and an
/// `events` row for every transition; heartbeats are not logged.
pub fn record_aoe(log: &AfterActionLog, action: &AoeAction) -> Result<()> {
    let (payload, estimate_id, hash, transition, ts) = match action {
        AoeAction::Publish {
            transition: None, ..
        } => return Ok(()),
        AoeAction::Publish {
            payload,
            transition: Some(t),
        } => (
            Some(payload.as_ref()),
            payload.estimate_id.as_str(),
            payload.evidence_hash.as_str(),
            *t,
            payload.computed_at,
        ),
        AoeAction::Retire {
            estimate_id,
            evidence_hash,
            at,
        } => (
            None,
            estimate_id.as_str(),
            evidence_hash.as_str(),
            Transition::Retire,
            *at,
        ),
    };
    log.append_emitter_estimate(&EmitterEstimateRow {
        estimate_id: estimate_id.to_string(),
        state: transition.as_str().to_string(),
        payload: payload
            .map(serde_json::to_string)
            .transpose()?
            .unwrap_or_default(),
        evidence_hash: hash.to_string(),
        ts,
    })?;
    log.append(&transition_event(
        payload,
        estimate_id,
        hash,
        transition,
        ts,
    ))
}

async fn execute_aoe(action: &AoeAction, publisher: &MqttPublisher, log: &AfterActionLog) {
    let sent = match action {
        AoeAction::Publish { payload, .. } => publisher.publish_emitter_estimate(payload).await,
        AoeAction::Retire { .. } => publisher.retire_emitter_estimate().await,
    };
    if let Err(e) = sent {
        warn!(error = %e, "emitter estimate publish failed");
    }
    if let Err(e) = record_aoe(log, action) {
        warn!(error = %e, "emitter estimate log failed");
    }
}

async fn publish_one_tick(
    state: &Arc<RwLock<EngineState>>,
    publisher: &Arc<MqttPublisher>,
    log: &Arc<AfterActionLog>,
    weights: &AggregatorWeights,
    library: &[FingerprintEntry],
    spatial_radius_m: f64,
    last_match: &mut std::collections::HashMap<String, String>,
) -> Result<()> {
    let now = Utc::now();
    let snapshot = state.read().await;
    let source_ids: Vec<String> = snapshot.sources.keys().cloned().collect();

    // Pass 1: per-source temporal + stability readings, so every source's
    // "degrading" status is MEASURED by the engine before spatial correlation.
    let readings: std::collections::HashMap<&str, (TemporalReading, StabilityReading)> = snapshot
        .sources
        .iter()
        .map(|(id, s)| {
            let arrivals: Vec<_> = s.recent_arrivals.iter().copied().collect();
            (
                id.as_str(),
                (
                    detect_temporal(&arrivals, &s.baseline),
                    detect_stability(&s.stability),
                ),
            )
        })
        .collect();
    let degrading = |id: &str| readings.get(id).is_some_and(|(t, s)| is_degrading(t, s));

    for source_id in &source_ids {
        let Some(source) = snapshot.sources.get(source_id) else {
            continue;
        };
        let Some((temporal, stability)) = readings.get(source_id.as_str()) else {
            continue;
        };

        let neighbors: Vec<NeighborState> = snapshot
            .sources
            .iter()
            .filter(|(id, _)| id.as_str() != source_id.as_str())
            .map(|(id, s)| NeighborState {
                id: s.location.id.clone(),
                position: s.location.position,
                degrading: degrading(id),
            })
            .collect();
        let spatial = classify_spatial(
            &source.location,
            degrading(source_id),
            &neighbors,
            spatial_radius_m,
        );

        let classes = UnitView {
            source_id: source_id.clone(),
            gnss: source.gnss,
            link_degraded: degrading(source_id),
            rf: None,
        }
        .degraded_classes();
        let dim6 = Dimension6::ObservedClasses(&classes);
        let fingerprint = source
            .last_rf
            .as_ref()
            .and_then(|rf| match_fingerprint_with(rf, dim6, library));

        let mut payload = aggregate(
            source_id.clone(),
            DetectorReadings {
                temporal,
                stability,
                spatial: &spatial,
                fingerprint: fingerprint.as_ref(),
            },
            weights,
            now,
        );
        payload.lat = Some(source.location.position.lat);
        payload.lon = Some(source.location.position.lon);

        if let Err(e) = publisher.publish_trust(&payload).await {
            warn!(source_id = %source_id, error = %e, "publish_trust failed");
            continue;
        }
        debug!(source_id = %source_id, score = payload.score, "tick published");

        if let Some(rf) = source.last_rf.as_ref() {
            let ranked = rank_candidates_with(rf, dim6, library);
            let top = ranked.first().map(|c| c.score).unwrap_or(0.0);
            if top >= PUBLISH_CANDIDATES_THRESHOLD {
                let candidates: Vec<FingerprintCandidate> = ranked
                    .into_iter()
                    .map(|c| FingerprintCandidate {
                        method_id: c.method_id,
                        named_systems: c.named_systems,
                        score: c.score,
                        munitions_affected: c.munitions_affected,
                        source_citation: c.source_citation,
                    })
                    .collect();
                let candidates_payload = FingerprintCandidatesPayload {
                    source_id: source_id.clone(),
                    candidates: pad_to_three(candidates),
                    timestamp: now,
                };
                let top_method = candidates_payload
                    .candidates
                    .first()
                    .map(|c| c.method_id.clone())
                    .unwrap_or_default();
                if let Err(e) = publisher.publish_candidates(&candidates_payload).await {
                    warn!(source_id = %source_id, error = %e, "publish_candidates failed");
                    continue;
                }
                let prev = last_match.get(source_id).cloned();
                if prev.as_deref() != Some(top_method.as_str()) && !top_method.is_empty() {
                    let event = DetectionEvent {
                        source_id: source_id.clone(),
                        kind: DetectionKind::Fingerprint,
                        message: format!("{source_id}: candidate {top_method} (top match)"),
                        values: Some(serde_json::json!({
                            "method_id": top_method,
                            "score": top
                        })),
                        timestamp: now,
                    };
                    if let Err(e) = log.append(&event) {
                        warn!(source_id = %source_id, error = %e, "log fingerprint event failed");
                    }
                    last_match.insert(source_id.clone(), top_method);
                }
            }
        }
    }
    Ok(())
}
