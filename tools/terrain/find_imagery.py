#!/usr/bin/env python3
"""List cloud-free Sentinel-2 L2A scenes that fully cover a mountain's bake window.

  python tools/terrain/find_imagery.py --config tools/terrain/patharia.config.json \
      --from 2023-11-01 --to 2024-03-31

Prints, best first: scene id, date, cloud-or-shadow fraction inside the window, empty
fraction, sun elevation and the TCI url to paste into the config's "imagery.url"
(prefix it with /vsicurl/). Prefer 0 empty, low cloud, high sun elevation.
"""
from __future__ import annotations

import argparse
import json
import sys
import urllib.request

import numpy as np

from terrain_lib import GridSpec, latlon_bounds

STAC_URL = "https://earth-search.aws.element84.com/v1/search"
BAD_SCL = (3, 8, 9, 10)  # cloud shadow, cloud medium, cloud high, cirrus


def search(bounds, start: str, end: str, max_cloud: float) -> list[dict]:
    body = {
        "collections": ["sentinel-2-l2a"],
        "bbox": list(bounds),
        "datetime": f"{start}T00:00:00Z/{end}T23:59:59Z",
        "query": {"eo:cloud_cover": {"lt": max_cloud}},
        "limit": 100,
    }
    req = urllib.request.Request(STAC_URL, json.dumps(body).encode(), {"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=60) as res:
        return json.load(res)["features"]


def window_stats(scl_url: str, bounds) -> tuple[float, float] | None:
    """(empty fraction, cloud-or-shadow fraction) of the window, or None if the scene
    does not contain it."""
    import rasterio
    from rasterio.enums import Resampling
    from rasterio.vrt import WarpedVRT
    from rasterio.windows import from_bounds

    west, south, east, north = bounds
    with rasterio.open("/vsicurl/" + scl_url) as src:
        with WarpedVRT(src, crs="EPSG:4326", resampling=Resampling.nearest) as vrt:
            b = vrt.bounds
            if not (west >= b.left and south >= b.bottom and east <= b.right and north <= b.top):
                return None
            window = from_bounds(west, south, east, north, transform=vrt.transform)
            scl = vrt.read(1, window=window.round_offsets().round_lengths(), out_shape=(256, 256))
    return float((scl == 0).mean()), float(np.isin(scl, BAD_SCL).mean())


def main(argv: list[str]) -> int:
    import rasterio

    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--config", required=True)
    parser.add_argument("--from", dest="start", required=True, help="YYYY-MM-DD")
    parser.add_argument("--to", dest="end", required=True, help="YYYY-MM-DD")
    parser.add_argument("--max-cloud", type=float, default=10.0, help="whole-scene cloud cover limit, percent")
    parser.add_argument("--check", type=int, default=12, help="how many scenes to measure")
    args = parser.parse_args(argv)
    with open(args.config) as f:
        cfg = json.load(f)
    spec = GridSpec(cfg["centerLat"], cfg["centerLon"], cfg["tiles"], cfg["tileCells"], cfg["spacingM"])
    bounds = latlon_bounds(spec)
    scenes = sorted(search(bounds, args.start, args.end, args.max_cloud),
                    key=lambda s: s["properties"]["eo:cloud_cover"])
    print(f"{len(scenes)} scenes under {args.max_cloud:g}% cloud; measuring the best {args.check}")
    rows = []
    with rasterio.Env(GDAL_DISABLE_READDIR_ON_OPEN="EMPTY_DIR", AWS_NO_SIGN_REQUEST="YES"):
        for scene in scenes[: args.check]:
            stats = window_stats(scene["assets"]["scl"]["href"], bounds)
            if stats is None:
                continue
            p = scene["properties"]
            rows.append((stats[0], stats[1], -p.get("view:sun_elevation", 0.0), scene["id"],
                         p["datetime"][:10], scene["assets"]["visual"]["href"]))
    for empty, bad, neg_sun, scene_id, date, url in sorted(rows):
        print(f"{scene_id}  {date}  cloud/shadow {bad:.2%}  empty {empty:.2%}  sun {-neg_sun:.0f} deg\n    {url}")
    return 0 if rows else 1


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
