//! Per-source mutable state held in memory between ticks.

use std::collections::HashMap;
use std::collections::VecDeque;

use hamilton_contracts as wire;
use trust_detectors::{
    fingerprint::{RfFingerprint, TimeDomainPattern as DetectorPattern},
    spatial::{Position, SourceLocation},
    stability::StabilityWindow,
    temporal::{InterArrival, TemporalBaseline},
};

#[derive(Default)]
pub struct EngineState {
    pub sources: HashMap<String, SourceState>,
}

pub struct SourceState {
    pub location: SourceLocation,
    pub baseline: TemporalBaseline,
    pub recent_arrivals: VecDeque<InterArrival>,
    pub stability: StabilityWindow,
    pub last_rf: Option<RfFingerprint>,
}

impl SourceState {
    pub fn new(source_id: impl Into<String>, lat: f64, lon: f64) -> Self {
        Self {
            location: SourceLocation {
                id: source_id.into(),
                position: Position { lat, lon },
            },
            baseline: TemporalBaseline {
                mean_seconds: 1.0,
                stddev_seconds: 0.05,
            },
            recent_arrivals: VecDeque::with_capacity(64),
            stability: StabilityWindow {
                crc_error_rate: 0.002,
                duplicate_rate: 0.0,
                baseline_duplicate_rate: 0.0,
            },
            last_rf: None,
        }
    }
}

/// Convert a wire-format RF observation into the detector input type.
pub fn rf_from_wire(o: &wire::RfObservation) -> RfFingerprint {
    let pattern = match o.time_domain_pattern {
        wire::TimeDomainPattern::Continuous => DetectorPattern::Continuous,
        wire::TimeDomainPattern::Pulsed => DetectorPattern::Pulsed,
        wire::TimeDomainPattern::Barrage => DetectorPattern::Barrage,
        wire::TimeDomainPattern::Swept => DetectorPattern::Swept,
    };
    RfFingerprint {
        frequency_band_mhz: o.frequency_band_mhz,
        hop_spread_hz: o.hop_spread_hz,
        gps_l1_overlap: o.gps_l1_overlap,
        gps_l2_overlap: o.gps_l2_overlap,
        time_domain_pattern: pattern,
        // telemetry/2 makes `effective_range_km` optional (contracts K1/K7). Until
        // E20 replaces fingerprint dimension 6, an absent range is 0 km, so the
        // range dimension still matches and B's 6/6 top match (and the K5 trust
        // pins) do not move when the sim stops sending it.
        effective_range_km: o.effective_range_km.unwrap_or(0.0),
    }
}
