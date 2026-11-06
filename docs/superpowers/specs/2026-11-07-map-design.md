# Map and intermediate camps: design

**Status:** approved in brainstorming (2026-11-07).

**Parent specs:**
- `2026-11-03-mountain-odyssey-design.md`: §5.6 lists `Tab` as the route map; §5.5 covers camps.
- `2026-11-06-keokradong-design.md`

## 1. Goal and scope

While climbing, the player can see where they are on the mountain: the camps on the way, the route, and their own position, with an arrow that shows which way they are moving.

**In scope:**
- **Keokradong stops.** Keokradong gets real intermediate camps: **Boga Lake → Camp 1 → Camp 2 → Summit**.
- **Minimap.** An always-visible round minimap in the top-right corner.
- **Full map.** A full map toggled with `Tab`, showing camp names and elevations.
- **Data.** Map data comes from the existing bake output, so no new bake files are needed.
- **Mera Peak** gets the same map automatically: Khare → High Camp → Summit.

**Out of scope:**
- Rotating the minimap with the camera. The map stays north-up.
- Fog of war or unexplored areas.
- Map markers placed by the player.
- Landmarks that are not camps.

## 2. Keokradong camps

`tools/terrain/keokradong.config.json` `camps` becomes:

```json
[
  { "id": "boga-lake", "name": "Boga Lake", "targetElevationM": 400 },
  { "id": "camp-1", "name": "Camp 1", "targetElevationM": 580 },
  { "id": "camp-2", "name": "Camp 2", "targetElevationM": 800 }
]
```

`summitWalkable` stays `true`, so routes are Boga Lake → Camp 1 → Camp 2 → Summit.

**Bake requirements:**
- Each route must stay below 33°.
- Each camp must be at least 500 m from the grid edge.

**If the bake fails:**
- Move a target by up to ±50 m, or adjust `toleranceM`, and record the result.
- Never raise `routeMaxSlopeDeg`.
- Record the final values in the Keokradong spec §7, replacing the Ridge Camp values.

**Trial bake results (2026-11-07):**
- A Camp 1 target of 600 m (or 650 m) fails at 33.4°. 550 m and 580 m pass; 580 m is chosen because its total route is shorter.

| Item | Value |
|---|---|
| Boga Lake | 402.2 m at x = −3344, z = −2032 |
| Camp 1 | 576.4 m at x = 3144, z = −1424 |
| Camp 2 | 801.7 m at x = −1568, z = −1344 |
| Summit | 979.6 m at x = −576, z = −1110 |
| Boga Lake → Camp 1 | 7,494 m, max 32.96° |
| Camp 1 → Camp 2 | 5,724 m, max 32.73° |
| Camp 2 → Summit | 1,045 m, max 32.61° |

**Engine:** no change. `CheckpointSystem`, `activeRoute` and `SurvivalSystem` already handle any number of consecutive camps. Rest, respawn and the route guide's next target work for every camp.

## 3. Map data (engine, pure)

**New `src/engine/world/mapImage.ts`:**

`buildMapImage(backdrop, manifest, palette, surface)` returns `{ width, height, pixels: Uint8ClampedArray }` (RGBA). The image is a shaded relief of the backdrop heights, one pixel per backdrop sample (for example, 193 × 193 at 64 m spacing).

**Colour:**
- Use `terrainColor(slopeDeg, altitudeM, surface, linearPalette(palette))`, the same colours the 3-D terrain uses.
- Convert the result back to sRGB for the image.

**Hillshade:**
- `shade = clamp(0.55 + 0.45 · dot(normal, LIGHT), 0.35, 1)`.
- `LIGHT` points from the north-west and above, which is the cartographic convention.
- Row = z (north at the top); column = x (west on the left).

**New `src/engine/world/mapMath.ts`:**
- `worldToMap(x, z, bounds) → { u, v }` in 0–1 map units, and `mapToWorld(u, v, bounds)`. `bounds` is `{ minX, minZ, sizeX, sizeZ }` from the manifest (origin plus tiles × tile size).
- `simplifyRoute(points, minSpacingM)` keeps the first and last points and drops points closer than `minSpacingM` to the last point kept. The default is 40 m.
- `campProgress(camps, reachedIds, lastId)` returns per-camp `'reached' | 'next' | 'ahead'`. `next` is the camp after the last one reached, in route order.

**`CheckpointSystem`** exposes `reachedIds: ReadonlySet<string>`, which it already tracks.

## 4. HUD state and publishing

**`HudState.map: MapInfo | null`.** It is published once, after the world is ready.
- `image: { width, height, pixels }`
- `bounds`
- `camps: { id, name, elevationM, u, v }[]`
- `routes: { u, v }[][]`, simplified and in map units

**`HudState.mapPlayer: { u, v, headingRad } | null`.** It is published with the other HUD fields, at most every 100 ms.
- `headingRad` is the player's facing yaw.
- 0 means north, which is up on the map, and the angle increases clockwise.
- Check the sign against `PlayerSnapshot.facingYaw = atan2(facing.x, facing.z)`. World +z is south, so north-up heading = π − facingYaw, normalised. Pin this with a unit test.

**`HudState.mapCamps: Record<campId, 'reached' | 'next' | 'ahead'>`.** It is published when it changes.

**`HudState.mapOpen: boolean`.**
- `Tab` toggles it. It is read in `render()` so it also works while paused, like `H`.
- `Esc` already pauses the game. While the map is open, pausing leaves it open.

**Distance to the next camp:** the full map shows it as text, reusing the route guide's distance, `guide.distanceM`.

The engine never touches the DOM for the map. React draws everything from this data.

## 5. UI (React)

**`src/ui/map/Minimap.tsx`:**
- A 180 px circular `<canvas>` (device-pixel-ratio aware), top-right below the FPS counter.
- Each publish redraws the canvas:
  1. The relief image, drawn once to an offscreen canvas and then blitted, centred on the player and showing about 1.2 km across.
  2. The route as an orange polyline.
  3. Camp flags: reached green, next yellow, ahead white.
  4. The player arrow in the centre, rotated by `headingRad`.
  5. An "N" marker at the top.
- It has a thin border and a dark backdrop for contrast.

**`src/ui/map/FullMap.tsx`:**
- It shows when `mapOpen` is true.
- It is a centred square of about `min(80vh, 80vw)` over a dim backdrop, and fits the whole baked area.
- It draws the same layers, plus a label at each camp: "Camp 1 · 602 m".
- The player arrow and a footer line, for example "Next: Camp 2 · 1.4 km", come from the route guide.
- Its title is the mountain's name, and a hint reads "Tab — close".
- `pointer-events: none`, so clicking still resumes the game.

**Shared drawing:** `src/ui/map/drawMap.ts`. Both components use it, with parameters for the view (centre and scale). It is pure canvas-2D code that receives a `CanvasRenderingContext2D`.

**Controls:**
- `toggleMap: ['Tab']` in `controls.config.ts`.
- The controls panel gains "Map".

**Accessibility:**
- The minimap canvas has `aria-label="Map"`.
- The full map has `role="dialog"`, `aria-label="Map of {mountain}"`, and a visually hidden list of camps with their states.
- The e2e test asserts on that list.

## 6. Testing

**Unit tests (Vitest, Node):**
- `mapImage`:
  - size and RGBA length
  - flat ground gives uniform shade
  - a slope facing north-west is brighter than one facing south-east
  - the himalaya palette uses the surface colours
- `mapMath`:
  - `worldToMap` and `mapToWorld` round-trip, with corners mapping to 0 and 1
  - `simplifyRoute` keeps the ends and enforces the spacing
  - `campProgress` gives reached / next / ahead
  - heading conversion: facing north gives 0, east gives π/2, south gives π
- `CheckpointSystem`: `reachedIds` contains the first camp at the start, then each camp as it is reached.

**Canvas drawing:** not unit-tested, because Node has no DOM canvas.

**Python:** `keokradong.config.json` lists three camps with increasing target elevations, and `summitWalkable` is true.

**e2e (test-peak):**
- `[aria-label="Map"]` is visible.
- `Tab` opens the dialog "Map of Test Peak", which lists Khare, High Camp and Summit.
- `Tab` closes it.
- No page errors.

**Visual check:** take headless screenshots of Keokradong with the minimap, and with the full map open after `Tab`.
