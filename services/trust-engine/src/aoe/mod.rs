//! Jammer area-of-effect lifecycle (FR-04b, plan `jammer-aoe.md` E15).
//!
//! Pure and clock-free: [`AoeTracker::tick`] takes the tick time and the
//! engine's unit views and returns [`AoeAction`]s; `ticker.rs` executes them
//! (MQTT + DuckDB). Tests drive it with a fake clock and collect the actions
//! (an in-memory publisher).
//!
//! - **Trigger:** the top FR-04a candidate (dimension 6 = observed degraded
//!   classes) matches ≥ 5/6, leads the second by ≥ 2 whole dimensions
//!   (integer counts), and ≥ 1 unit has been degraded (GNSS fix or link
//!   verdict) for ≥ 3 s.
//! - **Recompute** when the evidence hash changes (250 m quantised), at most
//!   every 5 s; **heartbeat** every 10 s; `valid_until` = tick + 20 s.
//! - **Stale** 10 s after the trigger drops; **retire** (empty retained
//!   payload + `retire` event) 120 s after it.
//! - **Unbounded** (no polygons) when no healthy same-class unit lies within
//!   R_max of a degraded one.

pub mod estimator;
pub mod inputs;
#[cfg(test)]
mod tests;

use std::collections::HashMap;

use chrono::{DateTime, Utc};
use hamilton_contracts::{
    self as wire, AoeContour, AoeLayer, DetectionEvent, DetectionKind, EmitterEstimatePayload,
    EmitterRegion, EstimateHypotheses, EstimateModel, EstimateModelKind, EstimateSchema,
    EvidenceItem as WireEvidence, EvidenceState, MultiPolygon, PropagationModel,
};
use trust_detectors::{
    fingerprint::{Dimension6, FingerprintEntry},
    fingerprint_candidates::{lead_dimensions, rank_candidates_with},
};
use trust_library::ReceiverTable;

use crate::state::ClassState;
use estimator::{AoeEstimator, Estimate, EstimateState as EstState};
use inputs::{AoFrame, EvidenceItem, UnitView};

/// Lifecycle timings and trigger thresholds (plan E15, System Design §5.4).
#[derive(Debug, Clone, PartialEq)]
pub struct AoeConfig {
    pub trigger_min_matched: u32,
    pub trigger_min_lead: u32,
    pub degraded_hold_ms: i64,
    pub min_recompute_ms: i64,
    pub heartbeat_ms: i64,
    pub valid_for_ms: i64,
    pub stale_after_ms: i64,
    pub retire_after_ms: i64,
    /// How long a superseded opposite-state observation stays evidence.
    pub evidence_retention_ms: i64,
    pub frame: AoFrame,
}

impl Default for AoeConfig {
    fn default() -> Self {
        Self {
            trigger_min_matched: 5,
            trigger_min_lead: 2,
            degraded_hold_ms: 3_000,
            min_recompute_ms: 5_000,
            heartbeat_ms: 10_000,
            valid_for_ms: 20_000,
            stale_after_ms: 10_000,
            retire_after_ms: 120_000,
            evidence_retention_ms: 120_000,
            frame: AoFrame::avdiivka(),
        }
    }
}

/// A lifecycle transition worth an `events` row and an `emitter_estimates` row.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Transition {
    Open,
    Update,
    Stale,
    Retire,
}

impl Transition {
    pub fn as_str(self) -> &'static str {
        match self {
            Transition::Open => "open",
            Transition::Update => "update",
            Transition::Stale => "stale",
            Transition::Retire => "retire",
        }
    }
}

#[derive(Debug, Clone, PartialEq)]
pub enum AoeAction {
    /// Publish (retained, QoS 1). `transition` is `None` for a heartbeat.
    Publish {
        payload: Box<EmitterEstimatePayload>,
        transition: Option<Transition>,
    },
    /// Publish an empty retained payload and log the retirement.
    Retire {
        estimate_id: String,
        evidence_hash: String,
        at: DateTime<Utc>,
    },
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Phase {
    Active,
    Stale,
}

#[derive(Debug, Clone)]
struct Episode {
    estimate_id: String,
    phase: Phase,
    /// Tick at which the trigger was first seen false (cleared when it returns).
    dropped_ms: Option<i64>,
    last_publish_ms: i64,
    hash: String,
    estimate: Estimate,
    method_match: f64,
    method_ambiguous: bool,
    unbounded: bool,
    evidence: Vec<EvidenceItem>,
}

/// The trigger's view of the best FR-04a candidate list this tick.
#[derive(Debug, Clone, PartialEq)]
pub struct TriggerReading {
    pub method_id: String,
    pub top_matched: u32,
    pub lead: u32,
    pub degraded_held: bool,
}

impl TriggerReading {
    fn fires(&self, cfg: &AoeConfig) -> bool {
        self.top_matched >= cfg.trigger_min_matched
            && self.lead >= cfg.trigger_min_lead
            && self.degraded_held
    }
}

pub struct AoeTracker {
    cfg: AoeConfig,
    /// Link verdict per source: (degraded, since_ms).
    link: HashMap<String, (bool, i64)>,
    episode: Option<Episode>,
}

impl AoeTracker {
    pub fn new(cfg: AoeConfig) -> Self {
        Self {
            cfg,
            link: HashMap::new(),
            episode: None,
        }
    }

    /// Evaluate the trigger: the best candidate list over every unit with an
    /// RF observation (highest top count, then lead, then source id).
    pub fn trigger(
        &mut self,
        units: &[UnitView],
        library: &[FingerprintEntry],
        now_ms: i64,
    ) -> Option<TriggerReading> {
        for u in units {
            let e = self
                .link
                .entry(u.source_id.clone())
                .or_insert((u.link_degraded, now_ms));
            if e.0 != u.link_degraded {
                *e = (u.link_degraded, now_ms);
            }
        }
        let hold = self.cfg.degraded_hold_ms;
        let degraded_held = units.iter().any(|u| {
            let gnss = u.gnss.as_ref().is_some_and(|g| {
                g.current.state == ClassState::Degraded && now_ms - g.since_ms >= hold
            });
            let link = self
                .link
                .get(&u.source_id)
                .is_some_and(|&(d, since)| d && now_ms - since >= hold);
            gnss || link
        });
        let mut best: Option<(u32, u32, &str, String)> = None;
        for u in units {
            let Some(rf) = &u.rf else { continue };
            let classes = u.degraded_classes();
            let ranked = rank_candidates_with(rf, Dimension6::ObservedClasses(&classes), library);
            let Some(top) = ranked.first().filter(|c| !c.method_id.is_empty()) else {
                continue;
            };
            let cand = (
                top.matched,
                lead_dimensions(&ranked),
                u.source_id.as_str(),
                top.method_id.clone(),
            );
            let better = match &best {
                None => true,
                Some(b) => {
                    (cand.0, cand.1, std::cmp::Reverse(cand.2)) > (b.0, b.1, std::cmp::Reverse(b.2))
                }
            };
            if better {
                best = Some(cand);
            }
        }
        best.map(|(top_matched, lead, _, method_id)| TriggerReading {
            method_id,
            top_matched,
            lead,
            degraded_held,
        })
    }

    /// One tick at engine time `now_ms`.
    pub fn tick(
        &mut self,
        now_ms: i64,
        units: &[UnitView],
        library: &[FingerprintEntry],
        receivers: &ReceiverTable,
        estimator: &dyn AoeEstimator,
    ) -> Vec<AoeAction> {
        let reading = self.trigger(units, library, now_ms);
        let fired = reading.as_ref().filter(|r| r.fires(&self.cfg));
        let mut out = Vec::new();

        if let Some(r) = fired {
            let Some(entry) = library.iter().find(|e| e.method_id == r.method_id) else {
                return out;
            };
            let Some(method) = inputs::method_model(entry) else {
                return out;
            };
            let evidence = inputs::build_evidence(
                units,
                &self.cfg.frame,
                now_ms,
                self.cfg.evidence_retention_ms,
            );
            let hash = inputs::evidence_hash(&r.method_id, &evidence, &self.cfg.frame);
            let method_match = f64::from(r.top_matched) / 6.0;
            let est_evidence = inputs::to_est_evidence(&evidence, now_ms);
            let est_receivers = inputs::receivers(receivers);
            let Some(grid) = inputs::fit_grid(
                &est_evidence,
                &method,
                &est_receivers,
                self.cfg.frame.flot.clone(),
            ) else {
                return out;
            };
            // `unbounded` (no healthy same-class unit within R_max of a
            // degraded one) is decided by the estimator.
            let compute = |_: &Self| {
                let est = estimator.estimate(&est_evidence, &method, &est_receivers, &grid);
                let unbounded = est.state == EstState::Unbounded;
                (est, unbounded)
            };
            match self.episode.take() {
                None => {
                    let (estimate, unbounded) = compute(self);
                    let ep = Episode {
                        estimate_id: estimate_id(now_ms),
                        phase: Phase::Active,
                        dropped_ms: None,
                        last_publish_ms: now_ms,
                        hash,
                        estimate,
                        method_match,
                        method_ambiguous: false,
                        unbounded,
                        evidence,
                    };
                    out.push(self.publish(&ep, now_ms, Some(Transition::Open)));
                    self.episode = Some(ep);
                }
                Some(mut ep) => {
                    ep.dropped_ms = None;
                    let changed = ep.hash != hash || ep.phase == Phase::Stale;
                    if changed && now_ms - ep.last_publish_ms >= self.cfg.min_recompute_ms {
                        let (estimate, unbounded) = compute(self);
                        ep.phase = Phase::Active;
                        ep.hash = hash;
                        ep.estimate = estimate;
                        ep.unbounded = unbounded;
                        ep.method_match = method_match;
                        ep.evidence = evidence;
                        ep.last_publish_ms = now_ms;
                        out.push(self.publish(&ep, now_ms, Some(Transition::Update)));
                    } else if now_ms - ep.last_publish_ms >= self.cfg.heartbeat_ms {
                        ep.last_publish_ms = now_ms;
                        out.push(self.publish(&ep, now_ms, None));
                    }
                    self.episode = Some(ep);
                }
            }
            return out;
        }

        let Some(mut ep) = self.episode.take() else {
            return out;
        };
        let dropped = *ep.dropped_ms.get_or_insert(now_ms);
        if now_ms - dropped >= self.cfg.retire_after_ms {
            out.push(AoeAction::Retire {
                estimate_id: ep.estimate_id,
                evidence_hash: ep.hash,
                at: at(now_ms),
            });
            return out;
        }
        if ep.phase == Phase::Active && now_ms - dropped >= self.cfg.stale_after_ms {
            ep.phase = Phase::Stale;
            ep.last_publish_ms = now_ms;
            out.push(self.publish(&ep, now_ms, Some(Transition::Stale)));
        } else if now_ms - ep.last_publish_ms >= self.cfg.heartbeat_ms {
            ep.last_publish_ms = now_ms;
            out.push(self.publish(&ep, now_ms, None));
        }
        self.episode = Some(ep);
        out
    }

    fn publish(&self, ep: &Episode, now_ms: i64, transition: Option<Transition>) -> AoeAction {
        AoeAction::Publish {
            payload: Box::new(to_payload(ep, now_ms, self.cfg.valid_for_ms)),
            transition,
        }
    }
}

fn at(ms: i64) -> DateTime<Utc> {
    DateTime::from_timestamp_millis(ms).unwrap_or_default()
}

/// Stable per episode: `J1-<open time, UTC, compact>`.
pub fn estimate_id(open_ms: i64) -> String {
    format!("J1-{}", at(open_ms).format("%Y%m%dT%H%M%SZ"))
}

/// Round to `dp` decimal places (multiply-then-divide, so 5 dp stays exact
/// in its shortest JSON form).
fn round_dp(v: f64, dp: i32) -> f64 {
    let k = 10f64.powi(dp);
    (v * k).round() / k
}

fn to_payload(ep: &Episode, now_ms: i64, valid_for_ms: i64) -> EmitterEstimatePayload {
    let e = &ep.estimate;
    let no_polygons = ep.unbounded;
    let state = match (ep.phase, no_polygons) {
        (Phase::Stale, _) => wire::EstimateState::Stale,
        (Phase::Active, true) => wire::EstimateState::Unbounded,
        (Phase::Active, false) => wire::EstimateState::Active,
    };
    let aoe = e
        .aoe
        .iter()
        .map(|l| AoeLayer {
            rx_class: inputs::to_wire_class(l.rx_class),
            contours: if no_polygons {
                Vec::new()
            } else {
                l.contours
                    .iter()
                    .map(|c| AoeContour {
                        p: c.p,
                        polygon: MultiPolygon::new(c.polygon.clone()),
                        area_km2: c.area_km2,
                    })
                    .collect()
            },
            radius_km_range: l.radius_km_range,
        })
        .collect();
    let emitter = EmitterRegion {
        region90: MultiPolygon::new(if no_polygons {
            Vec::new()
        } else {
            e.emitter.region90.clone()
        }),
        area90_km2: if no_polygons {
            0.0
        } else {
            e.emitter.area90_km2
        },
        erp_dbm_range: e.emitter.erp_dbm_range,
    };
    EmitterEstimatePayload {
        schema: EstimateSchema::V1,
        estimate_id: ep.estimate_id.clone(),
        state,
        method_id: e.method_id.clone(),
        method_match: ep.method_match,
        method_ambiguous: ep.method_ambiguous,
        model: EstimateModel {
            kind: EstimateModelKind::Set,
            propagation: PropagationModel::TwoRay,
            grid_m: e.model.grid_m,
            hypotheses: EstimateHypotheses {
                erp_dbm: e.model.erp_dbm.clone(),
                mast_m: e.model.mast_m.clone(),
            },
            sigma_db: e.model.sigma_db,
        },
        aoe,
        emitter,
        evidence: ep
            .evidence
            .iter()
            .map(|v| WireEvidence {
                source_id: v.source_id.clone(),
                state: match v.state {
                    ClassState::Degraded => EvidenceState::Degraded,
                    ClassState::Healthy => EvidenceState::Healthy,
                },
                rx_class: v.rx_class,
                age_s: round_dp((now_ms - v.observed_ms).max(0) as f64 / 1000.0, 1),
                lat: round_dp(v.lat, 5),
                lon: round_dp(v.lon, 5),
            })
            .collect(),
        evidence_hash: ep.hash.clone(),
        computed_at: at(now_ms),
        valid_until: at(now_ms + valid_for_ms),
    }
}

/// Units by their newest report: (degraded, healthy). Evidence can hold two
/// reports for one unit (`inputs::build_evidence` keeps B's earlier degraded
/// report after it moved), so counting reports would over-count units.
pub fn unit_counts(p: &EmitterEstimatePayload) -> (usize, usize) {
    let mut newest: HashMap<&str, (f64, EvidenceState)> = HashMap::new();
    for e in &p.evidence {
        let slot = newest
            .entry(e.source_id.as_str())
            .or_insert((e.age_s, e.state));
        if e.age_s < slot.0 {
            *slot = (e.age_s, e.state);
        }
    }
    let d = newest
        .values()
        .filter(|(_, s)| *s == EvidenceState::Degraded)
        .count();
    (d, newest.len() - d)
}

/// The `events` row for a transition (HS-24).
pub fn transition_event(
    payload: Option<&EmitterEstimatePayload>,
    estimate_id: &str,
    evidence_hash: &str,
    transition: Transition,
    timestamp: DateTime<Utc>,
) -> DetectionEvent {
    let (degraded, healthy) = payload.map_or((0, 0), unit_counts);
    let state = payload.map_or("retired".to_string(), |p| {
        serde_json::to_value(p.state)
            .ok()
            .and_then(|v| v.as_str().map(str::to_string))
            .unwrap_or_default()
    });
    let method = payload.map_or("", |p| p.method_id.as_str());
    let message = match transition {
        Transition::Retire => format!("Est. GPS denial {estimate_id} retired — evidence stopped"),
        t => format!(
            "Est. GPS denial {estimate_id} {} · {method} · {state} · {degraded} degraded / {healthy} healthy",
            match t {
                Transition::Open => "opened",
                Transition::Update => "updated",
                _ => "stale",
            }
        ),
    };
    DetectionEvent {
        source_id: estimate_id.to_string(),
        kind: DetectionKind::EmitterEstimate,
        message,
        values: Some(serde_json::json!({
            "estimate_id": estimate_id,
            "transition": transition.as_str(),
            "state": state,
            "method_id": method,
            "evidence_hash": evidence_hash,
            "area90_km2": payload.map(|p| p.emitter.area90_km2),
            "degraded": degraded,
            "healthy": healthy,
        })),
        timestamp,
    }
}
