# OSM Glacier Surfaces Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** On a mountain with a baked glacier mask, snow and ice appear only on real OpenStreetMap glaciers. Climb gating, terrain colour and the map follow the mask, and mountains without a mask behave exactly as today.

**Architecture:**
- **One-time extract.** A tool script reads the Geofabrik Nepal extract once and writes the glacier polygons near Mera to a small GeoJSON, which is committed to the repo.
- **Bake.** The bake projects those polygons onto the terrain grid and rasterises them into `surface.u8` (1 = glacier). It records the mask in the manifest.
- **Engine.** It loads the mask once. It passes the mask to:
  - `TerrainSampler`, for climb gating in `Player`;
  - each tile's mesh build, as a crop;
  - the backdrop and the map, resampled to their grid.

  `classifySurface` uses the mask when there is one, and `surfaceAt` otherwise.

**Tech Stack:** Python 3.9+ (numpy, pytest, `osmium` only for the one-time extract), TypeScript 5.9, Vitest, Three.js mesh worker, Playwright.

**Spec:** `docs/specs/specs/002-osm-glacier-surfaces.md`. Instruction: `docs/specs/instructions/002-osm-glacier-surfaces.md`.

## Global Constraints

- Work on branch `osm-glacier`, created from `dev`.
- Inside a glacier, ground is snow below `iceMinSlopeDeg` (25°) and ice from it. Ground at `rockMinSlopeDeg` (40°) or steeper is rock everywhere. Outside glaciers, ground is rock. Without a mask, `surfaceAt` is unchanged.
- Mask file: `surface.u8`, one byte per sample, row-major, row = z (north = row 0, matching the tiles), square, `samples = size / spacingM + 1`. Mera uses `maskSpacingM: 8` (1537 × 1537). Synthetic test-peak uses 32 m.
- World axes: x = east, z = south. Lon/lat → metric uses the DEM's transform:
  - `x = (lon − centerLon) × m_per_deg_lon(centerLat)`
  - `z = (centerLat − lat) × 111320`
- The attribution gains `" · © OpenStreetMap contributors"` only when a mask comes from OSM.
- `src/engine/**` never imports React. Every gameplay number lives in `GAME_CONFIG`. The surface thresholds stay in `GAME_CONFIG.surface`.
- Static files go through the existing loaders (`fetchWithRetry`). No leading `/`.
- CI must not download the 415 MB extract. The bake reads only the committed GeoJSON. `osmium` is not in `tools/terrain/requirements.txt`; it is in `tools/terrain/requirements-osm.txt`, and its test is skipped when `osmium` is missing.
- Python: run with `.venv/bin/python`. Tests: `.venv/bin/python -m pytest tools/terrain -q`.
- Run `npm run format` before every commit. Every commit passes `npm test` and `npm run typecheck`, and Python commits also pass the pytest suite.
- Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Keep `typescript@~5.9`.

## Decisions taken while planning (record in the spec in Task 7)

1. **The glacier GeoJSON is committed.** `tools/terrain/data/mera-peak-glaciers.geojson` is extracted once from `nepal-261112.osm.pbf` and kept under ODbL with attribution. This answers the spec's open question about CI downloads.
2. **Rasterising is a numpy scanline fill** (even-odd per polygon, then OR across polygons), not `rasterio.features`. It avoids GeoTIFF transform-orientation pitfalls and is easy to test.
3. **The backdrop and the map use the mask resampled to the backdrop grid** (`sampleMask`, nearest sample). Tiles get an exact crop (`cropMask`). The full mask is not structured-cloned into the worker on every backdrop rebuild.
4. **The synthetic test-peak mask is a 200 m disc around the mound** at x = +512, z = −512. It is asymmetric, so axis mix-ups fail the contract test.

## File map

| File | Status | Responsibility |
|---|---|---|
| `tools/terrain/extract_glaciers.py` (+ `test_extract_glaciers.py`) | create | OSM extract → glacier GeoJSON (one-time tool) |
| `tools/terrain/requirements-osm.txt` | create | `osmium` for the tool only |
| `tools/terrain/data/mera-peak-glaciers.geojson` | create (generated) | committed glacier polygons near Mera |
| `tools/terrain/terrain_lib.py` (+ test) | modify | `lonlat_to_xz`, `project_polygons`, `rasterise_polygons`, `synthetic_glacier_polygons`, `write_terrain(surface_mask=…)` |
| `tools/terrain/bake.py` (+ test) | modify | `bake_glacier_mask` from the config `osm` block; synthetic mask |
| `src/engine/world/__fixtures__/test-peak-mini/` | regenerate | gains `surface.u8` and `surfaceMask` |
| `src/engine/world/surfaceMask.ts` (+ test) | create | `SurfaceMask`, `glacierAt`, `cropMask`, `sampleMask` |
| `src/engine/world/surface.ts` (+ test) | modify | `surfaceWithMask`, `classifySurface` |
| `src/engine/world/terrainData.ts` (+ test) | modify | `surfaceMask` manifest field, `loadSurfaceMask` |
| `src/engine/world/terrainContract.test.ts` | modify | mask orientation from the Python fixture |
| `src/engine/world/palette.ts` (+ test) | modify | `terrainColor(…, onGlacier, …)` |
| `src/engine/world/gridGeometry.ts` (+ test) | modify | `glacier?: SurfaceMask` arg |
| `src/engine/world/mapImage.ts` (+ test) | modify | optional glacier mask on the backdrop grid |
| `src/engine/world/TerrainSampler.ts` (+ test) | modify | `setSurfaceMask`, `onGlacierAt` |
| `src/engine/world/ChunkManager.ts` (+ test) | modify | crops for tiles, sampled mask for the backdrop, `backdropGlacier` |
| `src/engine/player/Player.ts` | modify | `classifySurface` in `senseWall` |
| `src/engine/core/Game.ts` | modify | load the mask, wire it |
| `tools/terrain/mera-peak.config.json` | modify | `osm` block |
| docs: spec 002, design spec §6.5, `CLAUDE.md`, `CREDITS.md`, playtest checklist | modify | docs |

---

### Task 0: Branch

- [ ] **Step 1:** Create the branch from `dev` and commit the spec documents. Leave the unrelated `package-lock.json` change unstaged.

```bash
git checkout dev && git checkout -b osm-glacier
git add docs/specs/MAP.md docs/specs/instructions/002-osm-glacier-surfaces.md docs/specs/specs/002-osm-glacier-surfaces.md docs/superpowers/plans/2026-11-13-osm-glacier-surfaces.md
git commit -m "docs: spec and plan for OSM glacier surfaces

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 1: Glacier extract tool and the committed GeoJSON

**Files:**
- Create: `tools/terrain/extract_glaciers.py`
- Create: `tools/terrain/requirements-osm.txt`
- Create: `tools/terrain/test_extract_glaciers.py`
- Create (generated): `tools/terrain/data/mera-peak-glaciers.geojson`

**Interfaces:**
- Consumes: `GridSpec`, `latlon_bounds(spec, margin_m)` from `terrain_lib.py` (exist).
- Produces:
  - `extract_glaciers(pbf_path: str, bounds: tuple[float, float, float, float]) -> list[dict]` returns GeoJSON Feature dicts, sorted by `properties.osm`.
  - The GeoJSON file shape:
    ```json
    {"type": "FeatureCollection", "source": "...", "license": "...",
     "features": [{"type": "Feature", "properties": {"osm": "way/123"},
                   "geometry": {"type": "Polygon", "coordinates": [[[lon, lat], ...], ...]}}]}
    ```
    The first ring is the outer ring. Any further rings are holes.

- [ ] **Step 1: Install the tool dependency locally**

`tools/terrain/requirements-osm.txt`:

```
# Only for tools/terrain/extract_glaciers.py (one-time extraction). Not needed to bake.
osmium>=3.7
```

Run: `.venv/bin/pip install -r tools/terrain/requirements-osm.txt`

- [ ] **Step 2: Write the failing test**

`tools/terrain/test_extract_glaciers.py`:

```python
import pytest

osmium = pytest.importorskip("osmium")

from extract_glaciers import extract_glaciers  # noqa: E402

# Lon/lat around (0, 0). Way 1 is a glacier, way 2 is scree, way 3 is a glacier far away.
# Relation 100 is a glacier multipolygon: outer way 10, inner way 20.
OSM = """<?xml version='1.0' encoding='UTF-8'?>
<osm version="0.6" generator="test">
  <node id="1" lat="0.000" lon="0.000" version="1"/>
  <node id="2" lat="0.000" lon="0.002" version="1"/>
  <node id="3" lat="0.002" lon="0.002" version="1"/>
  <node id="4" lat="0.002" lon="0.000" version="1"/>
  <node id="5" lat="0.004" lon="0.004" version="1"/>
  <node id="6" lat="0.004" lon="0.005" version="1"/>
  <node id="7" lat="0.005" lon="0.005" version="1"/>
  <node id="31" lat="1.000" lon="1.000" version="1"/>
  <node id="32" lat="1.000" lon="1.002" version="1"/>
  <node id="33" lat="1.002" lon="1.002" version="1"/>
  <node id="11" lat="-0.006" lon="-0.006" version="1"/>
  <node id="12" lat="-0.006" lon="-0.002" version="1"/>
  <node id="13" lat="-0.002" lon="-0.002" version="1"/>
  <node id="14" lat="-0.002" lon="-0.006" version="1"/>
  <node id="21" lat="-0.005" lon="-0.005" version="1"/>
  <node id="22" lat="-0.005" lon="-0.003" version="1"/>
  <node id="23" lat="-0.003" lon="-0.003" version="1"/>
  <node id="24" lat="-0.003" lon="-0.005" version="1"/>
  <way id="1" version="1"><nd ref="1"/><nd ref="2"/><nd ref="3"/><nd ref="4"/><nd ref="1"/><tag k="natural" v="glacier"/></way>
  <way id="2" version="1"><nd ref="5"/><nd ref="6"/><nd ref="7"/><nd ref="5"/><tag k="natural" v="scree"/></way>
  <way id="3" version="1"><nd ref="31"/><nd ref="32"/><nd ref="33"/><nd ref="31"/><tag k="natural" v="glacier"/></way>
  <way id="10" version="1"><nd ref="11"/><nd ref="12"/><nd ref="13"/><nd ref="14"/><nd ref="11"/></way>
  <way id="20" version="1"><nd ref="21"/><nd ref="22"/><nd ref="23"/><nd ref="24"/><nd ref="21"/></way>
  <relation id="100" version="1">
    <member type="way" ref="10" role="outer"/>
    <member type="way" ref="20" role="inner"/>
    <tag k="type" v="multipolygon"/><tag k="natural" v="glacier"/>
  </relation>
</osm>
"""


def test_extracts_glacier_ways_and_multipolygons_inside_the_bounds(tmp_path):
    path = tmp_path / "t.osm"
    path.write_text(OSM)
    features = extract_glaciers(str(path), (-0.01, -0.01, 0.01, 0.01))
    by_id = {f["properties"]["osm"]: f["geometry"]["coordinates"] for f in features}
    assert sorted(by_id) == ["relation/100", "way/1"]
    assert len(by_id["way/1"]) == 1
    assert [0.002, 0.002] in by_id["way/1"][0]
    outer, inner = by_id["relation/100"]
    assert [-0.006, -0.006] in outer
    assert [-0.005, -0.005] in inner
```

- [ ] **Step 3: Run it to verify it fails**

Run: `.venv/bin/python -m pytest tools/terrain/test_extract_glaciers.py -q`
Expected: FAIL, `ModuleNotFoundError: No module named 'extract_glaciers'`.

- [ ] **Step 4: Implement the tool**

`tools/terrain/extract_glaciers.py`:

```python
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
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `.venv/bin/python -m pytest tools/terrain/test_extract_glaciers.py -q`
Expected: 1 passed.

- [ ] **Step 6: Generate the Mera GeoJSON**

The Nepal extract (`nepal-261112.osm.pbf`, 414,999,431 bytes) is already downloaded at:
`/private/tmp/claude-501/-Users-faisal-Documents-RND-mountain-odyssey/d6764bbe-3468-4457-a28e-6715f33f47f9/scratchpad/osm/data/nepal.osm.pbf`

If that file is missing, download `https://download.geofabrik.de/asia/nepal-261112.osm.pbf` to a scratch directory. Do not put it in the repo.

Run:

```bash
.venv/bin/python tools/terrain/extract_glaciers.py \
  --pbf /private/tmp/claude-501/-Users-faisal-Documents-RND-mountain-odyssey/d6764bbe-3468-4457-a28e-6715f33f47f9/scratchpad/osm/data/nepal.osm.pbf \
  --config tools/terrain/mera-peak.config.json \
  --source "Geofabrik nepal-261112.osm.pbf" \
  --out tools/terrain/data/mera-peak-glaciers.geojson
```

Expected:
- It prints `Wrote N glacier polygons`, with N roughly 30–45. An earlier survey found 30 glacier ways and 2 multipolygons inside the square, and the 1 km margin adds a few.
- The file is under 1 MB. Check with `ls -la tools/terrain/data/`.
- The run takes a few minutes.

- [ ] **Step 7: Run the full Python suite, format and commit**

```bash
.venv/bin/python -m pytest tools/terrain -q
git add tools/terrain/extract_glaciers.py tools/terrain/test_extract_glaciers.py tools/terrain/requirements-osm.txt tools/terrain/data/mera-peak-glaciers.geojson
git commit -m "feat(terrain): extract OSM glacier polygons for Mera

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

(`npm run format` does not touch Python or `.geojson`.)

---

### Task 2: Rasterise glaciers in the bake and write `surface.u8`

**Files:**
- Modify: `tools/terrain/terrain_lib.py`
- Modify: `tools/terrain/bake.py`
- Modify: `tools/terrain/test_terrain_lib.py`
- Modify: `tools/terrain/mera-peak.config.json`
- Regenerate: `src/engine/world/__fixtures__/test-peak-mini/`

**Interfaces:**
- Consumes: the GeoJSON format from Task 1; `GridSpec`, `M_PER_DEG_LAT`, `m_per_deg_lon` (exist).
- Produces:
  - `terrain_lib.lonlat_to_xz(lon, lat, center_lat, center_lon) -> tuple[float, float]`
  - `terrain_lib.project_polygons(polygons, center_lat, center_lon) -> list[list[list[tuple[float, float]]]]`
  - `terrain_lib.rasterise_polygons(polygons_xz, samples, origin_m, spacing_m) -> np.ndarray` (uint8, shape (samples, samples), row = z)
  - `terrain_lib.synthetic_glacier_polygons(center_xz=(512.0, -512.0), radius_m=200.0, segments=64)`
  - `write_terrain(..., surface_mask=None, surface_mask_spacing_m=None, surface_mask_source="")`
  - `bake.bake_glacier_mask(cfg, spec, config_dir) -> tuple[np.ndarray | None, float, str, str]` returning (mask, spacing, source, attribution)
  - The manifest field `"surfaceMask": {"file": "surface.u8", "samples": int, "spacingM": float, "source": str}`

- [ ] **Step 1: Write the failing tests**

Add to the import list of `tools/terrain/test_terrain_lib.py`: `lonlat_to_xz`, `project_polygons`, `rasterise_polygons` and `synthetic_glacier_polygons`. Then append:

```python
def test_lonlat_to_xz_matches_the_dem_transform():
    x, z = lonlat_to_xz(86.88, 27.71, 27.7, 86.87)
    assert x == pytest.approx(0.01 * 111320.0 * math.cos(math.radians(27.7)))
    assert z == pytest.approx(-0.01 * 111320.0)  # north of the centre is -z


def test_rasterise_fills_a_square_and_leaves_a_hole():
    # 11 x 11 samples, 10 m apart, origin -50: sample (r, c) sits at x = -50 + 10c, z = -50 + 10r.
    outer = [(-25.0, -25.0), (25.0, -25.0), (25.0, 25.0), (-25.0, 25.0), (-25.0, -25.0)]
    hole = [(-5.0, -5.0), (5.0, -5.0), (5.0, 5.0), (-5.0, 5.0), (-5.0, -5.0)]
    m = rasterise_polygons([[outer, hole]], samples=11, origin_m=-50.0, spacing_m=10.0)
    assert m.dtype == np.uint8 and m.shape == (11, 11)
    assert m[3, 3] == 1 and m[3, 7] == 1 and m[7, 3] == 1  # x, z = -20 / +20
    assert m[5, 5] == 0  # inside the hole
    assert m[1, 1] == 0  # outside
    assert int(m.sum()) == 25 - 1  # 5 x 5 samples inside the square, minus the hole sample


def test_rasterise_puts_north_in_row_zero():
    # A small polygon north-east of the centre (x > 0, z < 0).
    poly = [(10.0, -45.0), (45.0, -45.0), (45.0, -10.0), (10.0, -10.0)]
    m = rasterise_polygons([[poly]], samples=11, origin_m=-50.0, spacing_m=10.0)
    assert m[1, 9] == 1  # x = 40, z = -40
    assert m[9, 9] == 0 and m[1, 1] == 0


def test_overlapping_polygons_union_instead_of_cancelling():
    a = [(-20.0, -20.0), (20.0, -20.0), (20.0, 20.0), (-20.0, 20.0)]
    m = rasterise_polygons([[a], [a]], samples=11, origin_m=-50.0, spacing_m=10.0)
    assert m[5, 5] == 1


def test_project_polygons_keeps_rings_and_order():
    rings = project_polygons([[[[86.87, 27.7], [86.88, 27.7], [86.88, 27.71]]]], 27.7, 86.87)
    assert len(rings) == 1 and len(rings[0]) == 1 and len(rings[0][0]) == 3
    assert rings[0][0][0] == pytest.approx((0.0, 0.0))


def test_bake_synthetic_writes_an_asymmetric_glacier_mask(tmp_path):
    from bake import bake_synthetic

    spec = GridSpec(0.0, 0.0, tiles=2, tile_cells=16, spacing_m=64.0)
    manifest = bake_synthetic(str(tmp_path), spec, backdrop_spacing_m=128.0, validate=False)
    sm = manifest["surfaceMask"]
    assert sm["file"] == "surface.u8" and sm["spacingM"] == 32.0 and sm["samples"] == 65
    data = np.frombuffer((tmp_path / "surface.u8").read_bytes(), dtype=np.uint8).reshape(65, 65)

    def at(x, z):
        return int(data[int(round((z + 1024) / 32)), int(round((x + 1024) / 32))])

    assert at(512, -512) == 1  # the mound, north-east
    assert at(-512, -512) == 0 and at(512, 512) == 0 and at(0, 0) == 0
    assert "OpenStreetMap" not in manifest["attribution"]


def test_bake_glacier_mask_is_optional():
    from bake import bake_glacier_mask

    assert bake_glacier_mask({}, GridSpec(27.7, 86.87, 2, 16, 64.0), Path(".")) == (None, 0.0, "", "")


def test_bake_glacier_mask_reads_the_geojson(tmp_path):
    from bake import bake_glacier_mask

    spec = GridSpec(27.7, 86.87, tiles=2, tile_cells=16, spacing_m=64.0)  # 2048 m square
    d = 0.003  # about 300 m
    ring = [[86.87 - d, 27.7 - d], [86.87 + d, 27.7 - d], [86.87 + d, 27.7 + d], [86.87 - d, 27.7 + d], [86.87 - d, 27.7 - d]]
    (tmp_path / "g.geojson").write_text(json.dumps({
        "type": "FeatureCollection", "source": "test extract", "features": [
            {"type": "Feature", "properties": {}, "geometry": {"type": "Polygon", "coordinates": [ring]}}]}))
    cfg = {"osm": {"glaciers": "g.geojson", "attribution": "© OpenStreetMap contributors", "maskSpacingM": 32}}
    mask, spacing, source, attribution = bake_glacier_mask(cfg, spec, tmp_path)
    assert spacing == 32.0 and mask.shape == (65, 65)
    assert mask[32, 32] == 1 and mask[0, 0] == 0
    assert source == "test extract" and attribution == "© OpenStreetMap contributors"


@pytest.mark.parametrize("block", [
    {"attribution": "x", "maskSpacingM": 32},
    {"glaciers": "g.geojson", "maskSpacingM": 32},
    {"glaciers": "g.geojson", "attribution": "x", "maskSpacingM": 30},  # does not divide 2048
])
def test_bake_glacier_mask_rejects_a_bad_block(block):
    from bake import bake_glacier_mask

    with pytest.raises(ValueError):
        bake_glacier_mask({"osm": block}, GridSpec(27.7, 86.87, 2, 16, 64.0), Path("."))


def test_mera_config_points_at_the_committed_glaciers():
    cfg = json.loads((Path(__file__).parent / "mera-peak.config.json").read_text())
    path = Path(__file__).parent / cfg["osm"]["glaciers"]
    data = json.loads(path.read_text())
    assert data["type"] == "FeatureCollection" and len(data["features"]) > 0
```

`Path` and `json` are already imported in the test file. Also, in `test_contract_fixture_matches_current_bake`, add `"surface.u8"` to the compared file list:

```python
    for name in ["backdrop.u16", "surface.u8", *(f"tiles/{tx}_{tz}.u16" for tx in range(2) for tz in range(2))]:
```

- [ ] **Step 2: Run them to verify they fail**

Run: `.venv/bin/python -m pytest tools/terrain -q`
Expected: FAIL. You will see import errors for the new names, and the contract fixture lacks `surface.u8`.

- [ ] **Step 3: Implement in `terrain_lib.py`**

Add after `latlon_bounds`:

```python
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
```

Extend `write_terrain`'s signature with:

```python
    surface_mask: np.ndarray | None = None,
    surface_mask_spacing_m: float | None = None,
    surface_mask_source: str = "",
```

Before `(out / "manifest.json").write_text(...)` add:

```python
    if surface_mask is not None:
        n = int(round((h.shape[0] - 1) * spacing_m / surface_mask_spacing_m)) + 1
        if surface_mask.shape != (n, n) or surface_mask.dtype != np.uint8:
            raise ValueError(f"surface mask must be uint8 {n}x{n}, got {surface_mask.dtype} {surface_mask.shape}")
        (out / "surface.u8").write_bytes(np.ascontiguousarray(surface_mask).tobytes())
        manifest["surfaceMask"] = {
            "file": "surface.u8",
            "samples": n,
            "spacingM": float(surface_mask_spacing_m),
            "source": surface_mask_source,
        }
```

- [ ] **Step 4: Implement in `bake.py`**

1. Add `project_polygons`, `rasterise_polygons` and `synthetic_glacier_polygons` to the `terrain_lib` import list.
2. Add `from pathlib import Path`.
3. Add above `bake_dem`:

```python
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
    cells = spec.size_m / spacing
    if spacing <= 0 or abs(cells - round(cells)) > 1e-9:
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
```

4. In `bake_synthetic`, pass a synthetic mask to `write_terrain`:

```python
    n_mask = int(round(spec.size_m / SYNTHETIC_MASK_SPACING_M)) + 1
    mask = rasterise_polygons(synthetic_glacier_polygons(), n_mask, spec.origin, SYNTHETIC_MASK_SPACING_M)
```

   Then add these keyword arguments to its `write_terrain(...)` call: `surface_mask=mask, surface_mask_spacing_m=SYNTHETIC_MASK_SPACING_M, surface_mask_source="synthetic disc"`.

5. In `bake_dem`, after the imagery lines:

```python
    glacier, glacier_spacing, glacier_source, osm_attribution = bake_glacier_mask(cfg, spec, Path(config_path).parent)
    if osm_attribution:
        attribution += f" · {osm_attribution}"
```

   Then pass `surface_mask=glacier, surface_mask_spacing_m=glacier_spacing or None, surface_mask_source=glacier_source` to its `write_terrain(...)` call.

- [ ] **Step 5: Add the Mera `osm` block**

In `tools/terrain/mera-peak.config.json`, add after the `"imagery"` block:

```json
  "osm": {
    "glaciers": "data/mera-peak-glaciers.geojson",
    "attribution": "© OpenStreetMap contributors",
    "maskSpacingM": 8
  },
```

Mera's square is 24 × 256 × 2 = 12,288 m, and 8 m divides it.

- [ ] **Step 6: Regenerate the contract fixture and run the suite**

```bash
UPDATE_FIXTURES=1 .venv/bin/python -m pytest tools/terrain -q -k contract_fixture
.venv/bin/python -m pytest tools/terrain -q
npm test
```

Expected:
- All Python tests pass.
- The fixture dir gains `surface.u8` (65 × 65 = 4225 bytes), and `manifest.json` gains `surfaceMask`.
- `npm test` still passes, because the TS parser ignores unknown keys.

- [ ] **Step 7: Bake test-peak and check**

Run: `npm run terrain:test && ls -la public/terrain/test-peak/surface.u8`
Expected: 4225 bytes (2048 m / 32 m + 1 = 65 samples per side).

- [ ] **Step 8: Commit**

```bash
git add tools/terrain src/engine/world/__fixtures__/test-peak-mini
git commit -m "feat(terrain): bake a glacier surface mask from OSM polygons

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Engine mask type, classification and loading

**Files:**
- Create: `src/engine/world/surfaceMask.ts`, `src/engine/world/surfaceMask.test.ts`
- Modify: `src/engine/world/surface.ts`, `src/engine/world/surface.test.ts`
- Modify: `src/engine/world/terrainData.ts`, `src/engine/world/terrainData.test.ts`
- Modify: `src/engine/world/terrainContract.test.ts`

**Interfaces:**
- Consumes: the manifest `surfaceMask` field and `surface.u8` from Task 2.
- Produces:
  - `interface SurfaceMask { samplesX: number; samplesZ: number; spacingM: number; originX: number; originZ: number; data: Uint8Array }`
  - `glacierAt(m: SurfaceMask, x: number, z: number): boolean | null`
  - `cropMask(m: SurfaceMask, minX: number, minZ: number, maxX: number, maxZ: number): SurfaceMask | null`
  - `sampleMask(m: SurfaceMask, originX: number, originZ: number, spacingM: number, samplesX: number, samplesZ: number): SurfaceMask`
  - `surfaceWithMask(slopeDeg: number, onGlacier: boolean, rules: SurfaceRules): Surface`
  - `classifySurface(slopeDeg: number, altitudeM: number, onGlacier: boolean | null, rules: SurfaceRules): Surface`
  - `TerrainManifest.surfaceMask?: { file: string; samples: number; spacingM: number; source: string }`
  - `parseSurfaceMask(raw: unknown, sizeM: number): TerrainManifest['surfaceMask']`
  - `loadSurfaceMask(baseUrl: string, m: TerrainManifest, fetchFn?: typeof fetch): Promise<SurfaceMask | null>`

- [ ] **Step 1: Write the failing tests**

`src/engine/world/surfaceMask.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { cropMask, glacierAt, sampleMask, type SurfaceMask } from './surfaceMask';

// 4 columns x 3 rows, 10 m apart, sample (0,0) at x = 100, z = 200.
// Row 0 (north): 1 0 0 0
// Row 1:         0 0 1 0
// Row 2 (south): 0 0 0 0
const mask: SurfaceMask = {
  samplesX: 4,
  samplesZ: 3,
  spacingM: 10,
  originX: 100,
  originZ: 200,
  data: new Uint8Array([1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0]),
};

describe('glacierAt', () => {
  it('reads the nearest sample, row = z', () => {
    expect(glacierAt(mask, 100, 200)).toBe(true);
    expect(glacierAt(mask, 104, 204)).toBe(true);
    expect(glacierAt(mask, 120, 210)).toBe(true);
    expect(glacierAt(mask, 110, 220)).toBe(false);
    // Swapped axes would read (x=110, z=220) as glacier.
    expect(glacierAt(mask, 110, 200)).toBe(false);
  });
  it('is null outside the mask', () => {
    expect(glacierAt(mask, 94, 200)).toBeNull();
    expect(glacierAt(mask, 100, 226)).toBeNull();
    expect(glacierAt(mask, 136, 200)).toBeNull();
  });
});

describe('cropMask', () => {
  it('answers like the full mask everywhere inside the rectangle', () => {
    const crop = cropMask(mask, 112, 205, 118, 212)!;
    expect(crop.samplesX).toBeLessThan(mask.samplesX + 1);
    for (let x = 112; x <= 118; x += 1) {
      for (let z = 205; z <= 212; z += 1) expect(glacierAt(crop, x, z)).toBe(glacierAt(mask, x, z));
    }
  });
  it('copies the data instead of sharing it', () => {
    const crop = cropMask(mask, 100, 200, 130, 220)!;
    expect(crop.data.buffer).not.toBe(mask.data.buffer);
  });
  it('is null when the rectangle misses the mask', () => {
    expect(cropMask(mask, 500, 500, 600, 600)).toBeNull();
  });
});

describe('sampleMask', () => {
  it('resamples to another grid by nearest sample, outside = 0', () => {
    const s = sampleMask(mask, 100, 200, 20, 3, 2);
    expect(Array.from(s.data)).toEqual([1, 0, 0, 0, 0, 0]);
    expect(s).toMatchObject({ samplesX: 3, samplesZ: 2, spacingM: 20, originX: 100, originZ: 200 });
  });
});
```

Append to `src/engine/world/surface.test.ts` (and add `classifySurface` and `surfaceWithMask` to its import):

```ts
describe('surfaceWithMask', () => {
  it('is rock on steep ground, on or off a glacier', () => {
    expect(surfaceWithMask(45, true, rules)).toBe('rock');
    expect(surfaceWithMask(40, true, rules)).toBe('rock');
    expect(surfaceWithMask(45, false, rules)).toBe('rock');
  });
  it('is snow below 25° and ice from 25° on a glacier', () => {
    expect(surfaceWithMask(10, true, rules)).toBe('snow');
    expect(surfaceWithMask(25, true, rules)).toBe('ice');
    expect(surfaceWithMask(39, true, rules)).toBe('ice');
  });
  it('is rock off a glacier', () => {
    expect(surfaceWithMask(10, false, rules)).toBe('rock');
    expect(surfaceWithMask(30, false, rules)).toBe('rock');
  });
});

describe('classifySurface', () => {
  it('falls back to surfaceAt without a mask', () => {
    for (const [slope, alt] of [
      [10, 5100],
      [10, 5350],
      [30, 5600],
      [45, 6000],
    ]) {
      expect(classifySurface(slope, alt, null, rules)).toBe(surfaceAt(slope, alt, rules));
    }
  });
  it('uses the mask when known, whatever the altitude', () => {
    expect(classifySurface(10, 5100, true, rules)).toBe('snow');
    expect(classifySurface(10, 6000, false, rules)).toBe('rock');
  });
});
```

Append to `src/engine/world/terrainData.test.ts` (and add `parseSurfaceMask` and `loadSurfaceMask` to its import):

```ts
describe('surface mask', () => {
  const size = 2048;
  it('accepts a valid entry that covers the square', () => {
    expect(
      parseSurfaceMask({ file: 'surface.u8', samples: 65, spacingM: 32, source: 's' }, size),
    ).toEqual({ file: 'surface.u8', samples: 65, spacingM: 32, source: 's' });
    expect(parseSurfaceMask({ file: 'surface.u8', samples: 65, spacingM: 32 }, size)?.source).toBe(
      '',
    );
    expect(parseSurfaceMask(undefined, size)).toBeUndefined();
  });
  it('drops malformed entries', () => {
    for (const bad of [
      { file: '../x', samples: 65, spacingM: 32 },
      { file: 'surface.u8', samples: 1, spacingM: 32 },
      { file: 'surface.u8', samples: 65, spacingM: 0 },
      { file: 'surface.u8', samples: 64, spacingM: 32 }, // does not cover 2048 m
      { file: 'surface.u8', samples: 65.5, spacingM: 32 },
    ]) {
      expect(parseSurfaceMask(bad, size)).toBeUndefined();
    }
  });
  it('loads the bytes and checks their count', async () => {
    const m = parseManifest({
      ...minimalManifest(),
      surfaceMask: { file: 'surface.u8', samples: 3, spacingM: 1024, source: '' },
    });
    const ok = (async () => new Response(new Uint8Array(9).fill(1))) as typeof fetch;
    const mask = await loadSurfaceMask('/t', m, ok);
    expect(mask).toMatchObject({ samplesX: 3, samplesZ: 3, spacingM: 1024, originX: m.originX });
    expect(mask!.data.length).toBe(9);
    const short = (async () => new Response(new Uint8Array(8))) as typeof fetch;
    await expect(loadSurfaceMask('/t', m, short)).rejects.toThrow(/expected 9/);
    expect(await loadSurfaceMask('/t', parseManifest(minimalManifest()), ok)).toBeNull();
  });
});
```

`minimalManifest()` must return a raw manifest object whose square is 2048 m: `spacingM: 64`, `tileSamples: 17`, `tilesX: 2`, `tilesZ: 2`, `originX: -1024`, `originZ: -1024`, and two camps. If `terrainData.test.ts` already has a helper like that, reuse it and adjust the numbers above to its square. Otherwise add:

```ts
const minimalManifest = () => ({
  id: 't',
  spacingM: 64,
  tileSamples: 17,
  tilesX: 2,
  tilesZ: 2,
  originX: -1024,
  originZ: -1024,
  minHeightM: 0,
  maxHeightM: 1,
  backdrop: { file: 'backdrop.u16', samples: 17, spacingM: 128 },
  camps: [
    { id: 'a', name: 'A', position: [0, 0, 0] },
    { id: 'b', name: 'B', position: [1, 0, 1] },
  ],
  attribution: '',
});
```

Append to `src/engine/world/terrainContract.test.ts` (add the imports `glacierAt` from `./surfaceMask` and `loadSurfaceMask` from `./terrainData`):

```ts
describe('Python bake -> glacier mask contract', () => {
  it('puts the synthetic glacier on the north-east mound only', async () => {
    const m = parseManifest(JSON.parse(readFileSync(`${dir}manifest.json`, 'utf8')));
    const bytes = readFileSync(`${dir}surface.u8`);
    const fetchFn = (async () => new Response(new Uint8Array(bytes))) as typeof fetch;
    const mask = (await loadSurfaceMask('/fixture', m, fetchFn))!;
    expect(glacierAt(mask, 512, -512)).toBe(true);
    expect(glacierAt(mask, -512, -512)).toBe(false);
    expect(glacierAt(mask, 512, 512)).toBe(false);
    expect(glacierAt(mask, 0, 0)).toBe(false);
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run src/engine/world`
Expected: FAIL, because the modules and exports are missing.

- [ ] **Step 3: Implement `surfaceMask.ts`**

```ts
/**
 * Glacier mask baked from OSM (spec 002): 1 = glacier, 0 = not.
 * Row-major, row = z (north first), like the terrain tiles.
 */
export interface SurfaceMask {
  samplesX: number;
  samplesZ: number;
  spacingM: number;
  /** World x and z of sample (0, 0). */
  originX: number;
  originZ: number;
  data: Uint8Array;
}

/** Nearest sample; null outside the mask. */
export function glacierAt(m: SurfaceMask, x: number, z: number): boolean | null {
  const c = Math.round((x - m.originX) / m.spacingM);
  const r = Math.round((z - m.originZ) / m.spacingM);
  if (c < 0 || r < 0 || c >= m.samplesX || r >= m.samplesZ) return null;
  return m.data[r * m.samplesX + c] === 1;
}

/** The samples covering a world rectangle plus one on each side, as a smaller mask (for one tile). */
export function cropMask(
  m: SurfaceMask,
  minX: number,
  minZ: number,
  maxX: number,
  maxZ: number,
): SurfaceMask | null {
  const s = m.spacingM;
  const c0 = Math.max(0, Math.floor((minX - m.originX) / s) - 1);
  const r0 = Math.max(0, Math.floor((minZ - m.originZ) / s) - 1);
  const c1 = Math.min(m.samplesX - 1, Math.ceil((maxX - m.originX) / s) + 1);
  const r1 = Math.min(m.samplesZ - 1, Math.ceil((maxZ - m.originZ) / s) + 1);
  if (c1 < c0 || r1 < r0) return null;
  const w = c1 - c0 + 1;
  const h = r1 - r0 + 1;
  const data = new Uint8Array(w * h);
  for (let r = 0; r < h; r++) {
    const from = (r0 + r) * m.samplesX + c0;
    data.set(m.data.subarray(from, from + w), r * w);
  }
  return {
    samplesX: w,
    samplesZ: h,
    spacingM: s,
    originX: m.originX + c0 * s,
    originZ: m.originZ + r0 * s,
    data,
  };
}

/** Nearest-sample copy on another grid (backdrop and map). Points outside the mask count as 0. */
export function sampleMask(
  m: SurfaceMask,
  originX: number,
  originZ: number,
  spacingM: number,
  samplesX: number,
  samplesZ: number,
): SurfaceMask {
  const data = new Uint8Array(samplesX * samplesZ);
  for (let r = 0; r < samplesZ; r++) {
    for (let c = 0; c < samplesX; c++) {
      if (glacierAt(m, originX + c * spacingM, originZ + r * spacingM)) data[r * samplesX + c] = 1;
    }
  }
  return { samplesX, samplesZ, spacingM, originX, originZ, data };
}
```

Note on `cropMask`: `glacierAt` rounds to the nearest sample, so a point up to half a sample past the rectangle's edge still resolves inside the crop. The extra sample on each side covers that.

- [ ] **Step 4: Implement the classification in `surface.ts`**

Add after `surfaceAt`:

```ts
/** With a baked glacier mask (spec 002): snow/ice only on glaciers, steep ground is rock. */
export function surfaceWithMask(slopeDeg: number, onGlacier: boolean, rules: SurfaceRules): Surface {
  if (slopeDeg >= rules.rockMinSlopeDeg) return 'rock';
  if (!onGlacier) return 'rock';
  return slopeDeg >= rules.iceMinSlopeDeg ? 'ice' : 'snow';
}

/** The mask when known (true/false); otherwise the M1 altitude rule. */
export function classifySurface(
  slopeDeg: number,
  altitudeM: number,
  onGlacier: boolean | null,
  rules: SurfaceRules,
): Surface {
  return onGlacier === null
    ? surfaceAt(slopeDeg, altitudeM, rules)
    : surfaceWithMask(slopeDeg, onGlacier, rules);
}
```

- [ ] **Step 5: Implement manifest parsing and loading in `terrainData.ts`**

1. Add `import type { SurfaceMask } from './surfaceMask';`.
2. In `TerrainManifest`, after `imagery?`, add:
   ```ts
     /** Baked glacier mask (spec 002): square, covers the terrain, row = z. */
     surfaceMask?: { file: string; samples: number; spacingM: number; source: string };
   ```
3. In `parseManifest`, add this to the returned object after `imagery: parseImagery(m.imagery),`:
   ```ts
       surfaceMask: parseSurfaceMask(
         m.surfaceMask,
         (m.tileSamples! - 1) * m.tilesX! * m.spacingM!,
       ),
   ```
4. Add after `parseImagery`:

```ts
/** A valid mask entry covering a `sizeM` square, or undefined (warning when malformed). */
export function parseSurfaceMask(raw: unknown, sizeM: number): TerrainManifest['surfaceMask'] {
  if (raw === undefined || raw === null) return undefined;
  const r = raw as { file?: unknown; samples?: unknown; spacingM?: unknown; source?: unknown };
  const ok =
    typeof r.file === 'string' &&
    /^[\w.-]+$/.test(r.file) &&
    typeof r.samples === 'number' &&
    Number.isInteger(r.samples) &&
    r.samples > 1 &&
    typeof r.spacingM === 'number' &&
    Number.isFinite(r.spacingM) &&
    r.spacingM > 0 &&
    Math.abs((r.samples - 1) * r.spacingM - sizeM) < 1e-6;
  if (ok) {
    return {
      file: r.file as string,
      samples: r.samples as number,
      spacingM: r.spacingM as number,
      source: typeof r.source === 'string' ? r.source : '',
    };
  }
  console.warn('Terrain manifest "surfaceMask" is malformed; ignoring it');
  return undefined;
}
```

5. Add after `loadBackdrop`:

```ts
/** The baked glacier mask, or null when the manifest has none. */
export async function loadSurfaceMask(
  baseUrl: string,
  m: TerrainManifest,
  fetchFn?: typeof fetch,
): Promise<SurfaceMask | null> {
  const sm = m.surfaceMask;
  if (!sm) return null;
  const url = `${baseUrl}/${sm.file}`;
  const res = await fetchWithRetry(url, 3, 300, fetchFn);
  const data = new Uint8Array(await res.arrayBuffer());
  if (data.length !== sm.samples * sm.samples) {
    throw new Error(`Surface mask ${url} has ${data.length} bytes, expected ${sm.samples ** 2}`);
  }
  return {
    samplesX: sm.samples,
    samplesZ: sm.samples,
    spacingM: sm.spacingM,
    originX: m.originX,
    originZ: m.originZ,
    data,
  };
}
```

- [ ] **Step 6: Run the tests and typecheck**

Run: `npx vitest run src/engine/world && npm run typecheck`
Expected: all pass. Existing manifest tests still pass, because `surfaceMask` is undefined when absent.

- [ ] **Step 7: Commit**

```bash
npm run format
git add src/engine/world
git commit -m "feat(world): glacier mask type, mask-aware surface classification and loading

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Colours follow the mask (tiles, backdrop, map)

**Files:**
- Modify: `src/engine/world/palette.ts`, `palette.test.ts`
- Modify: `src/engine/world/gridGeometry.ts`, `gridGeometry.test.ts`
- Modify: `src/engine/world/mapImage.ts`, `mapImage.test.ts`

**Interfaces:**
- Consumes: `SurfaceMask`, `glacierAt` and `classifySurface` (Task 3).
- Produces:
  - `terrainColor(slopeDeg: number, altitudeM: number, onGlacier: boolean | null, surface: SurfaceRules, p: LinearPalette): Rgb`
  - `GridGeometryArgs.glacier?: SurfaceMask` (plain data, structured-cloned into the worker)
  - `buildMapImage(b: Backdrop, palette: TerrainPalette, surface: SurfaceRules, glacier?: SurfaceMask): MapImage`. `glacier` must be on the backdrop grid (`samplesX === b.samples`).

- [ ] **Step 1: Write the failing tests**

1. `palette.test.ts`: insert `null` as the third argument of every existing `terrainColor(...)` call (for example `terrainColor(10, 5000, null, surface, p)`). Then add, inside the first `describe`:

```ts
  it('himalaya follows the glacier mask when there is one', () => {
    const p = linearPalette(GAME_CONFIG.biomes.himalaya.palette);
    expect(terrainColor(10, 5000, true, surface, p)).toEqual(lin(SURFACE_COLORS.snow));
    expect(terrainColor(30, 5000, true, surface, p)).toEqual(lin(SURFACE_COLORS.ice));
    expect(terrainColor(10, 6000, false, surface, p)).toEqual(lin(SURFACE_COLORS.rock));
  });
```

   Use the file's existing `lin` helper and `linearPalette` import. If they are named differently, use those names.

2. `gridGeometry.test.ts`: add after `'colours snow brighter than rock'`:

```ts
  it('colours by the glacier mask instead of altitude when one is given', () => {
    const mask = (v: number) => ({
      samplesX: 5,
      samplesZ: 5,
      spacingM: 2,
      originX: 100,
      originZ: 200,
      data: new Uint8Array(25).fill(v),
    });
    const rock = buildGridGeometry(args({ skirtDepthM: 0 }));
    // 5000 m is below the snowline: rock without a mask, snow on a glacier.
    const onGlacier = buildGridGeometry(args({ skirtDepthM: 0, glacier: mask(1) }));
    expect(onGlacier.colors[0]).toBeGreaterThan(rock.colors[0] * 1.5);
    // 5350 m is snow without a mask, rock off a glacier.
    const offGlacier = buildGridGeometry(
      args({ skirtDepthM: 0, heights: new Float32Array(25).fill(5350), glacier: mask(0) }),
    );
    expect(offGlacier.colors[0]).toBeCloseTo(rock.colors[0], 5);
  });
```

   `hash2` shading depends only on x and z, which are the same in both builds, so the colours are directly comparable.

3. `mapImage.test.ts`: add:

```ts
  it('paints glacier samples as snow when a mask on the backdrop grid is given', () => {
    const flat = backdrop(() => 5000); // below the snowline: rock without a mask
    const data = new Uint8Array(n * n);
    data[4 * n + 4] = 1;
    const glacier = { samplesX: n, samplesZ: n, spacingM: 64, originX: 0, originZ: 0, data };
    const img = buildMapImage(flat, himalaya, surface, glacier);
    expect(brightness(pixel(img, 4, 4))).toBeGreaterThan(brightness(pixel(img, 3, 4)) * 1.5);
  });

  it('rejects a mask that is not on the backdrop grid', () => {
    const glacier = {
      samplesX: n + 1,
      samplesZ: n + 1,
      spacingM: 64,
      originX: 0,
      originZ: 0,
      data: new Uint8Array((n + 1) ** 2),
    };
    expect(() =>
      buildMapImage(
        backdrop(() => 5000),
        himalaya,
        surface,
        glacier,
      ),
    ).toThrow(/backdrop grid/);
  });
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run src/engine/world`
Expected: FAIL. You will see type errors on the new argument, and the colours do not change yet.

- [ ] **Step 3: Implement**

1. `palette.ts`:
   - Change the import to `import { classifySurface, SURFACE_COLORS, type Surface, type SurfaceRules } from './surface';`, and remove `surfaceAt` if it becomes unused.
   - Change `terrainColor`:

```ts
/** Linear-space vertex colour for a terrain point. `onGlacier` is null when there is no mask. */
export function terrainColor(
  slopeDeg: number,
  altitudeM: number,
  onGlacier: boolean | null,
  surface: SurfaceRules,
  p: LinearPalette,
): Rgb {
  if (p.kind === 'surface') return p.colors[classifySurface(slopeDeg, altitudeM, onGlacier, surface)];
```

   The rest of the function is unchanged.

2. `gridGeometry.ts`:
   - Add `import { glacierAt, type SurfaceMask } from './surfaceMask';`.
   - Add to `GridGeometryArgs`:
     ```ts
       /** Glacier mask around this grid (spec 002); plain data, cloned into the worker. */
       glacier?: SurfaceMask;
     ```
   - In `writeVertex`, replace the colour line with:
     ```ts
         const onGlacier = a.glacier ? glacierAt(a.glacier, x, z) : null;
         const c = terrainColor(slopeDeg, y, onGlacier, a.surface, palette);
     ```

3. `mapImage.ts`:
   - Add `import type { SurfaceMask } from './surfaceMask';`.
   - Change the signature to `buildMapImage(b: Backdrop, palette: TerrainPalette, surface: SurfaceRules, glacier?: SurfaceMask): MapImage`.
   - At the top of the body, add:
     ```ts
       if (glacier && (glacier.samplesX !== b.samples || glacier.samplesZ !== b.samples)) {
         throw new Error('Glacier mask for the map must be on the backdrop grid');
       }
     ```
   - Replace the colour line with:
     ```ts
           const onGlacier = glacier ? glacier.data[r * n + c] === 1 : null;
           const color = terrainColor(slopeDeg, h(c, r), onGlacier, surface, pal);
     ```

4. Run `grep -rn "terrainColor(" src`. Every other caller must pass the new third argument; use `null` where no mask is available.

- [ ] **Step 4: Run the tests and typecheck**

Run: `npm test && npm run typecheck`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
npm run format
git add src/engine/world
git commit -m "feat(world): terrain and map colours follow the glacier mask

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Wire the mask through the sampler, chunks, player and game

**Files:**
- Modify: `src/engine/world/TerrainSampler.ts`, `TerrainSampler.test.ts`
- Modify: `src/engine/world/ChunkManager.ts`, `ChunkManager.test.ts`
- Modify: `src/engine/player/Player.ts`
- Modify: `src/engine/core/Game.ts`

**Interfaces:**
- Consumes: Tasks 3 and 4.
- Produces:
  - `TerrainSampler.setSurfaceMask(mask: SurfaceMask | null): void`
  - `TerrainSampler.onGlacierAt(x: number, z: number): boolean | null`
  - `ChunkManagerDeps.glacier?: SurfaceMask | null`
  - the getter `ChunkManager.backdropGlacier: SurfaceMask | null` (on the backdrop grid, set by `loadBackdrop`)

- [ ] **Step 1: Write the failing tests**

`TerrainSampler.test.ts`: add:

```ts
  it('answers glacier queries from the mask, null without one', () => {
    const s = makeSampler();
    expect(s.onGlacierAt(1, 1)).toBeNull();
    s.setSurfaceMask({
      samplesX: 3,
      samplesZ: 2,
      spacingM: 2,
      originX: 0,
      originZ: 0,
      data: new Uint8Array([0, 1, 0, 0, 0, 0]),
    });
    expect(s.onGlacierAt(2, 0)).toBe(true);
    expect(s.onGlacierAt(0, 0)).toBe(false);
    expect(s.onGlacierAt(2, 2)).toBe(false);
    expect(s.onGlacierAt(50, 0)).toBeNull();
  });
```

`ChunkManager.test.ts`:
1. Give `setup` an optional `glacier` parameter, passed to the `ChunkManager` deps.
2. Add a builder that records its arguments:

```ts
class RecordingBuilder extends SyncMeshBuilder {
  readonly calls: GridGeometryArgs[] = [];
  override async build(args: GridGeometryArgs) {
    this.calls.push(args);
    return super.build(args);
  }
}
```

3. Make `setup` accept `builder = new SyncMeshBuilder()` as well.
4. Add the test:

```ts
  it('gives each tile a crop of the glacier mask and the backdrop a sampled copy', async () => {
    const m = manifest;
    const size = (m.tileSamples - 1) * m.tilesX * m.spacingM;
    const n = size / m.spacingM + 1;
    const glacier = {
      samplesX: n,
      samplesZ: n,
      spacingM: m.spacingM,
      originX: m.originX,
      originZ: m.originZ,
      data: new Uint8Array(n * n).fill(1),
    };
    const builder = new RecordingBuilder();
    const { manager } = await setup({ glacier, builder });
    expect(manager.backdropGlacier).toMatchObject({
      samplesX: m.backdrop.samples,
      spacingM: m.backdrop.spacingM,
    });
    await manager.update(0, 0);
    const tileCall = builder.calls.find((c) => c.skirtDepthM > 0)!;
    expect(tileCall.glacier).toBeDefined();
    expect(tileCall.glacier!.samplesX).toBeLessThan(n + 1);
    const backdropCall = builder.calls.find((c) => c.hole)!;
    expect(backdropCall.glacier).toBe(manager.backdropGlacier);
  });
```

Use the test file's real manifest values. If the manifest's world square is not divisible as assumed, build `n` from `m.backdrop` instead. The point of the test is that tiles get a crop and the backdrop gets `backdropGlacier`. Import `GridGeometryArgs` from `./gridGeometry`.

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run src/engine/world/TerrainSampler.test.ts src/engine/world/ChunkManager.test.ts`
Expected: FAIL, because the methods and getter are missing.

- [ ] **Step 3: Implement**

1. `TerrainSampler.ts`:
   - Add `import { glacierAt, type SurfaceMask } from './surfaceMask';`.
   - Add a field `private mask: SurfaceMask | null = null;` and these methods:
     ```ts
       setSurfaceMask(mask: SurfaceMask | null): void {
         this.mask = mask;
       }

       /** Glacier at a world point: null when there is no mask or the point is outside it. */
       onGlacierAt(x: number, z: number): boolean | null {
         return this.mask ? glacierAt(this.mask, x, z) : null;
       }
     ```

2. `ChunkManager.ts`:
   - Add `import { cropMask, sampleMask, type SurfaceMask } from './surfaceMask';`.
   - Add `glacier?: SurfaceMask | null;` to `ChunkManagerDeps`.
   - Add a field `private backdropMask: SurfaceMask | null = null;` and the getter:
     ```ts
       /** The glacier mask on the backdrop grid (for the backdrop mesh and the map), or null. */
       get backdropGlacier(): SurfaceMask | null {
         return this.backdropMask;
       }
     ```
   - Replace `loadBackdrop` with:
     ```ts
       async loadBackdrop(): Promise<void> {
         const b = await loadBackdrop(this.d.baseUrl, this.d.manifest, this.d.fetchFn);
         this.backdrop = b;
         const g = this.d.glacier;
         const m = this.d.manifest;
         this.backdropMask = g
           ? sampleMask(g, m.originX, m.originZ, b.spacingM, b.samples, b.samples)
           : null;
       }
     ```
   - In the tile `build({...})` call, add:
     ```ts
           glacier: this.d.glacier
             ? (cropMask(
                 this.d.glacier,
                 m.originX + k.tx * size,
                 m.originZ + k.tz * size,
                 m.originX + (k.tx + 1) * size,
                 m.originZ + (k.tz + 1) * size,
               ) ?? undefined)
             : undefined,
     ```
   - In `rebuildBackdrop`'s `build({...})`, add `glacier: this.backdropMask ?? undefined,`.

3. `Player.ts`:
   - Change the import from `../world/surface` to `import { classifySurface, climbRequirement, type Gear } from '../world/surface';`.
   - In `senseWall`, replace `const surface = surfaceAt(slopeDeg, hit.point.y, cfg.surface);` with:
     ```ts
         const surface = classifySurface(
           slopeDeg,
           hit.point.y,
           this.sampler.onGlacierAt(hit.point.x, hit.point.z),
           cfg.surface,
         );
     ```

4. `Game.ts`:
   - Add `loadSurfaceMask` to the `terrainData` import.
   - After `const sampler = new TerrainSampler(manifest);`, add:
     ```ts
         const glacier = await loadSurfaceMask(o.terrainBaseUrl, manifest);
         sampler.setSurfaceMask(glacier);
     ```
   - Add `glacier,` to the `new ChunkManager({...})` deps.
   - Change the map line to:
     ```ts
               image: buildMapImage(
                 backdrop,
                 cfg.biomes[o.biome].palette,
                 cfg.surface,
                 chunks.backdropGlacier ?? undefined,
               ),
     ```

- [ ] **Step 4: Run everything**

```bash
npm test && npm run typecheck && npm run lint && npm run e2e
```

Expected: all green. The test-peak e2e now loads a `surface.u8` (baked by `pree2e`) and must show no errors. The existing Player tests use a manifest without a mask, so they are unchanged.

- [ ] **Step 5: Commit**

```bash
npm run format
git add src
git commit -m "feat(game): climb gating, chunks and map use the baked glacier mask

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Bake Mera and look at it

**Files:** none committed, unless a fix is needed. `public/terrain/` is git-ignored.

- [ ] **Step 1: Re-bake Mera**

Run: `npm run terrain:mera` (needs network: DEM and imagery, a few minutes).

Expected:
- the line `Glacier mask: N polygons, X km2 (Y % of the square)`, with X roughly 20–40 km²;
- `public/terrain/mera-peak/surface.u8` of 1537 × 1537 = 2,362,369 bytes;
- the manifest attribution ends with `· © OpenStreetMap contributors`.

- [ ] **Step 2: Look at it**

Run `npm run dev` and open `http://localhost:5173/?mountain=mera-peak`. Take screenshots with Playwright if you cannot look yourself.

Check:
- Near Khare (start) the ground is rock-coloured.
- Snow and ice colour appears in glacier-shaped areas, not in a flat band, matching the white glacier areas on the satellite imagery.
- `Tab` (map) shows the same glacier shapes.
- The credit line shows the OSM attribution.

Describe what you saw in the task report. If the glacier sits visibly offset from the white areas of the imagery, stop and report it: it would mean a projection mistake.

---

### Task 7: Documentation

**Files:**
- Modify: `docs/specs/specs/002-osm-glacier-surfaces.md`, `docs/specs/MAP.md`
- Modify: `docs/superpowers/specs/2026-11-03-mountain-odyssey-design.md` (§6.5)
- Modify: `CLAUDE.md`, `CREDITS.md`, `docs/playtest/m1-checklist.md`

- [ ] **Step 1: Spec 002**
  - Set `status: implemented` and the date `2026-11-13` in the frontmatter.
  - Under "Open questions", answer the CI question with decision 1 from this plan.
  - Add `## 9. Decisions taken during planning`, which copies the four decisions from this plan.
  - In §5.1, replace the `url` and `sizeBytes` config example with the real block:
    `{"glaciers": "data/mera-peak-glaciers.geojson", "attribution": "© OpenStreetMap contributors", "maskSpacingM": 8}`.
  - In §5.2, describe the steps as "extract once with `extract_glaciers.py`; the bake rasterises the committed GeoJSON".

- [ ] **Step 2: Design spec §6.5**

After the "Splat map tiles" line, add:

> Update (2026-11-13, spec 002): the first surface map is a binary glacier mask (`surface.u8`) rasterised from OpenStreetMap glacier polygons; soft splat weights remain future work.

- [ ] **Step 3: `CLAUDE.md`**

In "Terrain is data, not code", add a bullet:

> - A bake config with an `"osm"` block (`glaciers`: a committed GeoJSON extracted once with `tools/terrain/extract_glaciers.py` from a pinned Geofabrik extract; `maskSpacingM`) also writes `surface.u8` and `"surfaceMask"` in the manifest: 1 = glacier, row = z. The engine's `classifySurface` then makes ground snow/ice only on glaciers (rock off them and on slopes ≥ 40°); without a mask it falls back to `surfaceAt`. `TerrainSampler.onGlacierAt` feeds climb gating, tiles get `cropMask` crops, and the backdrop and map get `ChunkManager.backdropGlacier`. The attribution appends `© OpenStreetMap contributors`.

Also add `docs/specs/specs/002-osm-glacier-surfaces.md` to the project status as implemented, in one short sentence.

- [ ] **Step 4: `CREDITS.md`**

Under "Data", add:

> - Glacier outlines: © OpenStreetMap contributors, available under the Open Database License (ODbL 1.0), from the Geofabrik extract `nepal-261112.osm.pbf` (`tools/terrain/data/mera-peak-glaciers.geojson`).

- [ ] **Step 5: Playtest checklist**

Append:

```markdown
## Glacier surfaces (spec 002)

- [ ] On Mera, snow and ice colour follows the glacier shapes on the satellite image; the ground near Khare is rock-coloured.
- [ ] A steep wall on the glacier says "Requires ice axe + crampons" without crampons.
- [ ] A steep rock wall off the glacier above 5,400 m can be climbed without an ice axe.
- [ ] The full map (Tab) shows the glacier shapes.
- [ ] The credit line includes "© OpenStreetMap contributors".
- [ ] The glacier edge on close tiles does not look jarringly hard (8 m mask).
```

- [ ] **Step 6: Commit**

```bash
npm run format
git add CLAUDE.md CREDITS.md docs
git commit -m "docs: record OSM glacier surfaces

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Self-review notes

- **Spec coverage:**
  - §5.2 bake: Tasks 1 and 2, with the GeoJSON instead of a download.
  - §5.3 classification: Task 3.
  - Sampler, Player and Game wiring: Task 5.
  - Worker crops: Task 5 (`cropMask`).
  - Map: Tasks 4 and 5.
  - Attribution: Task 2 (bake) and Task 6 (check).
  - §6 tests: Tasks 1–5.
  - §7 deploy notes: no CI download (decision 1); `CREDITS`, `CLAUDE.md` and design spec in Task 7.
  - Test-peak synthetic mask: Task 2.
- **Name consistency across tasks:** `SurfaceMask`, `glacierAt`, `cropMask`, `sampleMask`, `classifySurface`, `surfaceWithMask`, `loadSurfaceMask`, `parseSurfaceMask`, `onGlacierAt`, `setSurfaceMask`, `backdropGlacier`, `bake_glacier_mask`, `rasterise_polygons`, `project_polygons`, `lonlat_to_xz`, `synthetic_glacier_polygons`, `surface.u8`, `surfaceMask`.
