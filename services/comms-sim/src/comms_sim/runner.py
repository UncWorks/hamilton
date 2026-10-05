"""Scenario runner — evaluates the Avdiivka scenario over wall-clock or scaled
time and publishes telemetry every tick (plan row C5).

The hidden emitter truth is written ONCE to a sim-only `truth.json` (gitignored)
before the first tick and is never published (HS-20).
"""

from __future__ import annotations

import dataclasses
import json
import logging
import time
from collections.abc import Callable, Iterable
from dataclasses import dataclass
from datetime import UTC, datetime

import numpy as np
import paho.mqtt.client as mqtt

from comms_sim.missions import FireMissionSpec, avdiivka_missions, fire_mission_topic
from comms_sim.payloads import TelemetryPayload
from comms_sim.scenarios.avdiivka import AvdiivkaScenario, ScenarioBeat, avdiivka_beats
from comms_sim.scenarios.emitter_truth import write_truth_json

log = logging.getLogger(__name__)

TICK_INTERVAL_S = 1.0

# (topic, payload, qos, retain)
Publisher = Callable[[str, str | bytes, int, bool], None]


@dataclass
class RunnerConfig:
    broker_host: str = "localhost"
    broker_port: int = 1883
    speed: float = 1.0
    seed: int = 42
    duration_s: float = 150.0  # cover B-0:00 → B-2:15 + a bit
    truth_path: str | None = "truth.json"  # sim-only; None = do not write


def telemetry_topic(source_id: str) -> str:
    return f"telemetry/{source_id}/raw"


def run_scenario(
    config: RunnerConfig,
    missions: Iterable[FireMissionSpec] | None = None,
    *,
    scenario: AvdiivkaScenario | None = None,
    publisher: Publisher | None = None,
    sleep: Callable[[float], None] | None = None,
    beats: Iterable[ScenarioBeat] | None = None,
) -> None:
    """Drive the Avdiivka scenario, publishing telemetry per tick and the
    scenario's calls for fire (retained) at their scenario times.

    ``publisher`` defaults to a paho MQTT client on the configured broker;
    tests pass an in-process fake to capture every published body."""

    rng = np.random.default_rng(config.seed)
    scenario = scenario or AvdiivkaScenario()
    beats_list = sorted(beats or avdiivka_beats(), key=lambda b: b.tick_seconds)
    missions_list = sorted(
        avdiivka_missions() if missions is None else missions, key=lambda m: m.tick_seconds
    )

    if config.truth_path is not None:
        out = write_truth_json(scenario.truth, config.truth_path)
        log.info("hidden truth written (sim-only, never published): %s", out)

    client = None
    if publisher is None:
        client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2, client_id="hamilton-comms-sim")
        client.connect(config.broker_host, config.broker_port, keepalive=30)
        client.loop_start()
        log.info("comms-sim connected to broker %s:%s", config.broker_host, config.broker_port)

        def publisher(topic: str, payload: str | bytes, qos: int, retain: bool) -> None:
            client.publish(topic, payload, qos=qos, retain=retain)

    try:
        # Clear the previous loop's retained missions before t = 0.
        for mission in missions_list:
            publisher(fire_mission_topic(mission.mission_id), b"", 1, True)

        scenario_t = 0.0
        sleep_per_tick = TICK_INTERVAL_S / max(config.speed, 0.01)
        next_beat_idx = 0
        next_mission_idx = 0

        while scenario_t <= config.duration_s:
            while (
                next_beat_idx < len(beats_list)
                and beats_list[next_beat_idx].tick_seconds <= scenario_t
            ):
                beat = beats_list[next_beat_idx]
                log.info("beat (t=%.1fs): %s", beat.tick_seconds, beat.label)
                next_beat_idx += 1

            while (
                next_mission_idx < len(missions_list)
                and missions_list[next_mission_idx].tick_seconds <= scenario_t
            ):
                mission = missions_list[next_mission_idx]
                publisher(
                    fire_mission_topic(mission.mission_id),
                    json.dumps(mission_payload(mission)),
                    1,
                    True,
                )
                log.info(
                    "call for fire published (t=%.1fs): %s %s",
                    mission.tick_seconds,
                    mission.mission_id,
                    mission.munition.designation,
                )
                next_mission_idx += 1

            for payload in _jittered(scenario.telemetry(scenario_t), rng):
                publisher(
                    telemetry_topic(payload.source_id),
                    json.dumps(payload.to_wire()),
                    0,
                    False,
                )

            (sleep or time.sleep)(sleep_per_tick)
            scenario_t += TICK_INTERVAL_S

        log.info("scenario complete")
    finally:
        if client is not None:
            client.loop_stop()
            client.disconnect()


def mission_payload(mission: FireMissionSpec, now: datetime | None = None) -> dict:
    """Wire body for `fires/mission/{id}`, stamped with the receive time."""
    return mission.to_wire(now or datetime.now(UTC))


def _jittered(
    payloads: list[TelemetryPayload],
    rng: np.random.Generator,
) -> list[TelemetryPayload]:
    """Add seeded RNG jitter to inter-arrival + CRC so the engine's
    detectors see real noise, not a step function.

    Jitter is proportional to the value (0.5% on cadence, 5% on CRC, CRC
    floor 0.0005). The engine's temporal band is narrow (3σ = 1.15 s,
    6σ = 1.30 s), so absolute jitter of a few tenths of a second would make
    temporal trust, and with it the TSS verdict, flicker at random."""

    jittered = []
    for p in payloads:
        ia_jitter = float(rng.normal(0.0, 0.005 * p.inter_arrival_seconds))
        crc_jitter = float(rng.normal(0.0, max(0.0005, 0.05 * p.crc_error_rate)))
        jittered.append(
            dataclasses.replace(
                p,
                inter_arrival_seconds=max(0.05, p.inter_arrival_seconds + ia_jitter),
                crc_error_rate=min(1.0, max(0.0, p.crc_error_rate + crc_jitter)),
            )
        )
    return jittered
