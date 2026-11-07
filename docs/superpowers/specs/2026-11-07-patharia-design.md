# Patharia Hills (Sylhet) and the tea-garden biome: design

**Status:** approved in brainstorming (2026-11-07).

**Parent specs:**
- `2026-11-06-keokradong-design.md`: biomes, trees and `summitWalkable`.
- `2026-11-07-map-design.md`
- `2026-11-06-country-mountain-select-design.md`: catalog.

## 1. Goal and scope

Add **Patharia Hills**: a low ridge in Moulvibazar, Sylhet, ≈ 234 m, near Madhabkunda. It is an easy, scenic walk through tea gardens up to a forested ridge. It is reached from the menu: Bangladesh → Patharia Hills → Climb.

**In scope:**
- A real-DEM bake.
- A `summitName` bake option, so the top can be called "Ridge Top".
- A new **`tea-garden` biome**:
  - palette with tea-green, forest and soil bands
  - contour stripes on tea slopes
  - a bright, hazy sky
- **Layered vegetation:**
  - tea hedge rows along contours near the player
  - sparse shade trees on tea slopes
  - dense forest on steep slopes
- Catalog, docs and tests.

**Out of scope:**
- Waterfalls, water and rivers.
- Buildings and tea-factory props.
- Tea-picking gameplay.
- Collisions with vegetation.

## 2. Terrain bake

DEM probe (2026-11-07): the ridge runs north–south along ≈ 92.22–92.26° E. Its highest point is 234.7 m at 24.629° N, 92.244° E. The plains around it are ≈ 20–40 m.

**`tools/terrain/patharia.config.json`:**
- The same shape as Keokradong's.
- `id: "patharia"`, `centerLat: 24.64`, `centerLon: 92.24`.
- 24 × 256 cells at 2 m, 8 m coarse, 64 m backdrop, `noiseSeed: 235`, `summitSearchRadiusM: 1500`.
- `summitWalkable: true`, `summitName: "Ridge Top"`.
- `campPlacement` is the same as Keokradong's, except `toleranceM: 30`. The camps are low, so a smaller tolerance keeps them near their target elevation.
- DEM `Copernicus_DSM_COG_10_N24_00_E092_00_DEM`.
- Attribution `Contains modified Copernicus DEM data`.
- `camps`:
  - `tea-estate` "Tea Estate" 40
  - `madhabkunda` "Madhabkunda" 110

**New option `summitName`:**
- An optional string; it defaults to `"Summit"`.
- It sets the name of the appended summit camp. The summit's id stays `summit`.
- It is validated: a non-string value raises `ValueError`.
- Mera and Keokradong are unchanged.

**Trial bake (2026-11-07):**

| Item | Value |
|---|---|
| Tea Estate | 40.2 m at x = 3848, z = 4120 |
| Madhabkunda | 112.3 m at x = −2200, z = 4808 |
| Summit (Ridge Top) | 233.9 m at x = 446, z = 1230 |
| Tea Estate → Madhabkunda | 6,216 m, max 32.99° |
| Madhabkunda → Ridge Top | 4,536 m, max 32.94° |

- Every camp is at least 1.3 km from the grid edge.
- The camp positions are chosen by the bake and only take their names from the real places. The baked "Madhabkunda" is ≈ 4.5 km south of the real waterfall.

**Wiring:**
- `package.json` gets `terrain:patharia`.
- The deploy workflow bakes Patharia and checks for `dist/terrain/patharia/manifest.json`.

## 3. The `tea-garden` biome

`GAME_CONFIG.biomes['tea-garden']` contains `palette`, `sky` and `vegetation`. The vegetation layers are described in §4.

**Palette:**
- `kind: 'slope'` with bands (sRGB):
  - below 3°: lawn green
  - below 20°: bright tea green
  - below 35°: forest green
  - steeper: reddish laterite soil
- A new optional `stripes` field: `{ bandIndex, riseM, contrast }`.
  - On vertices whose slope falls in that band (tea), the colour is multiplied by `1 − contrast · s(altitude / riseM)`.
  - `s` is a smooth periodic 0–1 profile, for example `0.5 − 0.5·cos(2π·frac)`.
  - This draws contour-following rows that are visible from a distance.
  - The defaults are `riseM: 0.8` and `contrast: 0.18`, to be tuned in playtest.
  - It is applied in `terrainColor`, so the 3-D terrain shows it.
  - Deviation: the relief map draws the palette without stripes, because its 64 m samples would alias the 0.8 m-rise stripes into noise.

**Sky:** a bright pale morning haze, for example colour `0xd9e6dc`, fog near 400, fog far 4500.

## 4. Layered vegetation

**Config shape.** `GAME_CONFIG.biomes[id].trees` becomes `vegetation: VegetationLayer[]`:
- `himalaya`: `[]`
- `tropical-hills`: one layer, `{ kind: 'trees', …the existing tree rules }`. Keokradong must look the same as before.
- `tea-garden`:
  1. `{ kind: 'trees', …, minSlopeDeg: 20, maxSlopeDeg: 40 }`: dense forest on steep slopes.
  2. `{ kind: 'trees', …, minSlopeDeg: 3, maxSlopeDeg: 20, density: low, variants: [broadleaf] }`: sparse shade trees.
  3. `{ kind: 'tea', … }`: tea hedge rows.

**Trees (existing, extended):**
- `TreeRules` gains `minSlopeDeg` (default 0) and an optional `variants` subset.
- `placeTrees` skips slopes below `minSlopeDeg`. `variant` is chosen from the subset.
- `TreeSystem` keeps its tile ring. A layer with a variant subset draws only those meshes.

**Tea rows (new, pure placement in `teaPlacement.ts`):**
- `placeTea(area, ground, rules, avoid)` returns `{ x, y, z, yaw, length }[]`.
- It samples a world-aligned grid every `rules.stepM` (about 2 m) inside the area. A point is kept when:
  - the slope is within `[minSlopeDeg, maxSlopeDeg]` (3–20°),
  - `frac(altitude / rules.riseM) < rules.bandFraction`, which puts rows on contours (rise about 0.8 m, band about 0.35),
  - and it is clear of routes and camps, using the same clearances as the trees.
- `yaw` aligns the hedge with the contour, perpendicular to the terrain gradient, so rows follow the hill.
- Placement is deterministic and seamless across neighbouring areas, like the trees.

**Rendering (`TeaSystem`):**
- One shared low-poly hedge geometry, about 1.8 m long, 0.9 m wide and 0.8 m tall: a rounded box or flattened capsule-like shape in tea green, with a darker underside.
- It is drawn with an `InstancedMesh` per 64 m cell, for cells within `rules.radiusM` (about 250 m) of the player.
- Cells are built at most two per frame and dropped when out of range.
- No colliders, and no shadows by default.
- Deviation: cells are kept when their nearest point is within `radiusM` (not their centre), and `radiusM` is 190 m (not 250 m) to keep the hedge count near 15 k. Built cells are only dropped beyond `radiusM + cellSizeM / 2` (hysteresis).
- Target: about 15 k hedge instances or fewer around the player. Farther tea shows only as palette stripes.

The engine wiring (`Game`) creates one system per layer kind from `cfg.biomes[biome].vegetation`. It calls `update` on each in `render`, skipping it while respawning, and disposes them on cleanup.

## 5. Data, menu and docs

- `src/data/mountains/patharia.json`:
  - name "Patharia Hills", country `BD`, elevation 234, location 24.629 N / 92.244 E
  - `terrainBaseUrl: "terrain/patharia"`
  - `biome: "tea-garden"`
- `src/data/catalog.ts`: add a Bangladesh peak `patharia`, "Patharia Hills", 234 m, `approximate: true`, note "Sylhet · tea gardens", `mountainId: 'patharia'`. Within Bangladesh, playable peaks are listed first.
- `README.md`: add Patharia to the Mountains table with deep link `?mountain=patharia`, and mention the tea-garden biome in the features.
- `CLAUDE.md`:
  - `npm run terrain:patharia`
  - the `summitName` option
  - vegetation layers (`trees`, `tea`)
  - the `stripes` palette field
- `docs/playtest/m1-checklist.md`: add a `## Patharia Hills` section covering tea rows near you, contour stripes far away, shade trees, forest on steep tilas, and FPS.

## 6. Testing

**Python:**
- `summitName` renames the summit camp, the default is `"Summit"`, and a non-string raises.
- The patharia config loads, with `summitWalkable` true, `summitName` "Ridge Top", camps `tea-estate` and `madhabkunda` with increasing targets, the exact attribution, and `routeMaxSlopeDeg` ≤ 33.

**Unit (Vitest):**
- `terrainColor` stripes: inside the tea band the colour varies with altitude by at most `contrast`. Outside the band, and without `stripes`, it does not vary.
- `placeTrees` `minSlopeDeg` and the variant subset.
- `placeTea`:
  - none on flat ground (< 3°) or on steep ground
  - rows follow contours: kept points share altitude bands
  - `yaw` is perpendicular to the gradient
  - deterministic and seamless
  - keeps clear of routes and camps
- `TeaSystem` cell ring: builds at most two cells per update, drops cells out of range, and disposes.
- Catalog: Patharia is playable and listed first in Bangladesh, and every mountain has a valid biome.
- The Keokradong vegetation config is equivalent to the old `trees` config.

**e2e:**
- `/?mountain=test-peak&biome=tea-garden` loads the HUD without page errors.
- The menu shows Patharia Hills with Climb.

**Visual:** take headless screenshots of `?mountain=patharia`, close up and with the full map open.
