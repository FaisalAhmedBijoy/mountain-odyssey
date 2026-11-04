#!/usr/bin/env python3
"""Bake Mountain Odyssey terrain tiles.

  python3 tools/terrain/bake.py --synthetic --out public/terrain/test-peak
  python3 tools/terrain/bake.py --config tools/terrain/mera-peak.config.json --out public/terrain/mera-peak
"""
from __future__ import annotations

import argparse
import json
import sys

import numpy as np

from terrain_lib import (
    CampPlacementError,
    GridSpec,
    build_routes,
    cell_to_world,
    detail_noise,
    find_summit,
    latlon_bounds,
    place_camps,
    resample_to_metric,
    synthetic_heightmap,
    upsample,
    validate_camps,
    walkable_map,
    write_terrain,
)

TEST_PEAK_SPEC = GridSpec(0.0, 0.0, tiles=4, tile_cells=256, spacing_m=2.0)

# Defaults for the "campPlacement" block of a bake config. maxWalkSlopeDeg must match
# GAME_CONFIG.movement.maxWalkSlopeDeg in the engine.
CAMP_PLACEMENT_DEFAULTS = {"maxWalkSlopeDeg": 30.0, "analysisSpacingM": 8.0, "toleranceM": 100.0, "spawnRadiusM": 6.0}


def synthetic_terrain(spec: GridSpec) -> tuple[np.ndarray, list[tuple[str, str, tuple[int, int]]]]:
    """Synthetic heightmap plus (id, name, cell) for Khare (x=0, z=800) and High Camp
    (x=0, z=0), snapped to the grid."""
    h = synthetic_heightmap(spec.samples, spec.spacing_m)

    def cell(x: float, z: float) -> tuple[int, int]:
        return int(round((z - spec.origin) / spec.spacing_m)), int(round((x - spec.origin) / spec.spacing_m))

    return h, [("khare", "Khare", cell(0.0, 800.0)), ("high-camp", "High Camp", cell(0.0, 0.0))]


def bake_synthetic(out: str, spec: GridSpec = TEST_PEAK_SPEC, backdrop_spacing_m: float = 64.0,
                   validate: bool = True) -> dict:
    h, camp_cells = synthetic_terrain(spec)
    slope_limit = CAMP_PLACEMENT_DEFAULTS["maxWalkSlopeDeg"]
    wm = walkable_map(h, spec.spacing_m, slope_limit, CAMP_PLACEMENT_DEFAULTS["analysisSpacingM"])
    walk_cells = [(camp_id, rc) for camp_id, _, rc in camp_cells]
    if validate:
        validate_camps(h, spec.spacing_m, walk_cells, walk_map=wm)
    routes = build_routes(h, spec.spacing_m, spec.origin, wm, walk_cells, max_slope_deg=slope_limit)
    camps = [
        {"id": camp_id, "name": name, "position": cell_to_world(rc, spec.origin, spec.spacing_m, h)}
        for camp_id, name, rc in camp_cells
    ]
    return write_terrain(out, "test-peak", h, spec.spacing_m, spec.tile_cells, spec.origin, camps,
                         "Synthetic test terrain", backdrop_spacing_m=backdrop_spacing_m, routes=routes)


def load_dem(url: str, spec: GridSpec):
    import rasterio
    from rasterio.windows import from_bounds

    west, south, east, north = latlon_bounds(spec)
    with rasterio.Env(GDAL_DISABLE_READDIR_ON_OPEN="EMPTY_DIR", AWS_NO_SIGN_REQUEST="YES"):
        with rasterio.open(url) as src:
            window = from_bounds(west, south, east, north, transform=src.transform)
            window = window.round_offsets().round_lengths()
            dem = src.read(1, window=window).astype(np.float32)
            t = src.window_transform(window)
    west_c = t.c + t.a / 2
    north_c = t.f + t.e / 2
    east_c = west_c + (dem.shape[1] - 1) * t.a
    south_c = north_c + (dem.shape[0] - 1) * t.e
    return dem, (west_c, south_c, east_c, north_c)


def bake_dem(config_path: str, out: str) -> dict:
    with open(config_path) as f:
        cfg = json.load(f)
    spec = GridSpec(cfg["centerLat"], cfg["centerLon"], cfg["tiles"], cfg["tileCells"], cfg["spacingM"])
    print(f"Reading DEM window for {cfg['id']} ...", flush=True)
    dem, bounds = load_dem(cfg["demUrl"], spec)
    coarse = resample_to_metric(dem, bounds, spec, cfg["coarseSpacingM"])
    print(f"Upsampling to {spec.samples}x{spec.samples} at {spec.spacing_m} m ...", flush=True)
    h = upsample(coarse, spec.samples)
    h += detail_noise(spec.samples, spec.spacing_m, cfg["noiseSeed"])
    summit = find_summit(h, spacing_m=spec.spacing_m, radius_m=cfg.get("summitSearchRadiusM"))
    opts = {**CAMP_PLACEMENT_DEFAULTS, **cfg.get("campPlacement", {})}
    walk = {
        "max_slope_deg": opts["maxWalkSlopeDeg"],
        "analysis_spacing_m": opts["analysisSpacingM"],
        "spawn_radius_m": opts["spawnRadiusM"],
    }
    print("Placing camps on connected walkable ground ...", flush=True)
    wm = walkable_map(h, spec.spacing_m, walk["max_slope_deg"], walk["analysis_spacing_m"])
    cells = place_camps(h, spec.spacing_m, summit, cfg["camps"], tolerance_m=opts["toleranceM"], walk_map=wm, **walk)
    # The summit camp is reached by climbing (M2), so it is not part of the walkable check.
    walk_cells = [(c["id"], rc) for c, rc in zip(cfg["camps"], cells)]
    validate_camps(h, spec.spacing_m, walk_cells, walk_map=wm, **walk)
    print("Finding walkable routes between camps ...", flush=True)
    routes = build_routes(h, spec.spacing_m, spec.origin, wm, walk_cells, max_slope_deg=walk["max_slope_deg"])
    camps = [
        {"id": c["id"], "name": c["name"], "position": cell_to_world(rc, spec.origin, spec.spacing_m, h)}
        for c, rc in zip(cfg["camps"], cells)
    ]
    camps.append({"id": "summit", "name": "Summit", "position": cell_to_world(summit, spec.origin, spec.spacing_m, h)})
    return write_terrain(out, cfg["id"], h, spec.spacing_m, spec.tile_cells, spec.origin, camps,
                         cfg["attribution"], cfg["backdropSpacingM"], routes=routes)


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    source = parser.add_mutually_exclusive_group(required=True)
    source.add_argument("--synthetic", action="store_true", help="bake the synthetic test-peak")
    source.add_argument("--config", help="path to a mountain bake config JSON")
    parser.add_argument("--out", required=True, help="output directory")
    args = parser.parse_args(argv)
    try:
        manifest = bake_synthetic(args.out) if args.synthetic else bake_dem(args.config, args.out)
    except CampPlacementError as err:
        print(f"Bake validation failed: {err}", file=sys.stderr)
        return 1
    print(f"Wrote {manifest['tilesX'] * manifest['tilesZ']} tiles to {args.out}")
    for camp in manifest["camps"]:
        x, y, z = camp["position"]
        print(f"  {camp['id']:<10} x={x:>9.1f}  z={z:>9.1f}  elevation={y:>7.1f} m")
    for route in manifest.get("routes", []):
        print(f"  route {route['from']} -> {route['to']}: {route['lengthM']:.0f} m, "
              f"{len(route['points'])} points, {len(route['markers'])} markers")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
