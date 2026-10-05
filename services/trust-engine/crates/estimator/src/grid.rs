//! The fixed evaluation grid (E5) and the location prior.
//!
//! A local plane at the grid origin with the sim's / preview's equirectangular
//! projection (111.32 km per degree of latitude, × cos(lat0) for longitude).
//! At the AO's ~50 km scale its error against a true tangent plane is well
//! under one 250 m cell.

use crate::types::{Flot, Grid, LatLon, Observation, PriorModel, Side};

pub const KM_PER_DEG_LAT: f64 = 111.32;

/// Resolved grid geometry. Cell `(i, j)` (column, row) has its centre at
/// `(x0 + i·res, y0 + j·res)` km; cells are stored row-major (`j·nx + i`).
#[derive(Debug, Clone, PartialEq)]
pub struct GridGeom {
    pub nx: usize,
    pub ny: usize,
    pub x0: f64,
    pub y0: f64,
    pub res_km: f64,
    pub lat0: f64,
    pub lon0: f64,
    pub km_per_deg_lon: f64,
}

impl GridGeom {
    pub fn new(grid: &Grid) -> Self {
        let res_km = grid.cell_m / 1000.0;
        let count = |a: f64, b: f64| (((b - a) / res_km).round().max(0.0) as usize) + 1;
        Self {
            nx: count(grid.x_km[0], grid.x_km[1]),
            ny: count(grid.y_km[0], grid.y_km[1]),
            x0: grid.x_km[0],
            y0: grid.y_km[0],
            res_km,
            lat0: grid.origin.lat,
            lon0: grid.origin.lon,
            km_per_deg_lon: KM_PER_DEG_LAT * grid.origin.lat.to_radians().cos(),
        }
    }

    #[inline]
    pub fn len(&self) -> usize {
        self.nx * self.ny
    }

    #[inline]
    pub fn is_empty(&self) -> bool {
        self.len() == 0
    }

    #[inline]
    pub fn x(&self, i: usize) -> f64 {
        self.x0 + i as f64 * self.res_km
    }

    #[inline]
    pub fn y(&self, j: usize) -> f64 {
        self.y0 + j as f64 * self.res_km
    }

    /// Cell area, km².
    pub fn cell_area_km2(&self) -> f64 {
        self.res_km * self.res_km
    }

    /// (east, north) km of a lat/lon.
    pub fn to_enu(&self, lat: f64, lon: f64) -> (f64, f64) {
        (
            (lon - self.lon0) * self.km_per_deg_lon,
            (lat - self.lat0) * KM_PER_DEG_LAT,
        )
    }

    /// (lat, lon) of an (east, north) km point.
    pub fn to_latlon(&self, x: f64, y: f64) -> (f64, f64) {
        (
            self.lat0 + y / KM_PER_DEG_LAT,
            self.lon0 + x / self.km_per_deg_lon,
        )
    }

    /// Index of the cell whose centre is nearest to (x, y), if inside the grid.
    pub fn nearest(&self, x: f64, y: f64) -> Option<usize> {
        let i = ((x - self.x0) / self.res_km).round();
        let j = ((y - self.y0) / self.res_km).round();
        if i < 0.0 || j < 0.0 || i >= self.nx as f64 || j >= self.ny as f64 {
            return None;
        }
        Some(j as usize * self.nx + i as usize)
    }
}

/// Snap a depth to 1 mm so FLOT points that went through lat/lon round-trips do
/// not flip cells that sit exactly on a band edge.
#[inline]
fn snap_mm(v: f64) -> f64 {
    (v * 1.0e6).round() / 1.0e6
}

/// Signed depth of (x, y) behind the FLOT, km: > 0 on the enemy side.
/// Distance to the nearest segment of the polyline, the end segments extended
/// to infinity; the sign comes from that segment's side.
pub fn flot_depth_km(pts: &[(f64, f64)], enemy: Side, x: f64, y: f64) -> f64 {
    let n = pts.len();
    if n < 2 {
        return 0.0;
    }
    let mut best = f64::INFINITY;
    let mut best_signed = 0.0;
    for s in 0..n - 1 {
        let (ax, ay) = pts[s];
        let (bx, by) = pts[s + 1];
        let (dx, dy) = (bx - ax, by - ay);
        let len2 = dx * dx + dy * dy;
        if len2 == 0.0 {
            continue;
        }
        let mut t = ((x - ax) * dx + (y - ay) * dy) / len2;
        if s > 0 {
            t = t.max(0.0);
        }
        if s < n - 2 {
            t = t.min(1.0);
        }
        let (px, py) = (ax + t * dx, ay + t * dy);
        let dist = ((x - px).powi(2) + (y - py).powi(2)).sqrt();
        if dist < best {
            best = dist;
            // cross > 0: (x, y) is left of the segment direction.
            let cross = dx * (y - ay) - dy * (x - ax);
            let left = cross > 0.0;
            let enemy_side = match enemy {
                Side::Left => left,
                Side::Right => !left && cross != 0.0,
            };
            best_signed = if enemy_side { dist } else { -dist };
        }
    }
    snap_mm(best_signed)
}

/// Prior weight for a depth behind the FLOT (design §2.4 + standoff band [ASM]).
pub fn prior_weight(prior: &PriorModel, depth_km: f64) -> f64 {
    if depth_km <= 0.0 {
        prior.friendly_weight
    } else if depth_km < prior.standoff_km[0] || depth_km > prior.standoff_km[1] {
        prior.outside_standoff_weight
    } else {
        prior.enemy_weight
    }
}

/// FLOT polyline in grid km.
pub fn flot_km(geom: &GridGeom, flot: &Flot) -> Vec<(f64, f64)> {
    flot.points
        .iter()
        .map(|p| geom.to_enu(p.lat, p.lon))
        .collect()
}

/// Per-cell enemy-side mask (true = strictly behind the FLOT; all true without a FLOT).
pub fn enemy_mask(grid: &Grid, geom: &GridGeom) -> Vec<bool> {
    match &grid.flot {
        None => vec![true; geom.len()],
        Some(f) => {
            let pts = flot_km(geom, f);
            let mut out = Vec::with_capacity(geom.len());
            for j in 0..geom.ny {
                for i in 0..geom.nx {
                    out.push(flot_depth_km(&pts, f.enemy_side, geom.x(i), geom.y(j)) > 0.0);
                }
            }
            out
        }
    }
}

/// ln(prior) per cell, row-major. Unnormalised (the posterior is normalised once).
pub fn ln_prior(grid: &Grid, geom: &GridGeom) -> Vec<f64> {
    match &grid.flot {
        None => vec![0.0; geom.len()],
        Some(f) => {
            let pts = flot_km(geom, f);
            let mut out = Vec::with_capacity(geom.len());
            for j in 0..geom.ny {
                for i in 0..geom.nx {
                    let d = flot_depth_km(&pts, f.enemy_side, geom.x(i), geom.y(j));
                    out.push(prior_weight(&grid.prior, d).ln());
                }
            }
            out
        }
    }
}

/// E5 helper for the engine: a grid at the centre of the units' bounding box,
/// extending `margin_km` (normally R_max) beyond the units, snapped to whole cells.
/// Order-independent (bounding box, not a mean).
pub fn fit_grid(
    observations: &[Observation],
    margin_km: f64,
    cell_m: f64,
    flot: Option<Flot>,
    prior: PriorModel,
) -> Option<Grid> {
    let first = observations.first()?;
    let (mut la0, mut la1, mut lo0, mut lo1) = (first.lat, first.lat, first.lon, first.lon);
    for o in observations {
        la0 = la0.min(o.lat);
        la1 = la1.max(o.lat);
        lo0 = lo0.min(o.lon);
        lo1 = lo1.max(o.lon);
    }
    let origin = LatLon {
        lat: (la0 + la1) / 2.0,
        lon: (lo0 + lo1) / 2.0,
    };
    let kmlon = KM_PER_DEG_LAT * origin.lat.to_radians().cos();
    let half_x = (lo1 - lo0) / 2.0 * kmlon + margin_km;
    let half_y = (la1 - la0) / 2.0 * KM_PER_DEG_LAT + margin_km;
    let res = cell_m / 1000.0;
    let nx = (half_x / res).ceil();
    let ny = (half_y / res).ceil();
    Some(Grid {
        origin,
        cell_m,
        x_km: [-nx * res, nx * res],
        y_km: [-ny * res, ny * res],
        flot,
        prior,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::types::{RxClass, UnitState};

    fn obs(lat: f64, lon: f64) -> Observation {
        Observation {
            source_id: "u".into(),
            rx_class: RxClass::GnssCivil,
            state: UnitState::Healthy,
            lat,
            lon,
        }
    }

    #[test]
    fn flot_depth_sign_and_extension() {
        // A south→north FLOT at x = 1 km, enemy east (right of travel).
        let pts = [(1.0, -12.0), (1.0, 12.0)];
        assert_eq!(flot_depth_km(&pts, Side::Right, 3.0, 0.0), 2.0);
        assert_eq!(flot_depth_km(&pts, Side::Right, -4.0, 0.0), -5.0);
        // Beyond the end points the line is extended, not rounded off.
        assert_eq!(flot_depth_km(&pts, Side::Right, 6.0, 40.0), 5.0);
        assert_eq!(flot_depth_km(&pts, Side::Left, 6.0, 40.0), -5.0);
        let p = PriorModel::default();
        assert_eq!(prior_weight(&p, -5.0), 0.02);
        assert_eq!(prior_weight(&p, 1.0), 0.1);
        assert_eq!(prior_weight(&p, 2.0), 1.0);
        assert_eq!(prior_weight(&p, 25.0), 1.0);
        assert_eq!(prior_weight(&p, 26.0), 0.1);
    }

    #[test]
    fn fit_grid_is_order_independent_and_covers_the_margin() {
        let a = [obs(48.10, 37.60), obs(48.20, 37.75), obs(48.15, 37.70)];
        let mut b = a.clone();
        b.reverse();
        let ga = fit_grid(&a, 38.0, 250.0, None, PriorModel::default()).unwrap();
        let gb = fit_grid(&b, 38.0, 250.0, None, PriorModel::default()).unwrap();
        assert_eq!(ga, gb);
        let geom = GridGeom::new(&ga);
        for o in &a {
            let (x, y) = geom.to_enu(o.lat, o.lon);
            assert!(x - 38.0 >= ga.x_km[0] - 1e-9 && x + 38.0 <= ga.x_km[1] + 1e-9);
            assert!(y - 38.0 >= ga.y_km[0] - 1e-9 && y + 38.0 <= ga.y_km[1] + 1e-9);
        }
        assert!(fit_grid(&[], 38.0, 250.0, None, PriorModel::default()).is_none());
    }
}
