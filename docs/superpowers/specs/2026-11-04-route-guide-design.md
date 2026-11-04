# Route Guide — Design

| Field | Value |
|---|---|
| Status | Approved design, ready for planning |
| Date | 2026-11-04 |
| Parent spec | [2026-11-03-mountain-odyssey-design.md](2026-11-03-mountain-odyssey-design.md) |
| Milestone | M1 follow-up (playtest feedback) |

## 1. Problem

Players cannot tell where to go. The HUD has no direction, and on Mera Peak the straight line from Khare to High Camp is too steep to walk; the walkable route winds for about 5 km. Playtest feedback: "it is not understandable where I have to go".

## 2. Goals and non-goals

**Goals**

- Show the walkable route from the last reached camp to the next camp.
- Three cues, owner-approved:
  1. A route ribbon drawn on the ground (toggle with `T`, on by default).
  2. Trail marker flags along the route (always visible).
  3. A HUD arrow with the next camp's name and remaining route distance (always visible while a route is active).
- Routes are generated automatically by the terrain bake, so new mountains get them for free.

**Non-goals**

- Runtime pathfinding or re-routing from arbitrary positions.
- A minimap or world map (M2).
- Routes to the summit (the summit is reached by climbing; M2).

## 3. Bake pipeline (Python)

### 3.1 Route search — `find_route` in `tools/terrain/terrain_lib.py`

- Input: the walkable analysis grid already produced by `walkable_map` (8 m cells, walkable = slope < `maxWalkSlopeDeg`, default 30°), the camp cells from `place_camps`, and the full-resolution heightmap.
- Algorithm: A* over 8-connected cells of the walkable grid.
  - Step cost = horizontal step length × (1 + (slopeDeg / maxWalkSlopeDeg)²), where slopeDeg is the slope of the destination cell.
  - Non-walkable cells are impassable.
  - Heuristic = straight-line distance (admissible, because the cost multiplier is ≥ 1).
- Smoothing ("string pulling"): from each kept point, skip ahead to the farthest later point whose straight segment crosses only walkable cells (sampled every 4 m). Then resample the smoothed polyline at ≤ 20 m spacing.
- Heights: each point's `y` is the full-resolution (2 m) height at that x/z.
- Markers: one every 100 m of route length, plus one at every vertex where the route heading changes by more than 30°. No marker within 25 m of the start or the end camp.
- Failure: if no path exists, raise a clear error; `bake.py` exits non-zero.

### 3.2 Which routes are generated

One route per consecutive pair of walk-connected camps in the manifest order (for Mera and test-peak: `khare` → `high-camp`). The `summit` camp gets no route.

### 3.3 Manifest format (additive)

```json
"routes": [
  {
    "from": "khare",
    "to": "high-camp",
    "lengthM": 5180.0,
    "points": [[3664.0, 4995.5, -2432.0], [3651.2, 4998.0, -2447.9]],
    "markers": [[3601.0, 5002.1, -2470.0]]
  }
]
```

- `points` and `markers` are `[x, y, z]` world coordinates (x = east, z = south, y = up), rounded to 0.1 m.
- `lengthM` is the polyline length in 3D, rounded to 1 m.
- Existing manifest fields are unchanged. A manifest without `routes` remains valid.

### 3.4 Validation

- The existing camp connectivity check stays.
- The bake additionally fails if a route cannot be found between consecutive walk-connected camps.
- The synthetic test-peak must produce a `khare` → `high-camp` route through its south ramp.

## 4. Runtime (TypeScript engine)

### 4.1 Data

- `terrainData.ts`: add `RouteDef { from: string; to: string; lengthM: number; points: [number, number, number][]; markers: [number, number, number][] }` and an optional `routes?: RouteDef[]` on `TerrainManifest`.
- `parseManifest` validates each route's shape: `from` and `to` are existing camp ids, and `points` has at least two entries of three numbers each. Invalid routes are dropped with a `console.warn`; they never crash the game.

### 4.2 Pure route math — `src/engine/systems/routeMath.ts`

- `activeRoute(routes, lastCheckpointId): RouteDef | null` returns the route whose `from` equals the last reached camp, or null.
- `progressAlong(route, feet): { index: number; t: number; offRouteM: number; remainingM: number }` finds the nearest point on the polyline in the horizontal plane (`index` is the segment, `t` the 0–1 fraction along it). `offRouteM` is the horizontal distance to that point. `remainingM` is the route length from there to the end.
- `guideTarget(route, progress, lookAheadM): Vec3`
  - When `offRouteM ≤ offRouteThresholdM`, it returns the point `lookAheadM` ahead along the route.
  - Otherwise it returns the nearest route point, which leads the player back onto the route.
  - At the end of the route, it returns the last point.
- `bearingTo(from, to, cameraYaw): number` returns the arrow angle relative to the camera view in radians (0 = straight ahead, positive = to the right). It uses the engine's yaw convention: camera yaw 0 looks toward −Z.

### 4.3 RouteGuide system — `src/engine/systems/RouteGuide.ts`

- Owns the active route, the ribbon mesh, the marker instances and the visibility flag. It never touches React.
- **Ribbon** (draped on the terrain)
  - `RouteGuide` takes a height function `(x, z) => number | null`; `Game` passes `TerrainSampler.heightAt`.
  - Only the window from `behindM` (50 m) behind to `aheadM` (400 m) ahead of the player's progress is built, as a densified strip: one row every `ribbonVertexSpacingM` (2 m) along the route, three vertices per row (left edge, centre, right edge, `ribbonWidthM` = 1.2 m wide). Each vertex sits at the terrain height at its own x/z plus `ribbonLiftM` (0.3 m); where the height function returns null (tile not loaded) it falls back to the route height interpolated between route points. Row normals come from the route direction over ±1 m, so corners are mitred.
  - The position and index buffers are allocated once per route, sized for the longest window (`(behindM + aheadM) / ribbonVertexSpacingM + 1` rows). When progress moves by `windowStepM` (10 m) or more, the rows are refilled in place and the draw range covers the active rows (no reallocation). The mesh is not frustum-culled because its contents move.
  - The material is unlit, semi-transparent and bright orange, with `depthWrite: false`, `fog: false` and `polygonOffset` (factor −2, units −2), so it stays readable in fog and does not z-fight with the ground.
  - Why draped: the 20 m route points alone left the strip under the 2 m terrain on 23 % of the Mera centreline (44 % with any part hidden, up to 1.3 m deep). Draped at 0.3 m it is hidden nowhere on the step-1 mesh.
- **Markers**
  - One `InstancedMesh` for poles: a thin cylinder, 2 m tall.
  - One `InstancedMesh` for flags: a small red plane at the pole top.
  - Both use simple geometry, with no external asset.
  - They are placed at the route's `markers` and are always visible while the route is active.
- **API**
  - `setRoute(route | null)`
  - `update(feet, cameraYaw): GuideHud | null`
  - `toggleRibbon()`
  - `dispose()`
- `GuideHud` is `{ label: string; distanceM: number; bearingRad: number; offRoute: boolean }`. `label` is the destination camp's name.

### 4.4 Game integration — `src/engine/core/Game.ts`

- `RouteGuide` is created after the checkpoints, and the active route is set from the start camp.
- On `checkpoint:reached`, the active route switches to the route starting at that camp, or to null if none exists.
- On respawn, the active route is reset to the route from the respawn camp.
- Input: a new action, `toggleRoute: ['KeyT']`, in `controls.config.ts`. A press calls `toggleRibbon()`.
- The HUD is published with the existing 100 ms throttle as a new field, `guide: GuideHud | null`.
- `dispose()` disposes the RouteGuide's geometries and materials.

### 4.5 HUD — `src/ui/Hud.tsx`

- At the top centre: an arrow rotated by `bearingRad`, the label, and the distance underneath.
  - Under 1,000 m the distance shows as `850 m`; from 1,000 m up it shows as `3.4 km`.
  - The element carries `data-testid="guide"`.
- When `offRoute` is true, the text reads "Off route — follow the arrow" in a warning colour.
- Hidden when `guide` is null.
- The pause overlay's key list gains "T route".

### 4.6 Config — `GAME_CONFIG.guide`

```ts
guide: {
  ribbonWidthM: 1.2,
  ribbonLiftM: 0.3,
  ribbonVertexSpacingM: 2,
  ribbonColor: 0xff8a1f,
  ribbonOpacity: 0.75,
  aheadM: 400,
  behindM: 50,
  windowStepM: 10,
  lookAheadM: 30,
  offRouteThresholdM: 40,
  markerPoleHeightM: 2,
  markerFlagColor: 0xd7263d,
}
```

## 5. Error handling

| Situation | Behaviour |
|---|---|
| Manifest has no `routes` | Guide is hidden; the game works as before |
| A route fails validation | The route is dropped with `console.warn`; the other routes still work |
| No route from the current camp (e.g. at the last camp) | Arrow and ribbon are hidden |
| Bake cannot find a route | Bake exits non-zero with a message naming the two camps |

## 6. Testing

- **pytest**
  - `find_route` connects two plateaus joined by a gentle ramp, and no route point is steeper than the threshold.
  - `find_route` raises when a cliff separates the camps.
  - Smoothing keeps the start and end points, and point spacing is ≤ 20 m.
  - Marker spacing and the turn-marker rule.
  - The test-peak bake produces a route.
- **Vitest (pure)**
  - `routeMath`: on route, off route, past the end, at the start, and the bearing sign (target to the right of the view gives a positive angle).
  - `parseManifest`: accepts a manifest with routes, drops malformed routes, and accepts a manifest without routes.
- **Contract test**: the committed test-peak fixture includes `routes`. Its first and last points equal the camp positions (x/z within 8 m), and `TerrainSampler.heightAt` at the route points matches their `y` within 0.5 m.
- **E2E**: on test-peak, the element `guide` is visible and its text matches `/High Camp/` and a distance (`/\d+(\.\d)? (m|km)/`).
- **Playtest checklist**: add "Following the ribbon from Khare reaches High Camp on Mera without sliding" and "`T` hides and shows the ribbon".

## 7. Performance

- The ribbon is at most 450 m of strip: 226 rows × 3 vertices (678 vertices, 900 triangles) in one draw call. A refill (every 10 m of progress) does 678 `heightAt` calls into a preallocated buffer.
- Markers take two instanced draw calls.
- `progressAlong` runs once per frame: a linear scan over at most ~300 points, which costs microseconds. It is acceptable without spatial indexing.
- No changes to the terrain streaming.
