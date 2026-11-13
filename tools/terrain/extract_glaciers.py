#!/usr/bin/env python3
"""Extract natural=glacier polygons near a mountain from an OSM extract into GeoJSON.

Run once per mountain; the GeoJSON is committed and the bake reads only that file.

  .venv/bin/python tools/terrain/extract_glaciers.py --pbf nepal-261112.osm.pbf \\
      --config tools/terrain/mera-peak.config.json \\
      --source "Geofabrik nepal-261112.osm.pbf" \\
      --out tools/terrain/data/mera-peak-glaciers.geojson
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import osmium

from terrain_lib import GridSpec, latlon_bounds

LICENSE = "ODbL 1.0, © OpenStreetMap contributors"


def _ring(nodes) -> list[list[float]]:
    return [[round(n.lon, 6), round(n.lat, 6)] for n in nodes]


def _intersects(ring: list[list[float]], bounds: tuple[float, float, float, float]) -> bool:
    west, south, east, north = bounds
    lons = [p[0] for p in ring]
    lats = [p[1] for p in ring]
    return min(lons) <= east and max(lons) >= west and min(lats) <= north and max(lats) >= south


class _Glaciers(osmium.SimpleHandler):
    def __init__(self, bounds: tuple[float, float, float, float]):
        super().__init__()
        self.bounds = bounds
        self.features: list[dict] = []

    def area(self, a):
        if a.tags.get("natural") != "glacier":
            return
        osm_id = f"{'way' if a.from_way() else 'relation'}/{a.orig_id()}"
        for outer in a.outer_rings():
            ring = _ring(outer)
            if len(ring) < 4 or not _intersects(ring, self.bounds):
                continue
            holes = [_ring(inner) for inner in a.inner_rings(outer)]
            self.features.append({
                "type": "Feature",
                "properties": {"osm": osm_id},
                "geometry": {"type": "Polygon", "coordinates": [ring, *holes]},
            })


def extract_glaciers(pbf_path: str, bounds: tuple[float, float, float, float]) -> list[dict]:
    """Glacier polygons (outer ring first, then holes) whose bounding box meets bounds."""
    handler = _Glaciers(bounds)
    handler.apply_file(pbf_path, locations=True)
    return sorted(handler.features, key=lambda f: f["properties"]["osm"])


def main(argv: list[str]) -> int:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--pbf", required=True)
    p.add_argument("--config", required=True, help="mountain bake config (for the terrain square)")
    p.add_argument("--source", required=True, help='e.g. "Geofabrik nepal-261112.osm.pbf"')
    p.add_argument("--out", required=True)
    args = p.parse_args(argv)
    cfg = json.loads(Path(args.config).read_text())
    spec = GridSpec(cfg["centerLat"], cfg["centerLon"], cfg["tiles"], cfg["tileCells"], cfg["spacingM"])
    features = extract_glaciers(args.pbf, latlon_bounds(spec, margin_m=1000.0))
    out = {"type": "FeatureCollection", "source": args.source, "license": LICENSE, "features": features}
    Path(args.out).parent.mkdir(parents=True, exist_ok=True)
    Path(args.out).write_text(json.dumps(out, separators=(",", ":")) + "\n")
    print(f"Wrote {len(features)} glacier polygons to {args.out}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
