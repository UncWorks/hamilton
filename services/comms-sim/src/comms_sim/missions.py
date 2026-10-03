"""Fire missions (calls for fire) for the Avdiivka scenario.

Wire shape mirrors packages/contracts/src/fire-mission.ts `FireMissionSchema`
(TypeScript only — the trust engine does not consume missions; the web client
evaluates them against the target selection standards).

Published RETAINED on `fires/mission/{mission_id}` so a page opened late still
sees the open missions. At scenario start the runner publishes an empty
retained payload on every mission topic, which removes the previous loop's
missions from the broker and from any open page.

Demo dependency mapping (docs/plans/tss-mission-row.md): B is the forward
observer for AB1001, C (the target-acquisition radar) for AB1002, and A stands
in for the firing battery's nav/GPS link. A and C stay healthy all scenario.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Literal

MunitionClass = Literal["gps_guided", "laser_guided", "unguided"]
DependencyRole = Literal["observer_link", "target_location", "firing_unit_nav"]

TOPIC_FIRE_MISSION_PREFIX = "fires/mission"


def fire_mission_topic(mission_id: str) -> str:
    return f"{TOPIC_FIRE_MISSION_PREFIX}/{mission_id}"


@dataclass(frozen=True)
class Munition:
    designation: str
    name: str
    munition_class: MunitionClass

    def to_wire(self) -> dict:
        return {"designation": self.designation, "name": self.name, "class": self.munition_class}


@dataclass(frozen=True)
class FireMissionSpec:
    """A call for fire scheduled at `tick_seconds` of scenario time."""

    tick_seconds: float
    mission_id: str
    observer_id: str
    observer_label: str
    target_grid: str
    target_lat: float
    target_lon: float
    target_description: str
    target_class: Literal["standard", "hpt"]
    munition: Munition
    firing_unit_id: str
    firing_unit_label: str
    dependencies: tuple[tuple[str, DependencyRole], ...]
    method_of_control: Literal["when_ready", "at_my_command", "do_not_load"] = "when_ready"

    def to_wire(self, received_at: datetime) -> dict:
        return {
            "mission_id": self.mission_id,
            "observer": {"source_id": self.observer_id, "label": self.observer_label},
            "target": {
                "grid": self.target_grid,
                "lat": self.target_lat,
                "lon": self.target_lon,
                "description": self.target_description,
                "class": self.target_class,
            },
            "munition": self.munition.to_wire(),
            "firing_unit": {"unit_id": self.firing_unit_id, "label": self.firing_unit_label},
            "dependencies": [
                {"source_id": source_id, "role": role} for source_id, role in self.dependencies
            ],
            "status": "received",
            "method_of_control": self.method_of_control,
            "received_at": iso_utc(received_at),
        }


def iso_utc(dt: datetime) -> str:
    """RFC 3339 with milliseconds and a Z suffix (zod `.datetime()` accepts it)."""
    return dt.astimezone(UTC).strftime("%Y-%m-%dT%H:%M:%S.") + (
        f"{dt.microsecond // 1000:03d}Z"
    )


M982 = Munition("M982", "Excalibur", "gps_guided")
M795 = Munition("M795", "HE", "unguided")

# 1:12 — three seconds before B's link collapses at 1:15 (scenarios/avdiivka.py).
AB1001_AT_S = 72.0
# 0:30 — an unguided mission from C, open across the whole degradation: it never gates.
AB1002_AT_S = 30.0


def avdiivka_missions() -> list[FireMissionSpec]:
    """Calls for fire for the Avdiivka scenario, in publish order."""

    return [
        FireMissionSpec(
            tick_seconds=AB1002_AT_S,
            mission_id="AB1002",
            observer_id="unit_c",
            observer_label="OBS C (RADAR)",
            target_grid="37U DP 08409 31815",
            target_lat=48.1330,
            target_lon=37.7690,
            target_description="Infantry in trenchline",
            target_class="standard",
            munition=M795,
            firing_unit_id="unit_a",
            firing_unit_label="FU A",
            dependencies=(
                ("unit_c", "observer_link"),
                ("unit_c", "target_location"),
                ("unit_a", "firing_unit_nav"),
            ),
        ),
        FireMissionSpec(
            tick_seconds=AB1001_AT_S,
            mission_id="AB1001",
            observer_id="unit_b",
            observer_label="OBS B (FO)",
            target_grid="37U DP 08604 33757",
            target_lat=48.1505,
            target_lon=37.7712,
            target_description="Mortar section in the open",
            target_class="hpt",
            munition=M982,
            firing_unit_id="unit_a",
            firing_unit_label="FU A",
            dependencies=(
                ("unit_b", "observer_link"),
                ("unit_b", "target_location"),
                ("unit_a", "firing_unit_nav"),
            ),
        ),
    ]
