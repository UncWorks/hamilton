"""Wire-format payloads — must mirror packages/contracts-rs/src/lib.rs.

Field names and types are the contract. Renaming a field here without
updating Rust will produce silent deserialization failures on the engine
(the Rust side has #[serde(deny_unknown_fields)]).

Telemetry v2 (docs/plans/jammer-aoe.md §3.1, plan row C4, trimmed MVP):
`schema: "telemetry/2"`, `rx_class`, `gnss_fix`. `RfObservation` carries no
`effective_range_km` (FR-04 rev: the sim never sends it).

Frozen at CP1 (tag aoe-contracts-v1): packages/contracts/src/telemetry.ts
`TelemetryPayloadSchema` ↔ contracts-rs `TelemetryPayload`. Every recorded
payload in fixtures/aoe/telemetry-beats.recorded.jsonl parses under both.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

TimeDomainPattern = Literal["continuous", "pulsed", "barrage", "swept"]
RxClass = Literal["gnss_civil", "gnss_mil", "gnss_mil_crpa", "uhf_comms", "fpv_link"]
GnssFix = Literal["3d", "2d", "none"]

TELEMETRY_SCHEMA = "telemetry/2"


@dataclass(frozen=True)
class RfObservation:
    frequency_band_mhz: tuple[float, float]
    hop_spread_hz: float
    gps_l1_overlap: bool
    gps_l2_overlap: bool
    time_domain_pattern: TimeDomainPattern

    def to_wire(self) -> dict:
        return {
            "frequency_band_mhz": list(self.frequency_band_mhz),
            "hop_spread_hz": self.hop_spread_hz,
            "gps_l1_overlap": self.gps_l1_overlap,
            "gps_l2_overlap": self.gps_l2_overlap,
            "time_domain_pattern": self.time_domain_pattern,
        }


@dataclass(frozen=True)
class TelemetryPayload:
    """`lat`/`lon` (WGS-84 decimal degrees) are required by the engine's
    spatial discriminator (FR-03). There is no self-reported `degrading`
    flag: the engine measures degradation itself. `gnss_fix` is the
    receiver's own fix state (GNSS-class evidence, K2)."""

    source_id: str
    lat: float
    lon: float
    inter_arrival_seconds: float
    crc_error_rate: float
    duplicate_rate: float
    rx_class: RxClass | None = None
    gnss_fix: GnssFix | None = None
    rf: RfObservation | None = None

    def to_wire(self) -> dict:
        body: dict = {
            "schema": TELEMETRY_SCHEMA,
            "source_id": self.source_id,
            "lat": self.lat,
            "lon": self.lon,
            "inter_arrival_seconds": self.inter_arrival_seconds,
            "crc_error_rate": self.crc_error_rate,
            "duplicate_rate": self.duplicate_rate,
        }
        if self.rx_class is not None:
            body["rx_class"] = self.rx_class
        if self.gnss_fix is not None:
            body["gnss_fix"] = self.gnss_fix
        if self.rf is not None:
            body["rf"] = self.rf.to_wire()
        return body
