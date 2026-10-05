//! After-action log persisted to DuckDB.
//!
//! Append-only `events` table — one row per detection event + one row per
//! modal selection. Streamed to the COP event terminal in Phase 9.
//!
//! `emitter_estimates` (HS-24, FR-04b (9)): one row per AoE estimate state
//! change (open / update / stale / retire) with the published payload and
//! its evidence hash. No truth / eval table here (plan R4).

use anyhow::{Context, Result};
use chrono::{DateTime, Utc};
use duckdb::{params, Connection};
use hamilton_contracts::{DetectionEvent, DetectionKind};
use std::path::PathBuf;
use std::sync::Mutex;

pub struct LogConfig {
    pub db_path: PathBuf,
}

impl Default for LogConfig {
    fn default() -> Self {
        Self {
            db_path: PathBuf::from("./data/trust.duckdb"),
        }
    }
}

/// One `emitter_estimates` row.
#[derive(Debug, Clone, PartialEq)]
pub struct EmitterEstimateRow {
    pub estimate_id: String,
    pub state: String,
    pub payload: String,
    pub evidence_hash: String,
    pub ts: DateTime<Utc>,
}

pub struct AfterActionLog {
    conn: Mutex<Connection>,
}

impl AfterActionLog {
    pub fn open(config: LogConfig) -> Result<Self> {
        if let Some(parent) = config.db_path.parent() {
            if !parent.as_os_str().is_empty() {
                std::fs::create_dir_all(parent)
                    .with_context(|| format!("create db dir {}", parent.display()))?;
            }
        }
        let conn = Connection::open(&config.db_path)
            .with_context(|| format!("open duckdb at {}", config.db_path.display()))?;
        conn.execute_batch(
            "CREATE TABLE IF NOT EXISTS events (
                source_id  VARCHAR NOT NULL,
                kind       VARCHAR NOT NULL,
                message    VARCHAR NOT NULL,
                values     VARCHAR,
                ts         TIMESTAMPTZ NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_events_ts ON events(ts);
            CREATE TABLE IF NOT EXISTS emitter_estimates (
                estimate_id   VARCHAR NOT NULL,
                state         VARCHAR NOT NULL,
                payload       VARCHAR NOT NULL,
                evidence_hash VARCHAR NOT NULL,
                ts            TIMESTAMPTZ NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_emitter_estimates_ts ON emitter_estimates(ts);",
        )
        .context("init events table")?;
        Ok(Self {
            conn: Mutex::new(conn),
        })
    }

    pub fn append(&self, event: &DetectionEvent) -> Result<()> {
        let kind = serde_json::to_string(&event.kind)
            .context("serialize DetectionKind")?
            .trim_matches('"')
            .to_string();
        let values = event
            .values
            .as_ref()
            .map(|v| v.to_string())
            .unwrap_or_default();
        self.conn
            .lock()
            .expect("after-action log mutex poisoned")
            .execute(
                "INSERT INTO events (source_id, kind, message, values, ts)
                 VALUES (?, ?, ?, ?, ?)",
                params![
                    event.source_id,
                    kind,
                    event.message,
                    values,
                    event.timestamp.to_rfc3339(),
                ],
            )
            .context("insert event")?;
        Ok(())
    }

    /// Store one AoE estimate row. `state` is the lifecycle transition
    /// (`open`, `update`, `stale`, `retire`); `payload` is the published JSON
    /// (empty for `retire`, which publishes an empty retained payload).
    pub fn append_emitter_estimate(&self, row: &EmitterEstimateRow) -> Result<()> {
        self.conn
            .lock()
            .expect("after-action log mutex poisoned")
            .execute(
                "INSERT INTO emitter_estimates (estimate_id, state, payload, evidence_hash, ts)
                 VALUES (?, ?, ?, ?, ?)",
                params![
                    row.estimate_id,
                    row.state,
                    row.payload,
                    row.evidence_hash,
                    row.ts.to_rfc3339(),
                ],
            )
            .context("insert emitter estimate")?;
        Ok(())
    }

    /// Stored estimate rows, oldest first.
    pub fn emitter_estimates(&self) -> Result<Vec<EmitterEstimateRow>> {
        let conn = self.conn.lock().expect("after-action log mutex poisoned");
        let mut stmt = conn.prepare(
            "SELECT estimate_id, state, payload, evidence_hash, CAST(epoch_ms(ts) AS BIGINT)
             FROM emitter_estimates ORDER BY ts, rowid",
        )?;
        let rows = stmt.query_map([], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, String>(3)?,
                row.get::<_, i64>(4)?,
            ))
        })?;
        let mut out = Vec::new();
        for r in rows {
            let (estimate_id, state, payload, evidence_hash, ts_ms) = r?;
            out.push(EmitterEstimateRow {
                estimate_id,
                state,
                payload,
                evidence_hash,
                ts: DateTime::from_timestamp_millis(ts_ms)
                    .with_context(|| format!("invalid timestamp_ms in log: {ts_ms}"))?,
            });
        }
        Ok(out)
    }

    pub fn recent(&self, limit: u32) -> Result<Vec<DetectionEvent>> {
        let conn = self.conn.lock().expect("after-action log mutex poisoned");
        let mut stmt = conn.prepare(
            "SELECT source_id, kind, message, values,
                    CAST(epoch_ms(ts) AS BIGINT)
             FROM events
             ORDER BY ts DESC LIMIT ?",
        )?;
        let rows = stmt.query_map([limit], |row| {
            let source_id: String = row.get(0)?;
            let kind_str: String = row.get(1)?;
            let message: String = row.get(2)?;
            let values_str: String = row.get(3)?;
            let ts_ms: i64 = row.get(4)?;
            Ok((source_id, kind_str, message, values_str, ts_ms))
        })?;
        let mut out = Vec::new();
        for row in rows {
            let (source_id, kind_str, message, values_str, ts_ms) = row?;
            let kind: DetectionKind = serde_json::from_str(&format!("\"{kind_str}\""))
                .with_context(|| format!("unknown DetectionKind in log: {kind_str}"))?;
            let values: Option<serde_json::Value> = if values_str.is_empty() {
                None
            } else {
                Some(serde_json::from_str(&values_str).context("invalid JSON in event values")?)
            };
            let timestamp: DateTime<Utc> = DateTime::from_timestamp_millis(ts_ms)
                .with_context(|| format!("invalid timestamp_ms in log: {ts_ms}"))?;
            out.push(DetectionEvent {
                source_id,
                kind,
                message,
                values,
                timestamp,
            });
        }
        Ok(out)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn round_trips_a_temporal_event_through_an_in_memory_db() {
        let log = AfterActionLog::open(LogConfig {
            db_path: PathBuf::from(":memory:"),
        })
        .unwrap();
        let event = DetectionEvent {
            source_id: "unit_b".into(),
            kind: DetectionKind::TemporalAnomaly,
            message: "B-link cadence degraded 18s ago — investigating".into(),
            values: Some(serde_json::json!({ "latest_seconds": 6.1 })),
            timestamp: Utc::now(),
        };
        log.append(&event).unwrap();
        let recent = log.recent(10).unwrap();
        assert_eq!(recent.len(), 1);
        assert_eq!(recent[0].source_id, "unit_b");
        assert!(matches!(recent[0].kind, DetectionKind::TemporalAnomaly));
    }

    #[test]
    fn round_trips_emitter_estimate_rows_and_events() {
        let log = AfterActionLog::open(LogConfig {
            db_path: PathBuf::from(":memory:"),
        })
        .unwrap();
        let ts = DateTime::from_timestamp_millis(1_708_022_556_000).unwrap();
        for (state, payload) in [
            ("open", "{\"schema\":\"emitter-estimate/1\"}"),
            ("retire", ""),
        ] {
            log.append_emitter_estimate(&EmitterEstimateRow {
                estimate_id: "J1-20240215T184236Z".into(),
                state: state.into(),
                payload: payload.into(),
                evidence_hash: "793de9c75f940586".into(),
                ts,
            })
            .unwrap();
            log.append(&DetectionEvent {
                source_id: "J1-20240215T184236Z".into(),
                kind: DetectionKind::EmitterEstimate,
                message: format!("emitter estimate {state}"),
                values: Some(serde_json::json!({ "transition": state })),
                timestamp: ts,
            })
            .unwrap();
        }
        let rows = log.emitter_estimates().unwrap();
        assert_eq!(rows.len(), 2);
        assert_eq!(rows[0].state, "open");
        assert_eq!(rows[1].payload, "");
        assert_eq!(rows[0].ts, ts);
        let events = log.recent(10).unwrap();
        assert_eq!(events.len(), 2);
        assert!(events
            .iter()
            .all(|e| matches!(e.kind, DetectionKind::EmitterEstimate)));
    }
}
