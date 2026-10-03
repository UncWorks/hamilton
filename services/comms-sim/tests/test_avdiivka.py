"""Tests for the Avdiivka scenario.

Verifies that the beats produce the FRS §2 acceptance values when applied
in order.
"""

from __future__ import annotations

import math

from comms_sim.scenarios.avdiivka import (
    SOURCE_POSITIONS,
    avdiivka_beats,
    initial_state,
    render_telemetry,
)


def _state_after_beats_up_to(tick_seconds: float):
    state = initial_state()
    for beat in avdiivka_beats():
        if beat.tick_seconds <= tick_seconds:
            beat.apply(state)
    return state


def test_initial_state_has_three_healthy_units() -> None:
    state = initial_state()
    assert set(state.keys()) == {"unit_a", "unit_b", "unit_c"}
    for s in state.values():
        assert s.inter_arrival == 1.0
        assert s.crc < 0.005
        assert s.rf is None


# Engine temporal baseline: 1.0 s ± 0.05 s → 3σ = 1.15 s, 6σ = 1.30 s.
THREE_SIGMA_S = 1.15
SIX_SIGMA_S = 1.30


def test_b_0_45_unit_b_cadence_stretches_past_three_sigma() -> None:
    """WATCH band: anomaly fires (> 3σ) but temporal trust is not zeroed."""
    state = _state_after_beats_up_to(45.0)
    assert THREE_SIGMA_S < state["unit_b"].inter_arrival < SIX_SIGMA_S
    assert state["unit_b"].inter_arrival == 1.17
    assert state["unit_b"].rf is None
    assert state["unit_a"].inter_arrival == 1.0
    assert state["unit_c"].inter_arrival == 1.0


def test_b_0_55_unit_b_crc_crosses_five_percent() -> None:
    state = _state_after_beats_up_to(55.0)
    assert 0.05 < state["unit_b"].crc < 0.14
    assert state["unit_b"].crc == 0.06
    assert state["unit_a"].crc < 0.005


def test_b_1_05_nothing_new_before_jammer_peak() -> None:
    assert _state_after_beats_up_to(65.0) == _state_after_beats_up_to(55.0)


def test_b_1_15_jammer_full_power_lands_together() -> None:
    state = _state_after_beats_up_to(75.0)
    assert state["unit_b"].inter_arrival == 6.1
    assert state["unit_b"].crc == 0.14
    rf = state["unit_b"].rf
    assert rf is not None
    assert rf.gps_l1_overlap is True
    assert rf.gps_l2_overlap is True
    assert rf.time_domain_pattern == "barrage"


def test_jitter_keeps_watch_band_cadence_inside_engine_band() -> None:
    """Seeded jitter must not push B's 0:45–1:15 cadence under 3σ (flicker
    to healthy) or over 6σ (temporal 0 → early gate)."""
    import numpy as np

    from comms_sim.runner import _jittered

    rng = np.random.default_rng(42)
    state = _state_after_beats_up_to(55.0)
    for _ in range(30):
        by_id = {p.source_id: p for p in _jittered(render_telemetry(state), rng)}
        assert THREE_SIGMA_S < by_id["unit_b"].inter_arrival_seconds < 1.20
        assert by_id["unit_b"].crc_error_rate > 0.05
        assert by_id["unit_a"].inter_arrival_seconds < THREE_SIGMA_S


def test_b_2_15_unit_b_returns_to_nominal() -> None:
    state = _state_after_beats_up_to(135.0)
    assert state["unit_b"].inter_arrival == 1.0
    assert state["unit_b"].crc < 0.005
    assert state["unit_b"].rf is None


def test_render_telemetry_serializes_three_payloads() -> None:
    state = _state_after_beats_up_to(75.0)
    payloads = render_telemetry(state)
    assert len(payloads) == 3
    by_id = {p.source_id: p for p in payloads}
    assert by_id["unit_b"].rf is not None
    wire_b = by_id["unit_b"].to_wire()
    assert wire_b["rf"]["time_domain_pattern"] == "barrage"
    # The engine measures degradation; the sim must not self-report it.
    assert "degrading" not in wire_b
    # No unknown keys — Rust side has deny_unknown_fields
    assert set(wire_b.keys()) <= {
        "source_id",
        "lat",
        "lon",
        "inter_arrival_seconds",
        "crc_error_rate",
        "duplicate_rate",
        "rf",
    }


def _distance_m(a: tuple[float, float], b: tuple[float, float]) -> float:
    """Haversine, same formula as the engine's spatial detector."""
    r = 6_371_000.0
    lat1, lat2 = math.radians(a[0]), math.radians(b[0])
    dlat = math.radians(b[0] - a[0])
    dlon = math.radians(b[1] - a[1])
    h = math.sin(dlat / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlon / 2) ** 2
    return 2 * r * math.asin(math.sqrt(h))


def test_payloads_carry_real_positions() -> None:
    payloads = render_telemetry(initial_state())
    for p in payloads:
        wire = p.to_wire()
        assert (wire["lat"], wire["lon"]) == SOURCE_POSITIONS[p.source_id]
        assert (wire["lat"], wire["lon"]) != (0.0, 0.0)


def test_neighbors_within_spatial_radius_of_b() -> None:
    """Storyboard: C ~240 m from B, A within 500 m (FR-03 radius)."""
    b = SOURCE_POSITIONS["unit_b"]
    d_a = _distance_m(SOURCE_POSITIONS["unit_a"], b)
    d_c = _distance_m(SOURCE_POSITIONS["unit_c"], b)
    assert 200 < d_c < 280
    assert d_a <= 500
