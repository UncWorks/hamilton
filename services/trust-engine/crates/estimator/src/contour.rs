//! Contours (E9): hand-rolled marching squares, even-odd ring nesting,
//! Douglas–Peucker to ≤ 64 vertices, areas in km² (D9: no geometry crate).
//!
//! The field is sampled at cell centres and padded with a ring of zeros, so
//! every iso-line closes. Each segment is oriented with the inside (value ≥
//! level) on its left, so the linked rings come out CCW around filled areas and
//! CW around holes; the nesting is nevertheless decided by even-odd depth.

/// A ring in grid km, closed (first point repeated last).
pub type KmRing = Vec<(f64, f64)>;

/// A polygon in grid km: shell plus holes.
#[derive(Debug, Clone, PartialEq)]
pub struct KmPolygon {
    pub shell: KmRing,
    pub holes: Vec<KmRing>,
}

/// Rings smaller than this are dropped as specks (the preview generator's 0.3 km²).
pub const MIN_RING_KM2: f64 = 0.3;
/// Vertex budget per multipolygon, closing points included.
pub const MAX_VERTICES: usize = 64;
const DP_TOL0_KM: f64 = 0.05;
const DP_GROWTH: f64 = 1.4;
const DP_TOL_MAX_KM: f64 = 20.0;

/// Signed shoelace area (CCW > 0), km², of a closed ring.
pub fn signed_area(r: &[(f64, f64)]) -> f64 {
    let mut s = 0.0;
    for w in r.windows(2) {
        s += w[0].0 * w[1].1 - w[1].0 * w[0].1;
    }
    0.5 * s
}

/// Even-odd point-in-ring test.
pub fn point_in_ring(p: (f64, f64), r: &[(f64, f64)]) -> bool {
    let mut inside = false;
    for w in r.windows(2) {
        let (a, b) = (w[0], w[1]);
        if (a.1 > p.1) != (b.1 > p.1) {
            let x = a.0 + (p.1 - a.1) / (b.1 - a.1) * (b.0 - a.0);
            if p.0 < x {
                inside = !inside;
            }
        }
    }
    inside
}

/// Point in a multipolygon (holes respected).
pub fn point_in_polygons(p: (f64, f64), polys: &[KmPolygon]) -> bool {
    polys
        .iter()
        .any(|g| point_in_ring(p, &g.shell) && !g.holes.iter().any(|h| point_in_ring(p, h)))
}

/// Total area of a multipolygon, km².
pub fn area_km2(polys: &[KmPolygon]) -> f64 {
    polys
        .iter()
        .map(|g| {
            signed_area(&g.shell).abs() - g.holes.iter().map(|h| signed_area(h).abs()).sum::<f64>()
        })
        .sum()
}

/// Vertex count (closing points included).
pub fn vertex_count(polys: &[KmPolygon]) -> usize {
    polys
        .iter()
        .map(|g| g.shell.len() + g.holes.iter().map(Vec::len).sum::<usize>())
        .sum()
}

/// Marching squares on a row-major `nx × ny` field with cell-centre coordinates
/// `(x0 + i·res, y0 + j·res)`. Returns closed rings in km (unsimplified).
pub fn iso_rings(
    field: &[f64],
    nx: usize,
    ny: usize,
    x0: f64,
    y0: f64,
    res: f64,
    level: f64,
) -> Vec<KmRing> {
    // Padded lattice: node (pi, pj) = field (pi − 1, pj − 1), zero outside.
    let px = nx + 2;
    let py = ny + 2;
    let val = |pi: usize, pj: usize| -> f64 {
        if pi == 0 || pj == 0 || pi > nx || pj > ny {
            0.0
        } else {
            field[(pj - 1) * nx + (pi - 1)]
        }
    };
    let pos = |pi: usize, pj: usize| -> (f64, f64) {
        (x0 + (pi as f64 - 1.0) * res, y0 + (pj as f64 - 1.0) * res)
    };
    let inside = |v: f64| v >= level;
    // Edge ids: horizontal edge (pi, pj)→(pi+1, pj) = pj·px + pi; vertical edge
    // (pi, pj)→(pi, pj+1) = nh + pj·px + pi.
    let nh = px * py;
    let n_edges = 2 * nh;
    const NONE: u32 = u32::MAX;
    let mut next = vec![NONE; n_edges];
    let mut point = vec![(0.0f64, 0.0f64); n_edges];
    let edge_point = |e: usize| -> (f64, f64) {
        let (a, b) = if e < nh {
            let (pi, pj) = (e % px, e / px);
            ((pi, pj), (pi + 1, pj))
        } else {
            let k = e - nh;
            let (pi, pj) = (k % px, k / px);
            ((pi, pj), (pi, pj + 1))
        };
        let (va, vb) = (val(a.0, a.1), val(b.0, b.1));
        let t = if vb != va {
            ((level - va) / (vb - va)).clamp(0.0, 1.0)
        } else {
            0.5
        };
        let (pa, pb) = (pos(a.0, a.1), pos(b.0, b.1));
        (pa.0 + t * (pb.0 - pa.0), pa.1 + t * (pb.1 - pa.1))
    };
    // Square (pi, pj): corners 0 = (pi, pj) BL, 1 = (pi+1, pj) BR, 2 = (pi+1, pj+1) TR,
    // 3 = (pi, pj+1) TL. Edges: 0 = bottom (0–1), 1 = right (1–2), 2 = top (3–2), 3 = left (0–3).
    // Unit-square geometry for orientation.
    const CORNER: [(f64, f64); 4] = [(0.0, 0.0), (1.0, 0.0), (1.0, 1.0), (0.0, 1.0)];
    const EDGE_CORNERS: [(usize, usize); 4] = [(0, 1), (1, 2), (3, 2), (0, 3)];
    for pj in 0..py - 1 {
        for pi in 0..px - 1 {
            let v = [
                val(pi, pj),
                val(pi + 1, pj),
                val(pi + 1, pj + 1),
                val(pi, pj + 1),
            ];
            let ins = [inside(v[0]), inside(v[1]), inside(v[2]), inside(v[3])];
            let case =
                ins[0] as u8 | (ins[1] as u8) << 1 | (ins[2] as u8) << 2 | (ins[3] as u8) << 3;
            if case == 0 || case == 15 {
                continue;
            }
            let edge_id = |k: usize| -> usize {
                match k {
                    0 => pj * px + pi,
                    1 => nh + pj * px + (pi + 1),
                    2 => (pj + 1) * px + pi,
                    _ => nh + pj * px + pi,
                }
            };
            // Pairs of crossed edges.
            let mut pairs: [(usize, usize); 2] = [(0, 0); 2];
            let mut np = 0;
            if case == 5 || case == 10 {
                let centre = 0.25 * (v[0] + v[1] + v[2] + v[3]);
                // Cut off the corners that are *not* connected through the centre.
                let cut_inside = !inside(centre);
                let corners: [usize; 2] = if (case == 5) == cut_inside {
                    [0, 2]
                } else {
                    [1, 3]
                };
                for c in corners {
                    let es: Vec<usize> = (0..4)
                        .filter(|&e| EDGE_CORNERS[e].0 == c || EDGE_CORNERS[e].1 == c)
                        .collect();
                    pairs[np] = (es[0], es[1]);
                    np += 1;
                }
            } else {
                let es: Vec<usize> = (0..4)
                    .filter(|&e| ins[EDGE_CORNERS[e].0] != ins[EDGE_CORNERS[e].1])
                    .collect();
                pairs[0] = (es[0], es[1]);
                np = 1;
            }
            for &(e1, e2) in &pairs[..np] {
                // Midpoints of the crossed edges (unit square) for orientation.
                let mid = |e: usize| {
                    let (a, b) = EDGE_CORNERS[e];
                    (
                        (CORNER[a].0 + CORNER[b].0) / 2.0,
                        (CORNER[a].1 + CORNER[b].1) / 2.0,
                    )
                };
                let (p, q) = (mid(e1), mid(e2));
                // Reference corner: the shared corner of adjacent edges, else any inside corner.
                let (ra, rb) = (EDGE_CORNERS[e1], EDGE_CORNERS[e2]);
                let shared = [ra.0, ra.1].into_iter().find(|c| *c == rb.0 || *c == rb.1);
                let (rc, want_left) = match shared {
                    Some(c) => (c, ins[c]),
                    None => ((0..4).find(|&c| ins[c]).unwrap_or(0), true),
                };
                let k = CORNER[rc];
                let cross = (q.0 - p.0) * (k.1 - p.1) - (q.1 - p.1) * (k.0 - p.0);
                let (from, to) = if (cross > 0.0) == want_left {
                    (e1, e2)
                } else {
                    (e2, e1)
                };
                let (f, t) = (edge_id(from), edge_id(to));
                next[f] = t as u32;
                point[f] = edge_point(f);
                point[t] = edge_point(t);
            }
        }
    }
    // Link segments into rings, starting from the lowest unvisited edge id.
    let mut rings = Vec::new();
    let mut seen = vec![false; n_edges];
    for start in 0..n_edges {
        if next[start] == NONE || seen[start] {
            continue;
        }
        let mut ring = Vec::new();
        let mut e = start;
        while !seen[e] && next[e] != NONE {
            seen[e] = true;
            ring.push(point[e]);
            e = next[e] as usize;
        }
        if ring.len() >= 3 {
            ring.push(ring[0]);
            rings.push(ring);
        }
    }
    rings
}

/// Nest rings into polygons by even-odd depth. Rings below `MIN_RING_KM2` are dropped.
/// Shells are made CCW, holes CW; output sorted by descending shell area.
pub fn nest(rings: Vec<KmRing>) -> Vec<KmPolygon> {
    let mut rings: Vec<(f64, KmRing)> = rings
        .into_iter()
        .map(|r| (signed_area(&r).abs(), r))
        .filter(|(a, _)| *a >= MIN_RING_KM2)
        .collect();
    rings.sort_by(|a, b| {
        b.0.total_cmp(&a.0)
            .then(a.1[0].0.total_cmp(&b.1[0].0))
            .then(a.1[0].1.total_cmp(&b.1[0].1))
    });
    let n = rings.len();
    // Containers of ring k: larger rings containing its first vertex.
    let containers: Vec<Vec<usize>> = (0..n)
        .map(|k| {
            (0..k)
                .filter(|&o| point_in_ring(rings[k].1[0], &rings[o].1))
                .collect()
        })
        .collect();
    let depth: Vec<usize> = containers.iter().map(Vec::len).collect();
    let mut polys: Vec<KmPolygon> = Vec::new();
    let mut shell_of: Vec<Option<usize>> = vec![None; n];
    for k in 0..n {
        let mut r = rings[k].1.clone();
        if depth[k].is_multiple_of(2) {
            if signed_area(&r) < 0.0 {
                r.reverse();
            }
            shell_of[k] = Some(polys.len());
            polys.push(KmPolygon {
                shell: r,
                holes: Vec::new(),
            });
        } else {
            // Immediate parent: the container with depth − 1 (the smallest container).
            let parent = containers[k]
                .iter()
                .copied()
                .find(|&o| depth[o] + 1 == depth[k]);
            if let Some(pi) = parent.and_then(|o| shell_of[o]) {
                if signed_area(&r) > 0.0 {
                    r.reverse();
                }
                polys[pi].holes.push(r);
            }
        }
    }
    polys
}

fn perp_dist(p: (f64, f64), a: (f64, f64), b: (f64, f64)) -> f64 {
    let (dx, dy) = (b.0 - a.0, b.1 - a.1);
    let len = dx.hypot(dy);
    if len == 0.0 {
        return (p.0 - a.0).hypot(p.1 - a.1);
    }
    ((p.0 - a.0) * dy - (p.1 - a.1) * dx).abs() / len
}

fn dp(pts: &[(f64, f64)], tol: f64, keep: &mut [bool], lo: usize, hi: usize) {
    if hi <= lo + 1 {
        return;
    }
    let (mut best, mut idx) = (-1.0, lo);
    for k in lo + 1..hi {
        let d = perp_dist(pts[k], pts[lo], pts[hi]);
        if d > best {
            best = d;
            idx = k;
        }
    }
    if best > tol {
        keep[idx] = true;
        dp(pts, tol, keep, lo, idx);
        dp(pts, tol, keep, idx, hi);
    }
}

/// Douglas–Peucker on a closed ring: split at vertex 0 and the vertex farthest
/// from it; always keeps at least a triangle.
pub fn simplify_ring(r: &[(f64, f64)], tol: f64) -> KmRing {
    let n = r.len() - 1; // distinct vertices
    if n <= 3 {
        return r.to_vec();
    }
    let pts = &r[..n];
    let far = (1..n)
        .max_by(|&a, &b| {
            let da = (pts[a].0 - pts[0].0).hypot(pts[a].1 - pts[0].1);
            let db = (pts[b].0 - pts[0].0).hypot(pts[b].1 - pts[0].1);
            da.total_cmp(&db).then(b.cmp(&a))
        })
        .unwrap_or(1);
    let mut closed: Vec<(f64, f64)> = pts.to_vec();
    closed.push(pts[0]);
    let mut keep = vec![false; n + 1];
    keep[0] = true;
    keep[far] = true;
    keep[n] = true;
    dp(&closed, tol, &mut keep, 0, far);
    dp(&closed, tol, &mut keep, far, n);
    if keep.iter().filter(|&&k| k).count() < 4 {
        // Degenerate (0, far, 0): add the vertex farthest from the chord.
        let third = (1..n).filter(|&k| k != far).max_by(|&a, &b| {
            perp_dist(pts[a], pts[0], pts[far])
                .total_cmp(&perp_dist(pts[b], pts[0], pts[far]))
                .then(b.cmp(&a))
        });
        if let Some(t) = third {
            keep[t] = true;
        }
    }
    closed
        .iter()
        .zip(&keep)
        .filter(|(_, &k)| k)
        .map(|(p, _)| *p)
        .collect()
}

fn simplify_all(polys: &[KmPolygon], tol: f64) -> Vec<KmPolygon> {
    polys
        .iter()
        .map(|g| KmPolygon {
            shell: simplify_ring(&g.shell, tol),
            holes: g.holes.iter().map(|h| simplify_ring(h, tol)).collect(),
        })
        .collect()
}

/// Simplify to ≤ `max_vertices`: Douglas–Peucker at tolerance 0.05 km × 1.4ⁿ; if
/// even the largest tolerance leaves too many rings, the smallest holes, then the
/// smallest polygons, are dropped.
pub fn simplify(polys: &[KmPolygon], max_vertices: usize) -> Vec<KmPolygon> {
    if vertex_count(polys) <= max_vertices {
        return polys.to_vec();
    }
    let mut tol = DP_TOL0_KM;
    let mut out = simplify_all(polys, tol);
    while vertex_count(&out) > max_vertices && tol < DP_TOL_MAX_KM {
        tol *= DP_GROWTH;
        out = simplify_all(polys, tol);
    }
    while vertex_count(&out) > max_vertices {
        let smallest_hole = out
            .iter()
            .enumerate()
            .flat_map(|(gi, g)| {
                g.holes
                    .iter()
                    .enumerate()
                    .map(move |(hi, h)| (gi, hi, signed_area(h).abs()))
            })
            .min_by(|a, b| a.2.total_cmp(&b.2));
        if let Some((gi, hi, _)) = smallest_hole {
            out[gi].holes.remove(hi);
        } else {
            out.pop(); // sorted by descending shell area: the last is the smallest
        }
    }
    out
}

/// Field → nested, unsimplified multipolygon in grid km.
pub fn contour_raw(
    field: &[f64],
    nx: usize,
    ny: usize,
    x0: f64,
    y0: f64,
    res: f64,
    level: f64,
) -> Vec<KmPolygon> {
    nest(iso_rings(field, nx, ny, x0, y0, res, level))
}

/// Field → multipolygon in grid km simplified to ≤ `MAX_VERTICES`.
pub fn contour(
    field: &[f64],
    nx: usize,
    ny: usize,
    x0: f64,
    y0: f64,
    res: f64,
    level: f64,
) -> Vec<KmPolygon> {
    simplify(
        &contour_raw(field, nx, ny, x0, y0, res, level),
        MAX_VERTICES,
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    fn disc_field(nx: usize, ny: usize, cx: f64, cy: f64, r: f64, hole: f64) -> Vec<f64> {
        let mut f = vec![0.0; nx * ny];
        for j in 0..ny {
            for i in 0..nx {
                let d = ((i as f64 - cx).powi(2) + (j as f64 - cy).powi(2)).sqrt();
                f[j * nx + i] = if d <= r && d >= hole { 1.0 } else { 0.0 };
            }
        }
        f
    }

    #[test]
    fn disc_area_and_orientation() {
        let f = disc_field(60, 60, 30.0, 30.0, 20.0, -1.0);
        let rings = iso_rings(&f, 60, 60, 0.0, 0.0, 1.0, 0.5);
        assert_eq!(rings.len(), 1);
        assert!(
            signed_area(&rings[0]) > 0.0,
            "shell must be CCW (inside on the left)"
        );
        let a = signed_area(&rings[0]);
        assert!((a - std::f64::consts::PI * 400.0).abs() < 40.0, "area {a}");
    }

    #[test]
    fn annulus_nests_a_hole_and_islands_nest_again() {
        // Disc r 20 with hole r < 8, plus an island r ≤ 3 inside the hole.
        let mut f = disc_field(60, 60, 30.0, 30.0, 20.0, 8.0);
        for (k, v) in disc_field(60, 60, 30.0, 30.0, 3.0, -1.0)
            .into_iter()
            .enumerate()
        {
            if v > 0.0 {
                f[k] = 1.0;
            }
        }
        let polys = nest(iso_rings(&f, 60, 60, 0.0, 0.0, 1.0, 0.5));
        assert_eq!(polys.len(), 2, "outer annulus + island");
        assert_eq!(polys[0].holes.len(), 1);
        assert!(polys[1].holes.is_empty());
        assert!(signed_area(&polys[0].holes[0]) < 0.0, "hole must be CW");
        assert!(point_in_polygons((30.0, 30.0), &polys), "island centre");
        assert!(!point_in_polygons((30.0, 35.5), &polys), "in the hole");
        assert!(point_in_polygons((30.0, 45.0), &polys), "in the annulus");
    }

    #[test]
    fn saddle_and_edge_touching_fields_close() {
        // Checkerboard 2×2 blocks and a block touching the grid edge.
        let (nx, ny) = (12, 12);
        let mut f = vec![0.0; nx * ny];
        for j in 0..ny {
            for i in 0..nx {
                if ((i / 2) + (j / 2)) % 2 == 0 || i == 0 {
                    f[j * nx + i] = 1.0;
                }
            }
        }
        for r in iso_rings(&f, nx, ny, 0.0, 0.0, 1.0, 0.5) {
            assert_eq!(r.first(), r.last());
            assert!(r.len() >= 4);
        }
    }

    #[test]
    fn simplify_respects_budget() {
        let mut f = vec![0.0; 200 * 200];
        for j in 0..200 {
            for i in 0..200 {
                let (x, y) = (i as f64 - 100.0, j as f64 - 100.0);
                let r = (x * x + y * y).sqrt();
                let th = y.atan2(x);
                f[j * 200 + i] = if r < 60.0 + 15.0 * (7.0 * th).sin() {
                    1.0
                } else {
                    0.0
                };
            }
        }
        let polys = contour(&f, 200, 200, 0.0, 0.0, 0.25, 0.5);
        assert!(vertex_count(&polys) <= MAX_VERTICES);
        let raw = area_km2(&nest(iso_rings(&f, 200, 200, 0.0, 0.0, 0.25, 0.5)));
        let simp = area_km2(&polys);
        assert!(
            (simp - raw).abs() / raw < 0.05,
            "raw {raw} simplified {simp}"
        );
    }
}
