"""C2 propagation vs the frozen contract fixture (≤ 0.01 dB).

``packages/contracts/fixtures/aoe/propagation-vectors.json`` (CP1,
aoe-contracts-v1) holds path-loss / J/S vectors and denial radii;
``golden-cases.json`` holds the demo truth's per-unit evidence at seed 7.
"""

from __future__ import annotations

import json
import math
from pathlib import Path

import numpy as np
import pytest

from comms_sim.propagation import (
    THRESHOLD_DB,
    gnss_js_db,
    path_loss_db,
    radio_horizon_km,
    sector_gain_db,
)
from comms_sim.scenarios.avdiivka import B_WAYPOINT_T_S, UNITS, AvdiivkaScenario

REPO = Path(__file__).resolve().parents[3]
FIXTURES = REPO / "packages/contracts/fixtures/aoe"
PROP = json.loads((FIXTURES / "propagation-vectors.json").read_text())
GOLDEN = json.loads((FIXTURES / "golden-cases.json").read_text())
TOL_DB = PROP["model"]["tolerance_db"]


def test_fixture_tolerance_is_a_hundredth_of_a_db() -> None:
    assert TOL_DB == 0.01
    assert len(PROP["vectors"]) > 100
    # both the GNSS (L1) and the comms-module (300 MHz) bands are covered
    assert {v["f_mhz"] for v in PROP["vectors"]} >= {1575.42, 300.0}


@pytest.mark.parametrize(
    "v", PROP["vectors"], ids=lambda v: f"{v['f_mhz']}MHz-{v['d_km']}km-{v['h_tx_m']}m"
)
def test_path_loss_and_js_match_contract_vectors(v: dict) -> None:
    got = float(path_loss_db(v["d_km"], v["h_tx_m"], v["h_rx_m"], v["f_mhz"]))
    assert abs(got - v["path_loss_db"]) <= TOL_DB
    for erp, js in v.get("js_db", {}).items():  # J/S is given at L1 only
        got_js = float(gnss_js_db(v["d_km"], float(erp), v["h_tx_m"], v["h_rx_m"], v["f_mhz"]))
        assert abs(got_js - js) <= TOL_DB, erp


@pytest.mark.parametrize(
    "r", PROP["denial_radii"], ids=lambda r: f"{r['rx_class']}-{r['erp_dbm']}-{r['mast_m']}"
)
def test_denial_radii_match_contract(r: dict) -> None:
    ds = np.arange(0.01, 80, 0.01)
    ok = ds[gnss_js_db(ds, r["erp_dbm"], r["mast_m"]) >= r["threshold_db"]]
    radius = float(ok.max()) if len(ok) else 0.0
    assert r["threshold_db"] == THRESHOLD_DB[r["rx_class"]]
    assert abs(radius - r["denial_radius_km"]) <= 0.01 + 1e-9


def test_demo_truth_matches_golden_cases() -> None:
    s = AvdiivkaScenario()
    tr = GOLDEN["demo_truth"]
    lat, lon = s.truth.lat_lon
    assert (round(lat, 5), round(lon, 5)) == (tr["lat"], tr["lon"])
    assert list(s.truth.enu_km) == tr["enu_km"]
    assert s.truth.mast_m == tr["mast_m"]
    assert s.truth.sector_az_deg == tr["sector_az_deg"]
    assert s.truth.sector_width_deg == tr["sector_width_deg"]
    assert s.truth.back_db == tr["back_db"]
    assert s.truth.shadow_seed == tr["shadow_seed"]
    assert abs(s.truth.eirp_dbm("gnss", 75.0) - tr["erp_dbm"]) < 1e-3


def test_unit_layout_matches_golden_cases() -> None:
    golden = {u["source_id"]: u for u in GOLDEN["units"]}
    assert [u.key for u in UNITS] == GOLDEN["model"]["order"]
    for u in UNITS:
        g = golden[u.source_id]
        assert (u.key, u.rx_class, list(u.enu_km)) == (g["key"], g["rx_class"], g["enu_km"])
        assert (u.lat, u.lon) == (g["lat"], g["lon"])


def test_unit_gnss_js_and_shadow_match_golden_demo() -> None:
    """Per-unit J/S (sector + seed-7 shadowing) at the 1:15 and 1:50 beats."""
    s = AvdiivkaScenario()
    shadow = s.truth.shadow()
    assert len(GOLDEN["demo"]) >= 2
    for case in GOLDEN["demo"]:
        moved = any(e["key"].startswith("B@") for e in case["evidence"])
        t = B_WAYPOINT_T_S if moved else 75.0
        for e in case["evidence"]:
            if e["source_id"] == "unit_b" and moved != e["key"].startswith("B@"):
                continue
            lb = s.link_budget(e["source_id"], t)
            assert lb.gnss_js_db is not None
            assert abs(lb.gnss_js_db - e["js_db"]) <= TOL_DB, e["key"]
            assert abs(shadow[e["source_id"]] - e["shadow_db"]) < 0.0005
            degraded = lb.gnss_js_db >= THRESHOLD_DB[e["rx_class"]]
            assert degraded == (e["state"] == "degraded"), e["key"]


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
