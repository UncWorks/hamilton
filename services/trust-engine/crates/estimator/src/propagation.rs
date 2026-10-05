//! Link budget (E4): free-space, two-ray beyond the breakpoint, radio horizon.
//!
//! Plain closed-form functions, no `Propagation` trait (plan §0.2 cut 9). The
//! formulas are the worked example's (`gen_fixtures.py` `path_loss_db` /
//! `js_db` / `denial_radius_km`) and are checked against the shared
//! `propagation-vectors.json` to 0.01 dB.

use crate::types::Receivers;

/// Speed of light in m·MHz (λ[m] = 299.792458 / f[MHz]).
pub const C_M_MHZ: f64 = 299.792458;
/// Extra loss beyond the radio horizon, dB.
pub const BEYOND_HORIZON_DB: f64 = 20.0;
/// 4/3-earth radio-horizon constant, km/√m.
pub const HORIZON_KM_PER_SQRT_M: f64 = 4.12;
/// Denial-radius search: step and upper bound, km (the worked example's 0.01 km grid to 80 km).
pub const RADIUS_STEP_KM: f64 = 0.01;
pub const RADIUS_STEPS: usize = 7999;

/// Wavelength, m.
pub fn wavelength_m(f_mhz: f64) -> f64 {
    C_M_MHZ / f_mhz
}

/// Radio horizon between two antenna heights, km.
pub fn horizon_km(h_tx_m: f64, h_rx_m: f64) -> f64 {
    HORIZON_KM_PER_SQRT_M * (h_tx_m.sqrt() + h_rx_m.sqrt())
}

/// Precomputed constants of one (transmitter height, receiver, frequency) link,
/// so the hot loop needs one `log10` per (cell, unit) shared by every hypothesis.
#[derive(Debug, Clone, Copy)]
pub struct Link {
    fspl_const: f64,
    tworay_const: f64,
    breakpoint_m: f64,
    horizon_km: f64,
}

impl Link {
    pub fn new(h_tx_m: f64, h_rx_m: f64, f_mhz: f64) -> Self {
        let lam = wavelength_m(f_mhz);
        Self {
            fspl_const: 20.0 * (4.0 * std::f64::consts::PI / lam).log10(),
            tworay_const: -20.0 * h_tx_m.log10() - 20.0 * h_rx_m.log10(),
            breakpoint_m: 4.0 * h_tx_m * h_rx_m / lam,
            horizon_km: horizon_km(h_tx_m, h_rx_m),
        }
    }

    /// `log10` of the clamped distance in metres, the per-(cell, unit) shared term.
    #[inline]
    pub fn log10_distance(d_km: f64) -> f64 {
        (d_km * 1000.0).max(1.0).log10()
    }

    /// Path loss in dB given `d_km` and `log10_distance(d_km)`.
    #[inline]
    pub fn loss(&self, d_km: f64, lg: f64) -> f64 {
        let fspl = 20.0 * lg + self.fspl_const;
        let d_m = (d_km * 1000.0).max(1.0);
        let l = if d_m < self.breakpoint_m {
            fspl
        } else {
            fspl.max(40.0 * lg + self.tworay_const)
        };
        if d_km > self.horizon_km {
            l + BEYOND_HORIZON_DB
        } else {
            l
        }
    }
}

/// Path loss, dB: free space below the two-ray breakpoint 4·h_t·h_r/λ, max(free space,
/// two-ray) beyond it, plus 20 dB beyond the radio horizon.
pub fn path_loss_db(d_km: f64, h_tx_m: f64, h_rx_m: f64, f_mhz: f64) -> f64 {
    Link::new(h_tx_m, h_rx_m, f_mhz).loss(d_km, Link::log10_distance(d_km))
}

/// Jammer-to-signal ratio at a receiver `d_km` from an omni emitter, dB.
pub fn js_db(d_km: f64, erp_dbm: f64, h_tx_m: f64, rx: &Receivers) -> f64 {
    erp_dbm + rx.rx_gain_dbi
        - path_loss_db(d_km, h_tx_m, rx.rx_height_m, rx.freq_mhz)
        - rx.signal_dbm
}

/// Denial radius, km: the largest search distance (0.01 km steps, ≤ 80 km) with
/// J/S ≥ `threshold_db`; 0 if none. J/S is monotone non-increasing in distance
/// (the loss is continuous at the breakpoint and only jumps up at the horizon),
/// so a bisection over the step index gives exactly the worked example's
/// exhaustive-search result.
pub fn denial_radius_km(erp_dbm: f64, h_tx_m: f64, threshold_db: f64, rx: &Receivers) -> f64 {
    let d = |i: usize| RADIUS_STEP_KM + i as f64 * RADIUS_STEP_KM;
    let ok = |i: usize| js_db(d(i), erp_dbm, h_tx_m, rx) >= threshold_db;
    if !ok(0) {
        return 0.0;
    }
    if ok(RADIUS_STEPS - 1) {
        return d(RADIUS_STEPS - 1);
    }
    // Invariant: ok(lo) && !ok(hi).
    let (mut lo, mut hi) = (0usize, RADIUS_STEPS - 1);
    while hi - lo > 1 {
        let mid = lo + (hi - lo) / 2;
        if ok(mid) {
            lo = mid;
        } else {
            hi = mid;
        }
    }
    d(lo)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn breakpoint_continuity_and_monotone() {
        let mut prev = f64::MIN;
        for i in 1..20_000 {
            let d = i as f64 * 0.005;
            let l = path_loss_db(d, 10.0, 2.0, 1575.42);
            assert!(l >= prev - 1e-9, "loss decreased at {d} km");
            prev = l;
        }
    }
}
