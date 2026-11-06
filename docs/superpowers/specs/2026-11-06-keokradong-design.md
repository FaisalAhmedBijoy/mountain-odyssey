# Keokradong (Bangladesh): design

**Status:** approved in brainstorming (2026-11-06).

**Parent specs:** `2026-11-03-mountain-odyssey-design.md` (terrain pipeline §6, mountains as data), `2026-11-06-country-mountain-select-design.md` (catalog).

## 1. Goal and scope

Make **Keokradong** (Bandarban, Bangladesh, ≈ 986 m) playable from the menu: Bangladesh → Keokradong → Climb. It should look and feel like a green, forested hill, not a grey Himalayan rock slope.

**In scope:**
- A real-DEM terrain bake.
- Camps.
- A walking route all the way to the summit.
- A per-mountain **biome**: terrain palette, sky and fog.
- Procedural low-poly **trees**.
- Catalog, menu, deploy and docs.

**Out of scope:**
- Heat and humidity survival rules.
- Tree colliders.
- Water and lakes.
- Villages and buildings.
- Saka Haphong (it can follow the same pattern later).

At about 1,000 m the existing survival rules are mild:
- The oxygen ceiling is 100.
- Air is about 18 °C, so there is no cold exposure.

Only supplies and stamina matter, and that is accepted for this version.

## 2. Terrain bake

**New config `tools/terrain/keokradong.config.json`:**
- The same shape as `mera-peak.config.json`.
- `id: "keokradong"`, centred near the summit (≈ 21.95° N, 92.52° E).
- 24 tiles × 256 cells at 2 m (about 12.3 km square), with an 8 m coarse grid and a 64 m backdrop.
- The Copernicus GLO-30 COG for tile `N21_00_E092_00`.
- Attribution `Contains modified Copernicus DEM data`.

**Camps:**
- `boga-lake`, "Boga Lake", target ≈ 400 m (start).
- `ridge-camp`, "Ridge Camp", target ≈ 700 m.
- Then the automatic `summit` checkpoint.
- Camp positions come from the bake's placement on walkable ground near the target elevation. They are inspired by the real trek, not surveyed locations, as with Khare on Mera.

**New option `"summitWalkable": true`:**
- On Mera the summit camp is reached by climbing (M2), so it is exempt from the walk-connection check and has no route.
- With `summitWalkable`, the bake also includes the summit in `validate_camps` and in `build_routes`. That makes routes Boga Lake → Ridge Camp → Summit. The bake fails if the summit is not walk-connected below `routeMaxSlopeDeg` (33°).
- The default is `false`, so the Mera bake is unchanged.

**If the bake fails:**
- Typical failures are no camp near a target elevation, or no route below 33°.
- Adjust the target elevations or `toleranceM`, or move the centre slightly, and record the final values in this spec.
- Do not raise `routeMaxSlopeDeg` above the engine's `maxWalkSlopeDeg`.

**Wiring:**
- `package.json` gets `terrain:keokradong`.
- `.github/workflows/deploy.yml` bakes it after Mera and checks for `dist/terrain/keokradong/manifest.json`.
- `public/terrain/` stays git-ignored.

## 3. Biomes

A biome sets how a mountain looks. It does not change gameplay rules; `SurfaceRules` and climbability stay global.

**`MountainDef` gains `biome: BiomeId`:**
- `type BiomeId = 'himalaya' | 'tropical-hills'`.
- `mera-peak.json` and `test-peak.json` use `himalaya`, which is today's look.
- `keokradong.json` uses `tropical-hills`.

**`GAME_CONFIG.biomes[id]`** defines:
- `palette`: linear-space colour bands chosen by slope. For `tropical-hills`:
  - grass green for slopes below about 15°
  - forest green for about 15–35°
  - reddish-brown laterite soil for steeper ground
- For `himalaya`, the palette is the existing rock / snow / ice colours, chosen by `surfaceAt` as today.
- `sky`: sky colour, fog near and fog far.
  - `himalaya` keeps today's values (`GAME_CONFIG.world`).
  - `tropical-hills` uses a hazy pale blue-green sky with denser fog, for example near 300 m and far 3,500 m. Final values are tuned in playtest.
- `trees`: `null` for `himalaya`; the tree parameters in §4 for `tropical-hills`.

**Engine changes:**
- `GameOptions` gains `biome`.
- `Game` passes the biome's palette to `ChunkManager`, which forwards it to mesh builds, so the worker colours vertices from it.
- `Environment` takes the sky settings instead of reading `GAME_CONFIG.world` directly.
- The vertex colouring in `gridGeometry.ts` becomes a function of `(slopeDeg, altitudeM, palette)`.
- `GameView` passes `mountain.biome`.

**Debug override:** `?biome=<id>` on the URL overrides the mountain's biome. It is only for development and e2e, so `test-peak` can be viewed as `tropical-hills`. An unknown id is ignored.

## 4. Trees

**New engine module `src/engine/world/TreeSystem.ts`, with pure placement in `treePlacement.ts`.**

**Placement (pure, unit-tested):**
- `placeTrees(tile, sampler, rules, avoid)` returns `{ x, y, z, scale, rotation, variant }[]`.
- It uses a jittered grid with spacing `rules.spacingM`, for example 7 m, and keeps each candidate with probability `rules.density`.
- A seeded hash of the tile and cell makes the result deterministic: the same tile always gives the same trees.
- A candidate is skipped when:
  - the slope is above `rules.maxSlopeDeg` (about 40°),
  - it is within `rules.routeClearanceM` (4 m) of a route polyline,
  - it is within `rules.campClearanceM` (20 m) of a camp,
  - or it is outside the baked area.
- `y` comes from `TerrainSampler.heightAt`.

**Rendering:**
- Two or three low-poly variants, each made of a trunk (cylinder) and a crown (cone or icosphere) with a small colour variation. They are built once.
- Each variant is drawn with one `THREE.InstancedMesh` per tile.
- Trees exist only for the tiles inside `rules.ringRadius` (1, meaning the 3 × 3 tiles around the player). They are created when a tile enters that ring and disposed when it leaves, following `ChunkManager`'s tile set.
- Farther tiles show forest only through the palette.

**No colliders.** The player walks through trees. Trees cast shadows only if the frame budget allows (`rules.castShadow`, default false).

**Performance target:** the M1 budget of 30 FPS or more on minimum hardware must still hold with trees on. The density defaults are chosen to keep the instance count around 10–20 k across the 3 × 3 tiles; the playtest confirms it.

## 5. Data, menu and docs

- `src/data/mountains/keokradong.json`:
  - `id`, `facts` (name "Keokradong", country `BD`, elevationM 986, location, sources `["Copernicus GLO-30 DEM"]`)
  - `terrainBaseUrl: "terrain/keokradong"`
  - `biome: "tropical-hills"`
  - It is registered in `src/data/mountains/index.ts`.
- `src/data/catalog.ts`: the Keokradong entry gets `mountainId: 'keokradong'`, so the menu shows **Climb**. Within Bangladesh it is then listed first, because playable peaks come first.
- `README.md`: the Mountains table gains Keokradong, with its deep link `?mountain=keokradong`. The "coming soon" list loses it.
- `CLAUDE.md`:
  - add `npm run terrain:keokradong`
  - note biomes (`GAME_CONFIG.biomes`, `MountainDef.biome`) and `TreeSystem`
  - note the `summitWalkable` bake option
- `docs/playtest/m1-checklist.md`: add a short Keokradong section covering the green look, trees, the route to the summit and FPS.

## 6. Testing

**Python (`tools/terrain`):**
- `summitWalkable` routes to the summit on the synthetic test terrain, which already has a walkable south ramp to its summit.
- Without the flag, behaviour is unchanged.
- The bake config loads.

**Unit (Vitest):**
- **Biome palette:** colour by slope band, with `himalaya` equal to the existing surface colours.
- **Tree placement:**
  - deterministic for the same tile
  - none on steep cells
  - none within the route or camp clearance
  - density roughly as configured
- **Catalog:** Keokradong is playable, and Bangladesh lists it first.
- **`MountainDef`:** every mountain JSON has a valid biome.

**e2e:**
- The existing tests keep passing.
- One new check: `/?mountain=test-peak&biome=tropical-hills` loads the HUD with no page errors.
- The real Keokradong DEM is not baked in CI e2e, so its terrain is verified by the bake (deploy job) and by playtest.

**Bake:** run `npm run terrain:keokradong` locally once. It needs the network. Record the camp elevations and route slopes it prints in this spec.

## 7. Bake results

`npm run terrain:keokradong` (Copernicus GLO-30, height range 52–983 m):

- Camp Boga Lake: 401.4 m at x=-1792, z=5872.
- Camp Ridge Camp: 701.0 m at x=-16, z=4016.
- Camp Summit: 981.5 m at x=-576, z=-770.
- Route boga-lake → ridge-camp: 3589 m, max slope 32.82°.
- Route ridge-camp → summit: 5008 m, max slope 32.38°.
