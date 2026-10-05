"""Closed-form propagation for the hidden emitter (HS-20, plan row C2).

Plain numpy. The maths is the jammer-AoE worked example's link budget, the
same one `scripts/aoe-preview/gen_fixtures.py` uses, so the preview, the
contract fixture `packages/contracts/fixtures/aoe/propagation-vectors.json`
and the simulator agree to 0.01 dB:

- path loss: free space below the two-ray breakpoint ``4 h_t h_r / lambda``,
  ``max(free space, two-ray)`` beyond it, plus 20 dB beyond the radio
  horizon ``4.12 (sqrt h_t + sqrt h_r)`` km;
- sector antenna: 0 dB inside the sector, ``back_db`` outside it [ASM];
- per-unit log-normal shadowing, drawn once per run (see ``emitter_truth``).

Every function here is a pure function of its arguments. Nothing in this
module is ever published: the simulator turns its outputs into observable
symptoms (cadence, CRC, ``gnss_fix``) and only those leave the process.

Provenance tags (docs/plans/jammer-aoe.md §7.1): [RC] recomputed by the
verifier, [STD] standard, [DES] design worked-example value, [ASM] assumption.
"""

from __future__ import annotations

import math

import numpy as np
from numpy.typing import ArrayLike, NDArray

C_MHZ_M = 299.792458  # speed of light, in MHz·m (lambda_m = C_MHZ_M / f_MHz)

GPS_L1_MHZ = 1575.42
GPS_L2_MHZ = 1227.60
S_GNSS_DBM = -125.0  # GPS L1 C/A nominal received power [RC]; -128.5 dBm is the minimum [STD]
G_R_GNSS_JAM_DBI = -5.0  # GNSS patch gain toward a horizon jammer [DES/RC]
H_RX_M = 2.0  # receive antenna height [DES]
HORIZON_EXCESS_DB = 20.0  # extra loss past the radio horizon [DES]
HORIZON_K = 4.12  # km per sqrt(m), 4/3-earth radio horizon [STD]

# Receiver-class thresholds, J/S in dB (receivers.json, CP1 F5).
THRESHOLD_DB = {
    "gnss_civil": 36.0,  # loss of 3-D fix, lower bound of 36-58 dB (Forssell & Olsen 2003) [RC]
    "gnss_mil": 41.0,  # DAGR P(Y) tracking [DES]
    "gnss_mil_crpa": 66.0,  # 41 + 25 dB CRPA [ASM]
    "uhf_fhss": 10.0,  # UHF FHSS link, J/S at which the link starts to lose frames [ASM]
}


def wavelength_m(f_mhz: float) -> float:
    return C_MHZ_M / f_mhz


def radio_horizon_km(h_tx_m: float, h_rx_m: float = H_RX_M) -> float:
    return HORIZON_K * (math.sqrt(h_tx_m) + math.sqrt(h_rx_m))


def path_loss_db(
    d_km: ArrayLike,
    h_tx_m: float,
    h_rx_m: float = H_RX_M,
    f_mhz: float = GPS_L1_MHZ,
) -> NDArray[np.float64]:
    """Two-ray ground-reflection path loss with a radio-horizon penalty, dB.

    ``d`` is floored at 1 m. Below the breakpoint the loss is free space;
    beyond it, the larger of free space and the two-ray asymptote."""

    lam = wavelength_m(f_mhz)
    d_km_arr = np.asarray(d_km, dtype=float)
    d = np.maximum(d_km_arr * 1000.0, 1.0)
    fspl = 20.0 * np.log10(4.0 * np.pi * d / lam)
    tworay = 40.0 * np.log10(d) - 20.0 * np.log10(h_tx_m) - 20.0 * np.log10(h_rx_m)
    d_break = 4.0 * h_tx_m * h_rx_m / lam
    loss = np.where(d < d_break, fspl, np.maximum(fspl, tworay))
    beyond = d_km_arr > radio_horizon_km(h_tx_m, h_rx_m)
    return np.asarray(np.where(beyond, loss + HORIZON_EXCESS_DB, loss), dtype=float)


def received_dbm(
    eirp_dbm: float,
    d_km: ArrayLike,
    h_tx_m: float,
    f_mhz: float,
    g_rx_dbi: float = 0.0,
    h_rx_m: float = H_RX_M,
) -> NDArray[np.float64]:
    return eirp_dbm + g_rx_dbi - path_loss_db(d_km, h_tx_m, h_rx_m, f_mhz)


def gnss_js_db(
    d_km: ArrayLike,
    eirp_dbm: float,
    h_tx_m: float,
    h_rx_m: float = H_RX_M,
    f_mhz: float = GPS_L1_MHZ,
    s_dbm: float = S_GNSS_DBM,
) -> NDArray[np.float64]:
    """GNSS J/S at an omni (patch) receiver, before sector gain and shadowing.

    Identical to ``js_db`` in ``scripts/aoe-preview/gen_fixtures.py``."""

    return received_dbm(eirp_dbm, d_km, h_tx_m, f_mhz, G_R_GNSS_JAM_DBI, h_rx_m) - s_dbm


def bearing_deg(from_xy: tuple[float, float], to_x: ArrayLike, to_y: ArrayLike) -> NDArray:
    """Compass azimuth (deg, 0 = north, clockwise) from ``from_xy`` to points (ENU km)."""

    dx = np.asarray(to_x, dtype=float) - from_xy[0]
    dy = np.asarray(to_y, dtype=float) - from_xy[1]
    return np.asarray((90.0 - np.degrees(np.arctan2(dy, dx))) % 360.0, dtype=float)


def sector_gain_db(
    tx_xy: tuple[float, float],
    x: ArrayLike,
    y: ArrayLike,
    sector_az_deg: float,
    sector_width_deg: float,
    back_db: float,
) -> NDArray[np.float64]:
    """Sector antenna toward (x, y): 0 dB inside the sector, ``back_db`` outside [ASM]."""

    az = bearing_deg(tx_xy, x, y)
    off = np.abs(((az - sector_az_deg) + 180.0) % 360.0 - 180.0)
    return np.asarray(np.where(off <= sector_width_deg / 2.0, 0.0, back_db), dtype=float)


def shadowing_db(seed: int, keys: list[str], sigma_db: float) -> dict[str, float]:
    """Frozen per-unit log-normal shadowing: one N(0, sigma) draw per key, in order.

    Same generator and draw order as the worked example (seed 7 = demo)."""

    rng = np.random.default_rng(seed)
    return {k: float(rng.normal(0.0, sigma_db)) for k in keys}
