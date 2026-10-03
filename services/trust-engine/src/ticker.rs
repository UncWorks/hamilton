//! Trust score tick loop (FR-05 ≥1Hz publication).
//!
//! Every 1s: for each known source, run the four detectors against current
//! state, aggregate into a TrustScorePayload, publish on MQTT. When the
//! fingerprint matcher returns top candidates, also publish on
//! `integrity/fingerprint/candidates`.

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
    fingerprint::{match_fingerprint, FingerprintEntry},
    fingerprint_candidates::rank_candidates,
    spatial::{classify_spatial, is_degrading, NeighborState},
    stability::{detect_stability, StabilityReading},
    temporal::{detect_temporal, TemporalReading},
};
use trust_transport::{mqtt::pad_to_three, AfterActionLog, MqttPublisher};

use crate::state::EngineState;

const TICK_INTERVAL_MS: u64 = 1000;
const PUBLISH_CANDIDATES_THRESHOLD: f64 = 0.5;

pub async fn run(
    state: Arc<RwLock<EngineState>>,
    publisher: Arc<MqttPublisher>,
    log: Arc<AfterActionLog>,
    library: Vec<FingerprintEntry>,
    spatial_radius_m: f64,
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

        let fingerprint = source
            .last_rf
            .as_ref()
            .and_then(|rf| match_fingerprint(rf, library));

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
            let ranked = rank_candidates(rf, library);
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
