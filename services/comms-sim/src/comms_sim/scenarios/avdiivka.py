"""Avdiivka counterfactual scenario, driven by a hidden emitter (HS-20).

Every unit's symptoms follow from ONE hidden EW site (``emitter_truth``)
through a stated link budget (``comms_sim.propagation``); nothing is scripted
per unit. Per tick and per unit:

1. GNSS: J/S of the site's GNSS module at the unit (two-ray + horizon, sector
   gain, frozen shadowing) against the unit's ``rx_class`` threshold
   -> ``gnss_fix``.
2. Comms: J/S of the site's comms module against the unit's own net-control
   signal (``NETS``) -> comms margin m = J/S - 10 dB (``uhf_fhss``)
   -> g(m) -> cadence and CRC.
3. RF: unit B carries a spectrum monitor. When it sees the GNSS module it
   reports the union of the module bands it sees (``derive_rf``). No
   ``effective_range_km``.

R14 discipline: this is data plus physics, not detection logic. The engine
re-derives every detection from the telemetry, as it would on real radio.

Calibration (plan row C3, [ASM]): the comms EIRP steps (``emitter_truth``)
and the knots of g(·) are calibrated on B so that B shows 1.17 s @0:45,
6% CRC @0:55, 6.1 s / 14% @1:15 and 1.8 s / 4% @1:50, while A and C stay
below the comms threshold at full power.
"""

from __future__ import annotations

import math
from dataclasses import dataclass

import numpy as np

from comms_sim.payloads import GnssFix, RfObservation, RxClass, TelemetryPayload
from comms_sim.propagation import (
    GPS_L1_MHZ,
    GPS_L2_MHZ,
    THRESHOLD_DB,
    gnss_js_db,
    received_dbm,
    sector_gain_db,
)
from comms_sim.scenarios.emitter_truth import EmitterTruth, demo_truth, enu_to_latlon

# Geographic anchor (= unit B's start position, the ENU origin).
AVDIIVKA_LAT = 48.140
AVDIIVKA_LON = 37.745


@dataclass(frozen=True)
class Unit:
    key: str
    source_id: str
    rx_class: RxClass
    sensor_type: str
    role: str
    enu_km: tuple[float, float]
    lat: float
    lon: float
    net: str  # key into NETS


# The 8-unit layout = `units` in apps/web/src/stories/fixtures/aoe-preview.json
# (design §5, plan D1), in the worked example's order (it fixes the shadowing
# draw order). Nets [ASM]: observers report on the fire-support net to the Bn
# FDC; the TA radar and the AD section on the Bn command net; the batteries on
# the battery fire-direction net.
UNITS: tuple[Unit, ...] = (
    Unit(
        "B",
        "unit_b",
        "gnss_civil",
        "recon_static",
        "FO — OBS B (AB1001 observer)",
        (0.0, 0.0),
        48.14,
        37.745,
        "fire_support",
    ),
    Unit(
        "D",
        "d",
        "gnss_civil",
        "recon_static",
        "FO 2",
        (0.5, 4.0),
        48.17593,
        37.75173,
        "fire_support",
    ),
    Unit(
        "E",
        "e",
        "gnss_civil",
        "recon_static",
        "FO 3",
        (0.3, -4.0),
        48.10407,
        37.74904,
        "fire_support",
    ),
    Unit(
        "C",
        "unit_c",
        "gnss_civil",
        "detection",
        "TA radar (OBS C)",
        (-3.0, -1.5),
        48.12653,
        37.70462,
        "command",
    ),
    Unit(
        "A",
        "unit_a",
        "gnss_mil",
        "offense",
        "Firing battery (FU A)",
        (-7.0, 0.5),
        48.14449,
        37.65077,
        "battery",
    ),
    Unit("F", "f", "gnss_mil", "offense", "Battery 2", (-6.0, -5.0), 48.09508, 37.66423, "battery"),
    Unit(
        "G",
        "g",
        "gnss_civil",
        "defense",
        "AD section (Bn CP area)",
        (-9.0, 3.0),
        48.16695,
        37.62385,
        "command",
    ),
    Unit(
        "H",
        "h",
        "gnss_civil",
        "recon_mobile",
        "UAS team",
        (-1.5, 6.0),
        48.1939,
        37.72481,
        "fire_support",
    ),
)
UNITS_BY_ID = {u.source_id: u for u in UNITS}

# Start positions (lat, lon) of every unit, published on every payload.
SOURCE_POSITIONS: dict[str, tuple[float, float]] = {u.source_id: (u.lat, u.lon) for u in UNITS}

# B's waypoint (FR-06 1:50 beat): 5 km west, out of the GNSS denial radius.
# = `b_moved` in aoe-preview.json.
B_WAYPOINT_T_S = 110.0
B_WAYPOINT_ENU_KM = (-5.0, 0.0)
B_WAYPOINT_LATLON = (48.14, 37.67769)

JAMMER_OFF_T_S = 135.0


# --- comms link budget [ASM] --------------------------------------------------
@dataclass(frozen=True)
class NetControl:
    enu_km: tuple[float, float]
    eirp_dbm: float
    mast_m: float


# Each unit's comms "S" is its net control station's signal at the unit. The
# J/S is formed at the unit's receiver, so the unit's own antenna gain and
# height cancel. 50 W (47 dBm) vehicle stations on 10 m masts [ASM]. The
# fire-support NCS sits due south of the B / B-waypoint midpoint, so B's move
# changes its comms J/S only through its distance from the jammer.
NETS: dict[str, NetControl] = {
    "fire_support": NetControl(enu_km=(-2.5, -10.0), eirp_dbm=47.0, mast_m=10.0),
    "command": NetControl(enu_km=(-9.0, 3.0), eirp_dbm=47.0, mast_m=10.0),
    "battery": NetControl(enu_km=(-7.0, -2.5), eirp_dbm=47.0, mast_m=10.0),
}
COMMS_THRESHOLD_DB = THRESHOLD_DB["uhf_fhss"]  # 10 dB

# --- g(·): comms margin -> cadence, CRC [ASM, calibrated on B] --------------
# m = comms J/S - 10 dB. m < 0: the link is clean (1.0 s, 0.2% CRC).
#
# The link has two operating states. While the net is in sync, every margin
# m >= 0 costs about one ARQ retry per six frames (1.17 s). Once m reaches
# SYNC_LOSS_MARGIN_DB the radio loses net sync and falls back to its robust
# mode (long frames, re-sync), whose cadence grows with m; it only returns to
# normal operation when the margin drops back below SYNC_REGAIN_MARGIN_DB.
# This hysteresis is why B at 1:50 can have a lower CRC than at 0:55 (4% vs
# 6%: less interference) and still a longer cadence (1.8 s vs 1.17 s: still
# out of sync). Each branch is monotone non-decreasing in m; CRC is the same
# monotone function in both states.
BASE_CADENCE_S = 1.0
BASE_CRC = 0.002
SYNCED_CADENCE_S = 1.17
SYNC_LOSS_MARGIN_DB = 9.0
SYNC_REGAIN_MARGIN_DB = 0.0
# Knots (margin dB, value). 4.04 / 6.33 / 11.33 dB are B's margins at 1:50,
# 0:55 and 1:15 under the EIRP schedule in emitter_truth.
CRC_KNOTS: tuple[tuple[float, float], ...] = (
    (0.0, 0.002),
    (1.0, 0.002),
    (4.04, 0.04),
    (6.33, 0.06),
    (11.33, 0.14),
    (21.33, 0.50),
)
ROBUST_CADENCE_KNOTS: tuple[tuple[float, float], ...] = (
    (0.0, 1.5),
    (4.04, 1.8),
    (11.33, 6.1),
    (21.33, 15.0),
)

# --- GNSS fix ---------------------------------------------------------------
# J/S >= class threshold: 3-D fix lost; >= threshold + 6 dB: no fix [ASM].
GNSS_NO_FIX_EXCESS_DB = 6.0

# --- RF monitor (unit B) ------------------------------------------------------
RF_MONITOR_UNIT = "unit_b"
RF_MONITOR_SENSITIVITY_DBM = -100.0  # 0 dBi wideband monitor [ASM]


def _interp(m: float, knots: tuple[tuple[float, float], ...]) -> float:
    xs = [k[0] for k in knots]
    ys = [k[1] for k in knots]
    return float(np.interp(m, xs, ys))


def g_crc(margin_db: float) -> float:
    if margin_db < 0.0:
        return BASE_CRC
    return _interp(margin_db, CRC_KNOTS)


def g_cadence(margin_db: float, in_sync: bool) -> float:
    if margin_db < 0.0:
        return BASE_CADENCE_S
    if in_sync:
        return SYNCED_CADENCE_S
    return _interp(margin_db, ROBUST_CADENCE_KNOTS)


def gnss_fix_for(js_db: float, rx_class: str) -> GnssFix:
    excess = js_db - THRESHOLD_DB[rx_class]
    if excess < 0.0:
        return "3d"
    if excess < GNSS_NO_FIX_EXCESS_DB:
        return "2d"
    return "none"


@dataclass(frozen=True)
class LinkBudget:
    """Per-unit hidden quantities at one instant. Sim-internal: never published."""

    source_id: str
    enu_km: tuple[float, float]
    gnss_js_db: float | None  # None = GNSS module off
    comms_js_db: float | None  # None = comms module off
    gnss_monitor_dbm: float | None
    comms_monitor_dbm: float | None

    @property
    def comms_margin_db(self) -> float:
        if self.comms_js_db is None:
            return -math.inf
        return self.comms_js_db - COMMS_THRESHOLD_DB


@dataclass(frozen=True)
class ScenarioBeat:
    """A storyboard beat: a labelled scenario time (Branding §10)."""

    tick_seconds: float
    label: str


def avdiivka_beats() -> list[ScenarioBeat]:
    return [
        ScenarioBeat(0.0, "B-0:00 — eight healthy units"),
        ScenarioBeat(45.0, "B-0:45 — comms module on: Unit B cadence 1.0s → 1.17s (WATCH)"),
        ScenarioBeat(55.0, "B-0:55 — comms module up: Unit B CRC 0.2% → 6% (WATCH)"),
        ScenarioBeat(75.0, "B-1:15 — jammer at full power: 6.1s gap, 14% CRC, RF fingerprint"),
        ScenarioBeat(110.0, "B-1:50 — Unit B 5 km west: GNSS 3-D fix, link 1.8s / 4%"),
        ScenarioBeat(135.0, "B-2:15 — jammer off air: all units healthy"),
    ]


class AvdiivkaScenario:
    """Pure function of scenario time: ``telemetry(t)`` -> one payload per unit.

    The only state, each unit's net-sync latch, is recomputed from the
    piecewise-constant inputs (EIRP steps, waypoints), so any ``t`` can be
    evaluated in any order and the result does not depend on the tick rate."""

    def __init__(self, truth: EmitterTruth | None = None) -> None:
        self.truth = truth or demo_truth(tuple(u.source_id for u in UNITS))
        self._shadow = self.truth.shadow()

    # --- geometry -----------------------------------------------------------
    def position_enu(self, source_id: str, t_s: float) -> tuple[float, float]:
        if source_id == "unit_b" and t_s >= B_WAYPOINT_T_S:
            return B_WAYPOINT_ENU_KM
        return UNITS_BY_ID[source_id].enu_km

    def position_latlon(self, source_id: str, t_s: float) -> tuple[float, float]:
        if source_id == "unit_b" and t_s >= B_WAYPOINT_T_S:
            return B_WAYPOINT_LATLON
        return SOURCE_POSITIONS[source_id]

    def event_times(self) -> list[float]:
        return sorted({0.0, B_WAYPOINT_T_S, *self.truth.schedule_times()})

    # --- physics --------------------------------------------------------------
    def link_budget(self, source_id: str, t_s: float) -> LinkBudget:
        tr = self.truth
        x, y = self.position_enu(source_id, t_s)
        d_km = math.hypot(x - tr.enu_km[0], y - tr.enu_km[1])
        sector = float(
            sector_gain_db(tr.enu_km, x, y, tr.sector_az_deg, tr.sector_width_deg, tr.back_db)
        )
        shadow = self._shadow[source_id]

        gnss_js = gnss_mon = None
        p_gnss = tr.eirp_dbm("gnss", t_s)
        if p_gnss is not None:
            gnss_js = float(gnss_js_db(d_km, p_gnss, tr.mast_m)) + sector + shadow
            gnss_mon = (
                float(received_dbm(p_gnss, d_km, tr.mast_m, tr.module("gnss").ref_freq_mhz))
                + sector
                + shadow
            )

        comms_js = comms_mon = None
        p_comms = tr.eirp_dbm("comms", t_s)
        if p_comms is not None:
            f = tr.module("comms").ref_freq_mhz
            comms_mon = float(received_dbm(p_comms, d_km, tr.mast_m, f)) + sector + shadow
            ncs = NETS[UNITS_BY_ID[source_id].net]
            d_ncs = math.hypot(x - ncs.enu_km[0], y - ncs.enu_km[1])
            s_dbm = float(received_dbm(ncs.eirp_dbm, d_ncs, ncs.mast_m, f))
            comms_js = comms_mon - s_dbm

        return LinkBudget(source_id, (x, y), gnss_js, comms_js, gnss_mon, comms_mon)

    def in_sync(self, source_id: str, t_s: float) -> bool:
        synced = True
        for e in self.event_times():
            if e > t_s:
                break
            m = self.link_budget(source_id, e).comms_margin_db
            if synced and m >= SYNC_LOSS_MARGIN_DB:
                synced = False
            elif not synced and m < SYNC_REGAIN_MARGIN_DB:
                synced = True
        return synced

    def derive_rf(self, t_s: float) -> RfObservation | None:
        """B's spectrum monitor, cued by GNSS-band interference: reports the
        union of the module bands it sees above its sensitivity."""

        lb = self.link_budget(RF_MONITOR_UNIT, t_s)
        seen = []
        if lb.gnss_monitor_dbm is not None and lb.gnss_monitor_dbm >= RF_MONITOR_SENSITIVITY_DBM:
            seen.append(self.truth.module("gnss"))
        if not seen:
            return None
        if lb.comms_monitor_dbm is not None and lb.comms_monitor_dbm >= RF_MONITOR_SENSITIVITY_DBM:
            seen.append(self.truth.module("comms"))
        lo = min(m.band_mhz[0] for m in seen)
        hi = max(m.band_mhz[1] for m in seen)
        gnss_band = self.truth.module("gnss").band_mhz
        return RfObservation(
            frequency_band_mhz=(lo, hi),
            hop_spread_hz=max(m.hop_spread_hz for m in seen),
            gps_l1_overlap=gnss_band[0] <= GPS_L1_MHZ <= gnss_band[1],
            gps_l2_overlap=gnss_band[0] <= GPS_L2_MHZ <= gnss_band[1],
            time_domain_pattern="barrage",
        )

    # --- observable output ---------------------------------------------------
    def telemetry(self, t_s: float) -> list[TelemetryPayload]:
        """One noiseless payload per unit. Cadence is quantised to 10 ms and CRC
        to 0.1% (the radio's reporting resolution); the runner adds jitter."""

        rf = self.derive_rf(t_s)
        out = []
        for u in UNITS:
            lb = self.link_budget(u.source_id, t_s)
            m = lb.comms_margin_db
            fix: GnssFix = (
                "3d" if lb.gnss_js_db is None else gnss_fix_for(lb.gnss_js_db, u.rx_class)
            )
            lat, lon = self.position_latlon(u.source_id, t_s)
            out.append(
                TelemetryPayload(
                    source_id=u.source_id,
                    lat=lat,
                    lon=lon,
                    inter_arrival_seconds=round(g_cadence(m, self.in_sync(u.source_id, t_s)), 2),
                    crc_error_rate=round(g_crc(m), 3),
                    duplicate_rate=0.0,
                    rx_class=u.rx_class,
                    gnss_fix=fix,
                    rf=rf if u.source_id == RF_MONITOR_UNIT else None,
                )
            )
        return out


def truth_latlon(truth: EmitterTruth) -> tuple[float, float]:
    return enu_to_latlon(*truth.enu_km)
