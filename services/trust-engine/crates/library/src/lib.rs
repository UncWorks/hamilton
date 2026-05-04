//! Fingerprint library loader (FRS §2.4a).
//!
//! Library is data, not code (NFR-06). Additions post-Sunday-6AM are
//! documentation, not new dependencies.

use anyhow::{Context, Result};
use serde::Deserialize;
use std::path::Path;
use trust_detectors::fingerprint::{FingerprintEntry, TimeDomainPattern};

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
    effective_range_km: f64,
    munitions_affected: Vec<String>,
    source_citation: String,
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
                effective_range_km: raw.effective_range_km,
                munitions_affected: raw.munitions_affected,
                source_citation: raw.source_citation,
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
