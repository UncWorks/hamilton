"""HS-20 / FR-04b (6): the hidden emitter truth never leaves the simulator.

Runs the full scenario through the real runner with an in-process fake
publisher, captures every (topic, body) it would put on the broker, and
asserts that no truth value appears anywhere in them.
"""

from __future__ import annotations

import json
import math
from pathlib import Path

import pytest

from comms_sim import runner
from comms_sim.scenarios.avdiivka import UNITS, AvdiivkaScenario

FULL_RUN_S = 150.0


@pytest.fixture(scope="module")
def capture(tmp_path_factory: pytest.TempPathFactory) -> dict:
    truth_path = tmp_path_factory.mktemp("sim") / "truth.json"
    published: list[tuple[str, str | bytes, int, bool]] = []
    scenario = AvdiivkaScenario()
    runner.run_scenario(
        runner.RunnerConfig(duration_s=FULL_RUN_S, truth_path=str(truth_path)),
        scenario=scenario,
        publisher=lambda topic, body, qos, retain: published.append((topic, body, qos, retain)),
        sleep=lambda _s: None,
    )
    return {"published": published, "truth_path": truth_path, "scenario": scenario}


def _numbers(obj: object) -> list[float]:
    if isinstance(obj, bool):
        return []
    if isinstance(obj, int | float):
        return [float(obj)]
    if isinstance(obj, dict):
        return [n for v in obj.values() for n in _numbers(v)]
    if isinstance(obj, list):
        return [n for v in obj for n in _numbers(v)]
    return []


def _keys(obj: object) -> set[str]:
    if isinstance(obj, dict):
        return set(obj) | {k for v in obj.values() for k in _keys(v)}
    if isinstance(obj, list):
        return {k for v in obj for k in _keys(v)}
    return set()


def _bodies(capture: dict) -> list[tuple[str, object]]:
    out = []
    for topic, body, _q, _r in capture["published"]:
        text = body.decode() if isinstance(body, bytes) else body
        out.append((topic, json.loads(text) if text else None))
    return out


def _truth_scalars(scenario: AvdiivkaScenario) -> dict[str, float]:
    tr = scenario.truth
    lat, lon = tr.lat_lon
    vals = {
        "lat": lat,
        "lon": lon,
        "mast_m": tr.mast_m,
        "sector_az_deg": tr.sector_az_deg,
        "sector_width_deg": tr.sector_width_deg,
        "back_db": tr.back_db,
    }
    for i, step in enumerate(tr.eirp_schedule):
        for name, dbm in (("gnss", step.gnss_dbm), ("comms", step.comms_dbm)):
            if dbm is not None:
                vals[f"eirp_{name}_{i}_dbm"] = dbm
                vals[f"eirp_{name}_{i}_w"] = 10 ** (dbm / 10) / 1e3
    for sid, db in scenario.truth.shadow().items():
        vals[f"shadow_{sid}"] = db
    return vals


def test_full_run_published_something(capture: dict) -> None:
    topics = {t for t, *_ in capture["published"]}
    assert {f"telemetry/{u.source_id}/raw" for u in UNITS} <= topics
    n_ticks = int(FULL_RUN_S) + 1
    assert sum(t.startswith("telemetry/") for t in topics) == len(UNITS)
    assert sum(t.startswith("telemetry/") for t, *_ in capture["published"]) == n_ticks * 8


def test_no_truth_topic(capture: dict) -> None:
    for topic, *_ in capture["published"]:
        assert "truth" not in topic.lower()
        assert topic.startswith(("telemetry/", "fires/mission/"))


def test_truth_lat_lon_never_published_at_4dp(capture: dict) -> None:
    lat, lon = capture["scenario"].truth.lat_lon
    lat4, lon4 = f"{lat:.4f}", f"{lon:.4f}"
    for topic, body in _bodies(capture):
        raw = json.dumps(body)
        assert lat4 not in raw and lon4 not in raw, topic
        for n in _numbers(body):
            assert round(n, 4) != round(lat, 4), (topic, n)
            assert round(n, 4) != round(lon, 4), (topic, n)


def test_no_truth_scalar_in_any_body(capture: dict) -> None:
    """No published number equals the EIRP (dBm or W), mast, sector, back lobe,
    position or any unit's shadowing value."""

    scalars = _truth_scalars(capture["scenario"])
    for topic, body in _bodies(capture):
        if not topic.startswith("telemetry/"):
            continue
        for n in _numbers(body):
            for name, v in scalars.items():
                assert not math.isclose(n, v, rel_tol=0, abs_tol=1e-6), (topic, name, n)


def test_no_truth_key_or_effective_range_in_any_body(capture: dict) -> None:
    banned = ("truth", "eirp", "mast", "shadow", "sector", "emitter", "jammer", "erp")
    for topic, body in _bodies(capture):
        keys = _keys(body)
        assert "effective_range_km" not in keys, topic
        for k in keys:
            assert not any(b in k.lower() for b in banned), (topic, k)
        if isinstance(body, dict) and "rf" in body:
            assert "effective_range_km" not in body["rf"]


def test_truth_json_written_once_and_sim_only(capture: dict) -> None:
    path: Path = capture["truth_path"]
    data = json.loads(path.read_text())
    lat, lon = capture["scenario"].truth.lat_lon
    assert data["lat"] == round(lat, 5) and data["lon"] == round(lon, 5)
    assert data["shadow_seed"] == 7
    assert {m["name"] for m in data["modules"]} == {"gnss", "comms"}
    # The truth file is gitignored next to the default output location.
    gitignore = Path(__file__).resolve().parents[1] / ".gitignore"
    assert "truth.json" in gitignore.read_text().split()
