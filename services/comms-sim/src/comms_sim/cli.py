"""CLI entrypoint — `comms-sim` console script."""

from __future__ import annotations

import logging
import os
import sys

import click

from comms_sim.runner import RunnerConfig, run_scenario


def _broker_from_env() -> tuple[str, int]:
    raw = os.environ.get("MQTT_BROKER_URL", "mqtt://localhost:1883")
    stripped = raw.removeprefix("mqtt://").removeprefix("tcp://")
    host, _, port_str = stripped.partition(":")
    port = int(port_str) if port_str else 1883
    return host, port


@click.command()
@click.option(
    "--scenario",
    default=lambda: os.environ.get("COMMS_SIM_SCENARIO", "avdiivka"),
    show_default="avdiivka",
    help="Scenario name (only 'avdiivka' is implemented).",
)
@click.option(
    "--speed",
    type=float,
    default=lambda: float(os.environ.get("COMMS_SIM_SPEED", "1")),
    show_default="1",
    help="Time-scale multiplier (10 = 10x faster than real time, dev only).",
)
@click.option(
    "--seed",
    type=int,
    default=lambda: int(os.environ.get("COMMS_SIM_SEED", "42")),
    show_default="42",
    help="RNG seed for jitter — same seed -> same scenario.",
)
@click.option(
    "--duration",
    type=float,
    default=150.0,
    show_default=True,
    help="Total scenario duration in scenario-seconds.",
)
def main(scenario: str, speed: float, seed: int, duration: float) -> int:
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    )
    if scenario != "avdiivka":
        click.echo(f"unknown scenario: {scenario}", err=True)
        return 2

    host, port = _broker_from_env()
    config = RunnerConfig(
        broker_host=host,
        broker_port=port,
        speed=speed,
        seed=seed,
        duration_s=duration,
    )
    try:
        run_scenario(config)
    except KeyboardInterrupt:
        click.echo("interrupted", err=True)
        return 130
    return 0


if __name__ == "__main__":
    sys.exit(main())
