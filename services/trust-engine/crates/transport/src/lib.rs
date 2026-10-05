//! Transport layer — MQTT publication + DuckDB after-action log.
//!
//! The Rust engine is the source of truth (System Design §5). Both renderers
//! and the LLM narrator are *consumers* over MQTT.

pub mod log;
pub mod mqtt;

pub use log::{AfterActionLog, EmitterEstimateRow, LogConfig};
pub use mqtt::{encode_emitter_estimate, parse_broker_url, MqttPublisher, MqttPublisherConfig};
