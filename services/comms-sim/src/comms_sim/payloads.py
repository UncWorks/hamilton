"""Wire-format payloads — must mirror packages/contracts-rs/src/lib.rs.

Field names and types are the contract. Renaming a field here without
updating Rust will produce silent deserialization failures on the engine
(the Rust side has #[serde(deny_unknown_fields)]).
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

TimeDomainPattern = Literal["continuous", "pulsed", "barrage", "swept"]


@dataclass(frozen=True)
class RfObservation:
    frequency_band_mhz: tuple[float, float]
    hop_spread_hz: float
    gps_l1_overlap: bool
    gps_l2_overlap: bool
    time_domain_pattern: TimeDomainPattern
    effective_range_km: float

    def to_wire(self) -> dict:
        return {
            "frequency_band_mhz": list(self.frequency_band_mhz),
            "hop_spread_hz": self.hop_spread_hz,
            "gps_l1_overlap": self.gps_l1_overlap,
            "gps_l2_overlap": self.gps_l2_overlap,
            "time_domain_pattern": self.time_domain_pattern,
            "effective_range_km": self.effective_range_km,
        }


@dataclass(frozen=True)
class TelemetryPayload:
    """`lat`/`lon` (WGS-84 decimal degrees) are required by the engine's
    spatial discriminator (FR-03). There is no self-reported `degrading`
    flag: the engine measures degradation itself."""

    source_id: str
    lat: float
    lon: float
    inter_arrival_seconds: float
    crc_error_rate: float
    duplicate_rate: float
    rf: RfObservation | None = None

    def to_wire(self) -> dict:
        body: dict = {
            "source_id": self.source_id,
            "lat": self.lat,
            "lon": self.lon,
            "inter_arrival_seconds": self.inter_arrival_seconds,
            "crc_error_rate": self.crc_error_rate,
            "duplicate_rate": self.duplicate_rate,
        }
        if self.rf is not None:
            body["rf"] = self.rf.to_wire()
        return body
