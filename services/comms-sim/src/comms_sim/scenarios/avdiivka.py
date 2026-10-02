"""Avdiivka counterfactual scenario.

Beats per FRS §2 + System Design §2 acceptance criteria. The scenario is a
list of timestamped state mutations applied to per-source state; the engine
re-derives detection events from the resulting telemetry stream, just as it
would on real radio.

R14 discipline: this is data, not logic. The engine is the source of truth;
the scenario merely sets up the inputs that cause the engine's deterministic
detectors to fire.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Callable

from comms_sim.payloads import RfObservation, TelemetryPayload

# Geographic anchor — Avdiivka coordinates (approximate)
AVDIIVKA_LAT = 48.140
AVDIIVKA_LON = 37.745

# Three units in the FDC's COP, published on every telemetry payload. A and C
# sit ~245 m north/south of B, inside the spatial discriminator's 500 m radius
# (FRS §2.3 acceptance). Must match apps/web/app/page.tsx SEED_TRACKS.
SOURCE_POSITIONS = {
    "unit_a": (AVDIIVKA_LAT + 0.0022, AVDIIVKA_LON),
    "unit_b": (AVDIIVKA_LAT, AVDIIVKA_LON),
    "unit_c": (AVDIIVKA_LAT - 0.0022, AVDIIVKA_LON),
}

# RF profile of the suspected jammer at B-1:15 — matches the
# `ground_based_gps_uhf_barrage` library entry verbatim.
JAMMER_RF = RfObservation(
    frequency_band_mhz=(100.0, 2000.0),
    hop_spread_hz=50_000.0,
    gps_l1_overlap=True,
    gps_l2_overlap=True,
    time_domain_pattern="barrage",
    effective_range_km=30.0,
)


@dataclass
class SourceTelemetryState:
    inter_arrival: float = 1.0
    crc: float = 0.002
    duplicate_rate: float = 0.0
    rf: RfObservation | None = None
    # Scenario-internal: selects the simulator's jitter profile only. Never
    # sent on the wire; the engine measures degradation itself.
    degrading: bool = False


@dataclass(frozen=True)
class ScenarioBeat:
    """One timestamped mutation. Applied at `tick_seconds` past start."""

    tick_seconds: float
    label: str
    apply: Callable[[dict[str, SourceTelemetryState]], None]


def _set_unit_b_temporal_anomaly(state: dict[str, SourceTelemetryState]) -> None:
    state["unit_b"].inter_arrival = 6.1
    state["unit_b"].degrading = True


def _set_unit_b_stability_fault(state: dict[str, SourceTelemetryState]) -> None:
    state["unit_b"].crc = 0.14


def _set_unit_b_jammer_fingerprint(state: dict[str, SourceTelemetryState]) -> None:
    state["unit_b"].rf = JAMMER_RF


def _start_unit_b_recovery(state: dict[str, SourceTelemetryState]) -> None:
    state["unit_b"].crc = 0.04
    state["unit_b"].inter_arrival = 1.8


def _complete_unit_b_recovery(state: dict[str, SourceTelemetryState]) -> None:
    state["unit_b"].inter_arrival = 1.0
    state["unit_b"].crc = 0.002
    state["unit_b"].rf = None
    state["unit_b"].degrading = False


def avdiivka_beats() -> list[ScenarioBeat]:
    """Return the canonical Avdiivka scenario beats.

    Beat times match the storyboard (Branding §10) exactly. The engine's
    detectors decide what to publish on `integrity/trust/...` based on the
    telemetry these beats produce.
    """

    return [
        ScenarioBeat(0.0, "B-0:00 — three healthy units", lambda _: None),
        ScenarioBeat(45.0, "B-0:45 — Unit B temporal anomaly", _set_unit_b_temporal_anomaly),
        ScenarioBeat(55.0, "B-0:55 — Unit B stability fault", _set_unit_b_stability_fault),
        ScenarioBeat(75.0, "B-1:15 — Unit B jammer fingerprint", _set_unit_b_jammer_fingerprint),
        ScenarioBeat(110.0, "B-1:50 — Unit B recovery initiates", _start_unit_b_recovery),
        ScenarioBeat(135.0, "B-2:15 — Unit B fully recovered", _complete_unit_b_recovery),
    ]


def initial_state() -> dict[str, SourceTelemetryState]:
    return {source_id: SourceTelemetryState() for source_id in SOURCE_POSITIONS}


def render_telemetry(
    state: dict[str, SourceTelemetryState],
) -> list[TelemetryPayload]:
    """Snapshot current state into one TelemetryPayload per source."""
    return [
        TelemetryPayload(
            source_id=source_id,
            lat=SOURCE_POSITIONS[source_id][0],
            lon=SOURCE_POSITIONS[source_id][1],
            inter_arrival_seconds=s.inter_arrival,
            crc_error_rate=s.crc,
            duplicate_rate=s.duplicate_rate,
            rf=s.rf,
        )
        for source_id, s in state.items()
    ]
