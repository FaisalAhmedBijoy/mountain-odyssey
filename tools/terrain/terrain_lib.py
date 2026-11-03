"""Pure helpers for the Mountain Odyssey terrain pipeline (spec section 6.5).

World axes: x = east, z = south, y = up, all in metres. Grid sample (row r, col c)
sits at x = origin + c * spacing, z = origin + r * spacing. Row 0 is the north edge.
"""
from __future__ import annotations

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


def downsample(h: np.ndarray, step: int) -> np.ndarray:
    return np.ascontiguousarray(h[::step, ::step])


def slope_deg(h: np.ndarray, spacing_m: float) -> np.ndarray:
    gz, gx = np.gradient(np.asarray(h, dtype=np.float64), spacing_m)
    return np.degrees(np.arctan(np.hypot(gx, gz)))


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


def find_camp(
    h: np.ndarray,
    spacing_m: float,
    summit_rc: tuple[int, int],
    bearing_deg: float,
    target_elev_m: float,
    search_radius_m: float = 150.0,
    margin_cells: int = 8,
) -> tuple[int, int]:
    """Walk from the summit along a compass bearing (0 = north, 90 = east) until the
    terrain drops to target_elev_m, then pick the flattest nearby cell."""
    n = h.shape[0]
    dr = -math.cos(math.radians(bearing_deg))
    dc = math.sin(math.radians(bearing_deg))
    r, c = float(summit_rc[0]), float(summit_rc[1])
    while True:
        nr, nc = r + dr, c + dc
        inside = margin_cells <= nr < n - margin_cells and margin_cells <= nc < n - margin_cells
        if not inside:
            break
        r, c = nr, nc
        if h[int(round(r)), int(round(c))] <= target_elev_m:
            break
    ri, ci = int(round(r)), int(round(c))
    rad = max(1, int(search_radius_m / spacing_m))
    r_lo, r_hi = max(0, ri - rad), min(n, ri + rad + 1)
    c_lo, c_hi = max(0, ci - rad), min(n, ci + rad + 1)
    window = h[r_lo:r_hi, c_lo:c_hi]
    score = slope_deg(window, spacing_m) + np.abs(window - target_elev_m) / 20.0
    rr, cc = np.mgrid[r_lo:r_hi, c_lo:c_hi]
    score[np.hypot(rr - ri, cc - ci) > rad] = np.inf
    br, bc = np.unravel_index(int(np.argmin(score)), score.shape)
    return int(r_lo + br), int(c_lo + bc)


def cell_to_world(rc: tuple[int, int], origin_m: float, spacing_m: float, h: np.ndarray) -> list[float]:
    r, c = rc
    return [
        round(origin_m + c * spacing_m, 2),
        round(float(h[r, c]), 2),
        round(origin_m + r * spacing_m, 2),
    ]


def synthetic_heightmap(samples: int, spacing_m: float) -> np.ndarray:
    """Test mountain: 5000 m plain, a ~19 degree cone rising 240 m within 700 m of
    the centre, and an 8 m cliff band at radius 300 m."""
    half = (samples - 1) * spacing_m / 2.0
    coords = np.arange(samples) * spacing_m - half
    x, z = np.meshgrid(coords, coords)
    r = np.hypot(x, z)
    cone = np.clip(1.0 - r / 700.0, 0.0, 1.0) * 240.0
    cliff = 8.0 * np.clip((300.0 - r) / 1.0 + 0.5, 0.0, 1.0)
    return (5000.0 + cone + cliff).astype(np.float32)


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
) -> dict:
    out = Path(out_dir)
    tiles_dir = out / "tiles"
    tiles_dir.mkdir(parents=True, exist_ok=True)
    min_h = float(math.floor(float(h.min()))) - 1.0
    max_h = float(math.ceil(float(h.max()))) + 1.0
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
    (out / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
    return manifest
