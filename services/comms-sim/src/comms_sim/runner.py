"""Scenario runner — applies beats over wall-clock or scaled time and
publishes telemetry on MQTT every tick.
"""

from __future__ import annotations

import json
import logging
import time
from collections.abc import Iterable
from dataclasses import dataclass

import numpy as np
import paho.mqtt.client as mqtt

from comms_sim.payloads import TelemetryPayload
from comms_sim.scenarios.avdiivka import (
    ScenarioBeat,
    avdiivka_beats,
    initial_state,
    render_telemetry,
)

log = logging.getLogger(__name__)

TICK_INTERVAL_S = 1.0


@dataclass
class RunnerConfig:
    broker_host: str
    broker_port: int
    speed: float = 1.0
    seed: int = 42
    duration_s: float = 150.0  # cover B-0:00 → B-2:15 + a bit


def _telemetry_topic(source_id: str) -> str:
    return f"telemetry/{source_id}/raw"


def run_scenario(config: RunnerConfig, beats: Iterable[ScenarioBeat] | None = None) -> None:
    """Drive the Avdiivka scenario, publishing telemetry per tick."""

    rng = np.random.default_rng(config.seed)
    state = initial_state()
    beats_list = sorted(beats or avdiivka_beats(), key=lambda b: b.tick_seconds)

    client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2, client_id="hamilton-comms-sim")
    client.connect(config.broker_host, config.broker_port, keepalive=30)
    client.loop_start()
    log.info("comms-sim connected to broker %s:%s", config.broker_host, config.broker_port)

    try:
        scenario_t = 0.0
        sleep_per_tick = TICK_INTERVAL_S / max(config.speed, 0.01)
        next_beat_idx = 0

        while scenario_t <= config.duration_s:
            while (
                next_beat_idx < len(beats_list)
                and beats_list[next_beat_idx].tick_seconds <= scenario_t
            ):
                beat = beats_list[next_beat_idx]
                beat.apply(state)
                log.info("beat applied (t=%.1fs): %s", beat.tick_seconds, beat.label)
                next_beat_idx += 1

            for payload in _jittered(render_telemetry(state), rng):
                client.publish(
                    _telemetry_topic(payload.source_id),
                    json.dumps(payload.to_wire()),
                    qos=0,
                )

            time.sleep(sleep_per_tick)
            scenario_t += TICK_INTERVAL_S

        log.info("scenario complete")
    finally:
        client.loop_stop()
        client.disconnect()


def _jittered(
    payloads: list[TelemetryPayload],
    rng: np.random.Generator,
) -> list[TelemetryPayload]:
    """Add seeded RNG jitter to inter-arrival + CRC so the engine's
    detectors see real noise, not a step function.

    Jitter is proportional to the value (0.5% on cadence, 5% on CRC, CRC
    floor 0.0005). The engine's temporal band is narrow (3σ = 1.15 s,
    6σ = 1.30 s), so absolute jitter of a few tenths of a second would make
    temporal trust, and with it the ROE gate, flicker at random."""

    jittered = []
    for p in payloads:
        ia_jitter = float(rng.normal(0.0, 0.005 * p.inter_arrival_seconds))
        crc_jitter = float(rng.normal(0.0, max(0.0005, 0.05 * p.crc_error_rate)))
        jittered.append(
            TelemetryPayload(
                source_id=p.source_id,
                lat=p.lat,
                lon=p.lon,
                inter_arrival_seconds=max(0.05, p.inter_arrival_seconds + ia_jitter),
                crc_error_rate=min(1.0, max(0.0, p.crc_error_rate + crc_jitter)),
                duplicate_rate=p.duplicate_rate,
                rf=p.rf,
            )
        )
    return jittered
