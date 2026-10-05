//! Axum HTTP server — healthcheck, after-action log query, and the FDC's
//! mission-decision log (a copy of each TSS branch choice from the web).

use anyhow::Result;
use axum::{
    extract::{Query, State},
    http::{HeaderValue, Method, StatusCode},
    response::IntoResponse,
    routing::{get, post},
    Json, Router,
};
use chrono::Utc;
use hamilton_contracts::{BranchOption, DetectionEvent, DetectionKind};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tower_http::cors::{AllowOrigin, CorsLayer};
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
        .layer(cors_layer())
}

/// Browser CORS, so a web client on another origin can call the engine
/// directly (the Next.js app still goes through its same-origin
/// `/engine/api` proxy). Default: the usual localhost dev origins.
/// `HAMILTON_CORS_ORIGINS` overrides with a comma-separated allow-list;
/// `*` allows any origin.
fn cors_layer() -> CorsLayer {
    let base = CorsLayer::new()
        .allow_methods([Method::GET, Method::POST, Method::OPTIONS])
        .allow_headers([axum::http::header::CONTENT_TYPE]);
    let raw = std::env::var("HAMILTON_CORS_ORIGINS").unwrap_or_default();
    allow_origins(base, raw.trim())
}

fn allow_origins(base: CorsLayer, raw: &str) -> CorsLayer {
    if raw == "*" {
        return base.allow_origin(AllowOrigin::any());
    }
    let origins: Vec<&str> = if raw.is_empty() {
        DEFAULT_CORS_ORIGINS.to_vec()
    } else {
        raw.split(',')
            .map(str::trim)
            .filter(|o| !o.is_empty())
            .collect()
    };
    let configured: Vec<HeaderValue> = origins
        .into_iter()
        .filter_map(|o| HeaderValue::from_str(o).ok())
        .collect();
    base.allow_origin(AllowOrigin::list(configured))
}

const DEFAULT_CORS_ORIGINS: [&str; 4] = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://localhost:5173",
    "http://127.0.0.1:5173",
];

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

#[cfg(test)]
mod tests {
    use super::*;
    use axum::{body::Body, http::Request};
    use std::path::PathBuf;
    use tower::ServiceExt;
    use trust_transport::LogConfig;

    fn app() -> Router {
        let log = AfterActionLog::open(LogConfig {
            db_path: PathBuf::from(":memory:"),
        })
        .unwrap();
        router(AppState { log: Arc::new(log) })
    }

    async fn preflight(origin: &str) -> Option<String> {
        let res = app()
            .oneshot(
                Request::builder()
                    .method(Method::OPTIONS)
                    .uri("/api/missions/decision")
                    .header("origin", origin)
                    .header("access-control-request-method", "POST")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        res.headers()
            .get("access-control-allow-origin")
            .map(|v| v.to_str().unwrap().to_string())
    }

    #[tokio::test]
    async fn cors_allows_the_default_dev_origins_only() {
        assert_eq!(
            preflight("http://localhost:3000").await.as_deref(),
            Some("http://localhost:3000")
        );
        assert_eq!(preflight("http://evil.example").await, None);
    }

    #[test]
    fn cors_override_list_and_wildcard() {
        // Builds without panicking for a list, a wildcard and junk entries.
        let _ = allow_origins(CorsLayer::new(), "http://a.test, ,http://b.test");
        let _ = allow_origins(CorsLayer::new(), "*");
    }
}
