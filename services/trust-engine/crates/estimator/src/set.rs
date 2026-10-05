//! Per-hypothesis log-posterior over the grid and the HPD 90% emitter region (E7).
//!
//! ln post(h, e) = ln prior(e) + Σ_units ln P(state_u | h, e), log-domain, with the
//! units in canonical order and the hypotheses in (EIRP-major, mast-minor) order.
//! It is normalised once with the max subtracted; every sum runs in a fixed
//! (hypothesis-major, row-major) order, so identical input gives identical bits.

use crate::evidence::{ln_phi_fast, ln_phi_table, GridObs};
use crate::grid::GridGeom;
use crate::propagation::Link;
use crate::types::{MethodModel, Receivers};

/// Normalised joint posterior over (hypothesis, cell), its location marginal and HPD region.
#[derive(Debug, Clone)]
pub struct Posterior {
    /// Number of hypotheses = |EIRP| × |mast|; h = e·|mast| + m.
    pub n_hyp: usize,
    /// Joint weights, `w[h·cells + cell]`, summing to 1.
    pub w: Vec<f64>,
    /// ln w (same layout), for pruning.
    pub ln_w: Vec<f64>,
    /// Location marginal pe(cell) = Σ_h w.
    pub pe: Vec<f64>,
    /// HPD 90% threshold on `pe`: the region is `pe ≥ thr90`.
    pub thr90: f64,
    /// Number of cells in the HPD 90% set (the area is this × cell area).
    pub n90: usize,
    /// Marginal posterior of each EIRP hypothesis.
    pub erp_marginal: Vec<f64>,
}

/// Compute the posterior. `ln_prior` is per cell (row-major).
pub fn posterior(
    obs: &[GridObs],
    method: &MethodModel,
    receivers: &Receivers,
    geom: &GridGeom,
    ln_prior: &[f64],
) -> Posterior {
    let ne = method.erp_dbm.len();
    let nm = method.mast_m.len();
    let n_hyp = ne * nm;
    let cells = geom.len();
    let tab = ln_phi_table();
    let links: Vec<Link> = method
        .mast_m
        .iter()
        .map(|&h| Link::new(h, receivers.rx_height_m, receivers.freq_mhz))
        .collect();
    let inv_sigma = 1.0 / method.sigma_db;
    // J/S = erp + base − L; z = (J/S − T)/σ, sign-flipped for a healthy report.
    let base = receivers.rx_gain_dbi - receivers.signal_dbm;
    let mut ln = vec![0.0f64; n_hyp * cells];
    let mut acc = vec![0.0f64; n_hyp];
    let mut loss = vec![0.0f64; nm];
    for j in 0..geom.ny {
        let cy = geom.y(j);
        for i in 0..geom.nx {
            let cx = geom.x(i);
            let cell = j * geom.nx + i;
            acc.iter_mut().for_each(|a| *a = ln_prior[cell]);
            for o in obs {
                let d = ((cx - o.x) * (cx - o.x) + (cy - o.y) * (cy - o.y)).sqrt();
                let lg = Link::log10_distance(d);
                for (m, l) in links.iter().enumerate() {
                    loss[m] = l.loss(d, lg);
                }
                let sign = if o.degraded { 1.0 } else { -1.0 };
                for (e, erp) in method.erp_dbm.iter().enumerate() {
                    let k = erp + base - o.threshold_db;
                    for m in 0..nm {
                        let z = sign * (k - loss[m]) * inv_sigma;
                        acc[e * nm + m] += ln_phi_fast(tab, z);
                    }
                }
            }
            for h in 0..n_hyp {
                ln[h * cells + cell] = acc[h];
            }
        }
    }
    normalise(ln, n_hyp, cells, ne, nm)
}

fn normalise(mut ln: Vec<f64>, n_hyp: usize, cells: usize, ne: usize, nm: usize) -> Posterior {
    let max = ln.iter().fold(f64::NEG_INFINITY, |a, &b| a.max(b));
    let mut w: Vec<f64> = ln.iter().map(|&l| (l - max).exp()).collect();
    let total: f64 = w.iter().sum();
    let ln_total = total.ln();
    for v in w.iter_mut() {
        *v /= total;
    }
    for v in ln.iter_mut() {
        *v -= max + ln_total;
    }
    let mut pe = vec![0.0f64; cells];
    for h in 0..n_hyp {
        let row = &w[h * cells..(h + 1) * cells];
        for (p, &v) in pe.iter_mut().zip(row) {
            *p += v;
        }
    }
    let mut erp_marginal = vec![0.0f64; ne];
    for (e, em) in erp_marginal.iter_mut().enumerate() {
        for m in 0..nm {
            let h = e * nm + m;
            *em += w[h * cells..(h + 1) * cells].iter().sum::<f64>();
        }
    }
    let (n90, thr90) = hpd(&pe, 0.9);
    Posterior {
        n_hyp,
        w,
        ln_w: ln,
        pe,
        thr90,
        n90,
        erp_marginal,
    }
}

/// Highest-posterior-density set holding `mass`: the smallest number of cells,
/// taken in descending order (ties by index), whose cumulative mass reaches `mass`.
/// Returns (count, the last cell's value = the region threshold).
pub fn hpd(pe: &[f64], mass: f64) -> (usize, f64) {
    let mut idx: Vec<u32> = (0..pe.len() as u32).collect();
    idx.sort_unstable_by(|&a, &b| pe[b as usize].total_cmp(&pe[a as usize]).then(a.cmp(&b)));
    let mut c = 0.0;
    for (n, &k) in idx.iter().enumerate() {
        c += pe[k as usize];
        if c >= mass {
            return (n + 1, pe[k as usize]);
        }
    }
    (pe.len(), idx.last().map(|&k| pe[k as usize]).unwrap_or(0.0))
}
