//! Axum HTTP server — healthcheck + after-action log query + modal-selection
//! callback (Phase 7 will use the POST endpoint).

use anyhow::Result;
use axum::{
    extract::{Query, State},
    http::StatusCode,
    response::IntoResponse,
    routing::{get, post},
    Json, Router,
};
use chrono::Utc;
use hamilton_contracts::{DetectionEvent, DetectionKind, ModalOption};
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
        .route("/api/modal/selection", post(modal_selection))
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
pub struct ModalSelectionRequest {
    pub source_id: String,
    pub option: ModalOption,
    pub trust_score_at_selection: f64,
}

async fn modal_selection(
    State(state): State<AppState>,
    Json(req): Json<ModalSelectionRequest>,
) -> impl IntoResponse {
    let option_label = match req.option {
        ModalOption::Delay60s => "delay_60s",
        ModalOption::ShiftNonGps => "shift_non_gps",
        ModalOption::ConfirmAltChannel => "confirm_alt_channel",
    };
    let event = DetectionEvent {
        source_id: req.source_id.clone(),
        kind: DetectionKind::ModalSelection,
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
        tracing::error!(error = %e, "failed to log modal selection");
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({ "error": "log write failed" })),
        )
            .into_response();
    }
    (StatusCode::OK, Json(serde_json::json!({ "ok": true }))).into_response()
}
