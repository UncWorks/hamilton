//! Trust engine binary — wires the detectors, aggregator, transport, and HTTP
//! server into the running daemon (Phase 1).
//!
//! Spawns three concurrent tasks:
//! 1. Telemetry subscriber — listens to `telemetry/{source_id}/raw` from the
//!    comms simulator (Phase 2 will publish to it). Updates per-source state.
//! 2. Tick loop — every 1s aggregates per-source detector outputs and
//!    publishes a TrustScorePayload on `integrity/trust/{source_id}` (FR-05
//!    >=1Hz invariant).
//! 3. HTTP server — Axum on TRUST_ENGINE_HTTP_PORT.

mod state;
mod telemetry;
mod ticker;

use anyhow::Result;
use std::env;
use std::sync::Arc;
use tokio::sync::RwLock;
use tracing::info;

use trust_library::load_bundled;
use trust_server::{serve, AppState};
use trust_transport::{AfterActionLog, LogConfig, MqttPublisher, MqttPublisherConfig};

#[tokio::main]
async fn main() -> Result<()> {
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env().unwrap_or_else(|_| {
                "trust_engine=info,trust_transport=info,trust_server=info".into()
            }),
        )
        .init();

    let broker_url = env::var("MQTT_BROKER_URL").unwrap_or_else(|_| "mqtt://localhost:1883".into());
    let http_port: u16 = env::var("TRUST_ENGINE_HTTP_PORT")
        .ok()
        .and_then(|s| s.parse().ok())
        .unwrap_or(8080);
    let db_path = env::var("TRUST_ENGINE_DB_PATH")
        .unwrap_or_else(|_| "./data/trust.duckdb".into())
        .into();

    // FRS FR-03: neighbour radius for spatial correlation, default 500 m.
    let spatial_radius_m: f64 = env::var("TRUST_ENGINE_SPATIAL_RADIUS_M")
        .ok()
        .and_then(|s| s.parse().ok())
        .filter(|r: &f64| r.is_finite() && *r > 0.0)
        .unwrap_or(trust_detectors::spatial::DEFAULT_RADIUS_M);
    info!(spatial_radius_m, "spatial correlation radius");

    let library = load_bundled()?;
    info!(entries = library.len(), "fingerprint library loaded");

    let log = Arc::new(AfterActionLog::open(LogConfig { db_path })?);
    let publisher = Arc::new(MqttPublisher::connect(MqttPublisherConfig {
        broker_url: broker_url.clone(),
        client_id: "hamilton-trust-engine".into(),
        keep_alive_secs: 30,
    })?);

    let state = Arc::new(RwLock::new(state::EngineState::default()));

    let telemetry_handle = tokio::spawn(telemetry::run(
        broker_url.clone(),
        Arc::clone(&state),
        Arc::clone(&log),
    ));

    let tick_handle = tokio::spawn(ticker::run(
        Arc::clone(&state),
        Arc::clone(&publisher),
        Arc::clone(&log),
        library,
        spatial_radius_m,
    ));

    let http_state = AppState {
        log: Arc::clone(&log),
    };
    let http_handle = tokio::spawn(async move { serve(http_port, http_state).await });

    tokio::select! {
        r = telemetry_handle => r??,
        r = tick_handle => r??,
        r = http_handle => r??,
        _ = tokio::signal::ctrl_c() => {
            info!("shutdown requested");
        }
    }
    Ok(())
}
