"""Hidden emitter truth for the Avdiivka scenario (HS-20, plan row C1).

The jammer's position, power, mast and antenna pattern exist ONLY here. The
simulator uses them to compute each unit's J/S (``comms_sim.propagation``) and
then publishes nothing but the observable symptoms. ``write_truth_json``
writes a sim-only copy (``truth.json``, gitignored) for evaluation and the
after-action review; nothing in this module is ever put on an MQTT topic.
``tests/test_truth_isolation.py`` enforces that.

Design (docs/plans/jammer-aoe.md §0.3 b, d; §7.1 provenance):

- One EW site with two co-located modules on one mast:
  - GNSS module, Pole-21E-class: 300 W EIRP (low end of the verified
    300-1000 W envelope) [VMC], 10 m mast [VMC range], 125 deg sector [VMC]
    aimed west (az 270), -20 dB outside the sector [ASM back lobe].
  - Comms module, R-934B-class: 100-400 MHz ground band [VMC, Med]. Its EIRP
    schedule, the co-location and the shared sector antenna are [ASM],
    calibrated on unit B's beats.
- Per-unit log-normal shadowing, sigma 4 dB, drawn once from shadow seed 7
  (the worked example's seed and draw order) [ASM]. One draw per unit is used
  for both modules: they share the site, the mast and the path.
"""

from __future__ import annotations

import json
import math
from dataclasses import asdict, dataclass, field
from pathlib import Path

from comms_sim.propagation import GPS_L1_MHZ, shadowing_db

# ENU origin = unit B's start position (the worked example's origin).
ORIGIN_LAT = 48.14
ORIGIN_LON = 37.745
KM_PER_DEG_LAT = 111.32
KM_PER_DEG_LON = 111.32 * math.cos(math.radians(ORIGIN_LAT))


def enu_to_latlon(x_km: float, y_km: float) -> tuple[float, float]:
    """Flat-earth ENU (km east, km north of B's start) to WGS-84 degrees.

    Same projection as `scripts/aoe-preview/gen_fixtures.py` ``to_latlon``."""

    return ORIGIN_LAT + y_km / KM_PER_DEG_LAT, ORIGIN_LON + x_km / KM_PER_DEG_LON


@dataclass(frozen=True)
class EmitterModule:
    """One transmitter on the site's mast."""

    name: str  # "gnss" | "comms"
    model_class: str
    band_mhz: tuple[float, float]
    ref_freq_mhz: float  # frequency the link budget is evaluated at
    hop_spread_hz: float  # what a spectrum monitor measures as hop spread (barrage)


@dataclass(frozen=True)
class EirpStep:
    """From ``t_s`` on (scenario seconds), each module's EIRP in dBm; None = off."""

    t_s: float
    gnss_dbm: float | None
    comms_dbm: float | None


GNSS_MODULE = EmitterModule(
    name="gnss",
    model_class="Pole-21E-class",
    # GPS L5 lower edge .. GLONASS G1 upper edge: covers L1 and L2 [ASM]
    band_mhz=(1166.0, 1610.0),
    ref_freq_mhz=GPS_L1_MHZ,
    hop_spread_hz=0.0,
)
COMMS_MODULE = EmitterModule(
    name="comms",
    model_class="R-934B-class",
    band_mhz=(100.0, 400.0),  # [VMC, Med]
    ref_freq_mhz=300.0,  # the jammed UHF net's frequency [ASM]
    hop_spread_hz=50_000.0,  # [ASM] = the fingerprint library's observation
)

GNSS_EIRP_DBM = 10.0 * math.log10(300e3)  # 300 W = 54.77 dBm [VMC]

# EIRP schedule [ASM] (comms steps calibrated on B's beats; see avdiivka.py).
# Comms full power 67 dBm = a 500 W transmitter [VMC, Med] into a ~10 dBi
# sector antenna (125 x 25 deg beam) [ASM].
# The comms module steps up at 0:45, 0:55 and 1:15; the GNSS module comes on at
# 1:15; both hold through 1:50 and the site goes off air at 2:15.
DEMO_EIRP_SCHEDULE: tuple[EirpStep, ...] = (
    EirpStep(0.0, None, None),
    EirpStep(45.0, None, 56.0),
    EirpStep(55.0, None, 62.0),
    EirpStep(75.0, GNSS_EIRP_DBM, 67.0),
    EirpStep(135.0, None, None),
)


@dataclass(frozen=True)
class EmitterTruth:
    enu_km: tuple[float, float]
    mast_m: float
    sector_az_deg: float
    sector_width_deg: float
    back_db: float
    modules: tuple[EmitterModule, ...]
    shadow_seed: int
    shadow_sigma_db: float
    eirp_schedule: tuple[EirpStep, ...]
    shadow_keys: tuple[str, ...] = field(default=())

    @property
    def lat_lon(self) -> tuple[float, float]:
        return enu_to_latlon(*self.enu_km)

    def module(self, name: str) -> EmitterModule:
        return next(m for m in self.modules if m.name == name)

    def eirp_dbm(self, module: str, t_s: float) -> float | None:
        """The module's EIRP at scenario time ``t_s`` (None = off air)."""

        current: EirpStep | None = None
        for step in self.eirp_schedule:
            if step.t_s <= t_s:
                current = step
        if current is None:
            return None
        return current.gnss_dbm if module == "gnss" else current.comms_dbm

    def schedule_times(self) -> list[float]:
        return [s.t_s for s in self.eirp_schedule]

    def shadow(self) -> dict[str, float]:
        """Frozen per-unit shadowing in dB, keyed by source id."""

        return shadowing_db(self.shadow_seed, list(self.shadow_keys), self.shadow_sigma_db)

    def to_json(self) -> dict:
        lat, lon = self.lat_lon
        return {
            "_note": "SIM-ONLY hidden truth (HS-20). Never published; eval / AAR only.",
            "lat": round(lat, 5),
            "lon": round(lon, 5),
            "enu_km": list(self.enu_km),
            "mast_m": self.mast_m,
            "sector_az_deg": self.sector_az_deg,
            "sector_width_deg": self.sector_width_deg,
            "back_db": self.back_db,
            "modules": [{**asdict(m), "band_mhz": list(m.band_mhz)} for m in self.modules],
            "shadow_seed": self.shadow_seed,
            "shadow_sigma_db": self.shadow_sigma_db,
            "shadow_db": self.shadow(),
            "eirp_schedule": [asdict(s) for s in self.eirp_schedule],
        }


def demo_truth(shadow_keys: tuple[str, ...]) -> EmitterTruth:
    """The demo emitter: 9.6 km east of B (ENU 9.5, 1.0 km), shadow seed 7."""

    return EmitterTruth(
        enu_km=(9.5, 1.0),
        mast_m=10.0,
        sector_az_deg=270.0,
        sector_width_deg=125.0,
        back_db=-20.0,
        modules=(GNSS_MODULE, COMMS_MODULE),
        shadow_seed=7,
        shadow_sigma_db=4.0,
        eirp_schedule=DEMO_EIRP_SCHEDULE,
        shadow_keys=shadow_keys,
    )


def write_truth_json(truth: EmitterTruth, path: str | Path) -> Path:
    """Write the sim-only truth file. Called once per run by the runner."""

    out = Path(path)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(truth.to_json(), indent=2, sort_keys=True) + "\n")
    return out
