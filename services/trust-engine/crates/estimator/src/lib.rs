//! `trust-estimator`: the jammer area-of-effect estimator (FR-04b, `docs/plans/jammer-aoe.md` §1).
//!
//! A soft set-based grid estimator: a fixed 250 m grid, a fixed EIRP × mast
//! hypothesis set, a two-ray + horizon link budget, a binary probit likelihood
//! per unit (σ 6 dB), log-domain sums in a fixed order. No training, no learned
//! weights, no sampling; the same input gives the same bytes.
//!
//! Pipeline: [`evidence::canonical`] → [`set::posterior`] (HPD 90% region) →
//! [`aoe::p_denied`] per class → [`contour::contour`] → [`Estimate`].

pub mod aoe;
pub mod contour;
pub mod evidence;
pub mod grid;
pub mod propagation;
pub mod set;
pub mod types;

pub use types::*;

use contour::KmPolygon;
use evidence::GridObs;
use grid::GridGeom;
use set::Posterior;

/// Contour levels per class layer, in output order.
pub const LEVELS: [f64; 2] = [0.5, 0.9];
/// Vertex budget over all published multipolygons (2 classes × 2 levels + region90).
/// At ~20.5 B per `[lon,lat]` vertex (5 dp) this keeps the estimator's part of the
/// payload near 5.3 KB, leaving ~1.8 KB of the 7168 B F7 budget for the engine's
/// evidence list (~125 B per unit), ids, hash and times.
pub const MAX_TOTAL_VERTICES: usize = 240;
/// An EIRP hypothesis is reported in `erp_dbm_range` if its marginal mass is at least this.
pub const ERP_RANGE_MIN_MASS: f64 = 0.05;

/// P(denied) field of one receiver class.
#[derive(Debug, Clone)]
pub struct ClassField {
    pub rx_class: RxClass,
    pub threshold_db: f64,
    /// Denial radius per hypothesis, km.
    pub radii_km: Vec<f64>,
    /// Row-major P(denied | cell); empty when unbounded.
    pub p_denied: Vec<f64>,
}

/// The full intermediate state of one run (for tests and diagnostics; the
/// published result is [`Estimate`]).
#[derive(Debug, Clone)]
pub struct Analysis {
    pub geom: GridGeom,
    pub obs: Vec<GridObs>,
    pub state: EstimateState,
    /// `None` when unbounded.
    pub posterior: Option<Posterior>,
    /// Enemy-side mask (region90 is clipped to it).
    pub enemy: Vec<bool>,
    pub classes: Vec<ClassField>,
}

impl Analysis {
    /// Is (lat, lon)'s nearest cell inside the HPD 90% emitter region?
    pub fn in_region90(&self, lat: f64, lon: f64) -> bool {
        let (x, y) = self.geom.to_enu(lat, lon);
        match (&self.posterior, self.geom.nearest(x, y)) {
            (Some(p), Some(c)) => p.pe[c] >= p.thr90,
            _ => false,
        }
    }

    /// HPD 90% area, km² (cell count × cell area).
    pub fn area90_km2(&self) -> f64 {
        self.posterior
            .as_ref()
            .map(|p| p.n90 as f64 * self.geom.cell_area_km2())
            .unwrap_or(0.0)
    }

    /// P(denied) at (lat, lon)'s nearest cell.
    pub fn p_denied_at(&self, rx_class: RxClass, lat: f64, lon: f64) -> Option<f64> {
        let (x, y) = self.geom.to_enu(lat, lon);
        let c = self.geom.nearest(x, y)?;
        let f = self.classes.iter().find(|f| f.rx_class == rx_class)?;
        f.p_denied.get(c).copied()
    }

    /// Contour of one class at `level`, in grid km, nested but unsimplified.
    pub fn class_contour_km(&self, rx_class: RxClass, level: f64) -> Vec<KmPolygon> {
        let g = &self.geom;
        match self.classes.iter().find(|f| f.rx_class == rx_class) {
            Some(f) if !f.p_denied.is_empty() => {
                contour::contour_raw(&f.p_denied, g.nx, g.ny, g.x0, g.y0, g.res_km, level)
            }
            _ => Vec::new(),
        }
    }

    /// The region90 polygon in grid km (enemy side only), nested but unsimplified.
    pub fn region90_km(&self) -> Vec<KmPolygon> {
        let g = &self.geom;
        match &self.posterior {
            Some(p) => {
                let masked: Vec<f64> =
                    p.pe.iter()
                        .zip(&self.enemy)
                        .map(|(&v, &e)| if e { v } else { 0.0 })
                        .collect();
                contour::contour_raw(&masked, g.nx, g.ny, g.x0, g.y0, g.res_km, p.thr90)
            }
            None => Vec::new(),
        }
    }
}

/// Receiver classes that get an AoE layer, in [`RxClass`] order.
fn layer_classes(method: &MethodModel, receivers: &Receivers) -> Vec<ReceiverClass> {
    let mut out: Vec<ReceiverClass> = receivers
        .classes
        .iter()
        .filter(|c| {
            method.affects_rx_classes.is_empty() || method.affects_rx_classes.contains(&c.rx_class)
        })
        .copied()
        .collect();
    out.sort_by(|a, b| {
        a.rx_class
            .cmp(&b.rx_class)
            .then(a.js_threshold_db.total_cmp(&b.js_threshold_db))
    });
    out.dedup_by(|a, b| a.rx_class == b.rx_class);
    out
}

/// Maximum denial radius of a class over the hypothesis set, km (R_max).
pub fn r_max_km(method: &MethodModel, receivers: &Receivers, threshold_db: f64) -> f64 {
    aoe::radii_km(method, receivers, threshold_db)
        .into_iter()
        .fold(0.0, f64::max)
}

/// FR-04b "edge observed": some degraded unit has a healthy unit of the same class within R_max.
fn bounded(obs: &[GridObs], method: &MethodModel, receivers: &Receivers) -> bool {
    obs.iter().filter(|o| o.degraded).any(|d| {
        let r = r_max_km(method, receivers, d.threshold_db);
        obs.iter()
            .any(|h| !h.degraded && h.rx_class == d.rx_class && (h.x - d.x).hypot(h.y - d.y) <= r)
    })
}

/// Run the estimator and keep every intermediate field.
pub fn analyze(
    evidence: &Evidence,
    method: &MethodModel,
    receivers: &Receivers,
    grid: &Grid,
) -> Analysis {
    let geom = GridGeom::new(grid);
    let obs = evidence::canonical(evidence, receivers, &geom);
    let layers = layer_classes(method, receivers);
    let is_bounded = !geom.is_empty() && bounded(&obs, method, receivers);
    let state = if is_bounded {
        EstimateState::Active
    } else {
        EstimateState::Unbounded
    };
    let enemy = grid::enemy_mask(grid, &geom);
    let (posterior, classes) = if is_bounded {
        let ln_prior = grid::ln_prior(grid, &geom);
        let post = set::posterior(&obs, method, receivers, &geom, &ln_prior);
        let cutoff = aoe::prune_cutoff(&post);
        let classes = layers
            .iter()
            .map(|c| {
                let radii_km = aoe::radii_km(method, receivers, c.js_threshold_db);
                let p_denied = aoe::p_denied(&post, &geom, &radii_km, cutoff);
                ClassField {
                    rx_class: c.rx_class,
                    threshold_db: c.js_threshold_db,
                    radii_km,
                    p_denied,
                }
            })
            .collect();
        (Some(post), classes)
    } else {
        let classes = layers
            .iter()
            .map(|c| ClassField {
                rx_class: c.rx_class,
                threshold_db: c.js_threshold_db,
                radii_km: aoe::radii_km(method, receivers, c.js_threshold_db),
                p_denied: Vec::new(),
            })
            .collect();
        (None, classes)
    };
    Analysis {
        geom,
        obs,
        state,
        posterior,
        enemy,
        classes,
    }
}

#[inline]
fn round_to(v: f64, scale: f64) -> f64 {
    (v * scale).round() / scale
}

fn to_multipolygon(geom: &GridGeom, polys: &[KmPolygon]) -> MultiPolygon {
    let ring = |r: &[(f64, f64)]| -> Ring {
        r.iter()
            .map(|&(x, y)| {
                let (lat, lon) = geom.to_latlon(x, y);
                [round_to(lon, 1e5), round_to(lat, 1e5)]
            })
            .collect()
    };
    polys
        .iter()
        .map(|g| {
            let mut p = vec![ring(&g.shell)];
            p.extend(g.holes.iter().map(|h| ring(h)));
            p
        })
        .collect()
}

/// Simplify every multipolygon to ≤ `contour::MAX_VERTICES` (64) and, if their total
/// exceeds [`MAX_TOTAL_VERTICES`], lower the common per-multipolygon limit in steps
/// of 4 until it fits (F7 wire budget).
fn simplify_within_budget(raw: &[Vec<KmPolygon>]) -> Vec<Vec<KmPolygon>> {
    let mut limit = contour::MAX_VERTICES;
    loop {
        let out: Vec<Vec<KmPolygon>> = raw.iter().map(|m| contour::simplify(m, limit)).collect();
        let total: usize = out.iter().map(|m| contour::vertex_count(m)).sum();
        if total <= MAX_TOTAL_VERTICES || limit <= 16 {
            return out;
        }
        limit -= 4;
    }
}

/// Estimate the per-class area of effect and the 90% emitter region.
///
/// Pure: no clock, no I/O, no global state; `evidence.now_ms` is echoed.
/// Identical input gives a bit-identical [`Estimate`]; the order of
/// `evidence.observations` does not matter.
pub fn estimate(
    evidence: &Evidence,
    method: &MethodModel,
    receivers: &Receivers,
    grid: &Grid,
) -> Estimate {
    let a = analyze(evidence, method, receivers, grid);
    summarise(&a, evidence, method)
}

/// Turn an [`Analysis`] into the published [`Estimate`].
pub fn summarise(a: &Analysis, evidence: &Evidence, method: &MethodModel) -> Estimate {
    let degraded_count = a.obs.iter().filter(|o| o.degraded).count() as u32;
    let healthy_count = a.obs.len() as u32 - degraded_count;
    // Raw (nested, unsimplified) multipolygons: [class × level…, region90].
    let active = a.state == EstimateState::Active;
    let mut raw: Vec<Vec<KmPolygon>> = Vec::new();
    if active {
        for f in &a.classes {
            for &p in &LEVELS {
                raw.push(a.class_contour_km(f.rx_class, p));
            }
        }
        raw.push(a.region90_km());
    }
    let simplified = simplify_within_budget(&raw);
    let mut it = simplified.into_iter();
    let aoe = a
        .classes
        .iter()
        .map(|f| {
            let lo = f.radii_km.iter().copied().fold(f64::INFINITY, f64::min);
            let hi = f.radii_km.iter().copied().fold(0.0, f64::max);
            let contours = if active {
                LEVELS
                    .iter()
                    .map(|&p| {
                        let km = it.next().unwrap_or_default();
                        Contour {
                            p,
                            area_km2: round_to(contour::area_km2(&km), 10.0),
                            polygon: to_multipolygon(&a.geom, &km),
                        }
                    })
                    .collect()
            } else {
                Vec::new()
            };
            AoeLayer {
                rx_class: f.rx_class,
                contours,
                radius_km_range: [
                    round_to(if lo.is_finite() { lo } else { 0.0 }, 10.0),
                    round_to(hi, 10.0),
                ],
            }
        })
        .collect();
    let region90 = it.next().unwrap_or_default();
    let erp_dbm_range = match &a.posterior {
        Some(p) => {
            let kept: Vec<f64> = method
                .erp_dbm
                .iter()
                .zip(&p.erp_marginal)
                .filter(|(_, &m)| m >= ERP_RANGE_MIN_MASS)
                .map(|(&e, _)| e)
                .collect();
            [
                kept.iter().copied().fold(f64::INFINITY, f64::min),
                kept.iter().copied().fold(f64::NEG_INFINITY, f64::max),
            ]
        }
        None => [
            method.erp_dbm.iter().copied().fold(f64::INFINITY, f64::min),
            method
                .erp_dbm
                .iter()
                .copied()
                .fold(f64::NEG_INFINITY, f64::max),
        ],
    };
    let erp_dbm_range = if erp_dbm_range[0].is_finite() {
        erp_dbm_range
    } else {
        [0.0, 0.0]
    };
    Estimate {
        state: a.state,
        method_id: method.method_id.clone(),
        computed_at_ms: evidence.now_ms,
        model: ModelSummary {
            grid_m: a.geom.res_km * 1000.0,
            erp_dbm: method.erp_dbm.clone(),
            mast_m: method.mast_m.clone(),
            sigma_db: method.sigma_db,
        },
        aoe,
        emitter: EmitterRegion {
            region90: to_multipolygon(&a.geom, &region90),
            area90_km2: round_to(a.area90_km2(), 10.0),
            erp_dbm_range,
        },
        degraded_count,
        healthy_count,
    }
}
