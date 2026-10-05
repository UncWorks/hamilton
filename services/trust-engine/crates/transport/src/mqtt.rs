//! MQTT publisher (FR-05, FR-04a).
//!
//! Publishes:
//! - `integrity/trust/{source_id}` — continuous trust score >=1Hz
//! - `integrity/fingerprint/candidates` — top-3 ranked candidates on update
//! - `integrity/emitter/estimate` — jammer AoE estimate, retained, QoS 1;
//!   retire = empty retained payload (FR-04b, System Design §5.4)
//!
//! Payloads validated by serde against the shared contract before publish
//! (defense-in-depth — even our own broker is "external data" per R14
//! discipline).

use anyhow::{Context, Result};
use hamilton_contracts::{
    topics, EmitterEstimatePayload, FingerprintCandidatesPayload, TrustScorePayload,
    EMITTER_ESTIMATE_MAX_BYTES,
};
use rumqttc::{AsyncClient, EventLoop, MqttOptions, QoS};
use std::time::Duration;
use tracing::{debug, info, warn};

pub struct MqttPublisherConfig {
    pub broker_url: String,
    pub client_id: String,
    pub keep_alive_secs: u64,
}

impl Default for MqttPublisherConfig {
    fn default() -> Self {
        Self {
            broker_url: "mqtt://localhost:1883".into(),
            client_id: "hamilton-trust-engine".into(),
            keep_alive_secs: 30,
        }
    }
}

pub struct MqttPublisher {
    client: AsyncClient,
}

impl MqttPublisher {
    /// Connect to the broker and spawn the event loop on the current Tokio runtime.
    pub fn connect(config: MqttPublisherConfig) -> Result<Self> {
        let (host, port) = parse_broker_url(&config.broker_url)
            .with_context(|| format!("invalid broker URL: {}", config.broker_url))?;
        let mut opts = MqttOptions::new(&config.client_id, host, port);
        opts.set_keep_alive(Duration::from_secs(config.keep_alive_secs));
        opts.set_clean_session(true);

        let (client, eventloop) = AsyncClient::new(opts, 64);
        spawn_eventloop(eventloop);
        // Connection happens lazily on first poll; if the broker is down at
        // startup the event-loop logs a warn and retries. We log "initialized"
        // (not "connected") to avoid implying a TCP handshake we haven't done.
        info!(broker = %config.broker_url, "mqtt client initialized (connection pending)");
        Ok(Self { client })
    }

    pub async fn publish_trust(&self, payload: &TrustScorePayload) -> Result<()> {
        let topic = topics::trust(&payload.source_id);
        let body = serde_json::to_vec(payload).context("serialize TrustScorePayload")?;
        self.client
            .publish(&topic, QoS::AtMostOnce, false, body)
            .await
            .with_context(|| format!("publish {topic}"))?;
        debug!(
            source_id = %payload.source_id,
            score = payload.score,
            "trust score published"
        );
        Ok(())
    }

    pub async fn publish_candidates(&self, payload: &FingerprintCandidatesPayload) -> Result<()> {
        let topic = topics::FINGERPRINT_CANDIDATES;
        let body = serde_json::to_vec(payload).context("serialize candidates")?;
        self.client
            .publish(topic, QoS::AtLeastOnce, false, body)
            .await
            .context("publish candidates")?;
        info!(
            source_id = %payload.source_id,
            top = payload.candidates.first().map(|c| c.method_id.as_str()).unwrap_or("none"),
            "candidates published"
        );
        Ok(())
    }
}

/// Broker `message_size_limit` (infra/docker/mosquitto/mosquitto.conf). A
/// larger publish is dropped silently by the broker.
pub const BROKER_MESSAGE_SIZE_LIMIT: usize = 8192;

/// Serialize an estimate for the wire and check the size budget (F7).
/// Errors above the broker limit (it would be dropped); warns above the
/// 7168 B budget.
pub fn encode_emitter_estimate(payload: &EmitterEstimatePayload) -> Result<Vec<u8>> {
    let body = serde_json::to_vec(payload).context("serialize EmitterEstimatePayload")?;
    if body.len() > BROKER_MESSAGE_SIZE_LIMIT {
        anyhow::bail!(
            "emitter estimate {} is {} B, over the broker limit {BROKER_MESSAGE_SIZE_LIMIT} B",
            payload.estimate_id,
            body.len()
        );
    }
    if body.len() > EMITTER_ESTIMATE_MAX_BYTES {
        warn!(
            estimate_id = %payload.estimate_id,
            bytes = body.len(),
            budget = EMITTER_ESTIMATE_MAX_BYTES,
            "emitter estimate over the wire-size budget (F7)"
        );
    }
    Ok(body)
}

impl MqttPublisher {
    /// Publish the AoE estimate on `integrity/emitter/estimate`, retained, QoS 1.
    pub async fn publish_emitter_estimate(&self, payload: &EmitterEstimatePayload) -> Result<()> {
        let body = encode_emitter_estimate(payload)?;
        self.client
            .publish(topics::EMITTER_ESTIMATE, QoS::AtLeastOnce, true, body)
            .await
            .context("publish emitter estimate")?;
        debug!(estimate_id = %payload.estimate_id, state = ?payload.state, "emitter estimate published");
        Ok(())
    }

    /// Retire the estimate: an EMPTY retained payload clears the retained
    /// message, so late joiners see nothing (HS-25).
    pub async fn retire_emitter_estimate(&self) -> Result<()> {
        self.client
            .publish(
                topics::EMITTER_ESTIMATE,
                QoS::AtLeastOnce,
                true,
                Vec::<u8>::new(),
            )
            .await
            .context("retire emitter estimate")?;
        info!("emitter estimate retired (empty retained payload)");
        Ok(())
    }
}

/// Parse `mqtt://host:port` into `(host, port)`. Defaults port to 1883.
/// Public so the telemetry subscriber can use the same logic.
pub fn parse_broker_url(url: &str) -> Result<(String, u16)> {
    let stripped = url
        .strip_prefix("mqtt://")
        .or_else(|| url.strip_prefix("tcp://"))
        .unwrap_or(url);
    let mut parts = stripped.splitn(2, ':');
    let host = parts
        .next()
        .filter(|h| !h.is_empty())
        .context("missing host")?
        .to_string();
    let port = parts
        .next()
        .map(|p| p.parse::<u16>())
        .transpose()
        .context("invalid port")?
        .unwrap_or(1883);
    Ok((host, port))
}

fn spawn_eventloop(mut eventloop: EventLoop) {
    tokio::spawn(async move {
        loop {
            match eventloop.poll().await {
                Ok(_event) => { /* connection alive */ }
                Err(e) => {
                    warn!(error = %e, "mqtt event loop error; backing off");
                    tokio::time::sleep(Duration::from_millis(500)).await;
                }
            }
        }
    });
}

/// Pad a candidates list to exactly 3 entries with score-0 filler so the
/// payload always satisfies System Design §5.2 ("Top-3 always; pad with score
/// 0.0 entries if matcher returns fewer").
pub fn pad_to_three(
    mut candidates: Vec<hamilton_contracts::FingerprintCandidate>,
) -> Vec<hamilton_contracts::FingerprintCandidate> {
    while candidates.len() < 3 {
        candidates.push(hamilton_contracts::FingerprintCandidate {
            method_id: String::new(),
            named_systems: vec![],
            score: 0.0,
            munitions_affected: vec![],
            source_citation: String::new(),
        });
    }
    candidates.truncate(3);
    candidates
}

#[cfg(test)]
mod tests {
    use super::*;
    use hamilton_contracts::FingerprintCandidate;

    #[test]
    fn pad_to_three_pads_when_short() {
        let one = vec![FingerprintCandidate {
            method_id: "x".into(),
            named_systems: vec![],
            score: 0.8,
            munitions_affected: vec![],
            source_citation: "Bronk RUSI 2024".into(),
        }];
        let padded = pad_to_three(one);
        assert_eq!(padded.len(), 3);
        assert_eq!(padded[0].method_id, "x");
        assert_eq!(padded[1].score, 0.0);
        assert_eq!(padded[2].score, 0.0);
    }

    #[test]
    fn parses_mqtt_url_with_explicit_port() {
        let (h, p) = parse_broker_url("mqtt://broker.local:1884").unwrap();
        assert_eq!(h, "broker.local");
        assert_eq!(p, 1884);
    }

    #[test]
    fn parses_mqtt_url_with_default_port() {
        let (h, p) = parse_broker_url("mqtt://localhost").unwrap();
        assert_eq!(h, "localhost");
        assert_eq!(p, 1883);
    }

    #[test]
    fn pad_to_three_truncates_when_long() {
        let many: Vec<_> = (0..5)
            .map(|i| FingerprintCandidate {
                method_id: format!("m{i}"),
                named_systems: vec![],
                score: 0.9 - (i as f64) * 0.1,
                munitions_affected: vec![],
                source_citation: "".into(),
            })
            .collect();
        let padded = pad_to_three(many);
        assert_eq!(padded.len(), 3);
        assert_eq!(padded[0].method_id, "m0");
        assert_eq!(padded[2].method_id, "m2");
    }
}
