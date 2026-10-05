//! Binary probit evidence per receiver class (E6).
//!
//! A unit of class c at distance d reports *degraded* with probability
//! P_d = Φ((J/S(d) − T_c) / σ), clipped to [1e-6, 1 − 1e-6]; *healthy* with 1 − P_d.
//! Φ is closed form (Marsaglia's series). For speed, ln P is read from a fixed
//! table over z with linear interpolation (step 2⁻¹⁰, interpolation error
//! < 2e-7 nats); the table is built deterministically once per process.

use std::cmp::Ordering;
use std::sync::OnceLock;

use crate::grid::GridGeom;
use crate::types::{Evidence, Receivers, RxClass, UnitState};

/// Probability clip of the likelihood (the worked example's 1e-6).
pub const P_CLIP: f64 = 1.0e-6;
const Z_MAX: f64 = 8.0;
/// Φ(−Z_CLIP) = P_CLIP: beyond ±Z_CLIP the clipped likelihood is flat.
pub const Z_CLIP: f64 = 4.753_424_308_822_899;
const Z_TAB: f64 = 5.0;
const Z_STEPS_PER_UNIT: f64 = 1024.0;

/// Standard normal CDF, Marsaglia (2004) Taylor series; |error| ~1e-15 for |z| ≤ 8.
pub fn phi(z: f64) -> f64 {
    if z < -Z_MAX {
        return 0.0;
    }
    if z > Z_MAX {
        return 1.0;
    }
    let q = z * z;
    let (mut s, mut t, mut b, mut i) = (z, 0.0f64, z, 1.0f64);
    while s != t {
        t = s;
        i += 2.0;
        b *= q / i;
        s = t + b;
    }
    0.5 + s * (-0.5 * q - 0.918_938_533_204_672_8).exp()
}

/// ln of the clipped Φ(z), exact (the table's source).
pub fn ln_phi_clipped(z: f64) -> f64 {
    phi(z).clamp(P_CLIP, 1.0 - P_CLIP).ln()
}

fn table() -> &'static [f64] {
    static TABLE: OnceLock<Vec<f64>> = OnceLock::new();
    TABLE.get_or_init(|| {
        // Unclipped (smooth) ln Φ; the clip is applied on z in `ln_phi_fast`.
        let n = (2.0 * Z_TAB * Z_STEPS_PER_UNIT) as usize;
        (0..=n)
            .map(|k| phi(-Z_TAB + k as f64 / Z_STEPS_PER_UNIT).ln())
            .collect()
    })
}

/// ln of the clipped Φ(z) from the table: z is clamped to ±Z_CLIP (the probability
/// clip), then ln Φ is linearly interpolated.
#[inline]
pub fn ln_phi_fast(tab: &[f64], z: f64) -> f64 {
    let z = z.clamp(-Z_CLIP, Z_CLIP);
    let u = (z + Z_TAB) * Z_STEPS_PER_UNIT;
    let k = (u as usize).min(tab.len() - 2);
    let f = u - k as f64;
    tab[k] + f * (tab[k + 1] - tab[k])
}

/// The ln Φ table (exposed for the hot loop in `set.rs`).
pub fn ln_phi_table() -> &'static [f64] {
    table()
}

/// One observation in grid coordinates, with its class threshold.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct GridObs {
    pub x: f64,
    pub y: f64,
    pub rx_class: RxClass,
    pub threshold_db: f64,
    pub degraded: bool,
}

/// Canonical, order-independent evidence: observations of classes with a
/// threshold, sorted by (source_id, class, state, lat, lon). Sorting first makes
/// every later sum independent of the caller's order (FR-04b (4)).
pub fn canonical(evidence: &Evidence, receivers: &Receivers, geom: &GridGeom) -> Vec<GridObs> {
    let mut obs: Vec<_> = evidence
        .observations
        .iter()
        .filter_map(|o| {
            receivers
                .classes
                .iter()
                .find(|c| c.rx_class == o.rx_class)
                .map(|c| (o, c.js_threshold_db))
        })
        .collect();
    obs.sort_by(|(a, _), (b, _)| {
        a.source_id
            .cmp(&b.source_id)
            .then(a.rx_class.cmp(&b.rx_class))
            .then(a.state.cmp(&b.state))
            .then(a.lat.total_cmp(&b.lat))
            .then(a.lon.total_cmp(&b.lon))
            .then(Ordering::Equal)
    });
    obs.into_iter()
        .map(|(o, t)| {
            let (x, y) = geom.to_enu(o.lat, o.lon);
            GridObs {
                x,
                y,
                rx_class: o.rx_class,
                threshold_db: t,
                degraded: o.state == UnitState::Degraded,
            }
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn phi_reference_values() {
        assert!((phi(0.0) - 0.5).abs() < 1e-15);
        assert!((phi(1.0) - 0.841_344_746_068_542_9).abs() < 1e-13);
        assert!((phi(-3.0) - 0.001_349_898_031_630_094_6).abs() < 1e-15);
        assert!((phi(-4.753_424_308_822_899) - 1.0e-6).abs() < 1e-14);
    }

    #[test]
    fn table_matches_exact() {
        let tab = ln_phi_table();
        let mut worst: f64 = 0.0;
        for k in 0..20_000 {
            let z = -9.0 + k as f64 * 0.0009;
            worst = worst.max((ln_phi_fast(tab, z) - ln_phi_clipped(z)).abs());
        }
        assert!(worst < 2e-6, "table error {worst}");
    }
}
