//! P(denied | x) per receiver class (E8).
//!
//! P(denied | x) = Σ_h Σ_e w(h, e) · [|x − e| ≤ r_h(class)]: for each hypothesis,
//! the posterior convolved with a disc of that hypothesis's exact denial radius
//! (J/S ≥ T is monotone in range). The joint posterior is pruned to the
//! smallest set of (h, e) entries holding ≥ 99.5% of the mass (so P is low by at
//! most 0.005). The disc is applied row by row with a difference array, so the
//! cost is O(kept rows × disc rows × row span) with no FFT.

use crate::grid::GridGeom;
use crate::propagation::denial_radius_km;
use crate::set::Posterior;
use crate::types::{MethodModel, Receivers};

/// Share of the joint posterior mass kept for the convolution.
pub const PRUNE_MASS: f64 = 0.995;
const BIN_NATS: f64 = 0.01;
const MAX_NATS: f64 = 60.0;

/// Denial radius per hypothesis (h = e·|mast| + m), km.
pub fn radii_km(method: &MethodModel, receivers: &Receivers, threshold_db: f64) -> Vec<f64> {
    let mut out = Vec::with_capacity(method.erp_dbm.len() * method.mast_m.len());
    for &erp in &method.erp_dbm {
        for &mast in &method.mast_m {
            out.push(denial_radius_km(erp, mast, threshold_db, receivers));
        }
    }
    out
}

/// ln-weight cutoff that keeps ≥ `PRUNE_MASS` of the joint posterior: a histogram
/// over ln w in 0.01-nat bins (O(n), order-independent), walked from the top.
pub fn prune_cutoff(post: &Posterior) -> f64 {
    let top = post.ln_w.iter().fold(f64::NEG_INFINITY, |a, &b| a.max(b));
    let nbins = (MAX_NATS / BIN_NATS) as usize + 1;
    let mut hist = vec![0.0f64; nbins];
    for (&l, &w) in post.ln_w.iter().zip(&post.w) {
        let b = ((top - l) / BIN_NATS) as usize;
        if b < nbins {
            hist[b] += w;
        }
    }
    let mut c = 0.0;
    for (b, &m) in hist.iter().enumerate() {
        c += m;
        if c >= PRUNE_MASS {
            return top - (b + 1) as f64 * BIN_NATS;
        }
    }
    f64::NEG_INFINITY
}

/// Half-widths of a disc of radius `r_km` on the grid, per row offset |dy| = 0..=n:
/// the largest k with hypot(k·res, dy·res) ≤ r, or −1 if the row is empty.
pub fn disc_half_widths(r_km: f64, res_km: f64) -> Vec<i64> {
    if r_km <= 0.0 {
        return Vec::new();
    }
    let n = (r_km / res_km).ceil() as i64;
    (0..=n)
        .map(|dy| {
            let fy = dy as f64 * res_km;
            let mut k = -1i64;
            while ((k + 1) as f64 * res_km).hypot(fy) <= r_km {
                k += 1;
            }
            k
        })
        .collect()
}

/// P(denied | cell) for one class, row-major, clipped to [0, 1].
pub fn p_denied(post: &Posterior, geom: &GridGeom, radii: &[f64], ln_cutoff: f64) -> Vec<f64> {
    let (nx, ny, cells) = (geom.nx, geom.ny, geom.len());
    let kernels: Vec<Vec<i64>> = radii
        .iter()
        .map(|&r| disc_half_widths(r, geom.res_km))
        .collect();
    let pad = kernels
        .iter()
        .flat_map(|k| k.iter().copied())
        .max()
        .unwrap_or(0)
        .max(0) as usize
        + 1;
    let width = nx + 2 * pad + 1;
    let mut diff = vec![0.0f64; ny * width];
    let mut src = vec![0.0f64; nx];
    for (h, hw) in kernels.iter().enumerate() {
        if hw.is_empty() {
            continue;
        }
        let n = hw.len() as i64 - 1;
        let w = &post.w[h * cells..(h + 1) * cells];
        let lw = &post.ln_w[h * cells..(h + 1) * cells];
        for j in 0..ny {
            // Kept entries of this source row, as a dense span [a, b].
            let (mut a, mut b) = (usize::MAX, 0usize);
            let (wr, lr) = (&w[j * nx..(j + 1) * nx], &lw[j * nx..(j + 1) * nx]);
            for (i, (s, (&wv, &lv))) in src.iter_mut().zip(wr.iter().zip(lr)).enumerate() {
                if lv >= ln_cutoff {
                    *s = wv;
                    a = a.min(i);
                    b = i;
                } else {
                    *s = 0.0;
                }
            }
            if a == usize::MAX {
                continue;
            }
            let span = &src[a..=b];
            let lo_dy = (-n).max(-(j as i64));
            let hi_dy = n.min((ny - 1 - j) as i64);
            for dy in lo_dy..=hi_dy {
                let k = hw[dy.unsigned_abs() as usize];
                if k < 0 {
                    continue;
                }
                let k = k as usize;
                let row = &mut diff[(j as i64 + dy) as usize * width..][..width];
                // +w at x − k, −w at x + k + 1 (offset by `pad`; out-of-grid starts
                // still feed the prefix sum, out-of-grid ends are never read).
                let s0 = a + pad - k;
                for (d, &v) in row[s0..s0 + span.len()].iter_mut().zip(span) {
                    *d += v;
                }
                let e0 = a + pad + k + 1;
                for (d, &v) in row[e0..e0 + span.len()].iter_mut().zip(span) {
                    *d -= v;
                }
            }
        }
    }
    let mut out = vec![0.0f64; cells];
    for j in 0..ny {
        let row = &diff[j * width..(j + 1) * width];
        let mut run: f64 = row[..pad].iter().sum();
        for (o, &d) in out[j * nx..(j + 1) * nx]
            .iter_mut()
            .zip(&row[pad..pad + nx])
        {
            run += d;
            *o = run.clamp(0.0, 1.0);
        }
    }
    out
}
