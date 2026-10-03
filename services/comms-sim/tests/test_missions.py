"""Calls for fire published by the Avdiivka scenario (fires/mission/{id})."""

from __future__ import annotations

import json
import re
from datetime import UTC, datetime

from comms_sim.missions import (
    AB1001_AT_S,
    avdiivka_missions,
    fire_mission_topic,
)
from comms_sim.runner import mission_payload
from comms_sim.scenarios.avdiivka import SOURCE_POSITIONS, avdiivka_beats

# FireMissionSchema (packages/contracts/src/fire-mission.ts) field set.
TOP_LEVEL_FIELDS = {
    "mission_id",
    "observer",
    "target",
    "munition",
    "firing_unit",
    "dependencies",
    "status",
    "method_of_control",
    "received_at",
}
ROLES = {"observer_link", "target_location", "firing_unit_nav"}
CLASSES = {"gps_guided", "laser_guided", "unguided"}


def _by_id() -> dict:
    return {m.mission_id: m for m in avdiivka_missions()}


def test_ab1001_is_an_m982_call_from_b_three_seconds_before_the_collapse() -> None:
    m = _by_id()["AB1001"]
    jammer_beat = next(b for b in avdiivka_beats() if b.label.startswith("B-1:15"))
    assert m.tick_seconds == AB1001_AT_S == 72.0
    assert jammer_beat.tick_seconds - m.tick_seconds == 3.0
    assert m.observer_id == "unit_b"
    assert m.observer_label == "OBS B (FO)"
    assert (m.munition.designation, m.munition.munition_class) == ("M982", "gps_guided")
    deps = {(s, r) for s, r in m.dependencies}
    assert ("unit_b", "observer_link") in deps
    assert ("unit_b", "target_location") in deps
    assert {r for _, r in m.dependencies} == ROLES


def test_ab1002_is_unguided_and_does_not_depend_on_b() -> None:
    m = _by_id()["AB1002"]
    assert m.munition.munition_class == "unguided"
    assert m.tick_seconds < AB1001_AT_S
    assert all(s != "unit_b" for s, _ in m.dependencies)


def test_dependencies_are_rated_sources() -> None:
    for m in avdiivka_missions():
        for source_id, role in m.dependencies:
            assert source_id in SOURCE_POSITIONS
            assert role in ROLES


def test_wire_shape_matches_the_ts_contract() -> None:
    now = datetime(2024, 2, 15, 18, 42, 33, 250_000, tzinfo=UTC)
    for m in avdiivka_missions():
        body = json.loads(json.dumps(mission_payload(m, now)))
        assert set(body) == TOP_LEVEL_FIELDS
        assert re.fullmatch(r"[A-Z]{2}\d{4}", body["mission_id"])
        assert body["munition"]["class"] in CLASSES
        assert set(body["munition"]) == {"designation", "name", "class"}
        assert set(body["target"]) == {"grid", "lat", "lon", "description", "class"}
        assert body["target"]["class"] in {"standard", "hpt"}
        assert body["status"] == "received"
        assert body["method_of_control"] == "when_ready"
        assert body["received_at"] == "2024-02-15T18:42:33.250Z"
        assert body["dependencies"] and all(set(d) == {"source_id", "role"} for d in body["dependencies"])


def test_topic() -> None:
    assert fire_mission_topic("AB1001") == "fires/mission/AB1001"


class _FakeClient:
    def __init__(self, *_a: object, **_k: object) -> None:
        self.published: list[tuple[str, bytes | str, int, bool]] = []

    def connect(self, *_a: object, **_k: object) -> None: ...
    def loop_start(self) -> None: ...
    def loop_stop(self) -> None: ...
    def disconnect(self) -> None: ...

    def publish(self, topic: str, payload: bytes | str, qos: int = 0, retain: bool = False) -> None:
        self.published.append((topic, payload, qos, retain))


def test_runner_clears_then_publishes_missions_retained(monkeypatch) -> None:
    from comms_sim import runner

    fake = _FakeClient()
    monkeypatch.setattr(runner.mqtt, "Client", lambda *a, **k: fake)
    monkeypatch.setattr(runner.time, "sleep", lambda _s: None)
    runner.run_scenario(runner.RunnerConfig("localhost", 1883, duration_s=80.0))

    mission_msgs = [p for p in fake.published if p[0].startswith("fires/mission/")]
    # Two clears (empty, retained) first, then one retained call for fire each.
    assert [(t, pl) for t, pl, _q, _r in mission_msgs[:2]] == [
        ("fires/mission/AB1002", b""),
        ("fires/mission/AB1001", b""),
    ]
    assert all(r for *_x, r in mission_msgs)
    published = [json.loads(pl)["mission_id"] for _t, pl, _q, _r in mission_msgs[2:]]
    assert published == ["AB1002", "AB1001"]

    # AB1001 lands after the 72nd tick's telemetry index and before the 1:15 jammer tick.
    topics = [t for t, *_ in fake.published]
    i_ab1001 = topics.index("fires/mission/AB1001", 2)
    telemetry_ticks_before = topics[:i_ab1001].count("telemetry/unit_b/raw")
    assert telemetry_ticks_before == 72
