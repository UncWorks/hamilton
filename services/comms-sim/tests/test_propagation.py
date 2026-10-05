"""C2 propagation vs the reference link budget (≤ 0.01 dB).

Two sources of truth:

1. ``packages/contracts/fixtures/aoe/propagation-vectors.json`` (WS-A, frozen at
   CP1). The test below loads it when present and is skipped until then.
2. TEMPORARY (until CP1 lands the fixture): values computed by
   ``scripts/aoe-preview/gen_fixtures.py`` (``path_loss_db``, ``truth_obs``),
   frozen here. Delete this block once (1) runs green.
"""

from __future__ import annotations

import json
import math
from pathlib import Path

import numpy as np
import pytest

from comms_sim.propagation import (
    gnss_js_db,
    path_loss_db,
    radio_horizon_km,
    sector_gain_db,
    shadowing_db,
)
from comms_sim.scenarios.avdiivka import B_WAYPOINT_T_S, UNITS, AvdiivkaScenario

TOL_DB = 0.01
REPO = Path(__file__).resolve().parents[3]
VECTORS = REPO / "packages/contracts/fixtures/aoe/propagation-vectors.json"


# --- TEMPORARY: frozen from gen_fixtures.py (path_loss_db at L1, h_rx 2 m) ----
# [d_km, h_tx_m, path loss dB]
GEN_FIXTURES_PATH_LOSS = [
    [0.05, 10.0, 70.3751],
    [0.3, 10.0, 85.9381],
    [1.0, 10.0, 96.3957],
    [2.5, 10.0, 109.897],
    [2.5, 30.0, 104.3545],
    [2.5, 60.0, 104.3545],
    [5.0, 10.0, 121.9382],
    [5.0, 30.0, 112.3958],
    [5.0, 60.0, 110.3751],
    [9.55, 10.0, 133.1795],
    [9.55, 30.0, 123.6371],
    [9.55, 60.0, 117.6165],
    [12.0, 10.0, 137.1466],
    [12.0, 30.0, 127.6042],
    [12.0, 60.0, 121.5836],
    [18.9, 10.0, 165.0379],
    [18.9, 30.0, 135.4954],
    [18.9, 60.0, 129.4748],
    [19.5, 10.0, 165.5808],
    [19.5, 30.0, 136.0384],
    [19.5, 60.0, 130.0178],
    [25.0, 10.0, 169.897],
    [25.0, 30.0, 140.3546],
    [25.0, 60.0, 134.334],
    [40.0, 10.0, 178.0618],
    [40.0, 30.0, 168.5194],
    [40.0, 60.0, 162.4988],
]
# truth_obs() at the demo truth (300 W / 10 m / az 270, seed 7): per-unit GNSS
# J/S incl. sector gain and shadowing, and degraded (J/S >= class threshold).
GEN_FIXTURES_UNIT_JS = {
    "B": (41.5921, True),
    "D": (42.9019, True),
    "E": (38.8959, True),
    "C": (33.0124, False),
    "A": (30.2658, False),
    "F": (27.9992, False),
    "G": (30.2446, False),
    "H": (42.8656, True),
    "B@moved": (34.3008, False),
}
GEN_FIXTURES_SHADOW = {
    "B": 0.004921,
    "D": 1.194982,
    "E": -1.096551,
    "C": -3.562367,
    "A": -1.818683,
    "F": -3.966586,
    "G": 0.240574,
    "H": 5.360861,
}


@pytest.mark.parametrize(("d_km", "h_tx", "expected"), GEN_FIXTURES_PATH_LOSS)
def test_temporary_path_loss_matches_gen_fixtures(d_km: float, h_tx: float, expected: float):
    assert abs(float(path_loss_db(d_km, h_tx)) - expected) <= TOL_DB


def test_temporary_shadowing_matches_gen_fixtures_seed_7() -> None:
    order = [u.key for u in UNITS]
    assert order == ["B", "D", "E", "C", "A", "F", "G", "H"]
    got = shadowing_db(7, order, 4.0)
    for key, expected in GEN_FIXTURES_SHADOW.items():
        assert abs(got[key] - expected) < 1e-6


def test_temporary_unit_gnss_js_matches_gen_fixtures_truth_obs() -> None:
    s = AvdiivkaScenario()
    for u in UNITS:
        lb = s.link_budget(u.source_id, 75.0)
        js, degraded = GEN_FIXTURES_UNIT_JS[u.key]
        assert lb.gnss_js_db is not None
        assert abs(lb.gnss_js_db - js) <= TOL_DB, u.key
        assert (lb.gnss_js_db >= {"gnss_civil": 36.0, "gnss_mil": 41.0}[u.rx_class]) == degraded
    moved = s.link_budget("unit_b", B_WAYPOINT_T_S).gnss_js_db
    assert moved is not None
    assert abs(moved - GEN_FIXTURES_UNIT_JS["B@moved"][0]) <= TOL_DB


# --- model properties -------------------------------------------------------
def test_horizon_adds_twenty_db() -> None:
    h = radio_horizon_km(10.0)
    assert math.isclose(h, 4.12 * (math.sqrt(10.0) + math.sqrt(2.0)))
    inside = float(path_loss_db(h - 1e-6, 10.0))
    outside = float(path_loss_db(h + 1e-6, 10.0))
    assert abs(outside - inside - 20.0) < 0.01


def test_path_loss_is_monotone_in_distance_inside_horizon() -> None:
    d = np.linspace(0.01, radio_horizon_km(10.0) - 0.01, 500)
    assert np.all(np.diff(path_loss_db(d, 10.0)) >= 0)


def test_sector_gain_front_and_back() -> None:
    tx = (9.5, 1.0)
    assert float(sector_gain_db(tx, 0.0, 1.0, 270.0, 125.0, -20.0)) == 0.0  # due west
    assert float(sector_gain_db(tx, 20.0, 1.0, 270.0, 125.0, -20.0)) == -20.0  # due east
    # 62.5 deg off boresight is the sector edge (inside); 63 deg is outside.
    edge = math.radians(270.0 - 62.4)
    inside_xy = (tx[0] + math.sin(edge), tx[1] + math.cos(edge))
    assert float(sector_gain_db(tx, *inside_xy, 270.0, 125.0, -20.0)) == 0.0
    off = math.radians(270.0 - 63.0)
    outside_xy = (tx[0] + math.sin(off), tx[1] + math.cos(off))
    assert float(sector_gain_db(tx, *outside_xy, 270.0, 125.0, -20.0)) == -20.0


def test_gnss_js_is_the_worked_example_link_budget() -> None:
    # 300 W at 9.55 km, 10 m: EIRP - 5 dBi - L + 125 dBm
    p = 10 * math.log10(300e3)
    expected = p - 5.0 - float(path_loss_db(9.55, 10.0)) + 125.0
    assert abs(float(gnss_js_db(9.55, p, 10.0)) - expected) < 1e-9


# --- CP1 fixture (WS-A) -----------------------------------------------------
def _vector_rows() -> list[dict]:
    raw = json.loads(VECTORS.read_text())
    rows = raw.get("vectors", raw) if isinstance(raw, dict) else raw
    assert isinstance(rows, list) and rows
    return rows


@pytest.mark.skipif(not VECTORS.exists(), reason="propagation-vectors.json lands at CP1 (WS-A)")
def test_matches_contract_propagation_vectors() -> None:
    """Every vector's path loss (and J/S when given) within 0.01 dB.

    Field names follow the plan's §3.2 description; align after CP1 if the
    frozen fixture names them differently."""

    for row in _vector_rows():
        d_km = row["d_km"] if "d_km" in row else row["distance_km"]
        h_tx = row["h_tx_m"]
        h_rx = row.get("h_rx_m", 2.0)
        f = row.get("f_mhz", 1575.42)
        if "path_loss_db" in row:
            got = float(path_loss_db(d_km, h_tx, h_rx, f))
            assert abs(got - row["path_loss_db"]) <= TOL_DB, row
        if "js_db" in row and "eirp_dbm" in row:
            got = float(gnss_js_db(d_km, row["eirp_dbm"], h_tx, h_rx, f))
            assert abs(got - row["js_db"]) <= TOL_DB, row
