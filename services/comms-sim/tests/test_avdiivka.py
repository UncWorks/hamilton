"""Tests for the Avdiivka scenario (plan row C8).

The beat values are PINNED (FRS §2 acceptance, engine K5 re-baseline): never
edit them to make a test pass. They must come out of the hidden emitter
through the link budget and g(·), not out of per-unit scripting.
"""

from __future__ import annotations

import itertools
import math

import numpy as np
import pytest

from comms_sim.propagation import THRESHOLD_DB
from comms_sim.scenarios.avdiivka import (
    B_WAYPOINT_LATLON,
    B_WAYPOINT_T_S,
    COMMS_THRESHOLD_DB,
    CRC_KNOTS,
    JAMMER_OFF_T_S,
    ROBUST_CADENCE_KNOTS,
    SOURCE_POSITIONS,
    UNITS,
    AvdiivkaScenario,
    avdiivka_beats,
    g_cadence,
    g_crc,
)

# Engine temporal baseline: 1.0 s ± 0.05 s → 1σ = 1.05 s, 3σ = 1.15 s, 6σ = 1.30 s.
ONE_SIGMA_S = 1.05
THREE_SIGMA_S = 1.15
SIX_SIGMA_S = 1.30
CRC_FLAG = 0.05  # FR-02
CRC_FULL_SCORE = 0.005

BEATS = (0.0, 45.0, 55.0, 65.0, 72.0, 75.0, 110.0, 135.0)


@pytest.fixture(scope="module")
def scenario() -> AvdiivkaScenario:
    return AvdiivkaScenario()


def _by_id(scenario: AvdiivkaScenario, t: float) -> dict:
    return {p.source_id: p for p in scenario.telemetry(t)}


# --- layout -------------------------------------------------------------------
def test_eight_units_with_rx_class_match_the_preview_layout() -> None:
    assert [u.key for u in UNITS] == ["B", "D", "E", "C", "A", "F", "G", "H"]
    assert {u.source_id for u in UNITS} == {
        "unit_a",
        "unit_b",
        "unit_c",
        "d",
        "e",
        "f",
        "g",
        "h",
    }
    by_key = {u.key: u for u in UNITS}
    assert by_key["A"].rx_class == "gnss_mil"
    assert by_key["F"].rx_class == "gnss_mil"
    assert {by_key[k].rx_class for k in "BCDEGH"} == {"gnss_civil"}


def _distance_m(a: tuple[float, float], b: tuple[float, float]) -> float:
    """Haversine, same formula as the engine's spatial detector."""
    r = 6_371_000.0
    lat1, lat2 = math.radians(a[0]), math.radians(b[0])
    dlat = math.radians(b[0] - a[0])
    dlon = math.radians(b[1] - a[1])
    h = math.sin(dlat / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlon / 2) ** 2
    return 2 * r * math.asin(math.sqrt(h))


def test_no_unit_within_500_m_of_b() -> None:
    """Plan §0.3 a: B's degradation is `localized` (no neighbour in FR-03's radius)."""
    b = SOURCE_POSITIONS["unit_b"]
    for sid, pos in SOURCE_POSITIONS.items():
        if sid != "unit_b":
            assert _distance_m(pos, b) > 500


def test_b_waypoint_is_5_km_west(scenario: AvdiivkaScenario) -> None:
    start = SOURCE_POSITIONS["unit_b"]
    assert abs(_distance_m(start, B_WAYPOINT_LATLON) - 5_000) < 25
    assert B_WAYPOINT_LATLON[1] < start[1]
    assert (
        _by_id(scenario, B_WAYPOINT_T_S)["unit_b"].lat,
        _by_id(scenario, B_WAYPOINT_T_S)["unit_b"].lon,
    ) == B_WAYPOINT_LATLON
    assert (
        _by_id(scenario, B_WAYPOINT_T_S - 1)["unit_b"].lat,
        _by_id(scenario, B_WAYPOINT_T_S - 1)["unit_b"].lon,
    ) == start


# --- g(·) -----------------------------------------------------------------------
def test_g_is_monotone_in_the_comms_margin() -> None:
    m = np.linspace(-10, 30, 2001)
    crc = [g_crc(x) for x in m]
    synced = [g_cadence(x, True) for x in m]
    robust = [g_cadence(x, False) for x in m]
    assert all(b >= a for a, b in itertools.pairwise(crc))
    assert all(b >= a for a, b in itertools.pairwise(synced))
    assert all(b >= a for a, b in itertools.pairwise(robust))
    # out of sync is never better than in sync
    assert all(r >= s for r, s in zip(robust, synced, strict=True))
    assert all(np.diff([k[0] for k in CRC_KNOTS]) > 0)
    assert all(np.diff([k[0] for k in ROBUST_CADENCE_KNOTS]) > 0)


def test_below_threshold_is_exactly_healthy() -> None:
    assert g_crc(-0.01) == 0.002
    assert g_cadence(-0.01, True) == 1.0
    assert g_cadence(-0.01, False) == 1.0


# --- per-class degraded sets follow from J/S ---------------------------------
@pytest.mark.parametrize("t", BEATS)
def test_gnss_degraded_set_equals_js_over_threshold(scenario: AvdiivkaScenario, t: float) -> None:
    tel = _by_id(scenario, t)
    for u in UNITS:
        lb = scenario.link_budget(u.source_id, t)
        expected = lb.gnss_js_db is not None and lb.gnss_js_db >= THRESHOLD_DB[u.rx_class]
        assert (tel[u.source_id].gnss_fix != "3d") == expected, (t, u.key)


@pytest.mark.parametrize("t", BEATS)
def test_comms_degraded_set_equals_js_over_threshold(scenario: AvdiivkaScenario, t: float) -> None:
    tel = _by_id(scenario, t)
    for u in UNITS:
        lb = scenario.link_budget(u.source_id, t)
        expected = lb.comms_js_db is not None and lb.comms_js_db >= COMMS_THRESHOLD_DB
        p = tel[u.source_id]
        symptomatic = p.inter_arrival_seconds > THREE_SIGMA_S or p.crc_error_rate > CRC_FLAG
        assert symptomatic == expected, (t, u.key)


def test_gnss_set_at_1_15_is_b_d_e_h(scenario: AvdiivkaScenario) -> None:
    tel = _by_id(scenario, 75.0)
    degraded = {u.key for u in UNITS if tel[u.source_id].gnss_fix != "3d"}
    assert degraded == {"B", "D", "E", "H"}


# --- B's pinned beats -----------------------------------------------------------
def test_b_0_00_all_eight_healthy(scenario: AvdiivkaScenario) -> None:
    for p in scenario.telemetry(0.0):
        assert p.inter_arrival_seconds == 1.0
        assert p.crc_error_rate == 0.002
        assert p.gnss_fix == "3d"
        assert p.rf is None


def test_b_0_45_unit_b_cadence_stretches_past_three_sigma(scenario: AvdiivkaScenario) -> None:
    b = _by_id(scenario, 45.0)["unit_b"]
    assert THREE_SIGMA_S < b.inter_arrival_seconds < SIX_SIGMA_S
    assert b.inter_arrival_seconds == 1.17
    assert b.crc_error_rate <= CRC_FULL_SCORE
    assert b.rf is None


def test_b_0_55_unit_b_crc_crosses_five_percent(scenario: AvdiivkaScenario) -> None:
    b = _by_id(scenario, 55.0)["unit_b"]
    assert b.crc_error_rate == 0.06
    assert b.inter_arrival_seconds == 1.17
    assert b.rf is None


def test_b_1_05_nothing_new_before_jammer_peak(scenario: AvdiivkaScenario) -> None:
    assert scenario.telemetry(65.0) == scenario.telemetry(55.0)
    assert scenario.telemetry(72.0) == scenario.telemetry(55.0)


def test_b_1_15_jammer_full_power_lands_together(scenario: AvdiivkaScenario) -> None:
    b = _by_id(scenario, 75.0)["unit_b"]
    assert b.inter_arrival_seconds == 6.1
    assert b.crc_error_rate == 0.14
    assert b.gnss_fix != "3d"
    rf = b.rf
    assert rf is not None
    assert rf.gps_l1_overlap is True
    assert rf.gps_l2_overlap is True
    assert rf.time_domain_pattern == "barrage"
    # Derived from the modules: comms 100-400 MHz ∪ GNSS module band.
    assert rf.frequency_band_mhz[0] == 100.0
    assert 1575.42 < rf.frequency_band_mhz[1] <= 2000.0
    assert "effective_range_km" not in rf.to_wire()


def test_b_1_50_moved_gnss_healthy_link_still_degraded(scenario: AvdiivkaScenario) -> None:
    b = _by_id(scenario, B_WAYPOINT_T_S)["unit_b"]
    assert b.inter_arrival_seconds == 1.8
    assert b.crc_error_rate == 0.04
    assert b.gnss_fix == "3d"  # K2: GNSS healthy while FR-01 is still anomalous
    assert b.rf is not None  # fingerprint still 6/6 at 1:50


def test_b_1_50_state_holds_until_jammer_off(scenario: AvdiivkaScenario) -> None:
    ref = _by_id(scenario, B_WAYPOINT_T_S)["unit_b"]
    for t in range(int(B_WAYPOINT_T_S), int(JAMMER_OFF_T_S)):
        assert _by_id(scenario, float(t))["unit_b"] == ref


def test_b_2_15_jammer_off_everyone_nominal(scenario: AvdiivkaScenario) -> None:
    assert JAMMER_OFF_T_S == 135.0
    for p in scenario.telemetry(135.0):
        assert p.inter_arrival_seconds == 1.0
        assert p.crc_error_rate == 0.002
        assert p.gnss_fix == "3d"
        assert p.rf is None


@pytest.mark.parametrize("t", [float(t) for t in range(151)])
def test_a_and_c_healthy_throughout(scenario: AvdiivkaScenario, t: float) -> None:
    tel = _by_id(scenario, t)
    for sid in ("unit_a", "unit_c"):
        p = tel[sid]
        assert p.inter_arrival_seconds <= ONE_SIGMA_S, (t, sid)
        assert p.crc_error_rate <= CRC_FULL_SCORE, (t, sid)
        assert p.gnss_fix == "3d", (t, sid)
        assert p.rf is None


def test_rf_only_while_the_gnss_module_is_on(scenario: AvdiivkaScenario) -> None:
    for t in range(151):
        b = _by_id(scenario, float(t))["unit_b"]
        assert (b.rf is not None) == (75 <= t < 135), t


# --- runner jitter ------------------------------------------------------------
def test_jitter_keeps_watch_band_cadence_inside_engine_band(scenario: AvdiivkaScenario) -> None:
    """Seeded jitter must not push B's 0:45–1:15 cadence under 3σ (flicker
    to healthy) or over 6σ (temporal 0 → early gate)."""
    from comms_sim.runner import _jittered

    rng = np.random.default_rng(42)
    for t in (45.0, 55.0):
        for _ in range(30):
            by_id = {p.source_id: p for p in _jittered(scenario.telemetry(t), rng)}
            assert THREE_SIGMA_S < by_id["unit_b"].inter_arrival_seconds < 1.20
            if t == 55.0:
                assert by_id["unit_b"].crc_error_rate > CRC_FLAG
            assert by_id["unit_a"].inter_arrival_seconds < THREE_SIGMA_S


# --- wire -----------------------------------------------------------------------
V2_FIELDS = {
    "schema",
    "source_id",
    "lat",
    "lon",
    "inter_arrival_seconds",
    "crc_error_rate",
    "duplicate_rate",
    "rx_class",
    "gnss_fix",
    "rf",
}


def test_telemetry_v2_wire_shape(scenario: AvdiivkaScenario) -> None:
    payloads = scenario.telemetry(75.0)
    assert len(payloads) == 8
    for p in payloads:
        wire = p.to_wire()
        assert wire["schema"] == "telemetry/2"
        assert wire["rx_class"] in {"gnss_civil", "gnss_mil"}
        assert wire["gnss_fix"] in {"3d", "2d", "none"}
        # The engine measures degradation; the sim must not self-report it.
        assert "degrading" not in wire
        assert set(wire) <= V2_FIELDS
        assert (wire["lat"], wire["lon"]) == SOURCE_POSITIONS[p.source_id]
    wire_b = next(p for p in payloads if p.source_id == "unit_b").to_wire()
    assert set(wire_b["rf"]) == {
        "frequency_band_mhz",
        "hop_spread_hz",
        "gps_l1_overlap",
        "gps_l2_overlap",
        "time_domain_pattern",
    }


def test_beat_labels_cover_the_storyboard() -> None:
    assert [b.tick_seconds for b in avdiivka_beats()] == [0.0, 45.0, 55.0, 75.0, 110.0, 135.0]
