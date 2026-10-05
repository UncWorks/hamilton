//! Fingerprint library loader (FRS §2.4a).
//!
//! Library is data, not code (NFR-06). Additions post-Sunday-6AM are
//! documentation, not new dependencies.

use anyhow::{Context, Result};
use hamilton_contracts::RxClass;
use serde::Deserialize;
use std::path::Path;
use trust_detectors::fingerprint::{EmitterEnvelope, FingerprintEntry, TimeDomainPattern};

#[derive(Debug, Deserialize)]
struct LibraryFile {
    entries: Vec<RawEntry>,
}

#[derive(Debug, Deserialize)]
struct RawEntry {
    method_id: String,
    named_systems: Vec<String>,
    frequency_band_mhz: [f64; 2],
    hop_spread_hz: f64,
    gps_l1_overlap: bool,
    gps_l2_overlap: bool,
    time_domain_pattern: String,
    // `effective_range_km` (v0.1) is deprecated in v0.2 (an emitter range is
    // not observable): still accepted in the file, ignored by the loader.
    /// v0.2 (A1). Absent in v0.1 files.
    #[serde(default)]
    affects_rx_classes: Vec<RxClass>,
    munitions_affected: Vec<String>,
    source_citation: String,
    /// v0.2 optional envelope; module `eirp_w_claimed` / `emitter_height_m`
    /// may be `null` (the comms module).
    #[serde(default)]
    emitter: EmitterEnvelope,
}

pub fn load_from_path(path: impl AsRef<Path>) -> Result<Vec<FingerprintEntry>> {
    let p = path.as_ref();
    let text = std::fs::read_to_string(p)
        .with_context(|| format!("failed to read fingerprint library at {}", p.display()))?;
    parse_library(&text)
}

pub fn parse_library(json: &str) -> Result<Vec<FingerprintEntry>> {
    let file: LibraryFile = serde_json::from_str(json).context("invalid library JSON")?;
    file.entries
        .into_iter()
        .map(|raw| {
            let pattern = match raw.time_domain_pattern.as_str() {
                "continuous" => TimeDomainPattern::Continuous,
                "pulsed" => TimeDomainPattern::Pulsed,
                "barrage" => TimeDomainPattern::Barrage,
                "swept" => TimeDomainPattern::Swept,
                other => anyhow::bail!("unknown time_domain_pattern: {other}"),
            };
            Ok(FingerprintEntry {
                method_id: raw.method_id,
                named_systems: raw.named_systems,
                frequency_band_mhz: raw.frequency_band_mhz,
                hop_spread_hz: raw.hop_spread_hz,
                gps_l1_overlap: raw.gps_l1_overlap,
                gps_l2_overlap: raw.gps_l2_overlap,
                time_domain_pattern: pattern,
                affects_rx_classes: raw.affects_rx_classes,
                munitions_affected: raw.munitions_affected,
                source_citation: raw.source_citation,
                emitter: raw.emitter,
            })
        })
        .collect()
}

/// Bundled library shipped with the binary. Used in offline / docker contexts
/// where the assets directory may not be mounted.
pub const BUNDLED_LIBRARY_JSON: &str =
    include_str!("../../../../../assets/fingerprints/library.json");

pub fn load_bundled() -> Result<Vec<FingerprintEntry>> {
    parse_library(BUNDLED_LIBRARY_JSON)
}

/// Receiver thresholds (`assets/fingerprints/receivers.json`, A2).
pub const BUNDLED_RECEIVERS_JSON: &str =
    include_str!("../../../../../assets/fingerprints/receivers.json");

/// One receiver class's J/S threshold.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct ReceiverThreshold {
    pub rx_class: RxClass,
    pub threshold_js_db: f64,
}

/// The receiver-side link budget and per-class thresholds.
#[derive(Debug, Clone, PartialEq)]
pub struct ReceiverTable {
    /// GNSS L1 C/A nominal received power, dBm.
    pub signal_dbm: f64,
    pub rx_gain_dbi: f64,
    pub rx_height_m: f64,
    pub freq_mhz: f64,
    /// In `RxClass` order.
    pub classes: Vec<ReceiverThreshold>,
}

#[derive(Deserialize)]
struct RawReceivers {
    gnss_signal: RawGnssSignal,
    receivers: std::collections::BTreeMap<RxClass, RawReceiver>,
}

#[derive(Deserialize)]
struct RawGnssSignal {
    f_mhz: f64,
    l1_ca_received_dbm: RawSignalLevel,
    rx_antenna_gain_toward_jammer_dbi: f64,
    rx_antenna_height_m: f64,
}

#[derive(Deserialize)]
struct RawSignalLevel {
    nominal: f64,
}

#[derive(Deserialize)]
struct RawReceiver {
    threshold_js_db: f64,
}

pub fn parse_receivers(json: &str) -> Result<ReceiverTable> {
    let raw: RawReceivers = serde_json::from_str(json).context("invalid receivers JSON")?;
    Ok(ReceiverTable {
        signal_dbm: raw.gnss_signal.l1_ca_received_dbm.nominal,
        rx_gain_dbi: raw.gnss_signal.rx_antenna_gain_toward_jammer_dbi,
        rx_height_m: raw.gnss_signal.rx_antenna_height_m,
        freq_mhz: raw.gnss_signal.f_mhz,
        classes: raw
            .receivers
            .into_iter()
            .map(|(rx_class, r)| ReceiverThreshold {
                rx_class,
                threshold_js_db: r.threshold_js_db,
            })
            .collect(),
    })
}

pub fn load_bundled_receivers() -> Result<ReceiverTable> {
    parse_receivers(BUNDLED_RECEIVERS_JSON)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn bundled_library_parses_with_at_least_three_entries() {
        let entries = load_bundled().expect("bundled library must parse");
        assert!(
            entries.len() >= 3,
            "FRS §2.4a requires at least 3 candidates available"
        );
    }

    #[test]
    fn bundled_library_includes_ground_based_gps_uhf_barrage() {
        let entries = load_bundled().unwrap();
        let names: Vec<&str> = entries.iter().map(|e| e.method_id.as_str()).collect();
        assert!(
            names.contains(&"ground_based_gps_uhf_barrage"),
            "demo Beat 1:15 acceptance requires this method_id; got {names:?}"
        );
    }

    #[test]
    fn v0_2_envelope_and_affected_classes_parse_with_null_comms_eirp() {
        let entries = load_bundled().unwrap();
        let demo = &entries[0];
        assert_eq!(demo.method_id, "ground_based_gps_uhf_barrage");
        assert_eq!(
            demo.affects_rx_classes,
            [
                RxClass::GnssCivil,
                RxClass::GnssMil,
                RxClass::UhfComms,
                RxClass::FpvLink
            ]
        );
        assert_eq!(demo.emitter.modules.len(), 2);
        assert_eq!(demo.emitter.modules[1].eirp_w_claimed, None);
        assert_eq!(demo.emitter.modules[1].emitter_height_m, None);
        assert_eq!(
            demo.gnss_module().unwrap().eirp_w_claimed,
            Some([300.0, 1000.0])
        );
    }

    #[test]
    fn v0_1_entry_without_new_fields_still_parses() {
        let v01 = r#"{"entries":[{"method_id":"x","named_systems":[],
            "frequency_band_mhz":[0,1],"hop_spread_hz":0,"gps_l1_overlap":false,
            "gps_l2_overlap":false,"time_domain_pattern":"barrage",
            "effective_range_km":5,"munitions_affected":[],"source_citation":"x"}]}"#;
        let e = parse_library(v01).unwrap();
        assert!(e[0].affects_rx_classes.is_empty());
        assert!(e[0].emitter.modules.is_empty());
    }

    #[test]
    fn bundled_receivers_thresholds() {
        let r = load_bundled_receivers().unwrap();
        assert_eq!(r.signal_dbm, -125.0);
        assert_eq!(r.rx_gain_dbi, -5.0);
        assert_eq!(r.rx_height_m, 2.0);
        let t = |c| {
            r.classes
                .iter()
                .find(|x| x.rx_class == c)
                .unwrap()
                .threshold_js_db
        };
        assert_eq!(t(RxClass::GnssCivil), 36.0);
        assert_eq!(t(RxClass::GnssMil), 41.0);
        assert_eq!(t(RxClass::UhfComms), 10.0);
    }

    #[test]
    fn rejects_unknown_time_domain_pattern() {
        let bad = r#"{
            "entries": [{
                "method_id": "x",
                "named_systems": [],
                "frequency_band_mhz": [0, 1],
                "hop_spread_hz": 0,
                "gps_l1_overlap": false,
                "gps_l2_overlap": false,
                "time_domain_pattern": "bogus",
                "effective_range_km": 0,
                "munitions_affected": [],
                "source_citation": "x"
            }]
        }"#;
        assert!(parse_library(bad).is_err());
    }
}
