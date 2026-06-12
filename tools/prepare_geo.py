#!/usr/bin/env python3
"""Prepare map geometry for the isochrone app.

Reads Natural Earth 1:10m countries + lakes GeoJSON, extracts Norway (and
neighbouring Sweden edge for context), clips to a southern-Norway bounding
box, simplifies with Douglas-Peucker, and writes a compact GeoJSON bundle.

Usage: python3 prepare_geo.py <countries.geojson> <lakes.geojson> <out.json>
"""
import json
import math
import sys

# Southern Norway viewport (lon/lat) with margin
BBOX = (3.8, 57.4, 14.2, 62.9)  # W, S, E, N


def clip_ring(ring, bbox):
    """Sutherland-Hodgman polygon clip of a ring against bbox."""
    w, s, e, n = bbox

    def clip_edge(pts, inside, intersect):
        out = []
        if not pts:
            return out
        prev = pts[-1]
        prev_in = inside(prev)
        for cur in pts:
            cur_in = inside(cur)
            if cur_in:
                if not prev_in:
                    out.append(intersect(prev, cur))
                out.append(cur)
            elif prev_in:
                out.append(intersect(prev, cur))
            prev, prev_in = cur, cur_in
        return out

    def ix(p, q, x):
        t = (x - p[0]) / (q[0] - p[0])
        return [x, p[1] + t * (q[1] - p[1])]

    def iy(p, q, y):
        t = (y - p[1]) / (q[1] - p[1])
        return [p[0] + t * (q[0] - p[0]), y]

    pts = ring
    pts = clip_edge(pts, lambda p: p[0] >= w, lambda p, q: ix(p, q, w))
    pts = clip_edge(pts, lambda p: p[0] <= e, lambda p, q: ix(p, q, e))
    pts = clip_edge(pts, lambda p: p[1] >= s, lambda p, q: iy(p, q, s))
    pts = clip_edge(pts, lambda p: p[1] <= n, lambda p, q: iy(p, q, n))
    return pts


def simplify(ring, tol):
    """Douglas-Peucker simplification (iterative)."""
    if len(ring) < 5:
        return ring
    keep = [False] * len(ring)
    keep[0] = keep[-1] = True
    stack = [(0, len(ring) - 1)]
    while stack:
        a, b = stack.pop()
        if b <= a + 1:
            continue
        ax, ay = ring[a]
        bx, by = ring[b]
        dx, dy = bx - ax, by - ay
        norm = math.hypot(dx, dy)
        best, bi = -1.0, -1
        for i in range(a + 1, b):
            px, py = ring[i]
            if norm == 0:
                d = math.hypot(px - ax, py - ay)
            else:
                d = abs(dx * (ay - py) - dy * (ax - px)) / norm
            if d > best:
                best, bi = d, i
        if best > tol:
            keep[bi] = True
            stack.append((a, bi))
            stack.append((bi, b))
    return [p for p, k in zip(ring, keep) if k]


def ring_area(ring):
    a = 0.0
    for i in range(len(ring) - 1):
        a += ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1]
    return abs(a) / 2


def process_polys(geom, tol, min_area):
    """Yield cleaned [outer, holes...] polygons from a (Multi)Polygon."""
    polys = geom["coordinates"]
    if geom["type"] == "Polygon":
        polys = [polys]
    out = []
    for poly in polys:
        rings = []
        for ring in poly:
            c = clip_ring(ring, BBOX)
            if len(c) < 4:
                continue
            if c[0] != c[-1]:
                c = c + [c[0]]
            c = simplify(c, tol)
            if len(c) >= 4 and ring_area(c) >= min_area:
                rings.append([[round(x, 4), round(y, 4)] for x, y in c])
        if rings:
            out.append(rings)
    return out


def main(countries_path, lakes_path, out_path):
    with open(countries_path) as f:
        countries = json.load(f)
    with open(lakes_path) as f:
        lakes = json.load(f)

    land = {}
    for feat in countries["features"]:
        name = feat["properties"].get("ADMIN") or feat["properties"].get("admin")
        if name in ("Norway", "Sweden", "Denmark"):
            polys = process_polys(feat["geometry"], 0.004, 0.0006)
            if polys:
                land[name.lower()] = polys

    lake_polys = []
    for feat in lakes["features"]:
        polys = process_polys(feat["geometry"], 0.002, 0.004)
        lake_polys.extend(polys)

    bundle = {"bbox": list(BBOX), "land": land, "lakes": lake_polys}
    with open(out_path, "w") as f:
        f.write("window.GEO_DATA=")
        json.dump(bundle, f, separators=(",", ":"))
        f.write(";\n")
    n_pts = sum(
        len(r) for polys in land.values() for poly in polys for r in poly
    ) + sum(len(r) for poly in lake_polys for r in poly)
    print(f"wrote {out_path}: countries={list(land)}, lakes={len(lake_polys)}, points={n_pts}")


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2], sys.argv[3])
