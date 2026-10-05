"""Generate apps/web/src/stories/fixtures/aoe-preview.json — PREVIEW geometry for
the Storybook "Previews/Jammer AoE" stories (docs/plans/jammer-aoe.md).

NOT the estimator. The production estimator is the Rust crate the plan adds
(services/trust-engine/crates/estimator). This script is the jammer-AoE design
worked example (aoe_worked_example.py: same link budget, receiver thresholds,
hypothesis grid, prior, seeded shadowing and 8-unit layout), extended to emit
contours, so the previews draw what the model actually produces instead of
hand-drawn shapes. Deterministic: fixed grids, fixed seeds, ordered sums.

Differences from the worked-example script (all deliberate, all small):
- Grid widened to x -20..40 km, y -20..20 km (the script's x <= 25 km edge
  clipped the far side of the AoE and some posterior tail).
- The AoE kernel uses each hypothesis's exact denial radius (J/S >= T is
  monotone in range), i.e. a disc convolution, evaluated on the same 0.25 km
  grid. Same maths as the script's chunked sum, faster.
- Bearings (1:35 beat): the measured bearing is drawn ONCE per sensor. The
  script redraws the bearing noise inside the hypothesis loop, so each (ERP,
  mast) hypothesis saw a different bearing.

Run (numpy / scikit-image / shapely / scipy are dev-only, fetched by uv):
  uv run --with numpy --with scikit-image --with shapely --with scipy \
      python scripts/aoe-preview/gen_fixtures.py
Contract fixtures (docs/plans/aoe-parallelization.md §3.2; the preview JSON is
not written in this mode):
  uv run --with numpy --with scikit-image --with shapely --with scipy \
      python scripts/aoe-preview/gen_fixtures.py --contract-out packages/contracts/fixtures/aoe
"""

from __future__ import annotations

import json
import math
from pathlib import Path

import numpy as np
from scipy.signal import fftconvolve
from shapely.geometry import Polygon, MultiPolygon, Point, box
from shapely.ops import unary_union
from skimage.measure import find_contours

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "apps/web/src/stories/fixtures/aoe-preview.json"

# --- link budget ---------------------------------------------------------------
# Provenance tags (docs/plans/jammer-aoe.md §7.1): [VMC] verified manufacturer
# claim, [RC] recomputed by the verifier, [STD] standard, [ASM] assumption,
# [DES] design worked-example value. Source: ua-jamming-verification.md §3–§4.
S_DBM = -125.0           # GPS L1 C/A NOMINAL received power [RC]; -128.5 dBm is the IS-GPS-200 minimum [STD]
G_R_JAM = -5.0           # rx patch gain toward a horizon jammer, dBi [DES/RC]
H_R = 2.0                # rx antenna height, m [DES]
LAM_L1 = 299.792458 / 1575.42
T = {
    "gnss_civil": 36.0,     # loss of 3-D fix, lower bound of 36-58 dB (Forssell & Olsen 2003, Table 3) [RC]
    "gnss_mil": 41.0,       # DAGR P(Y) tracking (DAGR spec via design) [DES]
    "gnss_mil_crpa": 66.0,  # 41 + 25 dB CRPA: the 25 dB is Parkinson 2022's stated ASSUMPTION [ASM]
}
SIG_LIK = 6.0            # shadowing + model error, dB [DES]


def path_loss_db(d_km, ht, lam=LAM_L1, hr=H_R):
    d = np.maximum(np.asarray(d_km, dtype=float) * 1000.0, 1.0)
    fspl = 20 * np.log10(4 * np.pi * d / lam)
    tworay = 40 * np.log10(d) - 20 * np.log10(ht) - 20 * np.log10(hr)
    dbreak = 4 * ht * hr / lam
    L = np.where(d < dbreak, fspl, np.maximum(fspl, tworay))
    horizon_km = 4.12 * (math.sqrt(ht) + math.sqrt(hr))
    return np.where(np.asarray(d_km) > horizon_km, L + 20.0, L)


def js_db(d_km, p_dbm, ht):
    return p_dbm + G_R_JAM - path_loss_db(d_km, ht) - S_DBM


def Phi(z):
    from scipy.special import ndtr
    return ndtr(z)


# --- scenario (worked example, unchanged) -----------------------------------
LAT0, LON0 = 48.14, 37.745
KM_PER_DEG_LAT = 111.32
KM_PER_DEG_LON = 111.32 * math.cos(math.radians(LAT0))


def to_latlon(x, y):
    return LAT0 + y / KM_PER_DEG_LAT, LON0 + x / KM_PER_DEG_LON


# id: (x, y, rx class key in T, preview source id, role, sensor_type)
UNITS = {
    "B": (0.0, 0.0, "gnss_civil", "unit_b", "FO — OBS B (AB1001 observer)", "recon_static"),
    "D": (0.5, 4.0, "gnss_civil", "d", "FO 2", "recon_static"),
    "E": (0.3, -4.0, "gnss_civil", "e", "FO 3", "recon_static"),
    "C": (-3.0, -1.5, "gnss_civil", "unit_c", "TA radar (OBS C)", "detection"),
    "A": (-7.0, 0.5, "gnss_mil", "unit_a", "Firing battery (FU A)", "offense"),
    "F": (-6.0, -5.0, "gnss_mil", "f", "Battery 2", "offense"),
    "G": (-9.0, 3.0, "gnss_civil", "g", "AD section (Bn CP area)", "defense"),
    "H": (-1.5, 6.0, "gnss_civil", "h", "UAS team", "recon_mobile"),
}
ORDER = ["B", "D", "E", "C", "A", "F", "G", "H"]  # the worked example's dict order (seeded shadowing draws)
# Hidden truth: a Pole-21E-class module at the design's location (9.6 km east of B),
# at the LOW end of the verified envelope: EIRP 300 W (single-frequency mode) [VMC],
# on a 10 m roof / mast (MFR: up to 60 m) [VMC range], sector >=125 deg az [VMC]
# aimed west at the friendly side; outside the sector -20 dB (front-to-back) [ASM].
TRUTH = dict(x=9.5, y=1.0, p=10 * math.log10(300e3), ht=10.0, sector_az_deg=270.0, sector_width_deg=125.0, back_db=-20.0)
rng = np.random.default_rng(7)
SHADOW = {u: rng.normal(0, 4.0) for u in ORDER}

# Estimator hypotheses = the verified Pole-21E envelope: EIRP 300 / 550 / 1000 W
# [VMC], mast 10 / 30 / 60 m [VMC range]. The estimator is OMNI (MVP); the truth is
# sectoral — every unit sits inside the sector here, so the evidence cannot see
# the difference, but the true AoE behind the jammer is not denied (eval only).
PS = [round(10 * math.log10(w * 1e3), 1) for w in (300, 550, 1000)]
HTS = [10.0, 30.0, 60.0]
RES = 0.25
xs = np.arange(-25, 60 + 1e-9, RES)
ys = np.arange(-30, 30 + 1e-9, RES)
X, Y = np.meshgrid(xs, ys)
FLOT_X = 1.0
# 1:50: B displaces west far enough to be healthy (design said 3 km; with the
# verified 300 W / 10 m truth, 3 km west is still inside the denial radius).
B_MOVE_X = -5.0
# Prior (design §2.4): enemy side of the FLOT 1, friendly side 0.02 (soft floor).
# STANDOFF band (design "optional", from the inventory): RUSI Meatgrinder p.18
# [OBS] puts ~1 major EW system per 10 km of front ~7 km behind the line; we
# take 2-25 km behind the FLOT at weight 1 and beyond 25 km at 0.1 (soft) [ASM].
# Set STANDOFF = False to see the MVP without it (plan §7: NAI ~1030 km2).
STANDOFF = True
prior = np.where(X > FLOT_X, 1.0, 0.02)
if STANDOFF:
    prior = np.where((X > FLOT_X) & ((X - FLOT_X < 2.0) | (X - FLOT_X > 25.0)), 0.1, prior)


def sector_gain_db(x, y, truth=TRUTH):
    """Truth antenna pattern toward (x, y): 0 dB inside the sector, back_db outside [ASM]."""
    az = (90 - np.degrees(np.arctan2(np.asarray(y) - truth["y"], np.asarray(x) - truth["x"]))) % 360
    off = np.abs(((az - truth["sector_az_deg"]) + 180) % 360 - 180)
    return np.where(off <= truth["sector_width_deg"] / 2, 0.0, truth["back_db"])


def truth_js(x, y, truth=TRUTH):
    d = np.hypot(np.asarray(x) - truth["x"], np.asarray(y) - truth["y"])
    return js_db(d, truth["p"], truth["ht"]) + sector_gain_db(x, y, truth)


def unit_js(x, y, truth=TRUTH):
    d = math.hypot(x - truth["x"], y - truth["y"])
    return d, float(truth_js(x, y, truth))


def truth_obs(positions, truth=TRUTH, shadow=SHADOW):
    """positions: list of (key, x, y). Shadowing is per unit (seeded).
    `truth` / `shadow` default to the demo truth at shadow seed 7 (the preview);
    the contract golden cases (--contract-out) pass other truths and seeds."""
    out = {}
    for key, x, y in positions:
        u = key.split("@")[0]
        d, js = unit_js(x, y, truth)
        js += shadow[u]
        out[key] = dict(x=x, y=y, rc=UNITS[u][2], d=d, js=js, degraded=js >= T[UNITS[u][2]])
    return out


def posterior(obs, graded=False, bearings=()):
    """Grid posterior over (ERP, mast, e). graded: censored-Gaussian on J/S (v2).
    bearings: [(x, y, measured_rad, sigma_deg)] (v3)."""
    post = np.zeros((len(PS), len(HTS)) + X.shape)
    rng2 = np.random.default_rng(11)
    meas = {k: o["js"] + rng2.normal(0, 3.0) for k, o in obs.items()} if graded else {}
    for i, p in enumerate(PS):
        for j, ht in enumerate(HTS):
            logl = np.log(prior).copy()
            for k, o in obs.items():
                js = js_db(np.hypot(X - o["x"], Y - o["y"]), p, ht)
                if graded:
                    m = meas[k]
                    if m < 15:
                        logl += np.log(np.clip(Phi((15 - js) / SIG_LIK), 1e-9, 1))
                    elif m > 45:
                        logl += np.log(np.clip(Phi((js - 45) / SIG_LIK), 1e-9, 1))
                    else:
                        logl += -0.5 * ((js - m) / math.hypot(3.0, 4.0)) ** 2
                else:
                    pd = np.clip(Phi((js - T[o["rc"]]) / SIG_LIK), 1e-6, 1 - 1e-6)
                    logl += np.log(pd if o["degraded"] else 1 - pd)
            for bx, by, b_meas, sd in bearings:
                b = np.arctan2(Y - by, X - bx)
                db = np.angle(np.exp(1j * (b - b_meas)))
                logl += -0.5 * (db / math.radians(sd)) ** 2
            post[i, j] = logl
    post = np.exp(post - post.max())
    post /= post.sum()
    return post, meas


def denial_radius_km(p, ht, thr):
    ds = np.arange(0.01, 80, 0.01)
    ok = ds[js_db(ds, p, ht) >= thr]
    return float(ok.max()) if len(ok) else 0.0


def disc_kernel(r_km):
    n = int(math.ceil(r_km / RES))
    k = np.arange(-n, n + 1) * RES
    KX, KY = np.meshgrid(k, k)
    return (np.hypot(KX, KY) <= r_km).astype(float)


def p_denied(post, thr):
    out = np.zeros(X.shape)
    for i, p in enumerate(PS):
        for j, ht in enumerate(HTS):
            r = denial_radius_km(p, ht, thr)
            if r <= 0:
                continue
            out += fftconvolve(post[i, j], disc_kernel(r), mode="same")
    return np.clip(out, 0, 1)


def hpd(pe, mass):
    v = np.sort(pe.ravel())[::-1]
    c = np.cumsum(v)
    n = int(np.searchsorted(c, mass)) + 1
    return n * RES * RES, v[n - 1]


# --- geometry -----------------------------------------------------------------
def contour_multipolygon(field, level, max_vertices=64):
    """Marching squares (skimage) at `level`, padded so every ring closes; rings
    nested by even-odd depth into polygons with holes; simplified to <= 64 vertices."""
    pad = np.pad(field, 1, constant_values=0.0)
    rings = []
    for c in find_contours(pad, level):
        pts = [(xs[0] + (col - 1) * RES, ys[0] + (row - 1) * RES) for row, col in c]
        if len(pts) >= 4:
            poly = Polygon(pts)
            if poly.is_valid and poly.area > 0.3:  # drop specks < 0.3 km2
                rings.append(poly)
            elif not poly.is_valid:
                poly = poly.buffer(0)
                if poly.area > 0.3:
                    rings.append(poly)
    rings.sort(key=lambda p: -p.area)
    depth = [sum(1 for o in rings if o is not r and o.area > r.area and o.contains(r.representative_point())) for r in rings]
    shells = []
    for r, d in zip(rings, depth):
        if d % 2 == 0:
            shells.append([r, []])
        else:
            for s in shells:
                if s[0].contains(r.representative_point()):
                    s[1].append(r)
                    break
    polys = [Polygon(s.exterior.coords, [h.exterior.coords for h in holes]) for s, holes in shells]
    mp = unary_union(polys) if polys else MultiPolygon()
    tol = 0.05
    while True:
        simp = mp.simplify(tol, preserve_topology=True)
        geoms = list(simp.geoms) if hasattr(simp, "geoms") else [simp]
        nv = sum(len(g.exterior.coords) + sum(len(i.coords) for i in g.interiors) for g in geoms if not g.is_empty)
        if nv <= max_vertices or tol > 2:
            return simp
        tol *= 1.4


def mp_to_lonlat(mp):
    geoms = list(mp.geoms) if hasattr(mp, "geoms") else ([mp] if not mp.is_empty else [])
    out = []
    for g in geoms:
        if g.is_empty:
            continue
        rings = [g.exterior] + list(g.interiors)
        out.append([[[round(to_latlon(x, y)[1], 5), round(to_latlon(x, y)[0], 5)] for x, y in r.coords] for r in rings])
    return out


def area_km2(mp):
    return round(float(mp.area), 1)


def sample(field, x, y):
    ix = int(round((x - xs[0]) / RES))
    iy = int(round((y - ys[0]) / RES))
    return float(field[iy, ix])


def cn0_drop_db(js):
    """Effective C/N0 drop for J/S (Kaplan & Hegarty), C/A, Q = 2, C/N0_0 = 45 dB-Hz."""
    cn0 = 10 ** 4.5
    eff = 1 / (1 / cn0 + 10 ** (js / 10) / (2 * 1.023e6))
    return 45 - 10 * math.log10(eff)


TGT = dict(x=(37.7712 - LON0) * KM_PER_DEG_LON, y=(48.1505 - LAT0) * KM_PER_DEG_LAT)  # AB1001 target


def true_aoe(rc):
    """True denial area for a class (sector pattern, no shadowing), as a polygon."""
    field = (truth_js(X, Y) >= T[rc]).astype(float)
    return contour_multipolygon(field, 0.5, max_vertices=256) if field.any() else Polygon()


TRUE_AOE = {}
LAST_PE = {}


def estimate(name, positions, graded=False, bearings=(), classes=("gnss_civil", "gnss_mil", "gnss_mil_crpa")):
    obs = truth_obs(positions)
    bear = []
    rngb = np.random.default_rng(23)
    for u, sd in bearings:
        x, y = UNITS[u][0], UNITS[u][1]
        tb = math.atan2(TRUTH["y"] - y, TRUTH["x"] - x) + math.radians(rngb.normal(0, sd))
        bear.append((x, y, tb, sd))
    post, _ = posterior(obs, graded=graded, bearings=bear)
    pe = post.sum(axis=(0, 1))
    LAST_PE[name] = pe
    a50, thr50 = hpd(pe, 0.5)
    a90, thr90 = hpd(pe, 0.9)
    iy, ix = np.unravel_index(np.argmax(pe), pe.shape)
    mx, my = float(xs[ix]), float(ys[iy])
    mode_err = math.hypot(mx - TRUTH["x"], my - TRUTH["y"])
    truth_in90 = sample(pe, TRUTH["x"], TRUTH["y"]) >= thr90
    # ce90 around the mode
    dist = np.hypot(X - mx, Y - my).ravel()
    order = np.argsort(dist)
    ce90 = float(dist[order][np.searchsorted(np.cumsum(pe.ravel()[order]), 0.9)])
    # NAI = HPD90 region (contour of pe at thr90) ∩ prior mask (enemy side of the FLOT)
    nai = contour_multipolygon(pe, thr90).intersection(box(FLOT_X, ys[0], xs[-1], ys[-1]))
    erp_marg = post.sum(axis=(1, 2, 3))
    aoe = {}
    probes = {}
    for rc in classes:
        pden = p_denied(post, T[rc])
        radii = [denial_radius_km(p, ht, T[rc]) for p in PS for ht in HTS]
        c50 = contour_multipolygon(pden, 0.5)
        c90 = contour_multipolygon(pden, 0.9)
        aoe[rc] = dict(
            contours=[dict(p=0.5, area_km2=area_km2(c50), polygons=mp_to_lonlat(c50)),
                      dict(p=0.9, area_km2=area_km2(c90), polygons=mp_to_lonlat(c90))],
            radius_km_range=[round(min(radii), 1), round(max(radii), 1)],
            radius_km_median=round(float(np.median(radii)), 1),
        )
        probes[rc] = dict(
            units={k: round(sample(pden, o["x"], o["y"]), 2) for k, o in obs.items()},
            target=round(sample(pden, TGT["x"], TGT["y"]), 2),
        )
        # IoU of P>=0.5 against the true denial area for that class (truth: no shadowing)
        r_true = denial_radius_km(TRUTH["p"], TRUTH["ht"], T[rc])
        true_disc = TRUE_AOE[rc]
        inter = c50.intersection(true_disc).area
        union = c50.union(true_disc).area
        # Same IoU restricted to the evidence footprint: within the SMALLEST
        # hypothesis denial radius of a reporting unit (any denial there would have
        # shown up at that unit). Beyond it the AoE is extrapolated (outline only).
        r_fp = float(min(r for r in radii if r > 0))
        fp = unary_union([Point(o["x"], o["y"]).buffer(r_fp, 64) for o in obs.values()])
        fi = c50.intersection(true_disc).intersection(fp).area
        fu = c50.union(true_disc).intersection(fp).area
        aoe[rc]["eval"] = dict(true_radius_km=round(r_true, 2), iou50=round(inter / union, 2) if union else 0.0,
                               iou50_footprint=round(fi / fu, 2) if fu else 0.0)
        aoe[rc]["footprint_radius_km"] = round(r_fp, 1)
    symbol_gate = a90 <= 25.0 or len(bear) >= 2
    print(f"{name:12s} emitter HPD50 {a50:6.1f} HPD90 {a90:6.1f} km2  mode err {mode_err:4.1f} km  truth in 90%: {truth_in90}  "
          f"civil AoE50 {aoe['gnss_civil']['contours'][0]['area_km2']:6.1f} AoE90 {aoe['gnss_civil']['contours'][1]['area_km2']:6.1f} "
          f"IoU {aoe['gnss_civil']['eval']['iou50']}/{aoe['gnss_civil']['eval']['iou50_footprint']}  gate {symbol_gate}  P(B) {probes['gnss_civil']['units']}")
    mlat, mlon = to_latlon(mx, my)
    return dict(
        evidence={k: dict(state="degraded" if o["degraded"] else "healthy", js_db=round(o["js"], 1),
                          cn0_drop_db=round(cn0_drop_db(o["js"]), 0), rx_class=o["rc"],
                          lat=round(to_latlon(o["x"], o["y"])[0], 5), lon=round(to_latlon(o["x"], o["y"])[1], 5))
                  for k, o in obs.items()},
        emitter=dict(
            region90=mp_to_lonlat(nai), area90_km2=round(a90, 1), area50_km2=round(a50, 1),
            mode=dict(lat=round(mlat, 5), lon=round(mlon, 5), ce90_m=round(ce90 * 1000, -1)),
            mode_shown=bool(symbol_gate),
            erp_posterior={f"{int(p)}": round(float(w), 2) for p, w in zip(PS, erp_marg)},
        ),
        aoe=aoe,
        probes=probes,
        bearings=[dict(unit=u, lat=round(to_latlon(UNITS[u][0], UNITS[u][1])[0], 5), lon=round(to_latlon(UNITS[u][0], UNITS[u][1])[1], 5),
                       bearing_deg=round((90 - math.degrees(b[2])) % 360, 1), sigma_deg=sd)
                  for (u, sd), b in zip(bearings, bear)],
        eval=dict(mode_error_km=round(mode_err, 2), truth_in_region90=bool(truth_in90)),
    )


# --- illustrative comms / FPV layers (not Pole-21-class: band not covered) ---
def comms_layer(pe, f_mhz, erps_dbm, mast_m, ptx_dbm, htx_m, hrx_m, link_km, thr_db):
    """P(link denied at x) for a receiver at x on a `link_km` link, given the
    emitter-location marginal pe. Two-ray + horizon both paths (per-link J/S)."""
    lam = 299.792458 / f_mhz
    s = ptx_dbm - float(path_loss_db(np.array(link_km), htx_m, lam, hrx_m))
    out = np.zeros(X.shape)
    for erp in erps_dbm:
        ds = np.arange(0.01, 80, 0.01)
        jsr = erp - path_loss_db(ds, mast_m, lam, hrx_m) - s
        ok = ds[jsr >= thr_db]
        r = float(ok.max()) if len(ok) else 0.0
        out += fftconvolve(pe, disc_kernel(r), mode="same") / len(erps_dbm)
    return np.clip(out, 0, 1), r


def main():
    for rc in T:
        TRUE_AOE[rc] = true_aoe(rc)
    base = [(u, UNITS[u][0], UNITS[u][1]) for u in ORDER]
    beats = {}
    beats["b115"] = estimate("1:15", base)
    beats["b135"] = estimate("1:35", base, graded=True, bearings=(("B", 5.0), ("H", 5.0)))
    moved = base + [("B@moved", B_MOVE_X, 0.0)]
    beats["b150"] = estimate("1:50", moved)

    # Illustrative UHF / FPV layers on the 1:35 (DF-located) emitter-location marginal,
    # so that a 90% core exists and the hatch styles are visible.
    pe = LAST_PE["1:35"]
    uhf, _ = comms_layer(pe, 300.0, [47.0, 53.0, 60.0], 10.0, 37.0, 2.0, 2.0, 5.0, 10.0)
    fpv, _ = comms_layer(pe, 900.0, [40.0, 47.0, 53.0], 10.0, 30.0, 2.0, 2.0, 3.0, 6.0)
    illustrative = {}
    for key, field in (("uhf_comms", uhf), ("fpv_link", fpv)):
        c50 = contour_multipolygon(field, 0.5)
        c90 = contour_multipolygon(field, 0.9)
        illustrative[key] = dict(contours=[dict(p=0.5, area_km2=area_km2(c50), polygons=mp_to_lonlat(c50)),
                                           dict(p=0.9, area_km2=area_km2(c90), polygons=mp_to_lonlat(c90))])
        print(f"illustrative {key}: AoE50 {area_km2(c50)} AoE90 {area_km2(c90)}")

    tl = to_latlon(TRUTH["x"], TRUTH["y"])
    truth_civil_r = denial_radius_km(TRUTH["p"], TRUTH["ht"], T["gnss_civil"])
    truth = dict(lat=round(tl[0], 5), lon=round(tl[1], 5), erp_dbm=round(TRUTH["p"], 1), mast_m=TRUTH["ht"],
                 sector_az_deg=TRUTH["sector_az_deg"], sector_width_deg=TRUTH["sector_width_deg"],
                 radius_km={rc: round(denial_radius_km(TRUTH["p"], TRUTH["ht"], t), 2) for rc, t in T.items()},
                 aoe={rc: mp_to_lonlat(TRUE_AOE[rc]) for rc in ("gnss_civil", "gnss_mil")})
    units = [dict(key=u, source_id=UNITS[u][3], role=UNITS[u][4], sensor_type=UNITS[u][5], rx_class=UNITS[u][2],
                  enu_km=[UNITS[u][0], UNITS[u][1]], lat=round(to_latlon(UNITS[u][0], UNITS[u][1])[0], 5),
                  lon=round(to_latlon(UNITS[u][0], UNITS[u][1])[1], 5)) for u in ORDER]
    b_moved = to_latlon(B_MOVE_X, 0.0)
    flot = [[round(to_latlon(FLOT_X, y)[1], 5), round(to_latlon(FLOT_X, y)[0], 5)] for y in (-12, 12)]
    data = dict(units=units, b_moved=dict(lat=round(b_moved[0], 5), lon=round(b_moved[1], 5)), truth=truth,
                flot=flot, beats=beats, illustrative=illustrative,
                model=dict(propagation="two_ray+horizon", grid_m=int(RES * 1000), sigma_db=SIG_LIK,
                           hypotheses=dict(erp_dbm=PS, mast_m=HTS), thresholds_db=T))
    data["_generated"] = ("scripts/aoe-preview/gen_fixtures.py — do not edit by hand. Deterministic preview "
                          "geometry for Previews/Jammer AoE (docs/plans/jammer-aoe.md); typed by aoe-preview.ts.")
    body = json.dumps(data, separators=(",", ":"), sort_keys=True)
    OUT.write_text(body + "\n")
    print(f"wrote {OUT.relative_to(ROOT)} ({len(body)//1024} KiB); truth civil radius {truth_civil_r:.1f} km")


# =============================================================================
# --contract-out: the AoE contract fixture spine (packages/contracts/fixtures/aoe/)
# docs/plans/aoe-parallelization.md §3.2. The preview output above is untouched:
# this mode reuses the same model functions with the demo defaults and never
# writes aoe-preview.json.
# =============================================================================
import argparse
import hashlib

CONTRACT_SCHEMA = "emitter-estimate/1"
CONTRACT_METHOD_ID = "ground_based_gps_uhf_barrage"  # plan §0.3 b: the 6/6 top match is kept
CONTRACT_CLASSES = ("gnss_civil", "gnss_mil")        # MVP classes; gnss_mil_crpa dropped
MAX_ESTIMATE_BYTES = 7168                            # F7: under Mosquitto's 8192 B message_size_limit
MAX_RING_VERTICES = 64
# Scenario clock -> wall time, as apps/web/src/stories/fixtures/avdiivka.ts:
# T0 = 2024-02-15T18:42:00Z and clockIso(s) = T0 + (s - 39) s, so 1:15 = 18:42:36Z.
T0_EPOCH_S = 1708022520  # 2024-02-15T18:42:00Z
CLOCK_TO_T0_S = 39
BEAT_CLOCK_S = {"b115": 75, "b150": 110, "b215_stale": 145}  # stale = jammer off 2:15 + 10 s
VALID_FOR_S = 20                                      # valid_until = computed_at + 20 s (2 heartbeats)
# Evidence ages (s) at each estimate: the preview's illustrative values (aoe-preview.ts AGE_S);
# B's superseded 1:15 degraded report is 39 s old at 1:50.
AGE_S = {"B": 4, "D": 3, "H": 6, "A": 1, "C": 2, "E": 1, "F": 2, "G": 1, "B@moved": 2}
SUPERSEDED_AGE_S = 39
SWEEP_SEEDS = list(range(20))
# Off-node truth (plan §0.3 d): 420 W / 20 m at (9.63, 1.13) km, between hypothesis nodes.
OFF_NODE = dict(TRUTH, x=9.63, y=1.13, p=10 * math.log10(420e3), ht=20.0)
# Back-lobe (recorded, not asserted): the demo truth with the sector turned to az 315 deg.
BACK_LOBE = dict(TRUTH, sector_az_deg=315.0)


def contract_source_id(key):
    """Unit key -> contract source id. A/B/C keep the scenario ids; D..H become unit_d..unit_h (plan W13)."""
    return "unit_" + key.split("@")[0].lower()


def clock_iso(clock_s):
    import datetime as _dt
    t = _dt.datetime.fromtimestamp(T0_EPOCH_S + clock_s - CLOCK_TO_T0_S, tz=_dt.timezone.utc)
    return t.strftime("%Y-%m-%dT%H:%M:%SZ")


def f(v, nd=None):
    """Float for every f64 contract field (so serde / zod round-trips are value-equal)."""
    return float(round(v, nd)) if nd is not None else float(v)


def mp_obj(polygons):
    return {"type": "MultiPolygon", "coordinates": [[[[f(c[0]), f(c[1])] for c in ring] for ring in poly] for poly in polygons]}


def evidence_hash(evidence):
    canon = json.dumps([[e["source_id"], e["rx_class"], e["state"], e["lat"], e["lon"]] for e in evidence],
                       separators=(",", ":"))
    return hashlib.sha256(canon.encode()).hexdigest()[:16]


def contract_estimate(raw_beat, clock_s, estimate_open_s):
    keys = list(raw_beat["evidence"].keys())
    evidence = []
    for key in keys:
        e = raw_beat["evidence"][key]
        superseded = key == "B" and "B@moved" in raw_beat["evidence"]
        evidence.append(dict(
            source_id=contract_source_id(key), state=e["state"], rx_class=e["rx_class"],
            age_s=f(SUPERSEDED_AGE_S if superseded else AGE_S.get(key, 1)), lat=f(e["lat"]), lon=f(e["lon"])))
    evidence.sort(key=lambda e: (e["source_id"], e["age_s"]))
    aoe = []
    for rc in CONTRACT_CLASSES:
        a = raw_beat["aoe"][rc]
        aoe.append(dict(
            rx_class=rc,
            contours=[dict(p=f(c["p"]), polygon=mp_obj(c["polygons"]), area_km2=f(c["area_km2"])) for c in a["contours"]],
            radius_km_range=[f(a["radius_km_range"][0]), f(a["radius_km_range"][1])]))
    em = raw_beat["emitter"]
    erp = [p for p, w in zip(PS, em["erp_posterior"].values()) if w >= 0.1]
    computed = clock_iso(clock_s)
    return dict(
        schema=CONTRACT_SCHEMA,
        estimate_id="J1-" + clock_iso(estimate_open_s).replace("-", "").replace(":", ""),
        state="active",
        method_id=CONTRACT_METHOD_ID,
        method_match=1.0,
        method_ambiguous=False,
        model=dict(kind="set", propagation="two_ray", grid_m=f(RES * 1000),
                   hypotheses=dict(erp_dbm=[f(p) for p in PS], mast_m=[f(h) for h in HTS]), sigma_db=f(SIG_LIK)),
        aoe=aoe,
        emitter=dict(region90=mp_obj(em["region90"]), area90_km2=f(em["area90_km2"]),
                     erp_dbm_range=[f(min(erp)), f(max(erp))]),
        evidence=evidence,
        evidence_hash=evidence_hash(evidence),
        computed_at=computed,
        valid_until=clock_iso(clock_s + VALID_FOR_S),
    )


def check_estimate(name, est):
    body = json.dumps(est, separators=(",", ":"), sort_keys=True)
    assert len(body.encode()) <= MAX_ESTIMATE_BYTES, f"{name}: {len(body.encode())} B > {MAX_ESTIMATE_BYTES} B"
    polys = [c["polygon"] for layer in est["aoe"] for c in layer["contours"]] + [est["emitter"]["region90"]]
    for mp in polys:
        for poly in mp["coordinates"]:
            for ring in poly:
                assert len(ring) <= MAX_RING_VERTICES, f"{name}: ring with {len(ring)} vertices"
                for lon, lat in ring:
                    assert round(lon, 5) == lon and round(lat, 5) == lat, f"{name}: > 5 dp coordinate"
    for k in ("mode", "bearings_used", "ref_link_km", "footprint_radius_km", "area50_km2"):
        assert f'"{k}"' not in body, f"{name}: forbidden key {k}"
    return body


def unit_row(key, x, y):
    lat, lon = to_latlon(x, y)
    return dict(key=key, source_id=contract_source_id(key), rx_class=UNITS[key.split("@")[0]][2],
                enu_km=[f(x), f(y)], lat=f(lat, 5), lon=f(lon, 5))


def truth_row(truth, shadow_seed):
    lat, lon = to_latlon(truth["x"], truth["y"])
    return dict(enu_km=[f(truth["x"]), f(truth["y"])], lat=f(lat, 5), lon=f(lon, 5),
                erp_dbm=f(truth["p"], 4), eirp_w=f(10 ** (truth["p"] / 10) / 1e3, 1), mast_m=f(truth["ht"]),
                sector_az_deg=f(truth["sector_az_deg"]), sector_width_deg=f(truth["sector_width_deg"]),
                back_db=f(truth["back_db"]), shadow_seed=shadow_seed)


def truth_cell(truth):
    ix = int(round((truth["x"] - xs[0]) / RES))
    iy = int(round((truth["y"] - ys[0]) / RES))
    return dict(ix=ix, iy=iy, x_km=f(xs[ix], 4), y_km=f(ys[iy], 4))


def golden_case(case_id, positions, truth, seed, reference=True):
    """Evidence (per-class degraded / healthy sets) at a truth and shadow seed, plus the
    preview model's own result as a REFERENCE for the Rust estimator (not a pin)."""
    rng_s = np.random.default_rng(seed)
    shadow = {u: rng_s.normal(0, 4.0) for u in ORDER}
    obs = truth_obs(positions, truth=truth, shadow=shadow)
    ev = []
    for key, o in obs.items():
        ev.append(dict(unit_row(key, o["x"], o["y"]), shadow_db=f(shadow[key.split("@")[0]], 3),
                       js_db=f(o["js"], 3), state="degraded" if o["degraded"] else "healthy"))
    by = {}
    for st in ("degraded", "healthy"):
        by[st] = {rc: sorted({e["source_id"] for e in ev if e["state"] == st and e["rx_class"] == rc}) for rc in CONTRACT_CLASSES}
    out = dict(id=case_id, seed=seed, evidence=ev, degraded_by_class=by["degraded"], healthy_by_class=by["healthy"])
    if reference:
        post, _ = posterior(obs)
        pe = post.sum(axis=(0, 1))
        a90, thr90 = hpd(pe, 0.9)
        out["preview_reference"] = dict(truth_in_region90=bool(sample(pe, truth["x"], truth["y"]) >= thr90),
                                        area90_km2=f(a90, 1),
                                        any_healthy_civil=bool(by["healthy"]["gnss_civil"]))
    return out


def golden_cases():
    base = [(u, UNITS[u][0], UNITS[u][1]) for u in ORDER]
    moved = base + [("B@moved", B_MOVE_X, 0.0)]
    demo = [golden_case("demo_b115", base, TRUTH, 7), golden_case("demo_b150", moved, TRUTH, 7)]
    sweeps = []
    for sid, truth, asserted in (("demo_truth_seed_sweep", TRUTH, True),
                                 ("off_node_seed_sweep", OFF_NODE, True),
                                 ("back_lobe_seed_sweep", BACK_LOBE, False)):
        runs = [golden_case(f"{sid}_s{s}", base, truth, s) for s in SWEEP_SEEDS]
        contained = sum(r["preview_reference"]["truth_in_region90"] for r in runs)
        sweeps.append(dict(
            id=sid, truth=truth_row(truth, None), truth_cell=truth_cell(truth), seeds=SWEEP_SEEDS,
            assertion=(dict(kind="containment_min", min_contained=15, of=len(SWEEP_SEEDS)) if asserted
                       else dict(kind="recorded_only", note="known limitation of the omni MVP (D8 sector fitting, v2)")),
            preview_reference_contained=contained, runs=runs))
        print(f"golden {sid:24s} preview contained {contained}/{len(runs)}")
    return dict(
        _generated=("scripts/aoe-preview/gen_fixtures.py --contract-out — do not edit by hand. Test-only golden "
                    "inputs for the estimator (E11 golden.rs). The engine binary never reads this file."),
        model=dict(
            origin=dict(lat=LAT0, lon=LON0, km_per_deg_lat=KM_PER_DEG_LAT, km_per_deg_lon=f(KM_PER_DEG_LON, 9),
                        projection="equirectangular at the origin: lat = lat0 + y/km_per_deg_lat, lon = lon0 + x/km_per_deg_lon"),
            grid=dict(res_km=RES, x_km=[f(xs[0]), f(xs[-1])], y_km=[f(ys[0]), f(ys[-1])], nx=len(xs), ny=len(ys),
                      note="the preview grid; the engine grid extent is its own (units +/- R_max), same 250 m step"),
            hypotheses=dict(erp_dbm=PS, mast_m=HTS), sigma_db=SIG_LIK,
            thresholds_db={rc: T[rc] for rc in CONTRACT_CLASSES},
            link=dict(s_dbm=S_DBM, g_r_jam_dbi=G_R_JAM, h_rx_m=H_R, f_mhz=1575.42),
            likelihood="binary probit: P(degraded | cell, hyp) = clip(Phi((J/S - T_class) / sigma_db), 1e-6, 1 - 1e-6)",
            prior=dict(flot_x_km=FLOT_X, enemy_side=1.0, friendly_side=0.02,
                       standoff=dict(enabled=STANDOFF, band_km_behind_flot=[2.0, 25.0], outside_band_weight=0.1)),
            region90="HPD: smallest cell set holding 90% of the emitter-location marginal",
            shadow="per unit, drawn in ORDER from numpy default_rng(seed).normal(0, 4.0) (sim truth only)",
            order=ORDER),
        units=[unit_row(u, UNITS[u][0], UNITS[u][1]) for u in ORDER],
        b_moved=unit_row("B@moved", B_MOVE_X, 0.0),
        demo_truth=truth_row(TRUTH, 7), demo_truth_cell=truth_cell(TRUTH),
        demo=demo, sweeps=sweeps)


def propagation_vectors():
    """Shared vectors for comms-sim propagation.py (C2) and estimator propagation.rs (E4): both <= 0.01 dB."""
    rows = []
    dists = [0.001, 0.01, 0.05, 0.1, 0.25, 0.5, 1.0, 2.0, 3.0, 5.0, 7.5, 9.6, 12.0, 15.0, 19.0, 22.0, 25.0, 30.0,
             35.0, 40.0, 50.0, 60.0]
    for f_mhz in (1575.42, 300.0):
        lam = 299.792458 / f_mhz
        for ht in (2.0, 10.0, 20.0, 30.0, 60.0):
            for hr in (2.0,):
                horizon = 4.12 * (math.sqrt(ht) + math.sqrt(hr))
                dbreak_km = 4 * ht * hr / lam / 1000.0
                ds = sorted(set(dists + [round(horizon - 0.01, 4), round(horizon + 0.01, 4),
                                         round(dbreak_km * 0.99, 6), round(dbreak_km * 1.01, 6)]))
                for d in ds:
                    pl = float(path_loss_db(np.array(d), ht, lam, hr))
                    row = dict(d_km=f(d), h_tx_m=ht, h_rx_m=hr, f_mhz=f_mhz, path_loss_db=f(pl, 6))
                    if f_mhz == 1575.42:
                        row["js_db"] = {f"{p}": f(p + G_R_JAM - pl - S_DBM, 6) for p in PS}
                    rows.append(row)
    radii = []
    for rc in CONTRACT_CLASSES:
        for p in PS:
            for ht in HTS:
                radii.append(dict(rx_class=rc, erp_dbm=p, mast_m=ht, threshold_db=T[rc],
                                  denial_radius_km=f(denial_radius_km(p, ht, T[rc]), 4)))
    return dict(
        _generated="scripts/aoe-preview/gen_fixtures.py --contract-out — do not edit by hand.",
        model=dict(
            path_loss=("d_m = max(d_km * 1000, 1); lam = 299.792458 / f_mhz; fspl = 20 log10(4 pi d_m / lam); "
                       "tworay = 40 log10(d_m) - 20 log10(h_tx) - 20 log10(h_rx); d_break_m = 4 h_tx h_rx / lam; "
                       "L = fspl if d_m < d_break_m else max(fspl, tworay); L += 20 if d_km > 4.12 (sqrt h_tx + sqrt h_rx)"),
            js=("J/S = erp_dbm + g_r_jam_dbi - L - s_dbm (L1 only); g_r_jam_dbi = %s, s_dbm = %s" % (G_R_JAM, S_DBM)),
            denial_radius=("largest d in arange(0.01, 80, 0.01) km with J/S(d) >= threshold (0 if none); "
                           "a 0.01 km scan, so compare with a 0.01 km tolerance"),
            tolerance_db=0.01),
        vectors=rows, denial_radii=radii)


def telemetry_samples():
    lat, lon = to_latlon(0.0, 0.0)
    v1 = [dict(source_id="unit_b", lat=f(lat), lon=f(lon), inter_arrival_seconds=6.1, crc_error_rate=0.14,
               duplicate_rate=0.0, rf=dict(frequency_band_mhz=[100.0, 2000.0], hop_spread_hz=50000.0,
                                           gps_l1_overlap=True, gps_l2_overlap=True,
                                           time_domain_pattern="barrage", effective_range_km=30.0))]
    rf_v2 = dict(frequency_band_mhz=[100.0, 2000.0], hop_spread_hz=50000.0, gps_l1_overlap=True,
                 gps_l2_overlap=True, time_domain_pattern="barrage")
    v2 = []
    for sid, rc, fix, rf in (("unit_b", "gnss_civil", "none", rf_v2), ("unit_a", "gnss_mil", "3d", None),
                             ("unit_e", "gnss_civil", "2d", None), ("unit_x_crpa", "gnss_mil_crpa", "3d", None),
                             ("unit_x_uhf", "uhf_comms", None, None), ("unit_x_fpv", "fpv_link", None, None)):
        body = dict(schema="telemetry/2", source_id=sid, lat=f(lat), lon=f(lon), inter_arrival_seconds=1.0,
                    crc_error_rate=0.002, duplicate_rate=0.0, rx_class=rc)
        if fix is not None:
            body["gnss_fix"] = fix
        if rf is not None:
            body["rf"] = rf
        v2.append(body)
    return v1, v2, rf_v2


def telemetry_beats(golden, rf_v2):
    """v0, SYNTHETIC: 1 Hz per unit, scenario 0:00 .. 2:15 + 130 s. GNSS degraded sets come from the
    golden demo cases (seed 7): 1:15 set while the jammer is on [75, 135) s; B moves 5 km west at 1:50
    (110 s) and its fix is 3d. B's link values follow the current avdiivka.py beats. Re-recorded from the
    real sim at CP2 (v1)."""
    deg115 = {e["key"] for e in golden["demo"][0]["evidence"] if e["state"] == "degraded"}
    lines = []
    for t in range(0, 135 + 130 + 1):
        jam = 75 <= t < 135
        for u in sorted(ORDER, key=contract_source_id):
            x, y = UNITS[u][0], UNITS[u][1]
            if u == "B" and t >= 110:
                x, y = B_MOVE_X, 0.0
            lat, lon = to_latlon(x, y)
            ia, crc, rf = 1.0, 0.002, None
            if u == "B":
                if 45 <= t < 55:
                    ia = 1.17
                elif 55 <= t < 75:
                    ia, crc = 1.17, 0.06
                elif 75 <= t < 110:
                    ia, crc, rf = 6.1, 0.14, rf_v2
                elif 110 <= t < 135:
                    ia, crc, rf = 1.8, 0.04, rf_v2
            degraded = jam and u in deg115 and not (u == "B" and t >= 110)
            fix = ("2d" if u == "E" else "none") if degraded else "3d"
            body = dict(schema="telemetry/2", source_id=contract_source_id(u), lat=f(lat, 5), lon=f(lon, 5),
                        inter_arrival_seconds=ia, crc_error_rate=crc, duplicate_rate=0.0,
                        rx_class=UNITS[u][2], gnss_fix=fix)
            if rf is not None:
                body["rf"] = rf
            lines.append(json.dumps(dict(t=t, topic=f"telemetry/{contract_source_id(u)}/raw", payload=body),
                                    separators=(",", ":"), sort_keys=True))
    return "\n".join(lines) + "\n"


def write_json(path, obj, compact=False):
    body = json.dumps(obj, separators=(",", ":"), sort_keys=True) if compact else json.dumps(obj, indent=1, sort_keys=True)
    path.write_text(body + "\n")
    return len(body.encode())


def contract_out(out_dir):
    out_dir = Path(out_dir)
    if not out_dir.is_absolute():
        out_dir = ROOT / out_dir
    out_dir.mkdir(parents=True, exist_ok=True)
    for rc in CONTRACT_CLASSES:
        TRUE_AOE[rc] = true_aoe(rc)
    base = [(u, UNITS[u][0], UNITS[u][1]) for u in ORDER]
    b115 = estimate("1:15", base, classes=CONTRACT_CLASSES)
    b150 = estimate("1:50", base + [("B@moved", B_MOVE_X, 0.0)], classes=CONTRACT_CLASSES)
    open_s = BEAT_CLOCK_S["b115"]
    est = {
        "b115": contract_estimate(b115, BEAT_CLOCK_S["b115"], open_s),
        "b150": contract_estimate(b150, BEAT_CLOCK_S["b150"], open_s),
    }
    stale = json.loads(json.dumps(est["b150"]))
    stale.update(state="stale", computed_at=clock_iso(BEAT_CLOCK_S["b215_stale"]),
                 valid_until=clock_iso(BEAT_CLOCK_S["b215_stale"] + VALID_FOR_S))
    est["b215-stale"] = stale
    # unbounded: every civil unit degraded, so no healthy same-class unit bounds the edge.
    # Convention: no polygons at all — each layer's contours = [], region90 empty, area90 0.
    unb = json.loads(json.dumps(est["b115"]))
    for e in unb["evidence"]:
        if e["rx_class"] == "gnss_civil":
            e["state"] = "degraded"
    for layer in unb["aoe"]:
        layer["contours"] = []
    unb["emitter"]["region90"] = {"type": "MultiPolygon", "coordinates": []}
    unb["emitter"]["area90_km2"] = 0.0
    unb.update(state="unbounded", evidence_hash=evidence_hash(unb["evidence"]))
    est["unbounded"] = unb
    sizes = {}
    for name, e in est.items():
        body = check_estimate(name, e)
        p = out_dir / f"emitter-estimate.{name}.json"
        p.write_text(body + "\n")
        sizes[p.name] = len(body.encode())
    # K4: b115 + emitter.mode must FAIL both parsers.
    rej = json.loads(json.dumps(est["b115"]))
    mlat, mlon = to_latlon(9.5, 1.0)
    rej["emitter"]["mode"] = dict(lat=f(mlat, 5), lon=f(mlon, 5), ce90_m=35000.0)
    p = out_dir / "emitter-estimate.reject-mode.json"
    p.write_text(json.dumps(rej, separators=(",", ":"), sort_keys=True) + "\n")
    sizes[p.name] = len(p.read_bytes()) - 1
    v1, v2, rf_v2 = telemetry_samples()
    sizes["telemetry-v1.sample.json"] = write_json(out_dir / "telemetry-v1.sample.json", v1)
    sizes["telemetry-v2.sample.json"] = write_json(out_dir / "telemetry-v2.sample.json", v2)
    sizes["propagation-vectors.json"] = write_json(out_dir / "propagation-vectors.json", propagation_vectors())
    golden = golden_cases()
    sizes["golden-cases.json"] = write_json(out_dir / "golden-cases.json", golden)
    tb = telemetry_beats(golden, rf_v2)
    (out_dir / "telemetry-beats.jsonl").write_text(tb)
    sizes["telemetry-beats.jsonl"] = len(tb.encode())
    for name, n in sorted(sizes.items()):
        print(f"wrote {name:40s} {n:8d} B")


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--contract-out", metavar="DIR",
                    help="write the AoE contract fixtures (emitter-estimate/1 etc.) to DIR instead of the preview JSON")
    args = ap.parse_args()
    if args.contract_out:
        contract_out(args.contract_out)
    else:
        main()
