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


def sector_gain_db(x, y):
    """Truth antenna pattern toward (x, y): 0 dB inside the sector, back_db outside [ASM]."""
    az = (90 - np.degrees(np.arctan2(np.asarray(y) - TRUTH["y"], np.asarray(x) - TRUTH["x"]))) % 360
    off = np.abs(((az - TRUTH["sector_az_deg"]) + 180) % 360 - 180)
    return np.where(off <= TRUTH["sector_width_deg"] / 2, 0.0, TRUTH["back_db"])


def truth_js(x, y):
    d = np.hypot(np.asarray(x) - TRUTH["x"], np.asarray(y) - TRUTH["y"])
    return js_db(d, TRUTH["p"], TRUTH["ht"]) + sector_gain_db(x, y)


def unit_js(x, y):
    d = math.hypot(x - TRUTH["x"], y - TRUTH["y"])
    return d, float(truth_js(x, y))


def truth_obs(positions):
    """positions: list of (key, x, y). Shadowing is per unit (seeded)."""
    out = {}
    for key, x, y in positions:
        u = key.split("@")[0]
        d, js = unit_js(x, y)
        js += SHADOW[u]
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


if __name__ == "__main__":
    main()
