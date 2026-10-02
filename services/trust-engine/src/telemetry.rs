//! Telemetry MQTT subscriber.
//!
//! Listens to `telemetry/+/raw`, deserializes wire-format TelemetryPayload,
//! updates the per-source state, and logs a stability transition event when
//! a source first reports degradation.

use std::sync::Arc;
use std::time::Duration;

use anyhow::{Context, Result};
use chrono::Utc;
use hamilton_contracts::{self as wire, DetectionEvent, DetectionKind};
use rumqttc::{AsyncClient, Event, EventLoop, MqttOptions, Packet, QoS};
use tokio::sync::RwLock;
use tracing::{debug, info, warn};
use trust_detectors::{stability::StabilityWindow, temporal::InterArrival};
use trust_transport::{parse_broker_url, AfterActionLog};

use crate::state::{rf_from_wire, EngineState, SourceState};

const MAX_RECENT_ARRIVALS: usize = 60;

pub async fn run(
    broker_url: String,
    state: Arc<RwLock<EngineState>>,
    log: Arc<AfterActionLog>,
) -> Result<()> {
    let (host, port) = parse_broker_url(&broker_url)?;
    let mut opts = MqttOptions::new("hamilton-telemetry-sub", host, port);
    opts.set_keep_alive(Duration::from_secs(30));
    let (client, eventloop) = AsyncClient::new(opts, 64);
    client
        .subscribe("telemetry/+/raw", QoS::AtMostOnce)
        .await
        .context("subscribe telemetry/+/raw")?;
    info!("telemetry subscriber listening");
    pump(eventloop, state, log).await
}

async fn pump(
    mut eventloop: EventLoop,
    state: Arc<RwLock<EngineState>>,
    log: Arc<AfterActionLog>,
) -> Result<()> {
    loop {
        match eventloop.poll().await {
            Ok(Event::Incoming(Packet::Publish(p))) => {
                if let Err(e) = apply(&p.payload, &state, &log).await {
                    warn!(error = %e, "telemetry payload rejected");
                }
            }
            Ok(_) => {}
            Err(e) => {
                warn!(error = %e, "telemetry eventloop error; backing off");
                tokio::time::sleep(Duration::from_millis(500)).await;
            }
        }
    }
}

async fn apply(
    bytes: &[u8],
    state: &Arc<RwLock<EngineState>>,
    log: &Arc<AfterActionLog>,
) -> Result<()> {
    let payload: wire::TelemetryPayload =
        serde_json::from_slice(bytes).context("deserialize TelemetryPayload")?;
    debug!(source_id = %payload.source_id, "telemetry update");

    let mut guard = state.write().await;
    let entry = guard
        .sources
        .entry(payload.source_id.clone())
        .or_insert_with(|| SourceState::new(&payload.source_id, 0.0, 0.0));

    entry.recent_arrivals.push_back(InterArrival {
        seconds: payload.inter_arrival_seconds,
    });
    while entry.recent_arrivals.len() > MAX_RECENT_ARRIVALS {
        entry.recent_arrivals.pop_front();
    }

    let prev_crc = entry.stability.crc_error_rate;
    entry.stability = StabilityWindow {
        crc_error_rate: payload.crc_error_rate,
        duplicate_rate: payload.duplicate_rate,
        baseline_duplicate_rate: entry.stability.baseline_duplicate_rate,
    };

    // An absent `rf` means no current RF observation. Clearing it (rather than
    // keeping the last one) stops a stale jammer match from pinning
    // fingerprint trust at 0.0 after the source has recovered.
    entry.last_rf = payload.rf.as_ref().map(rf_from_wire);

    let was_degrading = entry.degrading;
    entry.degrading = payload.degrading;

    if !was_degrading && payload.degrading {
        let event = DetectionEvent {
            source_id: payload.source_id.clone(),
            kind: DetectionKind::Stability,
            message: format!(
                "{}: CRC {:.1}% → {:.1}%",
                payload.source_id,
                prev_crc * 100.0,
                payload.crc_error_rate * 100.0
            ),
            values: Some(serde_json::json!({
                "crc_error_rate": payload.crc_error_rate,
                "duplicate_rate": payload.duplicate_rate
            })),
            timestamp: Utc::now(),
        };
        if let Err(e) = log.append(&event) {
            warn!(error = %e, "failed to append telemetry transition event");
        }
    }

    Ok(())
}
