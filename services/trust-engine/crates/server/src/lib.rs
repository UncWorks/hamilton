//! Axum HTTP server — healthcheck, after-action log query, and the FDC's
//! mission-decision log (a copy of each TSS branch choice from the web).

use anyhow::Result;
use axum::{
    extract::{Query, State},
    http::StatusCode,
    response::IntoResponse,
    routing::{get, post},
    Json, Router,
};
use chrono::Utc;
use hamilton_contracts::{BranchOption, DetectionEvent, DetectionKind};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tracing::info;
use trust_transport::AfterActionLog;

#[derive(Clone)]
pub struct AppState {
    pub log: Arc<AfterActionLog>,
}

pub fn router(state: AppState) -> Router {
    Router::new()
        .route("/healthz", get(healthz))
        .route("/api/events", get(list_events))
        .route("/api/missions/decision", post(mission_decision))
        .with_state(state)
}

pub async fn serve(port: u16, state: AppState) -> Result<()> {
    let app = router(state);
    let addr = format!("0.0.0.0:{port}");
    let listener = tokio::net::TcpListener::bind(&addr).await?;
    info!(addr = %addr, "trust-server listening");
    axum::serve(listener, app).await?;
    Ok(())
}

async fn healthz() -> &'static str {
    "ok"
}

#[derive(Deserialize)]
struct EventsQuery {
    limit: Option<u32>,
}

async fn list_events(
    State(state): State<AppState>,
    Query(q): Query<EventsQuery>,
) -> impl IntoResponse {
    let limit = q.limit.unwrap_or(100).min(1000);
    match state.log.recent(limit) {
        Ok(events) => (StatusCode::OK, Json(events)).into_response(),
        Err(e) => {
            tracing::error!(error = %e, "failed to read events");
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(serde_json::json!({ "error": "log read failed" })),
            )
                .into_response()
        }
    }
}

#[derive(Deserialize, Serialize)]
pub struct MissionDecisionRequest {
    /// `<mission_id>/<lead source_id>`, e.g. "AB1001/unit_b".
    pub source_id: String,
    pub option: BranchOption,
    pub trust_score_at_selection: f64,
}

async fn mission_decision(
    State(state): State<AppState>,
    Json(req): Json<MissionDecisionRequest>,
) -> impl IntoResponse {
    let option_label = match req.option {
        BranchOption::Delay60s => "delay_60s",
        BranchOption::ShiftNonGps => "shift_non_gps",
        BranchOption::ConfirmAltChannel => "confirm_alt_channel",
    };
    let event = DetectionEvent {
        source_id: req.source_id.clone(),
        kind: DetectionKind::MissionDecision,
        message: format!(
            "operator selected ({}) at score {:.2}",
            option_label, req.trust_score_at_selection
        ),
        values: Some(serde_json::json!({
            "option": option_label,
            "score": req.trust_score_at_selection
        })),
        timestamp: Utc::now(),
    };
    if let Err(e) = state.log.append(&event) {
        tracing::error!(error = %e, "failed to log mission decision");
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({ "error": "log write failed" })),
        )
            .into_response();
    }
    (StatusCode::OK, Json(serde_json::json!({ "ok": true }))).into_response()
}
