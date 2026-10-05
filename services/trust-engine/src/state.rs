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
    /// telemetry/2 receiver class (absent on v1 telemetry).
    pub rx_class: Option<wire::RxClass>,
    /// GNSS-class evidence (K2): from `gnss_fix` only, never from the link verdict.
    pub gnss: Option<GnssTrack>,
    /// Engine time (Unix ms) of the last telemetry message.
    pub last_report_ms: i64,
}

/// Binary per-class state of a unit (E13).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ClassState {
    Degraded,
    Healthy,
}

impl From<wire::GnssFix> for ClassState {
    /// K2: `3d` = healthy; `2d` / `none` = degraded.
    fn from(fix: wire::GnssFix) -> Self {
        if fix.is_degraded() {
            ClassState::Degraded
        } else {
            ClassState::Healthy
        }
    }
}

/// One binary observation of a class at a place and time.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct ClassObservation {
    pub state: ClassState,
    pub lat: f64,
    pub lon: f64,
    /// Last time (Unix ms) the unit reported this state at this position.
    pub last_ms: i64,
}

/// GNSS evidence of one unit: the current state (with when it began) and the
/// last observation of the opposite state, so a unit that moves out of the
/// AoE keeps its earlier degraded report as evidence (no history ring).
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct GnssTrack {
    pub rx_class: wire::RxClass,
    pub current: ClassObservation,
    /// When `current.state` began (Unix ms).
    pub since_ms: i64,
    /// Last-degraded or last-healthy observation before the current state.
    pub previous: Option<ClassObservation>,
}

impl GnssTrack {
    /// Fold one `gnss_fix` report into the track.
    pub fn observe(
        this: Option<Self>,
        rx_class: wire::RxClass,
        fix: wire::GnssFix,
        lat: f64,
        lon: f64,
        now_ms: i64,
    ) -> Self {
        let obs = ClassObservation {
            state: fix.into(),
            lat,
            lon,
            last_ms: now_ms,
        };
        match this {
            Some(t) if t.current.state == obs.state => GnssTrack {
                rx_class,
                current: obs,
                ..t
            },
            Some(t) => GnssTrack {
                rx_class,
                current: obs,
                since_ms: now_ms,
                previous: Some(t.current),
            },
            None => GnssTrack {
                rx_class,
                current: obs,
                since_ms: now_ms,
                previous: None,
            },
        }
    }
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
            rx_class: None,
            gnss: None,
            last_report_ms: 0,
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
