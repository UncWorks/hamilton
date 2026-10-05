"""TEMPORARY test inputs for the trust-estimator crate.

The real fixtures (`packages/contracts/fixtures/aoe/propagation-vectors.json`,
`golden-cases.json`) are produced by WS-A from the same maths. Until CP1 lands
they are derived here from `scripts/aoe-preview/gen_fixtures.py` (the preview
model) and the review sweep (`sweep.py`): same link budget, hypotheses, prior,
seeded shadowing (numpy default_rng) and 8-unit layout. Delete this file and
`temp-*.json` once the tests point at the real fixtures.

Run from the repo root:
  uv run --with numpy --with scikit-image --with shapely --with scipy \
      python services/trust-engine/crates/estimator/tests/fixtures/gen_temp_fixtures.py
"""

from __future__ import annotations

import json
import math
import sys
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[6]
sys.path.insert(0, str(ROOT / "scripts/aoe-preview"))
import gen_fixtures as gf  # noqa: E402

OUT = Path(__file__).resolve().parent

BASE = dict(x=9.5, y=1.0, p=10 * math.log10(300e3), ht=10.0, sector_az_deg=270.0, sector_width_deg=125.0, back_db=-20.0)
CASES = {
    "demo": BASE,
    "off_node": dict(BASE, x=9.63, y=1.13, p=10 * math.log10(420e3), ht=20.0),
    "back_lobe": dict(BASE, sector_az_deg=315.0),
}


def run(truth, seed, positions):
    gf.TRUTH.clear()
    gf.TRUTH.update(truth)
    r = np.random.default_rng(seed)
    gf.SHADOW = {u: r.normal(0, 4.0) for u in gf.ORDER}
    obs = gf.truth_obs(positions)
    nd = sum(o["degraded"] for o in obs.values())
    res = dict(truth_in_region90=None, area90_km2=None)
    if 0 < nd < len(obs):
        post, _ = gf.posterior(obs)
        pe = post.sum(axis=(0, 1))
        a90, lvl = gf.hpd(pe, 0.9)
        ix = int(round((truth["x"] - gf.xs[0]) / gf.RES))
        iy = int(round((truth["y"] - gf.ys[0]) / gf.RES))
        res = dict(truth_in_region90=bool(pe[iy, ix] >= lvl), area90_km2=round(float(a90), 2))
    observations = []
    for key, o in obs.items():
        u = key.split("@")[0]
        lat, lon = gf.to_latlon(o["x"], o["y"])
        observations.append(dict(key=key, source_id=gf.UNITS[u][3], rx_class=o["rc"], x_km=o["x"], y_km=o["y"],
                                 lat=lat, lon=lon, state="degraded" if o["degraded"] else "healthy",
                                 js_db=round(float(o["js"]), 3)))
    return observations, res


def truth_block(t):
    lat, lon = gf.to_latlon(t["x"], t["y"])
    return dict(x_km=t["x"], y_km=t["y"], lat=lat, lon=lon, erp_dbm=t["p"], mast_m=t["ht"],
                sector_az_deg=t["sector_az_deg"], sector_width_deg=t["sector_width_deg"], back_db=t["back_db"])


def main():
    base = [(u, gf.UNITS[u][0], gf.UNITS[u][1]) for u in gf.ORDER]
    moved = base + [("B@moved", gf.B_MOVE_X, 0.0)]
    cases = []
    for beat, pos in (("b115", base), ("b150", moved)):
        obs, res = run(dict(BASE), 7, pos)
        cases.append(dict(name=f"demo_{beat}", kind="demo_beat", seed=7, truth=truth_block(BASE), observations=obs, python=res))
    for kind, t in CASES.items():
        for seed in range(20):
            obs, res = run(dict(t), seed, base)
            cases.append(dict(name=f"{kind}_seed{seed}", kind=f"sweep_{kind}", seed=seed, truth=truth_block(t),
                              observations=obs, python=res))
        ok = [c["python"]["truth_in_region90"] for c in cases if c["kind"] == f"sweep_{kind}" and c["python"]["truth_in_region90"] is not None]
        print(f"{kind}: python contained {sum(ok)}/{len(ok)} bounded")
    data = dict(
        _temporary="TEMPORARY: derived from scripts/aoe-preview/gen_fixtures.py by gen_temp_fixtures.py until "
                   "packages/contracts/fixtures/aoe/golden-cases.json (WS-A, CP1) lands. Do not extend.",
        frame=dict(lat0=gf.LAT0, lon0=gf.LON0, km_per_deg_lat=gf.KM_PER_DEG_LAT),
        grid=dict(x_km=[float(gf.xs[0]), float(gf.xs[-1])], y_km=[float(gf.ys[0]), float(gf.ys[-1])], cell_m=gf.RES * 1000),
        flot_x_km=gf.FLOT_X,
        model=dict(erp_dbm=gf.PS, mast_m=gf.HTS, sigma_db=gf.SIG_LIK, thresholds_db=gf.T, signal_dbm=gf.S_DBM,
                   rx_gain_dbi=gf.G_R_JAM, rx_height_m=gf.H_R, freq_mhz=1575.42),
        golden=dict(b115=dict(area90_km2=905.8, civil_area90_km2=365.4, civil_area50_km2=1657.1, civil_iou50_footprint=0.46),
                    b150=dict(area90_km2=809.2, civil_iou50_footprint=0.49)),
        cases=cases,
    )
    (OUT / "temp-golden-cases.json").write_text(json.dumps(data, indent=1, sort_keys=True) + "\n")

    vec = []
    for d in (0.0005, 0.05, 0.3, 0.9, 1.0, 2.5, 5.0, 9.6, 13.17, 17.0, 20.0, 25.0, 30.0, 38.0, 45.0, 60.0, 79.99):
        for ht in (2.0, 10.0, 20.0, 30.0, 60.0):
            for hr, f in ((2.0, 1575.42), (2.0, 300.0), (10.0, 900.0)):
                lam = 299.792458 / f
                pl = float(gf.path_loss_db(np.array(d), ht, lam, hr))
                vec.append(dict(d_km=d, h_tx_m=ht, h_rx_m=hr, f_mhz=f, path_loss_db=round(pl, 6)))
    js = []
    for d in (0.5, 5.0, 9.6, 13.17, 20.0, 33.0, 50.0):
        for p in gf.PS:
            for ht in gf.HTS:
                js.append(dict(d_km=d, erp_dbm=p, h_tx_m=ht, js_db=round(float(gf.js_db(np.array(d), p, ht)), 6)))
    radii = [dict(erp_dbm=p, h_tx_m=ht, threshold_db=t, radius_km=gf.denial_radius_km(p, ht, t))
             for t in (36.0, 41.0, 66.0) for p in gf.PS for ht in gf.HTS]
    (OUT / "temp-propagation-vectors.json").write_text(json.dumps(dict(
        _temporary="TEMPORARY: from gen_fixtures.py path_loss_db / js_db / denial_radius_km until "
                   "packages/contracts/fixtures/aoe/propagation-vectors.json (WS-A) lands.",
        link=dict(signal_dbm=gf.S_DBM, rx_gain_dbi=gf.G_R_JAM, rx_height_m=gf.H_R, freq_mhz=1575.42),
        path_loss=vec, js=js, denial_radius=radii), indent=1) + "\n")
    print("wrote", OUT)


if __name__ == "__main__":
    main()
