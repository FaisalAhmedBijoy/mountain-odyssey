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
    cell_slope_deg,
    cell_to_world,
    detail_noise,
    engine_heights,
    find_summit,
    latlon_bounds,
    place_camps,
    resample_to_metric,
    route_max_slope,
    synthetic_heightmap,
    upsample,
    validate_camps,
    walkable_map,
    write_terrain,
)

TEST_PEAK_SPEC = GridSpec(0.0, 0.0, tiles=4, tile_cells=256, spacing_m=2.0)

# Defaults for the "campPlacement" block of a bake config. routeMaxSlopeDeg must equal
# GAME_CONFIG.movement.maxWalkSlopeDeg in the engine (the contract test checks the value
# written to manifest.json). maxWalkSlopeDeg is the stricter limit for camp placement and
# spawn neighbourhoods, so players never spawn near the engine's slide threshold.
CAMP_PLACEMENT_DEFAULTS = {
    "maxWalkSlopeDeg": 30.0,
    "routeMaxSlopeDeg": 33.0,
    "analysisSpacingM": 8.0,
    "toleranceM": 100.0,
    "spawnRadiusM": 6.0,
}


def print_route_slopes(routes: list[dict], cell_slope: np.ndarray, spec: GridSpec, limit: float) -> None:
    for route in routes:
        worst, x, z = route_max_slope(route["points"], cell_slope, spec.spacing_m, spec.origin)
        print(f"  route {route['from']} -> {route['to']}: max slope {worst:.2f} deg (limit {limit:g}) "
              f"at x={x:.0f}, z={z:.0f}", flush=True)


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
    route_limit = CAMP_PLACEMENT_DEFAULTS["routeMaxSlopeDeg"]
    he = engine_heights(h)  # judge routes on the heights the engine will decode
    cell_slope = cell_slope_deg(he, spec.spacing_m)
    routes = build_routes(he, spec.spacing_m, spec.origin, wm, walk_cells, max_slope_deg=route_limit,
                          cell_slope=cell_slope)
    print_route_slopes(routes, cell_slope, spec, route_limit)
    camps = [
        {"id": camp_id, "name": name, "position": cell_to_world(rc, spec.origin, spec.spacing_m, h)}
        for camp_id, name, rc in camp_cells
    ]
    return write_terrain(out, "test-peak", h, spec.spacing_m, spec.tile_cells, spec.origin, camps,
                         "Synthetic test terrain", backdrop_spacing_m=backdrop_spacing_m, routes=routes,
                         route_max_slope_deg=route_limit)


def check_dem_coverage(requested: tuple[float, float, float, float],
                       available: tuple[float, float, float, float]) -> None:
    """Raise ValueError unless the requested (west, south, east, north) bounds lie fully
    inside the dataset's bounds. A partial read would be cropped (or edge-replicated) and
    mis-registered, so the bake refuses it instead."""
    w, s, e, n = requested
    aw, as_, ae, an = available
    if w >= aw and s >= as_ and e <= ae and n <= an:
        return
    raise ValueError(
        f"DEM window W {w:.4f} S {s:.4f} E {e:.4f} N {n:.4f} (grid plus margin) is not fully inside "
        f"the DEM, which covers W {aw:.4f} S {as_:.4f} E {ae:.4f} N {an:.4f}. Move centerLat/centerLon "
        f"so the window fits the tile, or mosaic neighbouring DEM tiles."
    )


def load_dem(url: str, spec: GridSpec):
    import rasterio
    from rasterio.windows import Window, from_bounds

    west, south, east, north = latlon_bounds(spec)
    with rasterio.Env(GDAL_DISABLE_READDIR_ON_OPEN="EMPTY_DIR", AWS_NO_SIGN_REQUEST="YES"):
        with rasterio.open(url) as src:
            b = src.bounds
            check_dem_coverage((west, south, east, north), (b.left, b.bottom, b.right, b.top))
            window = from_bounds(west, south, east, north, transform=src.transform)
            window = window.round_offsets().round_lengths()
            if window.intersection(Window(0, 0, src.width, src.height)) != window:
                # bounds fit but pixel rounding reaches past the edge: still a partial read
                raise ValueError(f"DEM window {window} rounds past the {src.width}x{src.height} DEM; "
                                 "move centerLat/centerLon away from the tile edge.")
            dem = src.read(1, window=window).astype(np.float32)
            t = src.window_transform(window)
    west_c = t.c + t.a / 2
    north_c = t.f + t.e / 2
    east_c = west_c + (dem.shape[1] - 1) * t.a
    south_c = north_c + (dem.shape[0] - 1) * t.e
    return dem, (west_c, south_c, east_c, north_c)


def walk_targets(camp_cfgs: list[dict], cells: list[tuple[int, int]], summit: tuple[int, int],
                 summit_walkable: bool) -> list[tuple[str, tuple[int, int]]]:
    """Camps that must be reached on foot, in route order.

    On mountains climbed to the top (Mera), the summit is reached by climbing (M2) and
    is exempt. With `summitWalkable` (e.g. Keokradong) it must be walk-connected too,
    and gets a route from the last camp.
    """
    targets = [(c["id"], rc) for c, rc in zip(camp_cfgs, cells)]
    if summit_walkable:
        targets.append(("summit", summit))
    return targets


def summit_walkable(cfg: dict) -> bool:
    """`summitWalkable` from a bake config: False when absent, else it must be a JSON boolean."""
    value = cfg.get("summitWalkable", False)
    if not isinstance(value, bool):
        raise ValueError(f"summitWalkable must be true or false, got {value!r}")
    return value


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
    walk_cells = walk_targets(cfg["camps"], cells, summit, summit_walkable(cfg))
    validate_camps(h, spec.spacing_m, walk_cells, walk_map=wm, **walk)
    route_limit = float(opts["routeMaxSlopeDeg"])
    print(f"Finding walkable routes between camps (full-res slope < {route_limit:g} deg) ...", flush=True)
    he = engine_heights(h)  # judge routes on the heights the engine will decode
    cell_slope = cell_slope_deg(he, spec.spacing_m)
    routes = build_routes(he, spec.spacing_m, spec.origin, wm, walk_cells, max_slope_deg=route_limit,
                          cell_slope=cell_slope)
    del he
    print_route_slopes(routes, cell_slope, spec, route_limit)
    camps = [
        {"id": c["id"], "name": c["name"], "position": cell_to_world(rc, spec.origin, spec.spacing_m, h)}
        for c, rc in zip(cfg["camps"], cells)
    ]
    camps.append({"id": "summit", "name": "Summit", "position": cell_to_world(summit, spec.origin, spec.spacing_m, h)})
    return write_terrain(out, cfg["id"], h, spec.spacing_m, spec.tile_cells, spec.origin, camps,
                         cfg["attribution"], cfg["backdropSpacingM"], routes=routes,
                         route_max_slope_deg=route_limit)


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
