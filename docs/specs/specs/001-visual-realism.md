---
id: 001
title: Visual realism — satellite terrain, illustrated climber, shoulder camera, painterly sky
status: implemented
date: 2026-11-11
instruction: docs/specs/instructions/001-visual-realism.md
---

# 001 — Visual realism: spec and implementation plan

This document is both the spec and the step-by-step plan. It is written so that an implementer with no earlier context can build it task by task. Read section 5 ("Rules for the implementer") before touching code.

## 1. Summary

Four changes make the game look like a real place seen through a hand-painted film:

| Phase | What the player sees | Main files |
| --- | --- | --- |
| A | Terrain coloured from a real Sentinel-2 satellite image, far and near | `tools/terrain/*`, `src/engine/world/*` |
| B | A toon-shaded, outlined human climber instead of a robot | `src/engine/player/*` |
| C | A close over-the-shoulder camera with landing shake and run bob | `src/engine/camera/*` |
| D | A gradient sky, drifting clouds, warm sunlight | `src/engine/world/Environment.ts` and new files |
| E | Docs, credits, attribution | `CLAUDE.md`, `CREDITS.md`, design spec |

Each phase can be merged alone. Do them in the order A, B, C, D, E.

## 2. Problem and goal

**Problem.** Terrain colour comes only from a slope and altitude palette, so every hill of a biome looks the same and nothing matches the real place. The character is a placeholder robot. The camera sits 5 m back and feels detached. The sky is one flat colour.

**Goal.** A player walking a hill track sees the real land cover of that location (forest, tea, fields, soil, snow), an illustrated human climber close to the camera, and a soft painted sky. No runtime service, no API key, no cost: everything is baked into static files.

## 3. Scope

**In scope**

- Bake: one true-colour JPEG per mountain from Sentinel-2 L2A, registered to the terrain grid.
- Engine: draw that image on all terrain, blend the biome palette in near the player.
- Character: toon shading, outline, clip-name mapping, replaceable model file.
- Camera: shoulder offset, shake, run bob.
- Sky: gradient dome, clouds, sun and hemisphere light colours in config.

**Out of scope** (do not build these)

- Google Earth or any runtime map tile service.
- A satellite `Tab` map. `mapImage.ts` is not changed.
- Removing terrain shadows from the satellite image with the DEM.
- First-person view, post-processing passes, changing the tone mapping or the shadow map type.
- Any gameplay number (speeds, slopes, stamina, survival).

## 4. Analysis

### 4.1 What exists today (verified on 2026-11-11)

- `tools/terrain/bake.py` reads a DEM window with rasterio and writes `manifest.json`, `backdrop.u16` and `tiles/*.u16` through `write_terrain` in `tools/terrain/terrain_lib.py`. There is no colour data.
- Every real mountain is a 12 288 m square (24 tiles × 256 cells × 2 m), origin (−6144, −6144). The test-peak is 2048 m (4 tiles).
- `src/engine/world/gridGeometry.ts` builds positions, normals, per-vertex colours and indices. It runs in a worker (`meshBuilder.worker.ts`). Vertex colours are already in linear colour space.
- `src/engine/world/ChunkManager.ts` builds chunk meshes and one backdrop mesh, all with the single material passed in `ChunkManagerDeps.material`.
- `src/engine/core/Game.ts` creates that material inline (`new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0, side: THREE.DoubleSide })`), creates `Environment`, loads `PlayerVisual`, and creates `ThirdPersonCamera`.
- `src/engine/player/PlayerVisual.ts` loads a GLB, scales it to `player.heightM`, and plays clips by the fixed names in `CLIPS`. The model is `public/models/RobotExpressive.glb`, set in `src/app/GameView.tsx`.
- `src/engine/camera/ThirdPersonCamera.ts` already shifts the look target sideways while climbing (`climbSideOffset`). There is no shake.
- `src/engine/world/Environment.ts` sets a flat background colour, linear fog, a hemisphere light and a sun. Light colours are hard-coded there.
- `src/engine/world/mapMath.ts` exports `mapBounds(manifest)` and `worldToMap(x, z, bounds)`. `worldToMap` returns `u` (0 at the west edge, grows east) and `v` (0 at the north edge, grows south). The terrain texture coordinates in this spec are exactly these `u`, `v`.
- three.js is r187. In it, the standard material's fragment shader contains the lines `#include <common>`, `#include <map_fragment>` and `#include <color_fragment>`, and `color_fragment` is `diffuseColor *= vColor;`. The Lambert vertex shader contains `#include <project_vertex>` and defines `transformedNormal` before it. Tasks A6 and B2 depend on these facts and add tests that fail if a three.js upgrade changes them.
- CI (`.github/workflows/ci.yml`) runs pytest, format check, lint, typecheck, vitest, build and Playwright. The deploy workflow bakes all four terrains on the runner, so the imagery source must be readable without credentials. It is (see 4.2).
- `docs/` is ignored by Prettier. Source files are not.

### 4.2 Imagery source (verified on 2026-11-11)

- Data: Sentinel-2 L2A cloud-optimised GeoTIFFs in the public bucket `sentinel-cogs` (AWS open data). Each scene has a `TCI.tif` asset: 3 bands, `uint8`, true colour, 10 m pixels, UTM projection, nodata value 0.
- Search: the STAC API `https://earth-search.aws.element84.com/v1/search`, collection `sentinel-2-l2a`. No key is needed.
- A test read of the Patharia window (about 1320 × 1200 pixels) through `rasterio.vrt.WarpedVRT(crs="EPSG:4326")` took 25 seconds and returned no empty pixels.
- The raw image is dark (mean value about 54 of 255), so the bake must brighten it (task A1, `grade_imagery`). With the default settings in A1 the Patharia window comes out at a mean of about 89, with vivid green forest and pale fields, and under 0.1 % of pixels clipped to white.
- Some scenes cover only part of their tile. The bake must reject a window that contains empty (all-zero) pixels.
- Licence: Copernicus Sentinel data is free for any use with the notice `Contains modified Copernicus Sentinel data <year>`.

Scenes chosen for the three mountains (cloud and shadow fraction inside the game window, measured from the scene classification band):

| Mountain | Scene id | Date | Cloud or shadow | Empty | Sun elevation |
| --- | --- | --- | --- | --- | --- |
| patharia | `S2B_46RDN_20240311_0_L2A` | 2024-03-11 | not measured, image inspected and clear | 0 % | 55.9° |
| keokradong | `S2B_46QDK_20240318_0_L2A` | 2024-03-18 | 0 % | 0 % | 59.1° |
| mera-peak | `S2A_45RVL_20231113_0_L2A` | 2023-11-13 | 0.7 % | 0 % | 42.5° |

The Patharia `TCI.tif` URL was read successfully. The other two URLs follow the same path pattern and were not read in full; the bake in task A3 verifies them and fails loudly if they are wrong.

### 4.3 Design decisions and reasons

| Decision | Reason |
| --- | --- |
| One pinned scene URL per mountain in the bake config, like `demUrl` | Bakes are repeatable. No search at bake time. |
| Image covers exactly the terrain square, `sizePx` × `sizePx`, row 0 = north, column 0 = west | Same convention as the height grid and the map, so `u`, `v` come from `worldToMap`. |
| Draw with a texture, not vertex colours | Backdrop vertices are 64 m apart. Vertex colours would blur a 10 m image to 64 m. |
| Texture coordinates are a `uv` vertex attribute written by `gridGeometry` | The standard `map` feature of the material then works with no shader change. |
| Near the player, mix the biome palette colour over the image; fade the mix out with distance | A 10 m pixel is a blur at your feet. The palette adds 2 m detail (rock on steep ground, tea stripes, snow and ice which matter for gameplay). One material for chunks and backdrop means no seam. |
| Colour grading (brightness, shadow lift, saturation) happens in the bake | No shader cost, no post-processing, and the result can be inspected as a file. |
| Outline is a second back-face mesh pushed out in screen space | Thickness does not depend on the model's internal scale, so any GLB works. |
| Sky is a vertex-coloured sphere and clouds are sprites with a generated texture | No custom shader and no image asset. Both are tone mapped like the rest of the scene, so the horizon matches the fog. |
| Camera shake is a pure function of trauma and time (no random numbers) | Unit-testable, repeatable. |

### 4.4 Impact on existing behaviour

- Physics, movement, survival, routes, camps and the map are unchanged.
- A manifest without `imagery` (old bakes) renders exactly as today.
- `manifest.json` gains an optional `imagery` object, and the committed contract fixture `src/engine/world/__fixtures__/test-peak-mini/` must be regenerated once (task A2).
- Download per mountain grows by one JPEG, expected 0.6 to 1.5 MB. GPU memory grows by about 22 MB (2048² RGBA with mipmaps).
- Bake time per real mountain grows by about 30 seconds.

### 4.5 Risks

| Risk | Mitigation |
| --- | --- |
| A three.js upgrade renames a shader chunk | `patchTerrainFragment` and `patchOutlineVertex` throw when the chunk is missing, and unit tests call them on the real shader source. |
| A shader fails to compile in the browser only | The e2e smoke test fails on any console error that mentions a shader or WebGL program (task A6). |
| Image is mirrored or rotated against the terrain | Python test on the synthetic marker (A1) plus TypeScript test on the corner `uv` values (A5). |
| Scene has cloud or haze | `tools/terrain/find_imagery.py` (A3) lists alternatives with measured cloud fraction. |
| No CC0 model matches the art direction | The toon look is applied in code to any model. Task B3 (model swap) is gated on a human choosing the file; everything else ships without it. |
| Mera Peak has long shadows in the November scene | Accepted. `gamma` in the config lifts dark tones. A spring scene can be pinned later with A3. |

## 5. Rules for the implementer

Read these first. They apply to every task.

1. Read `CLAUDE.md` at the repository root before starting. Its layer rule and config rule are enforced.
2. Work on a branch named `visual-realism` created from `main`. One commit per task, with the commit message given in the task.
3. Do the tasks in order. Do not start a task until the previous task's "Verify" commands pass.
4. Write the test first, run it and see it fail, then write the code. Tests are the authority: if the reference code in this document disagrees with a test described here, make the test pass.
5. Do not edit an existing test to make it pass, except where a task says so explicitly.
6. `src/engine/**` must not import React. `src/app` and `src/ui` must not import three.js.
7. Every tunable number goes in `src/engine/config/game.config.ts`. This document gives the values.
8. Static files are referenced through `assetUrl()`, never with a leading `/`.
9. Run `npm run format` before every commit.
10. Python on this Windows machine is `.venv/Scripts/python`. On Linux and macOS it is `.venv/bin/python`. This document writes `PY` for it. The npm `terrain:*` scripts call the system `python3`, which may lack rasterio; when they fail, run the same `bake.py` command with `PY`.
11. Nothing under `public/terrain/` is committed. It is generated.
12. If a step cannot be done as written (a file differs from what this document says, a download fails, a test that must stay green fails for an unrelated reason), stop and report what you found. Do not guess and do not work around it.
13. Do not change anything listed in section 3 "Out of scope".

Full check, run after every task:

```bash
PY -m pytest tools/terrain -q
npm run format && npm run lint && npm run typecheck && npm test
```

Run `npm run build && npm run e2e` at the end of every phase.

## 6. Design and tasks

### 6.1 Data contract (the one thing every phase A task must agree on)

`manifest.json` gains:

```json
"imagery": { "file": "imagery.jpg", "sizePx": 2048 }
```

- `imagery.jpg` is a square sRGB JPEG, `sizePx` pixels on each side.
- It covers exactly the terrain square: world x from `originX` to `originX + sizeX`, world z from `originZ` to `originZ + sizeZ`.
- Pixel row 0 is the north edge (smallest z). Pixel column 0 is the west edge (smallest x).
- The centre of pixel (row `r`, column `c`) is at `x = originX + (c + 0.5) * sizeX / sizePx`, `z = originZ + (r + 0.5) * sizeZ / sizePx`.
- Texture coordinate of a world point: `u = (x - originX) / sizeX`, `v = (z - originZ) / sizeZ`. The texture is loaded with `flipY = false`, so `v = 0` is image row 0.
- When imagery is baked, `manifest.attribution` is the config's `attribution` followed by `" · "` and the imagery attribution. Example: `Contains modified Copernicus DEM data · Contains modified Copernicus Sentinel data 2024`. The DEM sentence stays verbatim.

Bake config gains an optional block:

```json
"imagery": {
  "url": "/vsicurl/https://sentinel-cogs.s3.us-west-2.amazonaws.com/sentinel-s2-l2a-cogs/46/R/DN/2024/3/S2B_46RDN_20240311_0_L2A/TCI.tif",
  "sizePx": 2048,
  "attribution": "Contains modified Copernicus Sentinel data 2024",
  "grade": { "gamma": 0.65, "saturation": 1.2 }
}
```

`grade` is optional. A config without `imagery` bakes exactly as today.

---

### Phase A — Satellite terrain

#### Task A1 — Pure imagery helpers in `terrain_lib.py`

**Files:** `tools/terrain/terrain_lib.py`, `tools/terrain/test_terrain_lib.py`.

**Add four functions** to `terrain_lib.py` (place them above `write_terrain`), and one parameter to `write_terrain`.

```python
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
```

**Change `write_terrain`:** add a last keyword parameter `imagery: np.ndarray | None = None`. After the backdrop file is written and before the manifest is built, nothing changes. After the `route_max_slope_deg` block and before the manifest file is written, add:

```python
    if imagery is not None:
        if imagery.ndim != 3 or imagery.shape[0] != imagery.shape[1] or imagery.shape[2] != 3:
            raise ValueError(f"imagery must be a square RGB array, got shape {imagery.shape}")
        # No mode argument: Pillow infers RGB from a (rows, cols, 3) uint8 array.
        Image.fromarray(np.ascontiguousarray(imagery, dtype=np.uint8)).save(
            out / "imagery.jpg", quality=85, optimize=True
        )
        manifest["imagery"] = {"file": "imagery.jpg", "sizePx": int(imagery.shape[0])}
```

**Tests to add** in `test_terrain_lib.py` (import the new names at the top):

1. `test_resample_rgb_keeps_north_up_and_east_right`: build `spec = GridSpec(10.0, 20.0, tiles=1, tile_cells=100, spacing_m=10.0)` (a 1000 m square). Build a 50 × 50 × 3 source whose red channel equals the column index × 5 and whose green channel equals the row index × 5, with `src_bounds = latlon_bounds(spec, margin_m=0.0)`. Resample to `size_px=10`. Assert red grows from left to right (`out[5, 0, 0] < out[5, 9, 0]`), green grows from top to bottom (`out[0, 5, 1] < out[9, 5, 1]`), and the output shape is `(10, 10, 3)`.
2. `test_grade_imagery_brightens_and_keeps_channel_order`: build a 64 × 64 × 3 `uint8` image where every pixel in column `c` is `(40, 60, 30)` multiplied by `0.5 + 1.5 * c / 63` (a dark-to-light ramp of one green-brown colour). Assert the output dtype is `uint8`, the mean of the output is greater than the mean of the input, and at the middle pixel `out[32, 32]` green > red > blue.
3. `test_grade_imagery_limits_gain`: input a constant `(10, 10, 10)` image. Assert every output value is below 128 (the stretch is capped by `max_gain`, so a flat dark image is not blown up to white).
4. `test_imagery_empty_fraction`: a 10 × 10 × 3 zero array with 25 pixels set to `(1, 0, 0)` returns `0.75`.
5. `test_synthetic_imagery_marks_the_mound_north_east`: `spec = GridSpec(0.0, 0.0, tiles=4, tile_cells=256, spacing_m=2.0)`, `h = synthetic_heightmap(spec.samples, spec.spacing_m)`, `img = synthetic_imagery(h, spec.spacing_m, spec.origin, 256)`. The pixel for a world point is `col = int((x - spec.origin) / spec.size_m * 256)`, `row = int((z - spec.origin) / spec.size_m * 256)`. Assert the pixel at (x = 512, z = −512) has red > 200 and blue < 80. Assert the pixels at (−512, −512), (512, 512) and (−512, 512) have blue > 60 (they are not the marker).
6. `test_write_terrain_writes_imagery_and_manifest_entry(tmp_path)`: call `write_terrain` as the existing test `test_write_terrain_outputs_manifest_tiles_and_backdrop` does, with `imagery=np.full((64, 64, 3), 128, dtype=np.uint8)`. Assert `manifest["imagery"] == {"file": "imagery.jpg", "sizePx": 64}`, the file exists, and `Image.open(...)` reports size `(64, 64)`. Assert that calling without `imagery` gives a manifest with no `"imagery"` key.

**Verify:** `PY -m pytest tools/terrain -q` passes.

**Commit:** `feat(terrain): imagery resample, grading and synthetic image helpers`

#### Task A2 — Bake imagery in `bake.py`, regenerate the contract fixture

**Files:** `tools/terrain/bake.py`, `tools/terrain/test_terrain_lib.py`, `src/engine/world/__fixtures__/test-peak-mini/`.

**Steps**

1. Import the new helpers in `bake.py` (`grade_imagery`, `imagery_empty_fraction`, `resample_rgb_to_metric`, `synthetic_imagery`).
2. Add `load_imagery` below `load_dem`:

```python
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
```

3. Add `bake_imagery` below it:

```python
IMAGERY_MAX_EMPTY_FRACTION = 0.005


def bake_imagery(cfg: dict, spec: GridSpec) -> tuple[np.ndarray | None, str]:
    """(graded image or None, attribution to append or "") for a bake config."""
    block = cfg.get("imagery")
    if block is None:
        return None, ""
    for key in ("url", "attribution"):
        if not isinstance(block.get(key), str) or not block[key]:
            raise ValueError(f'imagery.{key} must be a non-empty string')
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
```

4. In `bake_dem`, just before the final `return write_terrain(...)`, add:

```python
    imagery, imagery_attribution = bake_imagery(cfg, spec)
    attribution = cfg["attribution"] + (f" · {imagery_attribution}" if imagery_attribution else "")
```

and change the `write_terrain` call to pass `attribution` in place of `cfg["attribution"]` and to add `imagery=imagery`.

5. In `bake_synthetic`, add a parameter `imagery_size_px: int = 256` and pass `imagery=synthetic_imagery(h, spec.spacing_m, spec.origin, imagery_size_px)` to `write_terrain`. The attribution stays `"Synthetic test terrain"` (an e2e test checks that exact text).
6. Regenerate the fixture: `UPDATE_FIXTURES=1 PY -m pytest tools/terrain -q` (PowerShell: `$env:UPDATE_FIXTURES = '1'; PY -m pytest tools/terrain -q; Remove-Item Env:UPDATE_FIXTURES`). `git status` must then show `manifest.json` modified and a new `imagery.jpg` in `src/engine/world/__fixtures__/test-peak-mini/`, and no change to the `.u16` files. If a `.u16` file changed, stop: something else is wrong.

**Tests to add**

1. `test_bake_synthetic_writes_imagery(tmp_path)`: `from bake import bake_synthetic`; bake with `GridSpec(0.0, 0.0, tiles=2, tile_cells=16, spacing_m=64.0)`, `backdrop_spacing_m=128.0`, `validate=False`. Assert `manifest["imagery"] == {"file": "imagery.jpg", "sizePx": 256}`, the file exists, and the pixel at world (512, −512) is orange (red > 180, blue < 110; JPEG changes values slightly).
2. `test_bake_imagery_is_optional`: `from bake import bake_imagery`; `bake_imagery({"id": "x"}, spec)` returns `(None, "")`.
3. `test_bake_imagery_rejects_a_block_without_url`: `bake_imagery({"id": "x", "imagery": {"attribution": "a"}}, spec)` raises `ValueError` matching `imagery.url`.

**Verify:** `PY -m pytest tools/terrain -q` passes without `UPDATE_FIXTURES`. `npm test` still passes (the TypeScript side ignores the new manifest key until A4).

**Commit:** `feat(terrain): bake satellite imagery next to the DEM`

#### Task A3 — Scene finder script and pinned scenes

**Files:** new `tools/terrain/find_imagery.py`; `tools/terrain/patharia.config.json`, `keokradong.config.json`, `mera-peak.config.json`.

**Steps**

1. Create `tools/terrain/find_imagery.py`. It is a helper for humans and is not run by CI or by the bake.

```python
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
```

2. Add the `imagery` block to each config, after the `"attribution"` line. Do not change any other key.

`patharia.config.json`:

```json
  "imagery": {
    "url": "/vsicurl/https://sentinel-cogs.s3.us-west-2.amazonaws.com/sentinel-s2-l2a-cogs/46/R/DN/2024/3/S2B_46RDN_20240311_0_L2A/TCI.tif",
    "sizePx": 2048,
    "attribution": "Contains modified Copernicus Sentinel data 2024"
  },
```

`keokradong.config.json`:

```json
  "imagery": {
    "url": "/vsicurl/https://sentinel-cogs.s3.us-west-2.amazonaws.com/sentinel-s2-l2a-cogs/46/Q/DK/2024/3/S2B_46QDK_20240318_0_L2A/TCI.tif",
    "sizePx": 2048,
    "attribution": "Contains modified Copernicus Sentinel data 2024"
  },
```

`mera-peak.config.json`:

```json
  "imagery": {
    "url": "/vsicurl/https://sentinel-cogs.s3.us-west-2.amazonaws.com/sentinel-s2-l2a-cogs/45/R/VL/2023/11/S2A_45RVL_20231113_0_L2A/TCI.tif",
    "sizePx": 2048,
    "attribution": "Contains modified Copernicus Sentinel data 2023"
  },
```

3. Bake all four (network needed for three of them):

```bash
PY tools/terrain/bake.py --synthetic --out public/terrain/test-peak
PY tools/terrain/bake.py --config tools/terrain/patharia.config.json --out public/terrain/patharia
PY tools/terrain/bake.py --config tools/terrain/keokradong.config.json --out public/terrain/keokradong
PY tools/terrain/bake.py --config tools/terrain/mera-peak.config.json --out public/terrain/mera-peak
```

**Verify**

- Each output folder contains `imagery.jpg`, between 0.2 MB and 3 MB for the real mountains.
- Each `manifest.json` has `"imagery": {"file": "imagery.jpg", "sizePx": 2048}` (256 for test-peak) and, for real mountains, an `attribution` that starts with `Contains modified Copernicus DEM data · Contains modified Copernicus Sentinel data`.
- Open each `imagery.jpg` and look at it. It must show land (forest, fields, ridges, or snow and rock for Mera), not be mostly black, white or cloud. If a bake fails with an HTTP or "not inside the scene" error, or the image is cloudy, run `find_imagery.py` for that config, pin the first listed scene, and bake again. If no scene works, stop and report.
- Camp positions printed by the bake are the same as before this task (imagery must not change heights).

**Commit:** `feat(terrain): pin Sentinel-2 scenes for Patharia, Keokradong and Mera Peak`

#### Task A4 — Read `imagery` from the manifest

**Files:** `src/engine/world/terrainData.ts`, `src/engine/world/terrainData.test.ts`, `src/engine/world/terrainContract.test.ts`.

**Steps**

1. Add to `TerrainManifest`: `imagery?: { file: string; sizePx: number };`
2. Add and export:

```ts
/** A valid imagery entry, or undefined (with a warning when one is present but malformed). */
export function parseImagery(raw: unknown): TerrainManifest['imagery'] {
  if (raw === undefined || raw === null) return undefined;
  const r = raw as { file?: unknown; sizePx?: unknown };
  const ok =
    typeof r.file === 'string' &&
    /^[\w.-]+$/.test(r.file) &&
    typeof r.sizePx === 'number' &&
    Number.isInteger(r.sizePx) &&
    r.sizePx > 0;
  if (ok) return { file: r.file as string, sizePx: r.sizePx as number };
  console.warn('Terrain manifest "imagery" is malformed; ignoring it');
  return undefined;
}

export const imageryUrl = (baseUrl: string, m: TerrainManifest): string | null =>
  m.imagery ? `${baseUrl}/${m.imagery.file}` : null;
```

3. In `parseManifest`, change the return to include `imagery: parseImagery(m.imagery)`.

**Tests to add**

- `terrainData.test.ts`: `parseImagery(undefined)` is `undefined`; `parseImagery({ file: 'imagery.jpg', sizePx: 2048 })` returns the same object; `parseImagery({ file: '../x.jpg', sizePx: 10 })`, `parseImagery({ file: 'a.jpg' })` and `parseImagery({ file: 'a.jpg', sizePx: 0 })` return `undefined`; `imageryUrl('terrain/t', manifestWithImagery)` is `'terrain/t/imagery.jpg'` and is `null` without imagery. Silence the expected warning with `vi.spyOn(console, 'warn').mockImplementation(() => {})` in the malformed cases, as other tests in that file do for routes.
- `terrainContract.test.ts`: add `it('ships an imagery entry whose file exists', ...)`: the parsed fixture manifest has `imagery` equal to `{ file: 'imagery.jpg', sizePx: 256 }` and `existsSync(`${dir}imagery.jpg`)` is true.

**Verify:** `npm test`, `npm run typecheck`.

**Commit:** `feat(world): parse the imagery entry of the terrain manifest`

#### Task A5 — Texture coordinates on terrain meshes

**Files:** `src/engine/world/gridGeometry.ts`, `gridGeometry.test.ts`, `meshBuilder.worker.ts`, `ChunkManager.ts`, `ChunkManager.test.ts`.

**Steps**

1. `gridGeometry.ts`:
   - `import type { MapBounds } from './mapMath';`
   - Add to `GridGeometryArgs`: `/** World rectangle of the terrain image. When set, a uv per vertex is written. */ uv?: MapBounds;`
   - Add to `GridGeometryData`: `uvs?: Float32Array;`
   - After `const colors = ...` add: `const uvs = a.uv ? new Float32Array(vertexCount * 2) : undefined;`
   - At the end of `writeVertex` add:

```ts
    if (uvs && a.uv) {
      uvs[v * 2] = (x - a.uv.minX) / a.uv.sizeX;
      uvs[v * 2 + 1] = (z - a.uv.minZ) / a.uv.sizeZ;
    }
```

   - Change the return to `return { positions, normals, colors, indices: indices.slice(0, k), ...(uvs ? { uvs } : {}) };`
2. `meshBuilder.worker.ts`: after the `transfer` array is built, add `if (data.uvs) transfer.push(data.uvs.buffer as ArrayBuffer);`
3. `ChunkManager.ts`:
   - `import { mapBounds } from './mapMath';`
   - In both `this.d.builder.build({...})` calls (chunk and backdrop) add `uv: mapBounds(m),`.
   - In `createMesh`, after the colour attribute: `if (data.uvs) geometry.setAttribute('uv', new THREE.BufferAttribute(data.uvs, 2));`

**Tests to add**

- `gridGeometry.test.ts`:
  - Without `uv`, `buildGridGeometry(args()).uvs` is `undefined`.
  - With `uv: { minX: 100, minZ: 200, sizeX: 8, sizeZ: 8 }` (the test grid is 5 × 5 samples, 2 m apart, origin (100, 200), so it spans exactly that rectangle): `uvs.length` equals `positions.length / 3 * 2`; vertex 0 (north-west) has uv `(0, 0)`; vertex 4 (north-east) has `(1, 0)`; vertex 20 (south-west) has `(0, 1)`; vertex 24 (south-east) has `(1, 1)`.
  - Skirt vertices have the same uv as the edge vertex above them: with skirts on, the first skirt vertex (index 25) has uv `(0, 0)`.
- `ChunkManager.test.ts`: in the first test, add `expect(centre.geometry.getAttribute('uv').count).toBe(25 + 20);` and check the backdrop mesh (`group.getObjectByName('terrain-backdrop')`) has a `uv` attribute.

**Verify:** `npm test`, `npm run typecheck`, `npm run lint`.

**Commit:** `feat(world): terrain meshes carry world-aligned texture coordinates`

#### Task A6 — Terrain material with imagery, wired into the game

**Files:** new `src/engine/world/terrainMaterial.ts`, new `terrainMaterial.test.ts`; `src/engine/config/game.config.ts`; `src/engine/core/Game.ts`; `e2e/smoke.spec.ts`.

**Config.** In `GAME_CONFIG.terrain`, after `outOfWorldDropM`, add:

```ts
    /** Satellite imagery blend (visual realism spec §6). */
    imagery: {
      /** Share of the biome palette colour mixed over the image right at the camera (0–1). */
      paletteMix: 0.4,
      /** The palette share falls to 0 between these distances from the camera (m). */
      fadeStartM: 120,
      fadeEndM: 900,
    },
```

**New file `terrainMaterial.ts`:**

```ts
import * as THREE from 'three';

export interface TerrainImageryOptions {
  paletteMix: number;
  fadeStartM: number;
  fadeEndM: number;
}

const COLOR_CHUNK = '#include <color_fragment>';
const COMMON_CHUNK = '#include <common>';

/**
 * Standard fragment shader with the vertex colour mixed over the map instead of multiplied.
 * Throws when three.js no longer has the chunks this relies on, so an upgrade fails in tests.
 */
export function patchTerrainFragment(source: string): string {
  if (!source.includes(COLOR_CHUNK) || !source.includes(COMMON_CHUNK)) {
    throw new Error('Terrain shader patch: expected chunks are missing from the fragment shader');
  }
  return source
    .replace(
      COMMON_CHUNK,
      `${COMMON_CHUNK}
uniform float uPaletteMix;
uniform float uFadeStartM;
uniform float uFadeEndM;`,
    )
    .replace(
      COLOR_CHUNK,
      `#if defined( USE_COLOR ) || defined( USE_COLOR_ALPHA )
	float terrainNear = 1.0 - smoothstep( uFadeStartM, uFadeEndM, length( vViewPosition ) );
	diffuseColor.rgb = mix( diffuseColor.rgb, vColor.rgb, uPaletteMix * terrainNear );
#endif`,
    );
}

/** Terrain material. Without imagery it is the plain vertex-coloured material. */
export function createTerrainMaterial(
  imagery: THREE.Texture | null,
  o: TerrainImageryOptions,
): THREE.MeshStandardMaterial {
  const material = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.95,
    metalness: 0,
    side: THREE.DoubleSide,
    map: imagery,
  });
  if (!imagery) return material;
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uPaletteMix = { value: o.paletteMix };
    shader.uniforms.uFadeStartM = { value: o.fadeStartM };
    shader.uniforms.uFadeEndM = { value: o.fadeEndM };
    shader.fragmentShader = patchTerrainFragment(shader.fragmentShader);
  };
  material.customProgramCacheKey = () => 'terrain-imagery';
  return material;
}

/** Loads the baked image so that v = 0 is its first (north) row. */
export async function loadImageryTexture(url: string, anisotropy: number): Promise<THREE.Texture> {
  const texture = await new THREE.TextureLoader().loadAsync(url);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.flipY = false;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.anisotropy = anisotropy;
  texture.needsUpdate = true;
  return texture;
}
```

**`Game.ts` changes** (in `init`):

1. Import `createTerrainMaterial`, `loadImageryTexture` from `../world/terrainMaterial` and `imageryUrl` from `../world/terrainData`.
2. Replace the inline `const material = new THREE.MeshStandardMaterial({...});` with:

```ts
    const imageUrl = imageryUrl(o.terrainBaseUrl, manifest);
    let imagery: THREE.Texture | null = null;
    if (imageUrl) {
      try {
        imagery = await loadImageryTexture(
          imageUrl,
          this.renderer.capabilities.getMaxAnisotropy(),
        );
      } catch (err) {
        console.warn('Terrain imagery failed to load; using the biome palette only.', err);
      }
    }
    const material = createTerrainMaterial(imagery, cfg.terrain.imagery);
```

3. In the existing cleanup callback that disposes `material`, add `imagery?.dispose();`.

**Tests** (`terrainMaterial.test.ts`):

```ts
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { createTerrainMaterial, patchTerrainFragment } from './terrainMaterial';

const options = { paletteMix: 0.4, fadeStartM: 120, fadeEndM: 900 };

describe('patchTerrainFragment', () => {
  it('patches the real three.js standard fragment shader', () => {
    const out = patchTerrainFragment(THREE.ShaderLib.standard.fragmentShader);
    expect(out).toContain('uniform float uPaletteMix;');
    expect(out).toContain('mix( diffuseColor.rgb, vColor.rgb');
    expect(out).not.toContain('#include <color_fragment>');
    expect(out).toContain('#include <map_fragment>');
  });
  it('throws when the expected chunk is missing', () => {
    expect(() => patchTerrainFragment('void main() {}')).toThrow(/chunks are missing/);
  });
});

describe('createTerrainMaterial', () => {
  it('is the plain vertex-colour material without imagery', () => {
    const m = createTerrainMaterial(null, options);
    expect(m.map).toBeNull();
    expect(m.vertexColors).toBe(true);
    expect(m.customProgramCacheKey()).not.toBe('terrain-imagery');
  });
  it('uses the image as the map and a distinct program with imagery', () => {
    const m = createTerrainMaterial(new THREE.Texture(), options);
    expect(m.map).not.toBeNull();
    expect(m.customProgramCacheKey()).toBe('terrain-imagery');
  });
});
```

**E2E** (`e2e/smoke.spec.ts`, first test): next to the `pageerror` listener add

```ts
  const shaderErrors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error' && /shader|WebGLProgram/i.test(m.text())) shaderErrors.push(m.text());
  });
```

and at the end of the test add `expect(shaderErrors).toEqual([]);`. The test-peak has imagery after task A2, so this runs the patched shader in a real browser.

**Verify**

```bash
npm run format && npm run lint && npm run typecheck && npm test && npm run build && npm run e2e
```

Then look at it: `npm run dev`, open `http://localhost:5173/?mountain=test-peak`. The ground must be green, getting whiter uphill, and there must be an orange disc on the mound. To find the mound: it is 512 m east and 512 m north of the centre of the map; open the `Tab` map to orient. If the disc is on the wrong side (south or west), the image is flipped: re-check `flipY = false` and the uv formula. Do not "fix" it by flipping the bake.

Then open `/?mountain=patharia`. Far hills must show the satellite colours; the ground near the player must still show palette detail (tea stripes, brown steep banks).

**Commit:** `feat(world): draw baked satellite imagery on terrain, palette detail near the camera`

#### Task A7 — Phase A docs

**Files:** `CREDITS.md`, `CLAUDE.md`.

- `CREDITS.md`, under "Data", add: `- Terrain imagery: Contains modified Copernicus Sentinel data 2023–2024 (Sentinel-2 L2A, ESA, provided under the Copernicus Sentinel data licence; read from the AWS Open Data registry).`
- `CLAUDE.md`, in "Terrain is data, not code", add one bullet: `- A bake config with an "imagery" block (a pinned Sentinel-2 TCI url) also writes imagery.jpg and "imagery" in the manifest: a square image over the terrain square, row 0 = north. Terrain meshes carry a uv from mapBounds, and terrainMaterial.ts mixes the biome palette over the image near the camera (GAME_CONFIG.terrain.imagery). tools/terrain/find_imagery.py lists candidate scenes.`
- In `CLAUDE.md` "Project constraints", change the attribution line to: `Show the DEM attribution verbatim: Contains modified Copernicus DEM data. With imagery, the manifest appends the Sentinel notice after " · ".`

**Commit:** `docs: satellite imagery pipeline and credits`

---

### Phase B — Illustrated climber

#### Task B1 — Character config and pure helpers

**Files:** `src/engine/config/game.config.ts`; new `src/engine/player/toonMath.ts`, `toonMath.test.ts`.

**Config.** Add a top-level block after `player`:

```ts
  /** Character look (visual realism spec §6, phase B). */
  character: {
    /** Brightness of each toon shading step, darkest first (0–1). Two steps = soft look. */
    toonLevels: [0.62, 1],
    outline: {
      /** Half-thickness as a fraction of the viewport half-size. 0.003 is about 3 px at 1080p. */
      width: 0.003,
      /** Dark brown, not black. */
      color: 0x3b2a20,
    },
    /** Clip names tried in order for each role. The first one the model has is used. */
    clips: {
      idle: ['Idle'],
      walk: ['Walking', 'Walk'],
      run: ['Running', 'Run'],
      fall: ['Falling', 'Fall', 'Jump'],
      climb: ['Climbing', 'Climb', 'Walking', 'Walk'],
    },
  },
```

**New file `toonMath.ts`** (no three.js import):

```ts
export type ClipRole = 'idle' | 'walk' | 'run' | 'fall' | 'climb';

/** One byte per toon step (0–255), for a 1-pixel-high gradient texture. */
export function toonGradientData(levels: readonly number[]): Uint8Array {
  if (levels.length === 0) throw new Error('toonLevels must not be empty');
  return Uint8Array.from(levels, (v) => Math.round(Math.min(Math.max(v, 0), 1) * 255));
}

/** For each role, the first wanted clip name the model has, or null. */
export function resolveClips(
  available: readonly string[],
  wanted: Readonly<Record<ClipRole, readonly string[]>>,
): Record<ClipRole, string | null> {
  const have = new Set(available);
  const pick = (names: readonly string[]): string | null => names.find((n) => have.has(n)) ?? null;
  return {
    idle: pick(wanted.idle),
    walk: pick(wanted.walk),
    run: pick(wanted.run),
    fall: pick(wanted.fall),
    climb: pick(wanted.climb),
  };
}
```

**Tests:** `toonGradientData([0.62, 1])` equals `Uint8Array.of(158, 255)`; values are clamped (`[-1, 2]` gives `0, 255`); an empty list throws. `resolveClips(['Idle', 'Walking', 'Running', 'Jump'], GAME_CONFIG.character.clips)` returns `{ idle: 'Idle', walk: 'Walking', run: 'Running', fall: 'Jump', climb: 'Walking' }` (this is the current robot's behaviour and must not change); `resolveClips([], ...)` returns all `null`.

**Commit:** `feat(player): character look config, toon gradient and clip resolution helpers`

#### Task B2 — Toon shading and outline

**Files:** new `src/engine/player/toonLook.ts`, `toonLook.test.ts`; `src/engine/player/PlayerVisual.ts`.

**New file `toonLook.ts`:**

```ts
import * as THREE from 'three';
import { toonGradientData } from './toonMath';

export interface ToonLookOptions {
  toonLevels: readonly number[];
  outline: { width: number; color: number };
}

const PROJECT_CHUNK = '#include <project_vertex>';

/**
 * Lambert vertex shader that pushes each vertex along its normal in screen space, giving an
 * outline of constant on-screen thickness. Throws if three.js no longer has the chunk.
 */
export function patchOutlineVertex(source: string): string {
  if (!source.includes(PROJECT_CHUNK)) {
    throw new Error('Outline shader patch: project_vertex chunk is missing from the vertex shader');
  }
  return source
    .replace('void main() {', 'uniform float uOutlineWidth;\nvoid main() {')
    .replace(
      PROJECT_CHUNK,
      `${PROJECT_CHUNK}
	vec2 outlineDir = ( projectionMatrix * vec4( transformedNormal, 0.0 ) ).xy;
	float outlineLen = length( outlineDir );
	if ( outlineLen > 0.00001 ) gl_Position.xy += outlineDir / outlineLen * uOutlineWidth * gl_Position.w;`,
    );
}

function createOutlineMaterial(o: ToonLookOptions['outline']): THREE.Material {
  // Black diffuse + emissive = a flat colour that still gets fog. Lambert, because its
  // vertex shader always computes transformedNormal (the basic material does not).
  const material = new THREE.MeshLambertMaterial({
    color: 0x000000,
    emissive: o.color,
    side: THREE.BackSide,
  });
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uOutlineWidth = { value: o.width };
    shader.vertexShader = patchOutlineVertex(shader.vertexShader);
  };
  material.customProgramCacheKey = () => 'character-outline';
  return material;
}

function createGradientMap(levels: readonly number[]): THREE.DataTexture {
  const data = toonGradientData(levels);
  const texture = new THREE.DataTexture(data, data.length, 1, THREE.RedFormat);
  texture.minFilter = THREE.NearestFilter;
  texture.magFilter = THREE.NearestFilter;
  texture.needsUpdate = true;
  return texture;
}

function toToon(source: THREE.Material, gradientMap: THREE.Texture): THREE.MeshToonMaterial {
  const s = source as THREE.MeshStandardMaterial;
  return new THREE.MeshToonMaterial({
    color: s.color ? s.color.clone() : new THREE.Color(0xffffff),
    map: s.map ?? null,
    gradientMap,
    vertexColors: s.vertexColors,
    transparent: s.transparent,
    opacity: s.opacity,
    alphaTest: s.alphaTest,
    side: s.side,
  });
}

/**
 * Replaces every mesh material under `model` with a toon material and adds an outline mesh
 * next to each mesh. Returns a function that frees what this created.
 */
export function applyToonLook(model: THREE.Object3D, o: ToonLookOptions): () => void {
  const gradientMap = createGradientMap(o.toonLevels);
  const outlineMaterial = createOutlineMaterial(o.outline);
  const created: THREE.Material[] = [outlineMaterial];
  const meshes: THREE.Mesh[] = [];
  model.traverse((obj) => {
    if ((obj as THREE.Mesh).isMesh) meshes.push(obj as THREE.Mesh);
  });
  // Collected first: adding outline meshes while traversing would visit them too.
  for (const mesh of meshes) {
    const convert = (m: THREE.Material): THREE.Material => {
      const toon = toToon(m, gradientMap);
      created.push(toon);
      return toon;
    };
    mesh.material = Array.isArray(mesh.material)
      ? mesh.material.map(convert)
      : convert(mesh.material);

    let outline: THREE.Mesh;
    if ((mesh as THREE.SkinnedMesh).isSkinnedMesh) {
      const skinned = mesh as THREE.SkinnedMesh;
      const copy = new THREE.SkinnedMesh(skinned.geometry, outlineMaterial);
      copy.bind(skinned.skeleton, skinned.bindMatrix);
      outline = copy;
    } else {
      outline = new THREE.Mesh(mesh.geometry, outlineMaterial);
    }
    outline.name = `${mesh.name}-outline`;
    outline.position.copy(mesh.position);
    outline.quaternion.copy(mesh.quaternion);
    outline.scale.copy(mesh.scale);
    if (mesh.morphTargetInfluences) outline.morphTargetInfluences = mesh.morphTargetInfluences;
    outline.castShadow = false;
    outline.receiveShadow = false;
    outline.frustumCulled = mesh.frustumCulled;
    (mesh.parent ?? model).add(outline);
  }
  return () => {
    for (const m of created) m.dispose();
    gradientMap.dispose();
  };
}
```

**`PlayerVisual.ts` changes**

1. Import `GAME_CONFIG`, `applyToonLook` and `resolveClips, type ClipRole`.
2. Delete the `CLIPS` constant. Add fields `private clips: Record<ClipRole, string | null> = { idle: null, walk: null, run: null, fall: null, climb: null };` and `private disposeLook: (() => void) | null = null;`.
3. In `load`, after the `model.traverse(... castShadow = true ...)` call and before `root.add(model)`, add `visual.disposeLook = applyToonLook(model, GAME_CONFIG.character);`. The order matters: cast-shadow is set on the original meshes first, and outline meshes are created with `castShadow = false`.
4. After the loop that fills `visual.actions`, add `visual.clips = resolveClips(gltf.animations.map((c) => c.name), GAME_CONFIG.character.clips);`.
5. Change `clipFor` to return `string | null`:

```ts
  private clipFor(state: MoveState, moving: boolean): string | null {
    if (state === 'fall' || state === 'slide') return this.clips.fall;
    if (state === 'climb') return moving ? this.clips.climb : this.clips.idle;
    if (!moving) return this.clips.idle;
    return state === 'run' ? this.clips.run : this.clips.walk;
  }
```

   and `play(name: string | null)` returns at once when `name` is `null`.
6. In `dispose`, call `this.disposeLook?.();`.
7. The capsule fallback stays as it is (no toon look).

**Tests** (`toonLook.test.ts`):

- `patchOutlineVertex(THREE.ShaderLib.lambert.vertexShader)` contains `uniform float uOutlineWidth;` and `transformedNormal`, and still contains `#include <project_vertex>`.
- `patchOutlineVertex('void main() {}')` throws.
- `applyToonLook` on a `THREE.Group` holding one `THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial({ color: 0xff0000 }))` named `body`: afterwards the group has 2 children; `body.material` is a `MeshToonMaterial` with `color.getHex() === 0xff0000` and a `gradientMap`; the child named `body-outline` shares `body.geometry`, has `castShadow === false`, and its material has `side === THREE.BackSide`.
- Calling `applyToonLook` on an empty group adds nothing and returns a function that does not throw.

**Verify:** the full check plus `npm run build && npm run e2e`. Then `npm run dev`, open `/?mountain=test-peak`: the robot has flat two-tone shading and a thin dark-brown edge, and it still animates when walking (`W`), running (`Shift`), and falling. The outline must move with the limbs. If the outline stays in a T-pose while the body moves, the `SkinnedMesh.bind` call is wrong.

Known limit: models with hard (split) normals, like the placeholder robot, show small gaps in the outline at sharp corners. This is expected and is not a bug to fix.

**Commit:** `feat(player): toon shading and outline for the character`

#### Task B3 — Swap the model for an illustrated human climber (needs a human)

This task needs a model file that a person must choose and download. If no file has been provided, skip this task, leave the robot in place, and say so in the final report. Do not download a model on your own judgement and do not generate one.

**Asset contract.** The file must meet all of these:

| Requirement | Value |
| --- | --- |
| Format | One `.glb` (binary glTF), skinned, with embedded animations |
| Licence | CC0, or a Mixamo character under Adobe's Mixamo terms |
| Subject | A stylised human in outdoor clothing. A backpack is wanted. Not a real person, not a character from any film or game |
| Size | 5 MB or less |
| Clips | At least one name from each of `idle`, `walk`, `run`, `fall` in `GAME_CONFIG.character.clips`. `climb` may fall back to walk |
| Facing | The model faces +Z in its own space, as the robot does (if the character walks backwards in game, this is wrong) |

Places a person can look (each licence must be checked on the download page, they were not verified for this document): Quaternius (CC0 character and animation packs), KayKit by Kay Lousberg (CC0 adventurer characters), Mixamo (character plus Walking, Running, Idle, Falling Idle and a climbing clip, merged into one GLB in Blender).

**Steps once the file exists**

1. Create `tools/assets/inspect-glb.mjs`:

```js
#!/usr/bin/env node
// Prints the size, meshes, skins and animation names of a .glb file.
//   node tools/assets/inspect-glb.mjs public/models/climber.glb
import { readFileSync } from 'node:fs';

const path = process.argv[2];
if (!path) {
  console.error('usage: node tools/assets/inspect-glb.mjs <file.glb>');
  process.exit(2);
}
const buf = readFileSync(path);
if (buf.readUInt32LE(0) !== 0x46546c67) {
  console.error('Not a binary glTF (.glb) file');
  process.exit(1);
}
const jsonLength = buf.readUInt32LE(12);
const gltf = JSON.parse(buf.subarray(20, 20 + jsonLength).toString('utf8'));
console.log(`size: ${(buf.length / 1e6).toFixed(2)} MB`);
console.log(`meshes: ${(gltf.meshes ?? []).length}, skins: ${(gltf.skins ?? []).length}`);
console.log('animations:');
for (const a of gltf.animations ?? []) console.log(`  ${a.name}`);
```

2. Save the model as `public/models/climber.glb` and run the script. Check the size, that `skins` is at least 1, and that the clip names satisfy the contract. If a clip has a different name (for example `Run_Fast`), add that name to the front of the matching list in `GAME_CONFIG.character.clips`. Do not rename clips inside the file.
3. In `src/app/GameView.tsx`, change `assetUrl('models/RobotExpressive.glb')` to `assetUrl('models/climber.glb')`.
4. Delete `public/models/RobotExpressive.glb`.
5. `CREDITS.md`, "Models": replace the robot line with the new model's file path, title, author, licence and source URL.

**Verify:** full check, build, e2e, then in the browser: the character stands upright on the ground (feet not sunk, not floating), faces away from the camera when walking forward, and plays idle, walk, run and fall.

**Commit:** `feat(player): illustrated human climber model`

---

### Phase C — Over-the-shoulder camera

#### Task C1 — Shake maths and config

**Files:** `src/engine/config/game.config.ts`; new `src/engine/camera/cameraShake.ts`, `cameraShake.test.ts`.

**Config.** In `GAME_CONFIG.camera`:

- Change `defaultDistance: 5` to `defaultDistance: 3` and `distanceSteps: [3, 5, 8]` to `distanceSteps: [2.2, 3, 5]`.
- After `climbSideOffset`, add:

```ts
    /** Look-target shift to the player's right while not climbing (m). Puts the character left of centre. */
    shoulderOffsetM: 0.55,
    shake: {
      enabled: true,
      /** Trauma (0–1) lost per second. */
      decayPerSec: 1.6,
      frequencyHz: 9,
      maxPitchDeg: 2.2,
      maxYawDeg: 1.6,
      maxRollDeg: 2.5,
      /** Landing drops below this add no trauma; at landFullDropM they add landMaxTrauma. */
      landMinDropM: 0.6,
      landFullDropM: 6,
      landMaxTrauma: 0.9,
      /** Run bob: steps per second, vertical amplitude (m), roll amplitude (deg), blend speed. */
      runBobHz: 2.6,
      runBobHeightM: 0.035,
      runBobRollDeg: 0.35,
      runBobSharpness: 8,
    },
```

**New file `cameraShake.ts`** (pure):

```ts
import { clamp, degToRad } from '../core/math';

export interface ShakeConfig {
  decayPerSec: number;
  frequencyHz: number;
  maxPitchDeg: number;
  maxYawDeg: number;
  maxRollDeg: number;
  landMinDropM: number;
  landFullDropM: number;
  landMaxTrauma: number;
  runBobHz: number;
  runBobHeightM: number;
  runBobRollDeg: number;
}

export const addTrauma = (trauma: number, amount: number): number =>
  clamp(trauma + amount, 0, 1);

export const decayTrauma = (trauma: number, dt: number, decayPerSec: number): number =>
  Math.max(0, trauma - decayPerSec * dt);

/** Trauma added by landing after falling dropM metres. */
export function landingTrauma(dropM: number, c: ShakeConfig): number {
  const t = (dropM - c.landMinDropM) / (c.landFullDropM - c.landMinDropM);
  return clamp(t, 0, 1) * c.landMaxTrauma;
}

/** Smooth repeatable signal in [-1, 1]. */
const wave = (timeS: number, hz: number, phase: number): number =>
  0.6 * Math.sin(2 * Math.PI * hz * timeS + phase) +
  0.4 * Math.sin(2 * Math.PI * hz * 2.3 * timeS + phase * 1.7);

/** Camera rotation offsets in radians. Strength is trauma squared, so small bumps stay small. */
export function shakeAngles(
  trauma: number,
  timeS: number,
  c: ShakeConfig,
): { pitch: number; yaw: number; roll: number } {
  const k = trauma * trauma;
  return {
    pitch: degToRad(c.maxPitchDeg) * k * wave(timeS, c.frequencyHz, 1.3),
    yaw: degToRad(c.maxYawDeg) * k * wave(timeS, c.frequencyHz, 4.1),
    roll: degToRad(c.maxRollDeg) * k * wave(timeS, c.frequencyHz, 7.7),
  };
}

/** Run bob for a stride phase in radians, scaled by weight (0 = standing, 1 = running). */
export function runBob(phase: number, weight: number, c: ShakeConfig): { y: number; roll: number } {
  return {
    y: -Math.abs(Math.sin(phase)) * c.runBobHeightM * weight,
    roll: Math.sin(phase) * degToRad(c.runBobRollDeg) * weight,
  };
}
```

Check that `clamp` and `degToRad` are exported from `src/engine/core/math.ts` (they are imported from there by `ThirdPersonCamera.ts` today).

**Tests** (use `GAME_CONFIG.camera.shake` as the config):

- `addTrauma(0.8, 0.5)` is `1`; `addTrauma(0.2, 0.3)` is close to `0.5`.
- `decayTrauma(0.5, 0.25, 1.6)` is close to `0.1`; `decayTrauma(0.1, 1, 1.6)` is `0`.
- `landingTrauma(0.3, c)` is `0`; `landingTrauma(6, c)` is `c.landMaxTrauma`; `landingTrauma(100, c)` is `c.landMaxTrauma`; `landingTrauma(3.3, c)` is close to `0.45`.
- `shakeAngles(0, 1.23, c)` is all zeros (use `toBeCloseTo(0)`; `-0` must pass).
- For `trauma = 1` and 200 times from 0 to 5 s, every `|pitch|` is at most `degToRad(c.maxPitchDeg) + 1e-9`, likewise yaw and roll, and at least one pitch value is non-zero.
- `shakeAngles(0.5, t, c).pitch` equals `0.25 * shakeAngles(1, t, c).pitch` for some `t`.
- `runBob(0, 1, c)` is `{ y: -0, roll: 0 }` (close to zero); `runBob(Math.PI / 2, 1, c).y` is close to `-c.runBobHeightM`; with weight 0 both are zero.

**Commit:** `feat(camera): shake and run-bob maths, closer default distance`

#### Task C2 — `player:landed` event

**Files:** `src/engine/core/events.ts`, `src/engine/player/Player.ts`, `src/engine/player/Player.test.ts`.

1. `events.ts`: add to `GameEvents`: `'player:landed': { dropM: number };`
2. `Player.ts`, in `private land(centerY: number)`: directly after `const dropM = this.fallPeakY - centerY;` add `this.events.emit('player:landed', { dropM });`. Do not change anything else in `land`.
3. Test: in `Player.test.ts`, find the existing test `reports an injury after falling off the 8 m cliff`. Copy its setup into a new test that also subscribes to `player:landed` (the shared setup helper only records `player:fell`; add a second listener on the same `events` bus, or extend the helper to return a `landed` array too) and asserts that at least one `player:landed` event was emitted and that the largest `dropM` among them is greater than `GAME_CONFIG.fall.injuryHeightM`. Existing tests must keep passing unchanged.

**Commit:** `feat(player): emit player:landed with the drop height`

#### Task C3 — Shoulder offset, shake and bob in `ThirdPersonCamera`

**Files:** `src/engine/camera/ThirdPersonCamera.ts`, `src/engine/core/Game.ts`.

**`ThirdPersonCamera.ts`**

1. Import `addTrauma, decayTrauma, runBob, shakeAngles` from `./cameraShake`.
2. Add and export:

```ts
export interface CameraInput {
  climbing: boolean;
  /** Running on the ground and actually moving. */
  running: boolean;
  /** No shake, bob or decay while the game is paused. */
  paused: boolean;
}
```

3. Add private fields: `private trauma = 0; private shakeTime = 0; private bobPhase = 0; private bobWeight = 0;`
4. Add a method:

```ts
  /** Adds camera shake (0–1). */
  addTrauma(amount: number): void {
    this.trauma = addTrauma(this.trauma, amount);
  }
```

5. In `snap()`, also set `this.trauma = 0; this.bobWeight = 0;`.
6. Change the signature to `update(feet: Vec3, input: CameraInput, dt: number): void` and replace the body's first part (up to and including the `if (climbing) { ... }` block) with:

```ts
    let target: Vec3 = { x: feet.x, y: feet.y + GAME_CONFIG.player.eyeHeight, z: feet.z };
    let distance = this.distance;
    if (input.climbing) distance += c.climbExtraDistance;
    const right = { x: Math.cos(this.yaw), y: 0, z: -Math.sin(this.yaw) };
    target = add(target, scale(right, input.climbing ? c.climbSideOffset : c.shoulderOffsetM));
```

   The rest of the body (desired, resolved, smoothing, ground clamp, `camera.position.set`, `camera.lookAt`) stays exactly as it is.
7. After `this.camera.lookAt(...)` add:

```ts
    if (!c.shake.enabled || input.paused) return;
    this.shakeTime += dt;
    this.trauma = decayTrauma(this.trauma, dt, c.shake.decayPerSec);
    this.bobWeight += ((input.running ? 1 : 0) - this.bobWeight) * smoothFactor(c.shake.runBobSharpness, dt);
    this.bobPhase += dt * c.shake.runBobHz * Math.PI;
    const angles = shakeAngles(this.trauma, this.shakeTime, c.shake);
    const bob = runBob(this.bobPhase, this.bobWeight, c.shake);
    this.camera.position.y += bob.y;
    this.camera.rotateX(angles.pitch);
    this.camera.rotateY(angles.yaw);
    this.camera.rotateZ(angles.roll + bob.roll);
```

   The stored `this.position` is not changed by shake or bob, so they never accumulate.

**`Game.ts`**

1. Import `landingTrauma` from `../camera/cameraShake`.
2. In `render`, replace `w.cameraCtrl.update(feet, snap.state === 'climb', frameDt);` with:

```ts
    w.cameraCtrl.update(
      feet,
      {
        climbing: snap.state === 'climb',
        running: snap.state === 'run' && snap.moving,
        paused: this.loop.isPaused,
      },
      frameDt,
    );
```

3. In `wireEvents`, add to the `this.cleanup.push(...)` list:

```ts
      this.events.on('player:landed', ({ dropM }) =>
        this.w?.cameraCtrl.addTrauma(landingTrauma(dropM, cfg.camera.shake)),
      ),
```

No new unit test in this task: `ThirdPersonCamera` needs a real camera and is covered by C1's maths tests, typecheck and the e2e smoke test.

**Verify:** full check, build, e2e. In the browser on `/?mountain=test-peak`:

- The character stands left of the screen centre and the camera is clearly closer than before.
- `C` cycles three distances.
- Running (`Shift` + `W`) gives a small rhythmic bob that fades in and out smoothly.
- Walking off the 8 m cliff band (about 300 m from the summit) shakes the camera on landing. A step down of less than half a metre does not.
- While paused (press `Esc` to release the mouse; the game pauses when pointer lock is lost) the view is perfectly still.
- Climbing still looks as before (side offset 0.8 m, extra distance).

**Commit:** `feat(camera): over-the-shoulder view with landing shake and run bob`

---

### Phase D — Painterly sky and light

#### Task D1 — Sky config and pure helpers

**Files:** `src/engine/config/game.config.ts`; new `src/engine/world/skyMath.ts`, `skyMath.test.ts`.

**Config**

1. In each biome's `sky`, add `zenithColor` (keep `color`, `fogNear`, `fogFar` unchanged):
   - `himalaya`: `zenithColor: 0x4f86c6`
   - `tropical-hills`: `zenithColor: 0x6fa3d8`
   - `tea-garden`: `zenithColor: 0x7fb0dc`
2. Replace `world: { sunDirection: [0.4, 0.8, 0.3] },` with:

```ts
  world: {
    sunDirection: [0.4, 0.8, 0.3],
    /** Warm sun, cool sky fill, warm ground bounce. */
    sun: { color: 0xffe2b8, intensity: 2.6 },
    hemisphere: { skyColor: 0xdfeeff, groundColor: 0x6b5a48, intensity: 1.0 },
    sky: {
      /** Dome radius (m). Must stay below camera.far. */
      domeRadiusM: 7000,
      /** Below 1: the horizon colour reaches higher up the sky. */
      gradientExponent: 0.6,
    },
    clouds: {
      seed: 4107,
      count: 26,
      /** Clouds repeat inside a square of this half-size around the player (m). */
      radiusM: 5000,
      /** Cloud base above the highest terrain point (m), and layer thickness (m). */
      baseAboveMaxM: 350,
      thicknessM: 250,
      puffsMin: 4,
      puffsMax: 8,
      puffSizeMinM: 350,
      puffSizeMaxM: 800,
      /** How far puffs of one cloud spread sideways (m). */
      spreadM: 500,
      /** Drift in m/s along x and z. */
      windX: 4,
      windZ: 1.5,
      color: 0xffffff,
      opacity: 0.85,
    },
  },
```

**New file `skyMath.ts`** (pure):

```ts
/** 0 at and below the horizon, 1 straight up. */
export const skyBlend = (dirY: number, exponent: number): number =>
  Math.pow(Math.min(Math.max(dirY, 0), 1), exponent);

/** Offset wrapped into [-radius, radius). */
export function wrapOffset(v: number, radius: number): number {
  const size = radius * 2;
  return ((((v + radius) % size) + size) % size) - radius;
}

/** Seeded 0–1 generator (mulberry32). */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface CloudConfig {
  seed: number;
  count: number;
  radiusM: number;
  thicknessM: number;
  puffsMin: number;
  puffsMax: number;
  puffSizeMinM: number;
  puffSizeMaxM: number;
  spreadM: number;
}

export interface CloudDef {
  /** Centre inside [-radiusM, radiusM), height above the cloud base. */
  x: number;
  y: number;
  z: number;
  puffs: { dx: number; dy: number; dz: number; sizeM: number }[];
}

/** The same clouds for the same config: positions and puffs, flat-bottomed. */
export function cloudLayout(c: CloudConfig): CloudDef[] {
  const rnd = seededRandom(c.seed);
  const between = (lo: number, hi: number): number => lo + (hi - lo) * rnd();
  const clouds: CloudDef[] = [];
  for (let i = 0; i < c.count; i++) {
    const x = between(-c.radiusM, c.radiusM);
    const z = between(-c.radiusM, c.radiusM);
    const y = between(0, c.thicknessM);
    const n = Math.round(between(c.puffsMin, c.puffsMax));
    const puffs: CloudDef['puffs'] = [];
    for (let k = 0; k < n; k++) {
      const sizeM = between(c.puffSizeMinM, c.puffSizeMaxM);
      puffs.push({
        dx: between(-c.spreadM, c.spreadM),
        dy: sizeM * 0.15 * rnd(), // never below the base: flat bottoms
        dz: between(-c.spreadM, c.spreadM) * 0.5,
        sizeM,
      });
    }
    clouds.push({ x, y, z, puffs });
  }
  return clouds;
}

/** size x size RGBA bytes: white, with a soft round alpha falloff. */
export function puffPixels(size: number): Uint8Array {
  const out = new Uint8Array(size * size * 4);
  const half = (size - 1) / 2;
  for (let r = 0; r < size; r++) {
    for (let col = 0; col < size; col++) {
      const d = Math.min(Math.hypot((col - half) / half, (r - half) / half), 1);
      const alpha = (1 - d * d) ** 2;
      const o = (r * size + col) * 4;
      out[o] = 255;
      out[o + 1] = 255;
      out[o + 2] = 255;
      out[o + 3] = Math.round(alpha * 255);
    }
  }
  return out;
}
```

**Tests**

- `skyBlend(-0.5, 0.6)` is `0`; `skyBlend(1, 0.6)` is `1`; `skyBlend(0.25, 0.5)` is close to `0.5`.
- `wrapOffset(0, 100)` is `0`; `wrapOffset(150, 100)` is `-50`; `wrapOffset(-150, 100)` is `50`; `wrapOffset(100, 100)` is `-100`.
- `seededRandom(1)` gives the same first five numbers on two instances, all in `[0, 1)`; seed 2 gives a different first number.
- `cloudLayout(GAME_CONFIG.world.clouds)`: length equals `count`; called twice gives deep-equal results; every cloud's `x` and `z` are within `±radiusM`; every cloud has between `puffsMin` and `puffsMax` puffs; every `dy >= 0`; every `sizeM` is within the min and max.
- `puffPixels(16)`: length `16 * 16 * 4`; the corner pixel's alpha is `0`; the alpha at pixel (8, 8) is above 200; every red value is 255.

**Commit:** `feat(world): sky and cloud config, layout and gradient helpers`

#### Task D2 — Sky dome, clouds and light colours

**Files:** new `src/engine/world/Sky.ts`; `src/engine/world/Environment.ts`; `src/engine/core/Game.ts`.

**New file `Sky.ts`:**

```ts
import * as THREE from 'three';
import { cloudLayout, puffPixels, skyBlend, wrapOffset, type CloudConfig } from './skyMath';

/** A large inward-facing sphere coloured from horizon to zenith. Centre it on the player. */
export function createSkyDome(
  horizonColor: number,
  zenithColor: number,
  radiusM: number,
  exponent: number,
): THREE.Mesh {
  const geometry = new THREE.SphereGeometry(radiusM, 32, 16);
  const horizon = new THREE.Color(horizonColor);
  const zenith = new THREE.Color(zenithColor);
  const position = geometry.getAttribute('position');
  const colors = new Float32Array(position.count * 3);
  const c = new THREE.Color();
  for (let i = 0; i < position.count; i++) {
    c.lerpColors(horizon, zenith, skyBlend(position.getY(i) / radiusM, exponent));
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const material = new THREE.MeshBasicMaterial({
    vertexColors: true,
    side: THREE.BackSide,
    fog: false,
    depthWrite: false,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'sky-dome';
  mesh.renderOrder = -1;
  mesh.frustumCulled = false;
  return mesh;
}

export interface CloudsOptions extends CloudConfig {
  windX: number;
  windZ: number;
  color: number;
  opacity: number;
}

/** Sprite clouds that drift with the wind and repeat around the player. */
export class Clouds {
  readonly group = new THREE.Group();
  private readonly texture: THREE.DataTexture;
  private readonly material: THREE.SpriteMaterial;
  private readonly clouds: { base: THREE.Vector3; node: THREE.Group }[] = [];
  private driftX = 0;
  private driftZ = 0;

  constructor(
    private readonly o: CloudsOptions,
    private readonly baseY: number,
  ) {
    const size = 64;
    this.texture = new THREE.DataTexture(puffPixels(size), size, size, THREE.RGBAFormat);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.minFilter = THREE.LinearFilter;
    this.texture.magFilter = THREE.LinearFilter;
    this.texture.needsUpdate = true;
    this.material = new THREE.SpriteMaterial({
      map: this.texture,
      color: o.color,
      opacity: o.opacity,
      transparent: true,
      depthWrite: false,
      fog: true,
    });
    this.group.name = 'clouds';
    for (const def of cloudLayout(o)) {
      const node = new THREE.Group();
      for (const p of def.puffs) {
        const sprite = new THREE.Sprite(this.material);
        sprite.position.set(p.dx, p.dy, p.dz);
        sprite.scale.set(p.sizeM, p.sizeM * 0.6, 1);
        node.add(sprite);
      }
      this.group.add(node);
      this.clouds.push({ base: new THREE.Vector3(def.x, def.y, def.z), node });
    }
  }

  /** Moves the clouds with the wind and keeps them around (x, z). dt = 0 freezes them. */
  update(x: number, z: number, dt: number): void {
    this.driftX += this.o.windX * dt;
    this.driftZ += this.o.windZ * dt;
    for (const c of this.clouds) {
      c.node.position.set(
        x + wrapOffset(c.base.x + this.driftX - x, this.o.radiusM),
        this.baseY + c.base.y,
        z + wrapOffset(c.base.z + this.driftZ - z, this.o.radiusM),
      );
    }
  }

  dispose(): void {
    this.group.removeFromParent();
    this.material.dispose();
    this.texture.dispose();
  }
}
```

**`Environment.ts` changes**

1. Import `Clouds, createSkyDome` from `./Sky`.
2. The sun and hemisphere light take their values from config:
   - `private readonly sun = new THREE.DirectionalLight(w.sun.color, w.sun.intensity);`
   - `scene.add(new THREE.HemisphereLight(w.hemisphere.skyColor, w.hemisphere.groundColor, w.hemisphere.intensity));`
3. Change the constructor's third parameter type to `sky: { color: number; zenithColor: number; fogNear: number; fogFar: number }` and add a fourth parameter `cloudBaseY: number`.
4. Add fields `private readonly dome: THREE.Mesh;` and `private readonly clouds: Clouds;`. In the constructor, after the fog is set:

```ts
    this.dome = createSkyDome(sky.color, sky.zenithColor, w.sky.domeRadiusM, w.sky.gradientExponent);
    this.clouds = new Clouds(w.clouds, cloudBaseY);
    scene.add(this.dome, this.clouds.group);
```

   Keep `scene.background = skyColor` (it shows below the horizon and behind the dome if the dome is ever clipped).
5. Change `follow(p: Vec3)` to `follow(p: Vec3, dt: number)` and add at its end:

```ts
    this.dome.position.set(p.x, p.y, p.z);
    this.clouds.update(p.x, p.z, dt);
```

6. Add:

```ts
  dispose(): void {
    this.clouds.dispose();
    this.dome.removeFromParent();
    this.dome.geometry.dispose();
    (this.dome.material as THREE.Material).dispose();
  }
```

**`Game.ts` changes**

The environment is created in the constructor today, before the manifest is loaded, but the cloud height needs `manifest.maxHeightM`. Move it:

1. Change the field `private readonly environment: Environment;` to `private environment: Environment | null = null;`.
2. Delete `this.environment = new Environment(this.scene, true, cfg.biomes[o.biome].sky);` from the constructor.
3. In `init`, directly after `const manifest = await loadManifest(...)`, add:

```ts
    const environment = new Environment(
      this.scene,
      true,
      cfg.biomes[o.biome].sky,
      manifest.maxHeightM + cfg.world.clouds.baseAboveMaxM,
    );
    this.environment = environment;
    this.cleanup.push(() => environment.dispose());
```

4. In `render`, replace `this.environment.follow(feet);` with `this.environment?.follow(feet, this.loop.isPaused ? 0 : frameDt);`.

Check with typecheck that no other code reads `this.environment`.

No new unit test in this task: the maths is tested in D1, and `Sky.ts` needs a renderer to be meaningful. The e2e smoke test (with the shader-error check from A6) covers that it runs.

**Verify:** full check, build, e2e. In the browser, on each of `test-peak`, `patharia`, `keokradong`, `mera-peak`:

- The sky is bluer overhead and pale at the horizon. There is no visible line where far terrain meets the sky.
- White clouds are above the highest ground, never touching terrain, and drift slowly. Walking for a minute does not make them run out.
- Sunlit ground looks slightly warmer than before. Shadows are still visible.
- While paused, clouds stop.
- Frame rate is not visibly worse (compare with `main` on the same mountain).

**Commit:** `feat(world): gradient sky, drifting clouds, warm sunlight`

---

### Phase E — Documentation

#### Task E1 — Record the changes

**Files:** `CLAUDE.md`, `docs/superpowers/specs/2026-11-03-mountain-odyssey-design.md`, `docs/playtest/m1-checklist.md`, `docs/specs/MAP.md`, this file.

1. `CLAUDE.md`:
   - "Project status": add a sentence that the visual realism spec (`docs/specs/specs/001-visual-realism.md`) is implemented, and say whether task B3 (model swap) was done.
   - "Architecture": add a short paragraph "**Look:**" covering: `toonLook.ts` (toon materials and screen-space outline, applied to any GLB in `PlayerVisual`), clip names resolved from `GAME_CONFIG.character.clips`, `ThirdPersonCamera` shoulder offset with shake and bob from `cameraShake.ts` driven by `player:landed`, and `Sky.ts` (vertex-coloured dome and sprite clouds) owned by `Environment`.
2. Design spec `2026-11-03-mountain-odyssey-design.md`: add dated notes (2026-11-11, pointing to this spec) in:
   - §5.7 Camera: default distance is now 3 m with a 0.55 m shoulder offset, landing shake and run bob.
   - §6.5 Terrain pipeline: optional baked Sentinel-2 imagery.
   - §6.7 Assets: character is toon-shaded in code; model contract is in this spec, task B3.
   - §15 Decision log: one line, "Google Earth imagery rejected (terms and runtime cost); Sentinel-2 baked offline instead."
3. `docs/playtest/m1-checklist.md`: add the browser checks from tasks A6, B2, C3 and D2 as checklist items under a heading "Visual realism".
4. In this file's frontmatter change `status: draft` to `status: implemented`, and tick the acceptance list in section 7.

**Commit:** `docs: record the visual realism changes`

## 7. Acceptance and test criteria

Automated (all must pass):

- [x] `PY -m pytest tools/terrain -q`
- [x] `npm run format:check`, `npm run lint`, `npm run typecheck`, `npm test`
- [x] `npm run build`
- [x] `npm run e2e`, including the new "no shader errors" assertion
- [x] `VITE_BASE=/mountain-odyssey/ npm run build && npx vite preview --base /mountain-odyssey/` loads a mountain with imagery (checks `assetUrl` paths)

Behaviour:

- [x] A manifest without `imagery` renders as before this work (delete `"imagery"` from a local `public/terrain/test-peak/manifest.json` and reload to check).
- [x] A missing `imagery.jpg` (rename the file locally) logs one warning and the game still loads with palette colours.
- [ ] On test-peak the orange marker is on the mound, north-east of the centre. (Checked in the baked image and by the uv tests; the in-game view needs pointer lock, so it is left to the playtest checklist.)
- [x] On Patharia, Keokradong and Mera Peak, distant terrain shows satellite colours; ground within about 100 m still shows palette detail.
- [x] The HUD credit line shows `Contains modified Copernicus DEM data · Contains modified Copernicus Sentinel data <year>` on real mountains and `Synthetic test terrain` on test-peak.
- [x] The character has toon shading and a dark-brown outline that follows the animation.
- [ ] The camera is over the shoulder, shakes on a landing above 0.6 m, bobs while running, and is still while paused. (Shoulder view checked; shake and bob need pointer lock and are left to the playtest checklist.)
- [ ] The sky has a gradient and drifting clouds on every mountain. (Seen on test-peak and Patharia; the rest is in the playtest checklist.)
- [x] No gameplay value changed: `git diff main -- src/engine/config/game.config.ts` shows changes only in `camera`, `terrain.imagery`, `character`, `world`, and the `zenithColor` lines of `biomes`.

## 8. Deploy notes

- The deploy workflow bakes on the runner, so it now also downloads three Sentinel-2 windows from the public `sentinel-cogs` bucket. No secret is needed. Expect the bake step to take about 1.5 minutes longer.
- If the bucket or a pinned scene is unavailable, the bake fails and nothing is deployed (the same behaviour as for the DEM). To deploy without imagery in an emergency, remove the `imagery` block from the affected config; the game falls back to palette colours.
- Total site size grows by about 3 MB.

## 9. Open questions

1. **Which climber model?** A person must pick and download a CC0 or Mixamo illustrated human (task B3). Until then the toon-shaded robot stays.
2. **Mera Peak season.** The pinned November scene has long shadows. A late-April or May scene would have a higher sun but more cloud risk. Decide after seeing the bake.
3. **Palette mix strength.** `paletteMix: 0.4` is a starting value. Himalaya may want more (snow and ice are gameplay surfaces), tea-garden less. If per-biome values are wanted, move `paletteMix` into each biome's config.
4. **Satellite map.** The `Tab` map could be drawn from `imagery.jpg`. Left out of this spec on purpose.
