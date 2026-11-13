#!/usr/bin/env python3
"""Bake Mountain Odyssey terrain tiles.

  python3 tools/terrain/bake.py --synthetic --out public/terrain/test-peak
  python3 tools/terrain/bake.py --config tools/terrain/mera-peak.config.json --out public/terrain/mera-peak
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

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
    grade_imagery,
    imagery_empty_fraction,
    latlon_bounds,
    place_camps,
    project_polygons,
    rasterise_polygons,
    resample_rgb_to_metric,
    resample_to_metric,
    route_max_slope,
    synthetic_glacier_polygons,
    synthetic_heightmap,
    synthetic_imagery,
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


SYNTHETIC_MASK_SPACING_M = 32.0


def bake_glacier_mask(cfg: dict, spec: GridSpec, config_dir: Path) -> tuple[np.ndarray | None, float, str, str]:
    """(mask, spacing, source, attribution) from the config's "osm" block, or (None, 0.0, "", "")."""
    block = cfg.get("osm")
    if block is None:
        return None, 0.0, "", ""
    for key in ("glaciers", "attribution"):
        if not isinstance(block.get(key), str) or not block[key]:
            raise ValueError(f"osm.{key} must be a non-empty string")
    spacing = float(block.get("maskSpacingM", 8))
    if spacing <= 0:
        raise ValueError(f"osm.maskSpacingM {spacing:g} must be positive")
    cells = spec.size_m / spacing
    if abs(cells - round(cells)) > 1e-9:
        raise ValueError(f"osm.maskSpacingM {spacing:g} must divide the terrain size {spec.size_m:g} m")
    data = json.loads((config_dir / block["glaciers"]).read_text())
    polygons = [f["geometry"]["coordinates"] for f in data["features"] if f["geometry"]["type"] == "Polygon"]
    samples = int(round(cells)) + 1
    mask = rasterise_polygons(project_polygons(polygons, spec.center_lat, spec.center_lon),
                              samples, spec.origin, spacing)
    area_km2 = float(mask.sum()) * spacing * spacing / 1e6
    share = float(mask.mean()) * 100
    print(f"Glacier mask: {len(polygons)} polygons, {area_km2:.1f} km2 ({share:.1f} % of the square)", flush=True)
    if mask.sum() == 0:
        print("WARNING: the glacier mask is empty; check osm.glaciers and the config centre.", flush=True)
    return mask, spacing, str(data.get("source", "")), block["attribution"]


def bake_synthetic(out: str, spec: GridSpec = TEST_PEAK_SPEC, backdrop_spacing_m: float = 64.0,
                   validate: bool = True, imagery_size_px: int = 256) -> dict:
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
    n_mask = int(round(spec.size_m / SYNTHETIC_MASK_SPACING_M)) + 1
    mask = rasterise_polygons(synthetic_glacier_polygons(), n_mask, spec.origin, SYNTHETIC_MASK_SPACING_M)
    return write_terrain(out, "test-peak", h, spec.spacing_m, spec.tile_cells, spec.origin, camps,
                         "Synthetic test terrain", backdrop_spacing_m=backdrop_spacing_m, routes=routes,
                         route_max_slope_deg=route_limit,
                         imagery=synthetic_imagery(h, spec.spacing_m, spec.origin, imagery_size_px),
                         surface_mask=mask, surface_mask_spacing_m=SYNTHETIC_MASK_SPACING_M,
                         surface_mask_source="synthetic disc")


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


def load_imagery(url: str, spec: GridSpec):
    """Read the true-colour window for the grid from a Sentinel-2 TCI GeoTIFF (UTM), warped to
    lat/lon. Returns (rgb rows x cols x 3 uint8, bounds of its outer pixel centres)."""
    import rasterio
    from rasterio.enums import Resampling
    from rasterio.vrt import WarpedVRT
    from rasterio.windows import from_bounds

    west, south, east, north = latlon_bounds(spec)
    with rasterio.Env(GDAL_DISABLE_READDIR_ON_OPEN="EMPTY_DIR", AWS_NO_SIGN_REQUEST="YES"):
        with rasterio.open(url) as src:
            with WarpedVRT(src, crs="EPSG:4326", resampling=Resampling.bilinear) as vrt:
                b = vrt.bounds
                if not (west >= b.left and south >= b.bottom and east <= b.right and north <= b.top):
                    raise ValueError(
                        f"Imagery window W {west:.4f} S {south:.4f} E {east:.4f} N {north:.4f} is not inside "
                        f"the scene, which covers W {b.left:.4f} S {b.bottom:.4f} E {b.right:.4f} N {b.top:.4f}. "
                        "Pick another scene with tools/terrain/find_imagery.py."
                    )
                window = from_bounds(west, south, east, north, transform=vrt.transform)
                window = window.round_offsets().round_lengths()
                data = vrt.read([1, 2, 3], window=window)
                t = vrt.window_transform(window)
    rgb = np.moveaxis(data, 0, -1)
    west_c = t.c + t.a / 2
    north_c = t.f + t.e / 2
    east_c = west_c + (rgb.shape[1] - 1) * t.a
    south_c = north_c + (rgb.shape[0] - 1) * t.e
    return rgb, (west_c, south_c, east_c, north_c)


IMAGERY_MAX_EMPTY_FRACTION = 0.005


def bake_imagery(cfg: dict, spec: GridSpec) -> tuple[np.ndarray | None, str]:
    """(graded image or None, attribution to append or "") for a bake config."""
    block = cfg.get("imagery")
    if block is None:
        return None, ""
    for key in ("url", "attribution"):
        if not isinstance(block.get(key), str) or not block[key]:
            raise ValueError(f"imagery.{key} must be a non-empty string")
    size_px = int(block.get("sizePx", 2048))
    print(f"Reading imagery window for {cfg['id']} ...", flush=True)
    rgb, bounds = load_imagery(block["url"], spec)
    empty = imagery_empty_fraction(rgb)
    if empty > IMAGERY_MAX_EMPTY_FRACTION:
        raise ValueError(
            f"Imagery scene leaves {empty:.1%} of the window empty. "
            "Pick another scene with tools/terrain/find_imagery.py."
        )
    out = resample_rgb_to_metric(rgb, bounds, spec, size_px)
    return grade_imagery(out, **block.get("grade", {})), block["attribution"]


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


def summit_name(cfg: dict) -> str:
    """Display name of the appended summit camp: `summitName` or "Summit"."""
    value = cfg.get("summitName", "Summit")
    if not isinstance(value, str):
        raise ValueError(f"summitName must be a string, got {value!r}")
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
    camps.append({"id": "summit", "name": summit_name(cfg), "position": cell_to_world(summit, spec.origin, spec.spacing_m, h)})
    imagery, imagery_attribution = bake_imagery(cfg, spec)
    attribution = cfg["attribution"] + (f" · {imagery_attribution}" if imagery_attribution else "")
    glacier, glacier_spacing, glacier_source, osm_attribution = bake_glacier_mask(cfg, spec, Path(config_path).parent)
    if osm_attribution:
        attribution += f" · {osm_attribution}"
    return write_terrain(out, cfg["id"], h, spec.spacing_m, spec.tile_cells, spec.origin, camps,
                         attribution, cfg["backdropSpacingM"], routes=routes,
                         route_max_slope_deg=route_limit, imagery=imagery,
                         surface_mask=glacier, surface_mask_spacing_m=glacier_spacing or None,
                         surface_mask_source=glacier_source)


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
