---
id: 002
title: OSM glacier surfaces — snow and ice from real glacier outlines
status: implemented
date: 2026-11-13
instruction: docs/specs/instructions/002-osm-glacier-surfaces.md
---

# 002 — OSM glacier surfaces

## 1. Summary

The bake reads glacier outlines from OpenStreetMap and writes a surface mask next to the terrain tiles. When a manifest has a mask, the engine classifies ground as snow or ice only inside real glaciers, instead of using the altitude and slope rule. Climb gating, terrain colour and the map all follow it. Mountains without a mask behave exactly as today.

This is the first step of the M2d "ice and snow surfaces" work, which design spec §6.5 calls "splat map tiles".

## 2. Problem and goal

**Problem.** `surfaceAt(slopeDeg, altitudeM, rules)` (`src/engine/world/surface.ts`) guesses surfaces from two numbers:
- snow above `snowlineM` 5,300 m;
- ice above `iceMinAltitudeM` 5,400 m on slopes of `iceMinSlopeDeg` 25° or more;
- rock at `rockMinSlopeDeg` 40° or more.

On Mera this puts snow and ice in a flat band around the mountain. It ignores where the glaciers really are.

**Goal.** Snow and ice sit where the Mera glaciers are in OSM, so:
- the ice-axe and crampon rules apply on the real glacier;
- the terrain colour and the map show its real shape.

## 3. Scope

In scope:
- the bake-time mask from `natural=glacier` ways and multipolygons;
- the manifest field;
- the runtime classification with the mask;
- passing the mask to the mesh worker and to the map;
- the OSM attribution;
- a synthetic mask for test-peak.

Out of scope: see the instruction.

## 4. Analysis

### 4.1 Impact on existing code

| Place | Today | After |
| --- | --- | --- |
| `surface.ts` | `surfaceAt(slope, altitude, rules)` | Adds `surfaceWithMask(slope, onGlacier, rules)`. `surfaceAt` stays as the fallback. |
| `Player.senseWall` | `surfaceAt(slopeDeg, hit.point.y, cfg.surface)` | Asks a classifier that knows the mask, using the hit point's x and z |
| `palette.ts` `terrainColor` | Takes slope and height | Also takes an `onGlacier: boolean | null` (`null` means no mask) |
| `gridGeometry.ts` (mesh worker) | Colours each vertex with `terrainColor` | Needs the mask for its tile. The worker receives the mask crop with the build request. |
| `mapImage.ts` | Colours from the backdrop heights | Samples the mask at each map pixel |
| `TerrainSampler` | Heights, normals, slope | Adds `onGlacierAt(x, z): boolean | null` |
| `terrainData.ts` manifest parser | — | Optional `surfaceMask` field |
| `tools/terrain/bake.py` | DEM, imagery, routes | Optional `osm` block, rasterising, writing `surface.u8` |
| Attribution | Copernicus DEM · Sentinel | Adds `· © OpenStreetMap contributors` |

### 4.2 Gameplay impact on Mera

- Most of the walk from Khare towards the glacier becomes rock-coloured. Before, everything above 5,300 m was snow.
- The route itself is unaffected: walking does not depend on surface; surface only gates climbing walls of 50° or more.
- Climb gating moves to the real glacier. A steep wall outside a glacier is rock and needs no gear, even above 5,400 m.
- The gloves rule (M2b) does not change, because it uses air temperature.

### 4.3 Risks

- **Old outlines.** OSM glacier outlines may be years old. The pinned extract date goes into the manifest attribution comment, so updates are a deliberate re-bake.
- **Edge sharpness.** At 8 m resolution, colour edges at the glacier rim will be visibly hard on close tiles. Soft blending is out of scope; check it in the playtest.
- **Large download.** The Nepal extract is about 415 MB. The bake caches it under `tools/terrain/.cache/` (git-ignored) and checks its size. A filtered copy (glaciers only) can also be cached, to avoid re-parsing.
- **Licence.** ODbL. A produced work (our mask) needs attribution, not share-alike of the game. The bake records the source and date in the manifest.
- **Worker message size.** Each tile build sends only its own mask crop (65 × 65 bytes at 8 m over a 512 m tile), not the whole mask.

## 5. Design

### 5.1 Bake config

`tools/terrain/mera-peak.config.json` gains:

```json
"osm": {
  "glaciers": "data/mera-peak-glaciers.geojson",
  "attribution": "© OpenStreetMap contributors",
  "maskSpacingM": 8
}
```

The GeoJSON is committed and extracted once from the pinned Geofabrik extract `nepal-261112.osm.pbf`, so the bake needs no download.

### 5.2 Bake steps (`tools/terrain/osm_mask.py`, called from `bake_dem`)

Extract once with `extract_glaciers.py`; the bake rasterises the committed GeoJSON.

1. `extract_glaciers.py` reads the pinned extract `nepal-261112.osm.pbf` with `pyosmium` and keeps only:
   - `natural=glacier` closed ways;
   - `type=multipolygon` relations with `natural=glacier`, using their outer and inner rings;
   - and only those whose bounding box intersects the terrain square (plus a 1 km margin).
   It writes `tools/terrain/data/mera-peak-glaciers.geojson` (38 polygons, about 30 KB), which is committed.
2. The bake projects each ring to the local metric grid with the same transform the DEM uses (`GridSpec`).
3. It rasterises at `maskSpacingM` with a numpy scanline fill (even-odd per polygon, then OR across polygons). Inner rings make holes.
4. It writes `surface.u8`:
   - row-major, row = z (north first), matching the tile convention;
   - `(sizeX / maskSpacingM + 1) × (sizeZ / maskSpacingM + 1)` samples (1537 × 1537 on Mera);
   - value 1 = glacier, 0 = not glacier.
5. Manifest:
   ```json
   "surfaceMask": { "file": "surface.u8", "spacingM": 8, "samplesX": N, "samplesZ": N, "source": "OSM natural=glacier, nepal-261112" }
   ```
   It appends `" · © OpenStreetMap contributors"` to `attribution`.
6. It prints the glacier area (km²) and the share of the square, and warns if it is 0. Mera: 26.8 km², 17.7 % of the 12.3 km square.

`bake_synthetic` (test-peak) writes a synthetic mask: a disc of radius 200 m around the mound at x = +512, z = −512. The manifest has no OSM attribution for it.

### 5.3 Runtime classification

In `surface.ts`:

```ts
/** With a baked glacier mask (spec 002): snow/ice only on glaciers, steep ground is rock. */
export function surfaceWithMask(slopeDeg: number, onGlacier: boolean, rules: SurfaceRules): Surface {
  if (slopeDeg >= rules.rockMinSlopeDeg) return 'rock';
  if (!onGlacier) return 'rock';
  return slopeDeg >= rules.iceMinSlopeDeg ? 'ice' : 'snow';
}

/** Mask when known (true/false), otherwise the M1 altitude rule. */
export function classifySurface(slopeDeg: number, altitudeM: number, onGlacier: boolean | null, rules: SurfaceRules): Surface {
  return onGlacier === null ? surfaceAt(slopeDeg, altitudeM, rules) : surfaceWithMask(slopeDeg, onGlacier, rules);
}
```

- `TerrainSampler.onGlacierAt(x, z)` uses the nearest mask sample. It returns `null` when the manifest has no mask, or when the point is outside the mask.
- `Player.senseWall`, `terrainColor`, `gridGeometry` and `mapImage` call `classifySurface`.
- The mesh worker receives `{ maskCrop: Uint8Array, cropOrigin, cropSpacingM }` with each tile request, or `null`.
- The backdrop mesh and the map read the full mask on the main thread.

### 5.4 Data flow

```
bake.py ─► surface.u8 + manifest.surfaceMask
                │
Game.init ─► loadSurfaceMask() ─► TerrainSampler (onGlacierAt)
                │                    ├─► Player.senseWall ─► climbRequirement
                │                    └─► ChunkManager ─► worker (mask crop) ─► gridGeometry colours
                └─► buildMapImage (map colours)
```

## 6. Acceptance and test criteria

Unit tests (Vitest):
- `surfaceWithMask`:
  - rock at 40° or more, on or off a glacier;
  - snow on a glacier below 25°;
  - ice on a glacier at 25° or more;
  - rock off a glacier at any altitude.
- `classifySurface(…, null, …)` equals `surfaceAt` for a table of inputs.
- `TerrainSampler.onGlacierAt`:
  - nearest-sample lookup with an asymmetric mask (catches row and column swaps);
  - `null` outside the mask and with no mask.
- The manifest parser accepts and validates `surfaceMask` (size equals `samplesX × samplesZ`, spacing > 0), and rejects bad values.
- `gridGeometry` uses the mask crop: a vertex on a glacier gets the snow colour, and one off a glacier gets the rock colour, at the same height and slope.
- `mapImage` respects the mask.

Python tests (pytest):
- Rasterising a square ring and a ring with a hole gives the expected cells at known coordinates. Check orientation: north is row 0.
- Multipolygon outer and inner rings.
- The synthetic test-peak bake writes `surface.u8` and the manifest entry.
- A missing `osm` block writes no mask and changes no attribution.

E2E (Playwright): the test-peak smoke test still passes, and the attribution text appears unchanged for test-peak.

Manual (playtest checklist):
- On Mera, snow and ice colour follows the glacier outlines seen on the satellite image.
- A steep wall on the glacier says "Requires ice axe + crampons" without crampons.
- A steep rock wall off the glacier above 5,400 m needs no gear.
- The map shows the glacier shape.
- The OSM credit is visible.

## 7. Deploy notes

- `public/terrain/` is generated and git-ignored. Re-bake Mera with `npm run terrain:mera` after this lands. The CI deploy bakes from the configs, so the pinned extract downloads in CI too (about 415 MB). Cache `tools/terrain/.cache/` in the workflow, or run the deploy bake with the filtered glacier cache.
- Add `tools/terrain/.cache/` to `.gitignore`.
- `CREDITS.md`: add OpenStreetMap (ODbL) with the extract date.
- `CLAUDE.md`: in "Terrain is data", add the `osm` block and `surface.u8`.
- Design spec §6.5: note that the M2 splat map starts as this glacier mask.

## 8. Open questions

- Should the CI deploy bake download the 415 MB extract on every run? Answered: no. The filtered GeoJSON of the glacier rings is committed to `tools/terrain/data/` and the bake rasterises from it (decision 1 in §9).
- Should the lower edge of a glacier get a thin snow fringe for looks? Leave it out until the playtest shows the need.

## 9. Decisions taken during planning

1. **The glacier GeoJSON is committed.** `tools/terrain/data/mera-peak-glaciers.geojson` is extracted once from `nepal-261112.osm.pbf` and kept under ODbL with attribution. This answers the open question about CI downloads.
2. **Rasterising is a numpy scanline fill** (even-odd per polygon, then OR across polygons), not `rasterio.features`. It avoids GeoTIFF transform-orientation pitfalls and is easy to test.
3. **The backdrop and the map use the mask resampled to the backdrop grid** (`sampleMask`, nearest sample). Tiles get an exact crop (`cropMask`). The full mask is not structured-cloned into the worker on every backdrop rebuild.
4. **The synthetic test-peak mask is a 200 m disc around the mound** at x = +512, z = −512. It is asymmetric, so axis mix-ups fail the contract test.
