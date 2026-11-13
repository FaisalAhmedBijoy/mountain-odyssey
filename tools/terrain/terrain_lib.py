"""Pure helpers for the Mountain Odyssey terrain pipeline (spec section 6.5).

World axes: x = east, z = south, y = up, all in metres. Grid sample (row r, col c)
sits at x = origin + c * spacing, z = origin + r * spacing. Row 0 is the north edge.
"""
from __future__ import annotations

import heapq
import json
import math
from dataclasses import dataclass
from pathlib import Path

import numpy as np
from PIL import Image

M_PER_DEG_LAT = 111_320.0


@dataclass(frozen=True)
class GridSpec:
    center_lat: float
    center_lon: float
    tiles: int
    tile_cells: int
    spacing_m: float

    @property
    def samples(self) -> int:
        return self.tiles * self.tile_cells + 1

    @property
    def size_m(self) -> float:
        return self.tiles * self.tile_cells * self.spacing_m

    @property
    def origin(self) -> float:
        return -self.size_m / 2.0


def m_per_deg_lon(lat: float) -> float:
    return M_PER_DEG_LAT * math.cos(math.radians(lat))


def latlon_bounds(spec: GridSpec, margin_m: float = 200.0) -> tuple[float, float, float, float]:
    """(west, south, east, north) in degrees covering the grid plus a margin."""
    half = spec.size_m / 2.0 + margin_m
    dlat = half / M_PER_DEG_LAT
    dlon = half / m_per_deg_lon(spec.center_lat)
    return (
        spec.center_lon - dlon,
        spec.center_lat - dlat,
        spec.center_lon + dlon,
        spec.center_lat + dlat,
    )


def lonlat_to_xz(lon: float, lat: float, center_lat: float, center_lon: float) -> tuple[float, float]:
    """Local metric x (east) and z (south) of a lon/lat point; same transform as resample_to_metric."""
    return (lon - center_lon) * m_per_deg_lon(center_lat), (center_lat - lat) * M_PER_DEG_LAT


def project_polygons(polygons: list, center_lat: float, center_lon: float) -> list:
    """GeoJSON polygon coordinates ([ring, ...], ring = [[lon, lat], ...]) to metric (x, z) rings."""
    return [
        [[lonlat_to_xz(p[0], p[1], center_lat, center_lon) for p in ring] for ring in rings]
        for rings in polygons
    ]


def rasterise_polygons(polygons_xz: list, samples: int, origin_m: float, spacing_m: float) -> np.ndarray:
    """uint8 (samples x samples, row = z): 1 where a sample point lies inside a polygon.

    Each polygon is [outer, *holes] in metric (x, z). Rings are filled with the even-odd rule
    per polygon, so holes are cut; different polygons are OR-ed, so overlaps do not cancel.
    A sample on a polygon's west or north edge counts as inside, on its east or south edge as outside.
    """
    mask = np.zeros((samples, samples), dtype=np.uint8)
    for rings in polygons_xz:
        edges = []
        for ring in rings:
            pts = np.asarray(ring, dtype=np.float64)
            if len(pts) < 3:
                continue
            if not np.array_equal(pts[0], pts[-1]):
                pts = np.vstack([pts, pts[:1]])
            edges.append(np.column_stack([pts[:-1], pts[1:]]))
        if not edges:
            continue
        x1, z1, x2, z2 = np.vstack(edges).T
        zlo = min(z1.min(), z2.min())
        zhi = max(z1.max(), z2.max())
        r0 = max(0, math.ceil((zlo - origin_m) / spacing_m))
        r1 = min(samples - 1, math.floor((zhi - origin_m) / spacing_m))
        for r in range(r0, r1 + 1):
            z = origin_m + r * spacing_m
            hit = ((z1 <= z) & (z < z2)) | ((z2 <= z) & (z < z1))
            if not hit.any():
                continue
            xi = np.sort(x1[hit] + (z - z1[hit]) * (x2[hit] - x1[hit]) / (z2[hit] - z1[hit]))
            for a, b in zip(xi[0::2], xi[1::2]):
                c0 = max(0, math.ceil((a - origin_m) / spacing_m))
                c1 = min(samples, math.ceil((b - origin_m) / spacing_m))
                if c1 > c0:
                    mask[r, c0:c1] = 1
    return mask


def synthetic_glacier_polygons(center_xz: tuple[float, float] = (512.0, -512.0), radius_m: float = 200.0,
                               segments: int = 64) -> list:
    """One metric disc polygon around the synthetic mound (north-east, so axis mix-ups show)."""
    cx, cz = center_xz
    ring = [(cx + radius_m * math.cos(2 * math.pi * k / segments),
             cz + radius_m * math.sin(2 * math.pi * k / segments)) for k in range(segments)]
    return [[ring]]


def bilinear_sample(grid: np.ndarray, rows: np.ndarray, cols: np.ndarray) -> np.ndarray:
    grid = np.asarray(grid, dtype=np.float64)
    r0 = np.clip(np.floor(rows).astype(np.int64), 0, grid.shape[0] - 2)
    c0 = np.clip(np.floor(cols).astype(np.int64), 0, grid.shape[1] - 2)
    fr = np.clip(rows - r0, 0.0, 1.0)
    fc = np.clip(cols - c0, 0.0, 1.0)
    top = grid[r0, c0] * (1 - fc) + grid[r0, c0 + 1] * fc
    bottom = grid[r0 + 1, c0] * (1 - fc) + grid[r0 + 1, c0 + 1] * fc
    return top * (1 - fr) + bottom * fr


def resample_to_metric(
    dem: np.ndarray,
    dem_bounds: tuple[float, float, float, float],
    spec: GridSpec,
    coarse_spacing_m: float,
) -> np.ndarray:
    """Resample a lat/lon DEM (row 0 = north) onto the local metric grid.

    dem_bounds are the (west, south, east, north) coordinates of the DEM's outer
    pixel centres.
    """
    west, south, east, north = dem_bounds
    n = int(round(spec.size_m / coarse_spacing_m)) + 1
    offsets = spec.origin + np.arange(n) * coarse_spacing_m
    lat = spec.center_lat - offsets / M_PER_DEG_LAT
    lon = spec.center_lon + offsets / m_per_deg_lon(spec.center_lat)
    rows = (north - lat) / (north - south) * (dem.shape[0] - 1)
    cols = (lon - west) / (east - west) * (dem.shape[1] - 1)
    rr, cc = np.meshgrid(rows, cols, indexing="ij")
    return bilinear_sample(dem, rr, cc).astype(np.float32)


def upsample(h: np.ndarray, out_samples: int) -> np.ndarray:
    img = Image.fromarray(np.ascontiguousarray(h, dtype=np.float32))
    resized = img.resize((out_samples, out_samples), Image.Resampling.BICUBIC)
    return np.array(resized, dtype=np.float32)


def detail_noise(
    n: int,
    spacing_m: float,
    seed: int,
    octaves: tuple[tuple[float, float], ...] = ((64.0, 1.2), (16.0, 0.5), (6.0, 0.2)),
) -> np.ndarray:
    """Smooth value noise: sum of (wavelength_m, amplitude_m) octaves."""
    rng = np.random.default_rng(seed)
    out = np.zeros((n, n), dtype=np.float32)
    extent = (n - 1) * spacing_m
    for wavelength, amplitude in octaves:
        cells = max(2, int(math.ceil(extent / wavelength)) + 1)
        coarse = rng.uniform(-1.0, 1.0, size=(cells, cells)).astype(np.float32)
        out += upsample(coarse, n) * amplitude
    return out


def split_tiles(h: np.ndarray, tile_cells: int) -> dict[tuple[int, int], np.ndarray]:
    """Split into (tile_cells + 1)^2 tiles keyed (tx, tz); neighbours share edges."""
    tiles = (h.shape[0] - 1) // tile_cells
    out: dict[tuple[int, int], np.ndarray] = {}
    for tz in range(tiles):
        for tx in range(tiles):
            r0, c0 = tz * tile_cells, tx * tile_cells
            out[(tx, tz)] = h[r0 : r0 + tile_cells + 1, c0 : c0 + tile_cells + 1]
    return out


def quantize(h: np.ndarray, min_h: float, max_h: float) -> np.ndarray:
    q = np.round((np.asarray(h, dtype=np.float64) - min_h) / (max_h - min_h) * 65535.0)
    return np.clip(q, 0, 65535).astype("<u2")


def height_range(h: np.ndarray) -> tuple[float, float]:
    """(min, max) quantisation range written to the manifest: whole metres plus 1 m margin."""
    return float(math.floor(float(h.min()))) - 1.0, float(math.ceil(float(h.max()))) + 1.0


def engine_heights(h: np.ndarray) -> np.ndarray:
    """The heights the engine decodes from the uint16 tiles that write_terrain writes."""
    min_h, max_h = height_range(h)
    q = quantize(h, min_h, max_h).astype(np.float64)
    return (min_h + q / 65535.0 * (max_h - min_h)).astype(np.float32)


def downsample(h: np.ndarray, step: int) -> np.ndarray:
    return np.ascontiguousarray(h[::step, ::step])


def slope_deg(h: np.ndarray, spacing_m: float) -> np.ndarray:
    gz, gx = np.gradient(np.asarray(h, dtype=np.float64), spacing_m)
    return np.degrees(np.arctan(np.hypot(gx, gz)))


def cell_slope_deg(h: np.ndarray, spacing_m: float, band_rows: int = 1024) -> np.ndarray:
    """Steepest slope (degrees) anywhere in each full-resolution cell, shape (rows-1, cols-1).

    This is the steepest gradient of the bilinear surface over the cell, which is reached
    at a corner (steepest x edge combined with steepest z edge). It bounds both physics
    triangles of the cell and the engine's sampled slope, so ground below the limit here is
    walkable in the engine. Computed in row bands to keep memory low on large grids.
    """
    h = np.asarray(h, dtype=np.float32)
    out = np.empty((h.shape[0] - 1, h.shape[1] - 1), np.float32)
    for r0 in range(0, h.shape[0] - 1, band_rows):
        q = h[r0 : r0 + band_rows + 1]
        ex = np.maximum(np.abs(q[:-1, 1:] - q[:-1, :-1]), np.abs(q[1:, 1:] - q[1:, :-1]))
        ez = np.maximum(np.abs(q[1:, :-1] - q[:-1, :-1]), np.abs(q[1:, 1:] - q[:-1, 1:]))
        out[r0 : r0 + q.shape[0] - 1] = np.degrees(np.arctan(np.hypot(ex, ez) / spacing_m))
    return out


def block_max_slope(cell_slope: np.ndarray, step: int, shape: tuple[int, int]) -> np.ndarray:
    """Max cell slope over the step x step cells centred on each coarse sample (every
    step-th full-resolution sample), so the blocks tile the grid. Shape = coarse shape."""
    lo = step // 2
    hi = step - lo
    pad = np.pad(cell_slope, ((lo, hi + 1), (lo, hi + 1)), mode="edge")
    out = np.zeros(shape, np.float32)
    for dr in range(step):
        for dc in range(step):
            out = np.maximum(out, pad[dr::step, dc::step][: shape[0], : shape[1]])
    return out


def segment_cells(
    a: tuple[float, float], b: tuple[float, float], origin_m: float, spacing_m: float
) -> tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray]:
    """Every full-resolution cell a straight x/z segment passes through, in order.

    Splits the segment at each grid line it crosses; the midpoint of each piece lies in
    exactly one cell. Returns (rows, cols, x, z) with x/z the midpoints (unclipped).
    """
    ax, az = (a[0] - origin_m) / spacing_m, (a[1] - origin_m) / spacing_m
    bx, bz = (b[0] - origin_m) / spacing_m, (b[1] - origin_m) / spacing_m
    ts = [np.array([0.0, 1.0])]
    for p0, p1 in ((ax, bx), (az, bz)):
        if p1 != p0:
            lines = np.arange(math.floor(min(p0, p1)) + 1, math.ceil(max(p0, p1)))
            ts.append((lines - p0) / (p1 - p0))
    t = np.unique(np.concatenate(ts))
    mid = (t[:-1] + t[1:]) / 2 if len(t) > 1 else t
    fx = ax + (bx - ax) * mid
    fz = az + (bz - az) * mid
    return (
        np.floor(fz).astype(np.int64),
        np.floor(fx).astype(np.int64),
        origin_m + fx * spacing_m,
        origin_m + fz * spacing_m,
    )


def route_max_slope(
    points: list[list[float]], cell_slope: np.ndarray, spacing_m: float, origin_m: float
) -> tuple[float, float, float]:
    """Steepest cell slope under a route polyline, over every full-resolution cell it
    passes through (finer than any fixed sampling step). Returns (slope_deg, x, z)."""
    worst = (-1.0, 0.0, 0.0)
    for p, q in zip(points, points[1:]):
        r, c, x, z = segment_cells((p[0], p[2]), (q[0], q[2]), origin_m, spacing_m)
        r = np.clip(r, 0, cell_slope.shape[0] - 1)
        c = np.clip(c, 0, cell_slope.shape[1] - 1)
        s = cell_slope[r, c]
        i = int(np.argmax(s))
        if s[i] > worst[0]:
            worst = (float(s[i]), float(x[i]), float(z[i]))
    return worst


def find_summit(h: np.ndarray, *, spacing_m: float = 1.0, radius_m: float | None = None) -> tuple[int, int]:
    """Highest cell; with radius_m, only cells within that distance of the grid centre
    (so taller neighbouring peaks at the edge of the crop are ignored)."""
    if radius_m is None:
        r, c = np.unravel_index(int(np.argmax(h)), h.shape)
        return int(r), int(c)
    mid = (h.shape[0] - 1) / 2.0
    rr, cc = np.mgrid[0 : h.shape[0], 0 : h.shape[1]]
    masked = np.where(np.hypot(rr - mid, cc - mid) * spacing_m <= radius_m, h, -np.inf)
    r, c = np.unravel_index(int(np.argmax(masked)), h.shape)
    return int(r), int(c)


class CampPlacementError(ValueError):
    """Camps cannot be placed on, or are not connected by, walkable ground."""


def label_components(mask: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """4-connected component labels of a boolean mask (0 = not in mask, 1..k).

    Works on horizontal runs: each row's runs are unioned with the overlapping runs of
    the row above, so the Python loop is over runs rather than cells.
    Returns (labels, sizes) where sizes[k] is the cell count of label k (sizes[0] = 0).
    """
    mask = np.asarray(mask, dtype=bool)
    rows, cols = mask.shape
    run_row: list[int] = []
    run_start: list[int] = []
    run_end: list[int] = []  # exclusive
    row_first: list[int] = []
    for r in range(rows):
        row_first.append(len(run_row))
        padded = np.concatenate(([False], mask[r], [False])).astype(np.int8)
        edges = np.flatnonzero(np.diff(padded))
        starts, ends = edges[0::2], edges[1::2]
        run_row.extend([r] * len(starts))
        run_start.extend(starts.tolist())
        run_end.extend(ends.tolist())
    row_first.append(len(run_row))

    parent = list(range(len(run_row)))

    def find(i: int) -> int:
        while parent[i] != i:
            parent[i] = parent[parent[i]]
            i = parent[i]
        return i

    for r in range(1, rows):
        a, a_end = row_first[r - 1], row_first[r]
        b, b_end = row_first[r], row_first[r + 1]
        while a < a_end and b < b_end:
            if run_start[a] < run_end[b] and run_start[b] < run_end[a]:
                ra, rb = find(a), find(b)
                if ra != rb:
                    parent[max(ra, rb)] = min(ra, rb)
            if run_end[a] < run_end[b]:
                a += 1
            else:
                b += 1

    labels = np.zeros((rows, cols), dtype=np.int32)
    ids: dict[int, int] = {}
    for i in range(len(run_row)):
        root = find(i)
        label = ids.setdefault(root, len(ids) + 1)
        labels[run_row[i], run_start[i] : run_end[i]] = label
    sizes = np.bincount(labels.ravel(), minlength=len(ids) + 1)
    sizes[0] = 0
    return labels, sizes


@dataclass(frozen=True)
class WalkableMap:
    """Walkable ground (slope below a threshold) on a coarse analysis grid that takes
    every step-th full-resolution sample, with its connected components labelled."""

    step: int
    heights: np.ndarray
    slope: np.ndarray
    labels: np.ndarray
    sizes: np.ndarray

    def coarse(self, rc: tuple[int, int]) -> tuple[int, int]:
        r = min(max(int(round(rc[0] / self.step)), 0), self.labels.shape[0] - 1)
        c = min(max(int(round(rc[1] / self.step)), 0), self.labels.shape[1] - 1)
        return r, c

    def label_at(self, rc: tuple[int, int]) -> int:
        return int(self.labels[self.coarse(rc)])


def walkable_map(
    h: np.ndarray, spacing_m: float, max_slope_deg: float = 30.0, analysis_spacing_m: float = 8.0
) -> WalkableMap:
    """Analyse walkability on a coarser grid (default 8 m) so it runs fast and ignores
    the small-scale detail noise."""
    step = max(1, int(round(analysis_spacing_m / spacing_m)))
    hc = np.asarray(h, dtype=np.float64)[::step, ::step]
    slope = slope_deg(hc, spacing_m * step)
    labels, sizes = label_components(slope < max_slope_deg)
    return WalkableMap(step, hc, slope, labels, sizes)


def spawn_is_walkable(
    h: np.ndarray, spacing_m: float, rc: tuple[int, int], radius_m: float = 6.0, max_slope_deg: float = 30.0
) -> bool:
    """True when every full-resolution cell within +/- radius_m of rc is walkable."""
    k = max(1, int(math.ceil(radius_m / spacing_m)))
    r, c = rc
    r_lo, r_hi = max(0, r - k - 1), min(h.shape[0], r + k + 2)
    c_lo, c_hi = max(0, c - k - 1), min(h.shape[1], c + k + 2)
    slope = slope_deg(h[r_lo:r_hi, c_lo:c_hi], spacing_m)
    inner = slope[max(0, r - k) - r_lo : min(h.shape[0], r + k + 1) - r_lo,
                  max(0, c - k) - c_lo : min(h.shape[1], c + k + 1) - c_lo]
    return bool(inner.max() < max_slope_deg)


def place_camps(
    h: np.ndarray,
    spacing_m: float,
    summit_rc: tuple[int, int],
    camps: list[dict],
    *,
    tolerance_m: float = 100.0,
    max_slope_deg: float = 30.0,
    analysis_spacing_m: float = 8.0,
    spawn_radius_m: float = 6.0,
    walk_map: WalkableMap | None = None,
) -> list[tuple[int, int]]:
    """Place camps inside one connected walkable component.

    The component is the largest one that has ground within tolerance_m of every
    camp's targetElevationM. Each camp is the cell of that component with the best
    score (closeness to the target elevation, then flatness, with an optional
    bearingFromSummitDeg as a mild preference) whose spawn neighbourhood is walkable.
    """
    wm = walk_map or walkable_map(h, spacing_m, max_slope_deg, analysis_spacing_m)
    hc, labels = wm.heights, wm.labels
    common: set[int] | None = None
    for camp in camps:
        near = labels[(np.abs(hc - camp["targetElevationM"]) <= tolerance_m) & (labels > 0)]
        found = set(np.unique(near).tolist())
        common = found if common is None else common & found
    if not common:
        targets = ", ".join(f"{c['id']}={c['targetElevationM']:.0f} m" for c in camps)
        raise CampPlacementError(
            f"no walkable component (slope < {max_slope_deg} deg) reaches every camp target "
            f"within +/-{tolerance_m:.0f} m ({targets})"
        )
    component = max(common, key=lambda k: wm.sizes[k])

    margin = int(math.ceil(spawn_radius_m / (spacing_m * wm.step))) + 1
    rr, cc = np.mgrid[0 : labels.shape[0], 0 : labels.shape[1]]
    inside = (
        (rr >= margin) & (rr < labels.shape[0] - margin) & (cc >= margin) & (cc < labels.shape[1] - margin)
    )
    sr, sc = summit_rc[0] / wm.step, summit_rc[1] / wm.step
    out: list[tuple[int, int]] = []
    for camp in camps:
        target = camp["targetElevationM"]
        dh = np.abs(hc - target)
        candidates = np.flatnonzero((labels == component) & (dh <= tolerance_m) & inside)
        score = dh.ravel()[candidates] / 20.0 + wm.slope.ravel()[candidates]
        bearing = camp.get("bearingFromSummitDeg")
        if bearing is not None:
            cand_r, cand_c = np.divmod(candidates, labels.shape[1])
            cand_bearing = np.degrees(np.arctan2(cand_c - sc, sr - cand_r))
            off = np.abs((cand_bearing - bearing + 180.0) % 360.0 - 180.0)
            score = score + off / 30.0
        chosen = None
        for i in candidates[np.argsort(score, kind="stable")]:
            r, c = divmod(int(i), labels.shape[1])
            rc = (r * wm.step, c * wm.step)
            if spawn_is_walkable(h, spacing_m, rc, spawn_radius_m, max_slope_deg):
                chosen = rc
                break
        if chosen is None:
            raise CampPlacementError(f"camp {camp['id']}: no candidate with a walkable spawn neighbourhood")
        out.append(chosen)
    return out


def validate_camps(
    h: np.ndarray,
    spacing_m: float,
    camps: list[tuple[str, tuple[int, int]]],
    *,
    max_slope_deg: float = 30.0,
    analysis_spacing_m: float = 8.0,
    spawn_radius_m: float = 6.0,
    walk_map: WalkableMap | None = None,
) -> None:
    """Raise CampPlacementError unless every camp spawns on walkable ground and each
    pair of consecutive camps lies in the same walkable component.

    Pass only the camps that must be reached on foot: the summit camp is reached by
    climbing (M2) and is exempt.
    """
    for camp_id, rc in camps:
        if not spawn_is_walkable(h, spacing_m, rc, spawn_radius_m, max_slope_deg):
            raise CampPlacementError(
                f"camp {camp_id}: spawn neighbourhood (+/-{spawn_radius_m} m) is too steep "
                f"(slope >= {max_slope_deg} deg)"
            )
    wm = walk_map or walkable_map(h, spacing_m, max_slope_deg, analysis_spacing_m)
    for (a_id, a_rc), (b_id, b_rc) in zip(camps, camps[1:]):
        la, lb = wm.label_at(a_rc), wm.label_at(b_rc)
        if la == 0 or la != lb:
            raise CampPlacementError(
                f"camps {a_id} and {b_id} are not connected by walkable ground "
                f"(slope < {max_slope_deg} deg at {spacing_m * wm.step:g} m analysis spacing)"
            )


class RouteError(CampPlacementError):
    """No walkable route between two cells."""


_NEIGHBOURS = ((-1, -1), (-1, 0), (-1, 1), (0, -1), (0, 1), (1, -1), (1, 0), (1, 1))


def find_route(
    h: np.ndarray,
    spacing_m: float,
    origin_m: float,
    wm: WalkableMap,
    start_rc: tuple[int, int],
    goal_rc: tuple[int, int],
    *,
    max_slope_deg: float = 33.0,
    point_spacing_m: float = 20.0,
    cell_slope: np.ndarray | None = None,
    max_lookahead: int = 250,
) -> list[list[float]]:
    """Walkable route between two full-resolution cells as [x, y, z] world points.

    Slope is judged at full resolution (cell_slope_deg, the steepest ground the engine
    can measure in each 2 m cell), not on the coarse grid, so 2 m features the coarse
    grid skips are seen. A* runs on the walkable map's coarse grid (8-connected); each
    coarse sample stands for the block of full-resolution cells around it, with the
    block's max slope: blocks at or above max_slope_deg are impassable and the step cost
    is step length x (1 + (block slope / max_slope_deg)^2). The cell path is
    string-pulled (a shortcut is kept only when every full-resolution cell the straight
    segment passes through is below max_slope_deg) and resampled
    so consecutive points are at most point_spacing_m apart. Heights come from the
    full-resolution heightmap. Raises RouteError when the cells are not connected.
    """
    if cell_slope is None:
        cell_slope = cell_slope_deg(h, spacing_m)
    rows, cols = wm.slope.shape
    block = block_max_slope(cell_slope, wm.step, (rows, cols))
    walk = (block < max_slope_deg).ravel().tolist()
    cost = (1.0 + (block / max_slope_deg) ** 2).ravel().tolist()
    cs = spacing_m * wm.step
    s = wm.coarse(start_rc)
    g = wm.coarse(goal_rc)
    si, gi = s[0] * cols + s[1], g[0] * cols + g[1]
    if not walk[si] or not walk[gi]:
        raise RouteError("route start or end is not on walkable ground")

    best = [math.inf] * (rows * cols)
    came = [-1] * (rows * cols)
    best[si] = 0.0
    diag = math.sqrt(2.0)
    heap = [(math.hypot(s[0] - g[0], s[1] - g[1]) * cs, 0.0, si)]
    while heap:
        _, d, i = heapq.heappop(heap)
        if i == gi:
            break
        if d > best[i]:
            continue
        r, c = divmod(i, cols)
        for dr, dc in _NEIGHBOURS:
            nr, nc = r + dr, c + dc
            if nr < 0 or nr >= rows or nc < 0 or nc >= cols:
                continue
            ni = nr * cols + nc
            if not walk[ni]:
                continue
            nd = d + (diag if dr and dc else 1.0) * cs * cost[ni]
            if nd < best[ni]:
                best[ni] = nd
                came[ni] = i
                heapq.heappush(heap, (nd + math.hypot(nr - g[0], nc - g[1]) * cs, nd, ni))
    if not math.isfinite(best[gi]):
        raise RouteError("cells are not connected by walkable ground")

    cells = [gi]
    while cells[-1] != si:
        cells.append(came[cells[-1]])
    cells.reverse()

    def to_xz(rc: tuple[int, int]) -> tuple[float, float]:
        return origin_m + rc[1] * spacing_m, origin_m + rc[0] * spacing_m

    inner = [to_xz((ci // cols * wm.step, ci % cols * wm.step)) for ci in cells[1:-1]]
    pts = [to_xz(start_rc), *inner, to_xz(goal_rc)]

    crows, ccols = cell_slope.shape
    steep = cell_slope >= max_slope_deg

    def clear(a: tuple[float, float], b: tuple[float, float]) -> bool:
        r, c, _, _ = segment_cells(a, b, origin_m, spacing_m)
        if r.min() < 0 or c.min() < 0 or r.max() >= crows or c.max() >= ccols:
            return False
        return not steep[r, c].any()

    kept = string_pull(pts, clear, max_lookahead)

    xz: list[tuple[float, float]] = []
    for a, b in zip(kept, kept[1:]):
        n = max(1, int(math.ceil(math.hypot(b[0] - a[0], b[1] - a[1]) / point_spacing_m)))
        xz.extend((a[0] + (b[0] - a[0]) * k / n, a[1] + (b[1] - a[1]) * k / n) for k in range(n))
    xz.append(kept[-1])
    rows_f = np.array([(z - origin_m) / spacing_m for _, z in xz])
    cols_f = np.array([(x - origin_m) / spacing_m for x, _ in xz])
    ys = bilinear_sample(h, rows_f, cols_f)
    return [[round(x, 1), round(float(y), 1), round(z, 1)] for (x, z), y in zip(xz, ys)]


def string_pull(
    points: list,
    clear,
    max_lookahead: int = 250,
) -> list:
    """Smooth a path: from each kept point, keep the farthest of the next max_lookahead
    points that clear(kept, candidate) accepts, scanning from far to near (so a shortcut
    blocked near the start does not hide a farther visible point). The next point is
    always reachable, so this always ends at the last point."""
    kept = [points[0]]
    i = 0
    while i < len(points) - 1:
        j = i + 1
        for k in range(min(len(points) - 1, i + max_lookahead), i + 1, -1):
            if clear(points[i], points[k]):
                j = k
                break
        kept.append(points[j])
        i = j
    return kept


def route_length(points: list[list[float]]) -> float:
    """3D length of a route polyline in metres."""
    return float(
        sum(math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]) for a, b in zip(points, points[1:]))
    )


def route_markers(
    points: list[list[float]],
    every_m: float = 100.0,
    turn_deg: float = 30.0,
    end_clear_m: float = 25.0,
    min_gap_m: float = 30.0,
) -> list[list[float]]:
    """Trail-marker positions: one at each vertex where the heading changes by more than
    turn_deg, and distance markers every every_m of horizontal route length counted from
    the start or from the last turn marker. A distance marker within min_gap_m (along the
    route) of the previous marker is skipped, and one within min_gap_m before a turn
    marker is replaced by it, so only turn markers come closer than min_gap_m. No marker within end_clear_m of either end,
    and no duplicates closer than 1 m. The y values are interpolated between points;
    build_routes replaces them with terrain heights."""
    seg = [math.hypot(b[0] - a[0], b[2] - a[2]) for a, b in zip(points, points[1:])]
    total = sum(seg)
    out: list[list[float]] = []
    last_at = -math.inf
    last_is_distance = False

    def add(p: list[float], dist: float, turn: bool) -> bool:
        nonlocal last_at, last_is_distance
        if dist < end_clear_m or total - dist < end_clear_m:
            return False
        if out and math.hypot(out[-1][0] - p[0], out[-1][2] - p[2]) < 1.0:
            return False
        if turn and last_is_distance and dist - last_at < min_gap_m:
            out.pop()  # the turn marker replaces a distance marker just before it
        out.append([round(p[0], 1), round(p[1], 1), round(p[2], 1)])
        last_at, last_is_distance = dist, not turn
        return True

    def heading(a: list[float], b: list[float]) -> float:
        return math.atan2(b[2] - a[2], b[0] - a[0])

    dist = 0.0
    next_mark = every_m
    for i, (a, b, length) in enumerate(zip(points, points[1:], seg)):
        if i > 0 and length > 0 and seg[i - 1] > 0:
            turn = heading(a, b) - heading(points[i - 1], a)
            turn = abs((turn + math.pi) % (2 * math.pi) - math.pi)
            if math.degrees(turn) > turn_deg and add(a, dist, turn=True):
                next_mark = dist + every_m
        while length > 0 and next_mark <= dist + length + 1e-9:
            t = (next_mark - dist) / length
            if next_mark - last_at >= min_gap_m:
                add([a[k] + (b[k] - a[k]) * t for k in range(3)], next_mark, turn=False)
            next_mark += every_m
        dist += length
    return out


def build_routes(
    h: np.ndarray,
    spacing_m: float,
    origin_m: float,
    wm: WalkableMap,
    camps: list[tuple[str, tuple[int, int]]],
    *,
    max_slope_deg: float = 33.0,
    cell_slope: np.ndarray | None = None,
) -> list[dict]:
    """One manifest route per pair of consecutive walk-connected camps.

    Every route is validated at full resolution: no cell it passes through (an exact
    traversal, finer than sampling every 1 m) may be at or above max_slope_deg; raises
    RouteError naming the camps and the location.
    """
    if cell_slope is None:
        cell_slope = cell_slope_deg(h, spacing_m)
    routes = []
    for (a_id, a_rc), (b_id, b_rc) in zip(camps, camps[1:]):
        try:
            points = find_route(
                h, spacing_m, origin_m, wm, a_rc, b_rc, max_slope_deg=max_slope_deg, cell_slope=cell_slope
            )
        except RouteError as err:
            raise RouteError(f"no walkable route from {a_id} to {b_id}: {err}") from err
        worst, x, z = route_max_slope(points, cell_slope, spacing_m, origin_m)
        if worst >= max_slope_deg:
            raise RouteError(
                f"route {a_id} to {b_id} is steeper than {max_slope_deg:g} deg at x={x:.0f}, z={z:.0f} "
                f"({worst:.1f} deg)"
            )
        routes.append(
            {
                "from": a_id,
                "to": b_id,
                "lengthM": float(round(route_length(points))),
                "points": points,
                "markers": terrain_markers(h, spacing_m, origin_m, route_markers(points)),
            }
        )
    return routes


def terrain_markers(
    h: np.ndarray, spacing_m: float, origin_m: float, markers: list[list[float]]
) -> list[list[float]]:
    """Markers with y set to the full-resolution terrain height at their x/z."""
    if not markers:
        return []
    rows = np.array([(m[2] - origin_m) / spacing_m for m in markers])
    cols = np.array([(m[0] - origin_m) / spacing_m for m in markers])
    ys = bilinear_sample(h, rows, cols)
    return [[m[0], round(float(y), 1), m[2]] for m, y in zip(markers, ys)]


def cell_to_world(rc: tuple[int, int], origin_m: float, spacing_m: float, h: np.ndarray) -> list[float]:
    r, c = rc
    return [
        round(origin_m + c * spacing_m, 2),
        round(float(h[r, c]), 2),
        round(origin_m + r * spacing_m, 2),
    ]


def synthetic_heightmap(samples: int, spacing_m: float) -> np.ndarray:
    """Test mountain: 5000 m plain, a ~19 degree cone rising 240 m within 700 m of
    the centre, and an 8 m cliff band at radius 300 m. On the south side (z > 0,
    |x| < 40 m, tapering out by |x| = 80 m) the cliff becomes an 80 m ramp so the
    summit is walkable from the south. A 20 m mound at (x = +512, z = -512) makes
    the terrain asymmetric so axis mix-ups show up in tests."""
    half = (samples - 1) * spacing_m / 2.0
    coords = np.arange(samples) * spacing_m - half
    x, z = np.meshgrid(coords, coords)
    r = np.hypot(x, z)
    cone = np.clip(1.0 - r / 700.0, 0.0, 1.0) * 240.0
    gap = np.where(z > 0.0, np.clip((80.0 - np.abs(x)) / 40.0, 0.0, 1.0), 0.0)
    cliff_width = 1.0 + 79.0 * gap
    cliff = 8.0 * np.clip((300.0 - r) / cliff_width + 0.5, 0.0, 1.0)
    mound = 20.0 * np.exp(-((x - 512.0) ** 2 + (z + 512.0) ** 2) / (2.0 * 40.0**2))
    return (5000.0 + cone + cliff + mound).astype(np.float32)


def resample_rgb_to_metric(
    rgb: np.ndarray,
    src_bounds: tuple[float, float, float, float],
    spec: GridSpec,
    size_px: int,
) -> np.ndarray:
    """Resample a lat/lon RGB image (rows x cols x 3, row 0 = north) onto a square image
    covering the terrain grid. src_bounds are the (west, south, east, north) coordinates of
    the source's outer pixel centres. Output is (size_px, size_px, 3) float32 in 0..255.
    Output pixel (r, c) is centred at x = origin + (c + 0.5) * size_m / size_px (z likewise)."""
    west, south, east, north = src_bounds
    offsets = spec.origin + (np.arange(size_px) + 0.5) * (spec.size_m / size_px)
    lat = spec.center_lat - offsets / M_PER_DEG_LAT
    lon = spec.center_lon + offsets / m_per_deg_lon(spec.center_lat)
    rows = (north - lat) / (north - south) * (rgb.shape[0] - 1)
    cols = (lon - west) / (east - west) * (rgb.shape[1] - 1)
    rr, cc = np.meshgrid(rows, cols, indexing="ij")
    return np.stack([bilinear_sample(rgb[:, :, k], rr, cc) for k in range(3)], axis=-1).astype(np.float32)


_LUMA = np.array([0.2126, 0.7152, 0.0722], dtype=np.float32)


def grade_imagery(
    rgb: np.ndarray,
    *,
    low_pct: float = 1.0,
    high_pct: float = 97.0,
    max_gain: float = 3.0,
    gamma: float = 0.65,
    saturation: float = 1.2,
) -> np.ndarray:
    """Brighten and enrich a satellite image for use as a terrain colour. Returns uint8.
    1. Stretch so the low_pct luminance -> 0 and the high_pct luminance -> 1 (the same
       offset and scale for all channels, so the order of the channels is kept). The
       stretch never exceeds max_gain.
    2. gamma < 1 lifts dark tones (softens baked-in shadows).
    3. saturation > 1 pushes colours away from grey."""
    x = np.asarray(rgb, dtype=np.float32) / 255.0
    luma = x @ _LUMA
    lo, hi = (float(v) for v in np.percentile(luma, [low_pct, high_pct]))
    hi = max(hi, lo + 1.0 / max_gain)
    x = np.clip((x - lo) / (hi - lo), 0.0, 1.0) ** gamma
    grey = (x @ _LUMA)[..., None]
    x = np.clip(grey + (x - grey) * saturation, 0.0, 1.0)
    return (x * 255.0 + 0.5).astype(np.uint8)


def imagery_empty_fraction(rgb: np.ndarray) -> float:
    """Fraction of pixels that are exactly (0, 0, 0): the nodata value of Sentinel-2 TCI."""
    return float((np.asarray(rgb).sum(axis=-1) == 0).mean())


def synthetic_imagery(h: np.ndarray, spacing_m: float, origin_m: float, size_px: int = 256) -> np.ndarray:
    """Test image for the synthetic test-peak: green low ground blending to white high ground,
    with an orange disc of radius 60 m at world (x = +512, z = -512), where the heightmap
    has its mound. The disc makes axis mix-ups visible. Returns (size_px, size_px, 3) uint8."""
    n = h.shape[0]
    size_m = (n - 1) * spacing_m
    centres = origin_m + (np.arange(size_px) + 0.5) * (size_m / size_px)
    x, z = np.meshgrid(centres, centres)  # x varies along columns, z along rows
    idx = np.clip(np.rint((centres - origin_m) / spacing_m).astype(int), 0, n - 1)
    height = h[np.ix_(idx, idx)].astype(np.float64)
    t = np.clip((height - height.min()) / max(float(height.max() - height.min()), 1e-6), 0.0, 1.0)[..., None]
    low = np.array([96.0, 140.0, 72.0])
    high = np.array([236.0, 240.0, 244.0])
    rgb = low + (high - low) * t
    rgb[(x - 512.0) ** 2 + (z + 512.0) ** 2 < 60.0**2] = (230.0, 120.0, 30.0)
    return (rgb + 0.5).astype(np.uint8)


def write_terrain(
    out_dir: str | Path,
    mountain_id: str,
    h: np.ndarray,
    spacing_m: float,
    tile_cells: int,
    origin_m: float,
    camps: list[dict],
    attribution: str,
    backdrop_spacing_m: float,
    routes: list[dict] | None = None,
    route_max_slope_deg: float | None = None,
    imagery: np.ndarray | None = None,
    surface_mask: np.ndarray | None = None,
    surface_mask_spacing_m: float | None = None,
    surface_mask_source: str = "",
) -> dict:
    out = Path(out_dir)
    tiles_dir = out / "tiles"
    tiles_dir.mkdir(parents=True, exist_ok=True)
    min_h, max_h = height_range(h)
    for (tx, tz), tile in split_tiles(h, tile_cells).items():
        (tiles_dir / f"{tx}_{tz}.u16").write_bytes(quantize(tile, min_h, max_h).tobytes())
    step = int(round(backdrop_spacing_m / spacing_m))
    if (h.shape[0] - 1) % step != 0:
        raise ValueError("backdrop spacing must divide the grid size")
    backdrop = downsample(h, step)
    (out / "backdrop.u16").write_bytes(quantize(backdrop, min_h, max_h).tobytes())
    tiles = (h.shape[0] - 1) // tile_cells
    manifest = {
        "id": mountain_id,
        "spacingM": spacing_m,
        "tileSamples": tile_cells + 1,
        "tilesX": tiles,
        "tilesZ": tiles,
        "originX": origin_m,
        "originZ": origin_m,
        "minHeightM": min_h,
        "maxHeightM": max_h,
        "backdrop": {"file": "backdrop.u16", "samples": int(backdrop.shape[0]), "spacingM": backdrop_spacing_m},
        "camps": camps,
        "attribution": attribution,
    }
    if routes is not None:
        manifest["routes"] = routes
    if route_max_slope_deg is not None:
        manifest["routeMaxSlopeDeg"] = route_max_slope_deg
    if imagery is not None:
        if imagery.ndim != 3 or imagery.shape[0] != imagery.shape[1] or imagery.shape[2] != 3:
            raise ValueError(f"imagery must be a square RGB array, got shape {imagery.shape}")
        # No mode argument: Pillow infers RGB from a (rows, cols, 3) uint8 array.
        Image.fromarray(np.ascontiguousarray(imagery, dtype=np.uint8)).save(
            out / "imagery.jpg", quality=85, optimize=True
        )
        manifest["imagery"] = {"file": "imagery.jpg", "sizePx": int(imagery.shape[0])}
    if surface_mask is not None:
        n = int(round((h.shape[0] - 1) * spacing_m / surface_mask_spacing_m)) + 1
        if surface_mask.shape != (n, n) or surface_mask.dtype != np.uint8:
            raise ValueError(f"surface mask must be uint8 {n}x{n}, got {surface_mask.dtype} {surface_mask.shape}")
        (out / "surface.bits").write_bytes(
            np.packbits(np.ascontiguousarray(surface_mask).ravel(), bitorder="little").tobytes()
        )
        manifest["surfaceMask"] = {
            "file": "surface.bits",
            "samples": n,
            "spacingM": float(surface_mask_spacing_m),
            "source": surface_mask_source,
        }
    (out / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
    return manifest

