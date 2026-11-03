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
    GridSpec,
    cell_to_world,
    detail_noise,
    find_camp,
    find_summit,
    latlon_bounds,
    resample_to_metric,
    synthetic_heightmap,
    upsample,
    write_terrain,
)


def bake_synthetic(out: str) -> dict:
    spec = GridSpec(0.0, 0.0, tiles=4, tile_cells=256, spacing_m=2.0)
    h = synthetic_heightmap(spec.samples, spec.spacing_m)

    def camp(camp_id: str, name: str, x: float, z: float) -> dict:
        rc = (int(round((z - spec.origin) / spec.spacing_m)), int(round((x - spec.origin) / spec.spacing_m)))
        return {"id": camp_id, "name": name, "position": cell_to_world(rc, spec.origin, spec.spacing_m, h)}

    camps = [camp("khare", "Khare", 0.0, 800.0), camp("high-camp", "High Camp", 0.0, 0.0)]
    return write_terrain(out, "test-peak", h, spec.spacing_m, spec.tile_cells, spec.origin, camps,
                         "Synthetic test terrain", backdrop_spacing_m=64.0)


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
    summit = find_summit(h, spec.spacing_m, cfg.get("summitSearchRadiusM"))
    camps = []
    for c in cfg["camps"]:
        rc = find_camp(h, spec.spacing_m, summit, c["bearingFromSummitDeg"], c["targetElevationM"])
        camps.append({"id": c["id"], "name": c["name"], "position": cell_to_world(rc, spec.origin, spec.spacing_m, h)})
    camps.append({"id": "summit", "name": "Summit", "position": cell_to_world(summit, spec.origin, spec.spacing_m, h)})
    return write_terrain(out, cfg["id"], h, spec.spacing_m, spec.tile_cells, spec.origin, camps,
                         cfg["attribution"], cfg["backdropSpacingM"])


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    source = parser.add_mutually_exclusive_group(required=True)
    source.add_argument("--synthetic", action="store_true", help="bake the synthetic test-peak")
    source.add_argument("--config", help="path to a mountain bake config JSON")
    parser.add_argument("--out", required=True, help="output directory")
    args = parser.parse_args(argv)
    manifest = bake_synthetic(args.out) if args.synthetic else bake_dem(args.config, args.out)
    print(f"Wrote {manifest['tilesX'] * manifest['tilesZ']} tiles to {args.out}")
    for camp in manifest["camps"]:
        x, y, z = camp["position"]
        print(f"  {camp['id']:<10} x={x:>9.1f}  z={z:>9.1f}  elevation={y:>7.1f} m")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
