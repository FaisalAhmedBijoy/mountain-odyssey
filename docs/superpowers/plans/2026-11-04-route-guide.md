# Route Guide Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show players the walkable route from their last camp to the next one, using a ground ribbon (toggled with `T`), trail-marker flags and a HUD arrow with distance.

**Architecture:** The Python terrain bake finds a walkable A* route between consecutive camps on the existing 8 m walkable grid, smooths and resamples it, places markers, and writes `routes` into `manifest.json`. The engine parses routes, computes progress and arrow direction with pure functions (`routeMath.ts`), and draws them with a `RouteGuide` system. `Game` switches routes on checkpoints and publishes a throttled `guide` HUD field that React renders.

**Tech Stack:** Python 3.9+ (numpy, heapq), TypeScript 5.9, Three.js 0.187, React 19, Zustand, Vitest, Playwright.

**Spec:** [docs/superpowers/specs/2026-11-04-route-guide-design.md](../specs/2026-11-04-route-guide-design.md)

## Global Constraints

- World axes: x = east, z = south, y = up (metres). Camera yaw 0 looks toward −Z; forward = (−sin yaw, 0, −cos yaw); right = (cos yaw, 0, −sin yaw).
- Route walkability uses the same threshold as camp placement and the engine: `maxWalkSlopeDeg` = 30.
- Route points ≤ 20 m apart; markers every 100 m plus at turns > 30°; no marker within 25 m of either end; coordinates rounded to 0.1 m; `lengthM` is the 3D length rounded to 1 m.
- A manifest without `routes` must keep working (guide hidden). Malformed routes are dropped with `console.warn`, never thrown.
- `src/engine/**` never imports React. Engine publishes HUD state at most every 100 ms.
- Every tunable number lives in `src/engine/config/game.config.ts` (`GAME_CONFIG.guide`).
- `T` toggles the ribbon (on at start). Markers and the HUD arrow are always visible while a route is active.
- Run `npm run format` before every commit. When Claude commits, end the message with `Co-Authored-By: Claude <model> <noreply@anthropic.com>` for the model doing the work.

## File map

```
tools/terrain/terrain_lib.py        # + RouteError, find_route, route_markers, route_length, build_routes; write_terrain(routes=)
tools/terrain/bake.py               # + routes for synthetic and DEM bakes; route summary output
tools/terrain/test_terrain_lib.py   # + route tests
src/engine/world/__fixtures__/test-peak-mini/manifest.json   # regenerated with routes
src/engine/world/terrainData.ts     # + RouteDef, routes?, parseRoutes
src/engine/world/terrainData.test.ts
src/engine/world/terrainContract.test.ts   # + route contract
src/engine/systems/routeMath.ts     # new, pure
src/engine/systems/routeMath.test.ts
src/engine/systems/RouteGuide.ts    # new, Three.js ribbon + markers + HUD data
src/engine/systems/RouteGuide.test.ts
src/engine/config/game.config.ts    # + guide block
src/engine/config/controls.config.ts# + toggleRoute
src/engine/core/hud.ts              # + guide field
src/engine/core/Game.ts             # wire RouteGuide
src/ui/formatDistance.ts            # new, pure
src/ui/formatDistance.test.ts
src/ui/Hud.tsx                      # + guide element, "T route"
src/app/app.css                     # + guide styles, toast moved down
e2e/smoke.spec.ts                   # + guide assertion
docs/playtest/m1-checklist.md       # + two items
CLAUDE.md                           # + routes note
```

---

### Task 1: Route finding in the terrain library (Python)

**Files:**
- Modify: `tools/terrain/terrain_lib.py`
- Test: `tools/terrain/test_terrain_lib.py`

**Interfaces:**
- Consumes (existing): `WalkableMap(step, heights, slope, labels, sizes)` with `.coarse(rc)`; `walkable_map(h, spacing_m, max_slope_deg=30.0, analysis_spacing_m=8.0)`; `CampPlacementError`; `bilinear_sample(grid, rows, cols)`; `slope_deg(h, spacing_m)`; `cell_to_world(rc, origin_m, spacing_m, h)`.
- Produces:
  - `class RouteError(CampPlacementError)`
  - `find_route(h, spacing_m, origin_m, wm, start_rc, goal_rc, *, max_slope_deg=30.0, point_spacing_m=20.0, check_step_m=4.0) -> list[list[float]]` — `[x, y, z]` world points; first/last at the start/goal cells.
  - `route_markers(points, every_m=100.0, turn_deg=30.0, end_clear_m=25.0) -> list[list[float]]`
  - `route_length(points) -> float` (3D)
  - `build_routes(h, spacing_m, origin_m, wm, camps, *, max_slope_deg=30.0) -> list[dict]` where `camps` is `[(camp_id, rc), ...]` and each dict is `{"from", "to", "lengthM", "points", "markers"}`.

- [ ] **Step 1: Write the failing tests**

Append to `tools/terrain/test_terrain_lib.py`. Add `import math` at the top if it is not already imported, and add `RouteError, build_routes, find_route, route_length, route_markers, walkable_map` to the `from terrain_lib import (...)` list where they are missing.

```python
def _plateaus(connected: bool) -> np.ndarray:
    """401 x 401 cells at 2 m: a 5000 m plateau in the south, a 5100 m plateau in the
    north, joined by a ~22.6 degree ramp (connected) or a 100 m cliff (not connected)."""
    n = 401
    rows = np.repeat(np.arange(n, dtype=np.float64)[:, None], n, axis=1)
    if connected:
        h = np.interp(rows.ravel(), [140.0, 260.0], [5100.0, 5000.0]).reshape(n, n)
    else:
        h = np.where(rows < 200, 5100.0, 5000.0)
    return h.astype(np.float32)


ROUTE_START, ROUTE_GOAL, ROUTE_ORIGIN, ROUTE_SPACING = (360, 200), (40, 200), -400.0, 2.0


def test_find_route_follows_walkable_ramp():
    h = _plateaus(True)
    wm = walkable_map(h, ROUTE_SPACING, 30.0, 8.0)
    pts = find_route(h, ROUTE_SPACING, ROUTE_ORIGIN, wm, ROUTE_START, ROUTE_GOAL)
    start = cell_to_world(ROUTE_START, ROUTE_ORIGIN, ROUTE_SPACING, h)
    goal = cell_to_world(ROUTE_GOAL, ROUTE_ORIGIN, ROUTE_SPACING, h)
    assert pts[0][0] == pytest.approx(start[0], abs=0.1) and pts[0][2] == pytest.approx(start[2], abs=0.1)
    assert pts[-1][0] == pytest.approx(goal[0], abs=0.1) and pts[-1][2] == pytest.approx(goal[2], abs=0.1)
    steps = [math.hypot(b[0] - a[0], b[2] - a[2]) for a, b in zip(pts, pts[1:])]
    assert max(steps) <= 20.0 + 1e-6
    slope = slope_deg(h, ROUTE_SPACING)
    for x, _, z in pts:
        r = int(round((z - ROUTE_ORIGIN) / ROUTE_SPACING))
        c = int(round((x - ROUTE_ORIGIN) / ROUTE_SPACING))
        assert slope[r, c] < 30.0
    # The ramp is straight, so the smoothed route is a straight 640 m line rising 100 m.
    assert route_length(pts) == pytest.approx(math.hypot(640.0, 100.0), rel=0.02)


def test_find_route_raises_when_a_cliff_separates_the_cells():
    h = _plateaus(False)
    wm = walkable_map(h, ROUTE_SPACING, 30.0, 8.0)
    with pytest.raises(RouteError, match="not connected"):
        find_route(h, ROUTE_SPACING, ROUTE_ORIGIN, wm, ROUTE_START, ROUTE_GOAL)


def test_route_markers_every_100_m_and_at_turns():
    straight = [[0.0, 0.0, -20.0 * i] for i in range(51)]  # 1000 m north
    assert [round(-p[2]) for p in route_markers(straight)] == [100, 200, 300, 400, 500, 600, 700, 800, 900]
    corner = [[20.0 * i, 0.0, 0.0] for i in range(16)] + [[300.0, 0.0, 20.0 * i] for i in range(1, 16)]
    assert [(round(p[0]), round(p[2])) for p in route_markers(corner)] == [
        (100, 0), (200, 0), (300, 0), (300, 100), (300, 200)
    ]
    short = [[0.0, 0.0, -20.0 * i] for i in range(7)]  # 120 m: the 100 m mark is 20 m from the end
    assert route_markers(short) == []


def test_build_routes_names_the_camps_when_no_route_exists():
    h = _plateaus(False)
    wm = walkable_map(h, ROUTE_SPACING, 30.0, 8.0)
    with pytest.raises(RouteError, match="no walkable route from a to b"):
        build_routes(h, ROUTE_SPACING, ROUTE_ORIGIN, wm, [("a", ROUTE_START), ("b", ROUTE_GOAL)])


def test_build_routes_returns_manifest_ready_dicts():
    h = _plateaus(True)
    wm = walkable_map(h, ROUTE_SPACING, 30.0, 8.0)
    (route,) = build_routes(h, ROUTE_SPACING, ROUTE_ORIGIN, wm, [("a", ROUTE_START), ("b", ROUTE_GOAL)])
    assert set(route) == {"from", "to", "lengthM", "points", "markers"}
    assert (route["from"], route["to"]) == ("a", "b")
    assert route["lengthM"] == float(round(route_length(route["points"])))
    assert route["markers"] == route_markers(route["points"])
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `.venv/bin/python -m pytest tools/terrain -q -k "route"`
Expected: FAIL with `ImportError: cannot import name 'RouteError' from 'terrain_lib'`.

- [ ] **Step 3: Implement**

In `tools/terrain/terrain_lib.py`, add `import heapq` next to the other standard-library imports. Add the following after `validate_camps`:

```python
class RouteError(CampPlacementError):
    """No walkable route between two cells."""


_NEIGHBOURS = ((-1, -1), (-1, 0), (-1, 1), (0, -1), (0, 1), (1, -1), (1, 0), (1, 1))


def find_route(
    h: np.ndarray,
    spacing_m: float,
    origin_m: float,
    wm: WalkableMap,
    start_rc: tuple[int, int],
    goal_rc: tuple[int, int],
    *,
    max_slope_deg: float = 30.0,
    point_spacing_m: float = 20.0,
    check_step_m: float = 4.0,
) -> list[list[float]]:
    """Walkable route between two full-resolution cells as [x, y, z] world points.

    A* runs on the walkable map's coarse grid (8-connected; step cost = step length x
    (1 + (slope / max_slope_deg)^2); cells at or above max_slope_deg are impassable).
    The cell path is string-pulled (a shortcut is kept only when the straight segment
    stays on walkable cells, sampled every check_step_m) and resampled so consecutive
    points are at most point_spacing_m apart. Heights come from the full-resolution
    heightmap. Raises RouteError when the cells are not connected.
    """
    rows, cols = wm.slope.shape
    walk_grid = wm.slope < max_slope_deg
    walk = walk_grid.ravel().tolist()
    cost = (1.0 + (wm.slope / max_slope_deg) ** 2).ravel().tolist()
    cs = spacing_m * wm.step
    s = wm.coarse(start_rc)
    g = wm.coarse(goal_rc)
    si, gi = s[0] * cols + s[1], g[0] * cols + g[1]
    if not walk[si] or not walk[gi]:
        raise RouteError("route start or end is not on walkable ground")

    best = [math.inf] * (rows * cols)
    came = [-1] * (rows * cols)
    best[si] = 0.0
    diag = math.sqrt(2.0)
    heap = [(math.hypot(s[0] - g[0], s[1] - g[1]) * cs, 0.0, si)]
    while heap:
        _, d, i = heapq.heappop(heap)
        if i == gi:
            break
        if d > best[i]:
            continue
        r, c = divmod(i, cols)
        for dr, dc in _NEIGHBOURS:
            nr, nc = r + dr, c + dc
            if nr < 0 or nr >= rows or nc < 0 or nc >= cols:
                continue
            ni = nr * cols + nc
            if not walk[ni]:
                continue
            nd = d + (diag if dr and dc else 1.0) * cs * cost[ni]
            if nd < best[ni]:
                best[ni] = nd
                came[ni] = i
                heapq.heappush(heap, (nd + math.hypot(nr - g[0], nc - g[1]) * cs, nd, ni))
    if not math.isfinite(best[gi]):
        raise RouteError("cells are not connected by walkable ground")

    cells = [gi]
    while cells[-1] != si:
        cells.append(came[cells[-1]])
    cells.reverse()

    def to_xz(rc: tuple[int, int]) -> tuple[float, float]:
        return origin_m + rc[1] * spacing_m, origin_m + rc[0] * spacing_m

    inner = [to_xz((ci // cols * wm.step, ci % cols * wm.step)) for ci in cells[1:-1]]
    pts = [to_xz(start_rc), *inner, to_xz(goal_rc)]

    def clear(a: tuple[float, float], b: tuple[float, float]) -> bool:
        n = max(1, int(math.ceil(math.hypot(b[0] - a[0], b[1] - a[1]) / check_step_m)))
        for k in range(n + 1):
            t = k / n
            x = a[0] + (b[0] - a[0]) * t
            z = a[1] + (b[1] - a[1]) * t
            r = int(round((z - origin_m) / cs))
            c = int(round((x - origin_m) / cs))
            if r < 0 or r >= rows or c < 0 or c >= cols or not walk_grid[r, c]:
                return False
        return True

    kept = [pts[0]]
    i = 0
    while i < len(pts) - 1:
        j = i + 1
        while j + 1 < len(pts) and clear(pts[i], pts[j + 1]):
            j += 1
        kept.append(pts[j])
        i = j

    xz: list[tuple[float, float]] = []
    for a, b in zip(kept, kept[1:]):
        n = max(1, int(math.ceil(math.hypot(b[0] - a[0], b[1] - a[1]) / point_spacing_m)))
        xz.extend((a[0] + (b[0] - a[0]) * k / n, a[1] + (b[1] - a[1]) * k / n) for k in range(n))
    xz.append(kept[-1])
    rows_f = np.array([(z - origin_m) / spacing_m for _, z in xz])
    cols_f = np.array([(x - origin_m) / spacing_m for x, _ in xz])
    ys = bilinear_sample(h, rows_f, cols_f)
    return [[round(x, 1), round(float(y), 1), round(z, 1)] for (x, z), y in zip(xz, ys)]


def route_length(points: list[list[float]]) -> float:
    """3D length of a route polyline in metres."""
    return float(
        sum(math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]) for a, b in zip(points, points[1:]))
    )


def route_markers(
    points: list[list[float]], every_m: float = 100.0, turn_deg: float = 30.0, end_clear_m: float = 25.0
) -> list[list[float]]:
    """Trail-marker positions: one every every_m of horizontal route length plus one
    at each vertex where the heading changes by more than turn_deg, skipping markers
    within end_clear_m of either end and duplicates closer than 1 m."""
    seg = [math.hypot(b[0] - a[0], b[2] - a[2]) for a, b in zip(points, points[1:])]
    total = sum(seg)
    out: list[list[float]] = []

    def add(p: list[float], dist: float) -> None:
        if dist < end_clear_m or total - dist < end_clear_m:
            return
        if out and math.hypot(out[-1][0] - p[0], out[-1][2] - p[2]) < 1.0:
            return
        out.append([round(p[0], 1), round(p[1], 1), round(p[2], 1)])

    def heading(a: list[float], b: list[float]) -> float:
        return math.atan2(b[2] - a[2], b[0] - a[0])

    dist = 0.0
    next_mark = every_m
    for i, (a, b, length) in enumerate(zip(points, points[1:], seg)):
        if i > 0 and length > 0 and seg[i - 1] > 0:
            turn = heading(a, b) - heading(points[i - 1], a)
            turn = abs((turn + math.pi) % (2 * math.pi) - math.pi)
            if math.degrees(turn) > turn_deg:
                add(a, dist)
        while length > 0 and next_mark <= dist + length + 1e-9:
            t = (next_mark - dist) / length
            add([a[k] + (b[k] - a[k]) * t for k in range(3)], next_mark)
            next_mark += every_m
        dist += length
    return out


def build_routes(
    h: np.ndarray,
    spacing_m: float,
    origin_m: float,
    wm: WalkableMap,
    camps: list[tuple[str, tuple[int, int]]],
    *,
    max_slope_deg: float = 30.0,
) -> list[dict]:
    """One manifest route per pair of consecutive walk-connected camps."""
    routes = []
    for (a_id, a_rc), (b_id, b_rc) in zip(camps, camps[1:]):
        try:
            points = find_route(h, spacing_m, origin_m, wm, a_rc, b_rc, max_slope_deg=max_slope_deg)
        except RouteError as err:
            raise RouteError(f"no walkable route from {a_id} to {b_id}: {err}") from err
        routes.append(
            {
                "from": a_id,
                "to": b_id,
                "lengthM": float(round(route_length(points))),
                "points": points,
                "markers": route_markers(points),
            }
        )
    return routes
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `.venv/bin/python -m pytest tools/terrain -q`
Expected: all pass (30 existing + 5 new = 35).

- [ ] **Step 5: Commit**

```bash
npm run format && git add tools/terrain/terrain_lib.py tools/terrain/test_terrain_lib.py
git commit -m "feat(terrain): find smoothed walkable routes between camps with trail markers"
```

---

### Task 2: Bake routes into the manifest

**Files:**
- Modify: `tools/terrain/terrain_lib.py` (`write_terrain`), `tools/terrain/bake.py`
- Modify (regenerated): `src/engine/world/__fixtures__/test-peak-mini/manifest.json`
- Test: `tools/terrain/test_terrain_lib.py`

**Interfaces:**
- Consumes: `walkable_map`, `validate_camps`, `build_routes` (Task 1).
- Produces: `write_terrain(..., backdrop_spacing_m, routes=None)` writes `manifest["routes"]` when `routes` is not None. `bake_synthetic` and `bake_dem` always write routes. Test-peak route `khare` → `high-camp` passes through the south ramp.

- [ ] **Step 1: Write the failing test**

Append to `tools/terrain/test_terrain_lib.py`:

```python
def test_bake_synthetic_writes_a_route_through_the_south_ramp(tmp_path):
    from bake import bake_synthetic

    m = bake_synthetic(str(tmp_path))
    (route,) = m["routes"]
    assert (route["from"], route["to"]) == ("khare", "high-camp")
    khare, high = (c["position"] for c in m["camps"])
    assert route["points"][0][0] == pytest.approx(khare[0], abs=0.1)
    assert route["points"][0][2] == pytest.approx(khare[2], abs=0.1)
    assert route["points"][-1][0] == pytest.approx(high[0], abs=0.1)
    assert route["points"][-1][2] == pytest.approx(high[2], abs=0.1)
    assert 780.0 <= route["lengthM"] <= 1000.0
    ramp = [p for p in route["points"] if 280.0 <= p[2] <= 320.0]
    assert ramp and all(abs(p[0]) < 80.0 for p in ramp)
    assert json.loads((tmp_path / "manifest.json").read_text())["routes"] == m["routes"]
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `.venv/bin/python -m pytest tools/terrain -q -k south_ramp`
Expected: FAIL with `KeyError: 'routes'`.

- [ ] **Step 3: Implement**

In `tools/terrain/terrain_lib.py`, change the `write_terrain` signature and the end of its body:

```python
def write_terrain(
    out_dir: str | Path,
    mountain_id: str,
    h: np.ndarray,
    spacing_m: float,
    tile_cells: int,
    origin_m: float,
    camps: list[dict],
    attribution: str,
    backdrop_spacing_m: float,
    routes: list[dict] | None = None,
) -> dict:
```

and, right after the `manifest = {...}` literal and before it is written:

```python
    if routes is not None:
        manifest["routes"] = routes
```

In `tools/terrain/bake.py`, add `build_routes` to the `from terrain_lib import (...)` list and replace `bake_synthetic` with:

```python
def bake_synthetic(out: str, spec: GridSpec = TEST_PEAK_SPEC, backdrop_spacing_m: float = 64.0,
                   validate: bool = True) -> dict:
    h, camp_cells = synthetic_terrain(spec)
    slope_limit = CAMP_PLACEMENT_DEFAULTS["maxWalkSlopeDeg"]
    wm = walkable_map(h, spec.spacing_m, slope_limit, CAMP_PLACEMENT_DEFAULTS["analysisSpacingM"])
    walk_cells = [(camp_id, rc) for camp_id, _, rc in camp_cells]
    if validate:
        validate_camps(h, spec.spacing_m, walk_cells, walk_map=wm)
    routes = build_routes(h, spec.spacing_m, spec.origin, wm, walk_cells, max_slope_deg=slope_limit)
    camps = [
        {"id": camp_id, "name": name, "position": cell_to_world(rc, spec.origin, spec.spacing_m, h)}
        for camp_id, name, rc in camp_cells
    ]
    return write_terrain(out, "test-peak", h, spec.spacing_m, spec.tile_cells, spec.origin, camps,
                         "Synthetic test terrain", backdrop_spacing_m=backdrop_spacing_m, routes=routes)
```

In `bake_dem`, replace the `validate_camps(...)` line and the final `return write_terrain(...)` with:

```python
    walk_cells = [(c["id"], rc) for c, rc in zip(cfg["camps"], cells)]
    validate_camps(h, spec.spacing_m, walk_cells, walk_map=wm, **walk)
    print("Finding walkable routes between camps ...", flush=True)
    routes = build_routes(h, spec.spacing_m, spec.origin, wm, walk_cells, max_slope_deg=walk["max_slope_deg"])
```

(keep the existing `camps = [...]` and summit lines in between), and:

```python
    return write_terrain(out, cfg["id"], h, spec.spacing_m, spec.tile_cells, spec.origin, camps,
                         cfg["attribution"], cfg["backdropSpacingM"], routes=routes)
```

In `main`, change the error message and print a route summary after the camp lines:

```python
    except CampPlacementError as err:
        print(f"Bake validation failed: {err}", file=sys.stderr)
        return 1
    print(f"Wrote {manifest['tilesX'] * manifest['tilesZ']} tiles to {args.out}")
    for camp in manifest["camps"]:
        x, y, z = camp["position"]
        print(f"  {camp['id']:<10} x={x:>9.1f}  z={z:>9.1f}  elevation={y:>7.1f} m")
    for route in manifest.get("routes", []):
        print(f"  route {route['from']} -> {route['to']}: {route['lengthM']:.0f} m, "
              f"{len(route['points'])} points, {len(route['markers'])} markers")
    return 0
```

- [ ] **Step 4: Regenerate the contract fixture and run all Python tests**

```bash
UPDATE_FIXTURES=1 .venv/bin/python -m pytest tools/terrain -q -k contract_fixture
.venv/bin/python -m pytest tools/terrain -q
```

Expected: the first command passes and rewrites `src/engine/world/__fixtures__/test-peak-mini/manifest.json` (it now has a `routes` array; the binary tiles are unchanged). The second gives 36 passed.

Run: `git diff --stat src/engine/world/__fixtures__/`
Expected: only `manifest.json` changed.

- [ ] **Step 5: Bake test-peak and check the output**

Run: `source .venv/bin/activate && npm run terrain:test`
Expected: the camp lines as before, plus a line like `route khare -> high-camp: 8xx m, 4x points, 7 markers`.

- [ ] **Step 6: Commit**

```bash
npm run format && git add tools/terrain/terrain_lib.py tools/terrain/bake.py tools/terrain/test_terrain_lib.py src/engine/world/__fixtures__/test-peak-mini/manifest.json
git commit -m "feat(terrain): write walkable camp-to-camp routes into the terrain manifest"
```

---

### Task 3: Parse routes in the engine and extend the contract test

**Files:**
- Modify: `src/engine/world/terrainData.ts`
- Test: `src/engine/world/terrainData.test.ts`, `src/engine/world/terrainContract.test.ts`

**Interfaces:**
- Produces:
  - `interface RouteDef { from: string; to: string; lengthM: number; points: [number, number, number][]; markers: [number, number, number][] }`
  - `TerrainManifest.routes?: RouteDef[]`. After `parseManifest` this is always an array, empty when the manifest has none.
  - `parseRoutes(raw: unknown, campIds: ReadonlySet<string>): RouteDef[]`

- [ ] **Step 1: Write the failing tests**

Append to `src/engine/world/terrainData.test.ts`, and add `parseRoutes` to its import from `./terrainData`:

```ts
describe('routes in the manifest', () => {
  const base = {
    id: 't',
    spacingM: 1,
    tileSamples: 3,
    tilesX: 1,
    tilesZ: 1,
    originX: 0,
    originZ: 0,
    minHeightM: 0,
    maxHeightM: 1,
    backdrop: { file: 'b', samples: 2, spacingM: 2 },
    camps: [
      { id: 'a', name: 'A', position: [0, 0, 0] },
      { id: 'b', name: 'B', position: [0, 0, -100] },
    ],
  };
  const good = {
    from: 'a',
    to: 'b',
    lengthM: 100,
    points: [
      [0, 0, 0],
      [0, 0, -100],
    ],
    markers: [],
  };

  it('keeps well-formed routes', () => {
    expect(parseManifest({ ...base, routes: [good] }).routes).toEqual([good]);
  });

  it('defaults to no routes', () => {
    expect(parseManifest(base).routes).toEqual([]);
  });

  it('drops malformed routes with a warning instead of throwing', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const routes = parseRoutes(
      [good, { ...good, to: 'nowhere' }, { ...good, points: [[0, 0]] }, 'junk'],
      new Set(['a', 'b']),
    );
    expect(routes).toEqual([good]);
    expect(warn).toHaveBeenCalledTimes(3);
    warn.mockRestore();
  });

  it('ignores a non-array routes field', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    expect(parseRoutes({ nope: true }, new Set(['a']))).toEqual([]);
    warn.mockRestore();
  });
});
```

Append to `src/engine/world/terrainContract.test.ts` (inside the existing `describe`):

```ts
  it('ships a walkable route from the first camp to the next that lies on the terrain', () => {
    const { m, sampler } = loadFixture();
    const route = m.routes!.find((r) => r.from === m.camps[0].id)!;
    expect(route.to).toBe(m.camps[1].id);
    const [first, last] = [route.points[0], route.points[route.points.length - 1]];
    expect(Math.hypot(first[0] - m.camps[0].position[0], first[2] - m.camps[0].position[2])).toBeLessThan(8);
    expect(Math.hypot(last[0] - m.camps[1].position[0], last[2] - m.camps[1].position[2])).toBeLessThan(8);
    for (const [x, y, z] of route.points) {
      expect(Math.abs(sampler.heightAt(x, z)! - y)).toBeLessThan(0.5);
    }
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/engine/world/terrainData.test.ts src/engine/world/terrainContract.test.ts`
Expected: FAIL. `parseRoutes` is not exported, and `m.routes` is undefined.

- [ ] **Step 3: Implement**

In `src/engine/world/terrainData.ts`, add after `CampDef`:

```ts
export interface RouteDef {
  from: string;
  to: string;
  lengthM: number;
  /** [x, y, z] world points, at most ~20 m apart. */
  points: [number, number, number][];
  /** [x, y, z] trail-marker positions. */
  markers: [number, number, number][];
}
```

Add `routes?: RouteDef[];` as the last field of `TerrainManifest`. Then add `parseRoutes` and use it in `parseManifest`:

```ts
const isVec3 = (v: unknown): v is [number, number, number] =>
  Array.isArray(v) && v.length === 3 && v.every((n) => typeof n === 'number' && Number.isFinite(n));

/** Valid routes only; malformed entries are dropped with a warning, never thrown. */
export function parseRoutes(raw: unknown, campIds: ReadonlySet<string>): RouteDef[] {
  if (raw === undefined) return [];
  if (!Array.isArray(raw)) {
    console.warn('Terrain manifest "routes" is not an array; ignoring it');
    return [];
  }
  const out: RouteDef[] = [];
  raw.forEach((entry: unknown, i) => {
    const r = (entry ?? {}) as Partial<RouteDef>;
    const ok =
      typeof r.from === 'string' &&
      campIds.has(r.from) &&
      typeof r.to === 'string' &&
      campIds.has(r.to) &&
      typeof r.lengthM === 'number' &&
      Array.isArray(r.points) &&
      r.points.length >= 2 &&
      r.points.every(isVec3) &&
      Array.isArray(r.markers) &&
      r.markers.every(isVec3);
    if (ok) out.push(r as RouteDef);
    else console.warn(`Terrain manifest route ${i} is malformed; ignoring it`);
  });
  return out;
}
```

Replace the last line of `parseManifest` (`return { attribution: '', ...m } as TerrainManifest;`) with:

```ts
  const campIds = new Set(m.camps.map((c) => c.id));
  return { attribution: '', ...m, routes: parseRoutes(m.routes, campIds) } as TerrainManifest;
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/engine/world && npm run typecheck`
Expected: PASS, typecheck clean.

- [ ] **Step 5: Commit**

```bash
npm run format && git add src/engine/world/terrainData.ts src/engine/world/terrainData.test.ts src/engine/world/terrainContract.test.ts
git commit -m "feat(engine): parse baked routes from the terrain manifest"
```

---

### Task 4: Pure route math

**Files:**
- Create: `src/engine/systems/routeMath.ts`
- Test: `src/engine/systems/routeMath.test.ts`

**Interfaces:**
- Consumes: `RouteDef` (Task 3), `Vec3`, `clamp` (`src/engine/core/math.ts`).
- Produces:
  - `interface RouteProgress { index: number; t: number; offRouteM: number; remainingM: number }`
  - `activeRoute(routes: readonly RouteDef[] | undefined, fromCampId: string): RouteDef | null`
  - `progressAlong(route: RouteDef, feet: Vec3): RouteProgress`. Nearest point in the horizontal plane; `remainingM` is the 3D length from there to the end.
  - `pointOnRoute(route: RouteDef, index: number, t: number): Vec3`
  - `guideTarget(route: RouteDef, progress: RouteProgress, lookAheadM: number, offRouteThresholdM: number): Vec3`
  - `bearingTo(from: Vec3, to: Vec3, cameraYaw: number): number`. Radians relative to the camera view: 0 is ahead, positive is to the right, in the range (−π, π].

- [ ] **Step 1: Write the failing test**

`src/engine/systems/routeMath.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { RouteDef } from '../world/terrainData';
import { activeRoute, bearingTo, guideTarget, progressAlong } from './routeMath';

// 100 m straight north (toward -Z), a point every 20 m, rising 1 m per point.
const north: RouteDef = {
  from: 'a',
  to: 'b',
  lengthM: 100,
  points: Array.from({ length: 6 }, (_, i) => [0, i, -20 * i] as [number, number, number]),
  markers: [],
};

describe('activeRoute', () => {
  it('finds the route leaving a camp, or null', () => {
    expect(activeRoute([north], 'a')).toBe(north);
    expect(activeRoute([north], 'b')).toBeNull();
    expect(activeRoute(undefined, 'a')).toBeNull();
  });
});

describe('progressAlong', () => {
  it('projects onto the route', () => {
    const p = progressAlong(north, { x: 0, y: 0, z: -10 });
    expect(p.index).toBe(0);
    expect(p.t).toBeCloseTo(0.5);
    expect(p.offRouteM).toBeCloseTo(0);
    expect(p.remainingM).toBeCloseTo(Math.hypot(20, 1) * 4.5);
  });

  it('measures how far the player is from the route', () => {
    expect(progressAlong(north, { x: 5, y: 0, z: -50 }).offRouteM).toBeCloseTo(5);
  });

  it('clamps past the end', () => {
    const p = progressAlong(north, { x: 0, y: 0, z: -150 });
    expect(p.remainingM).toBeCloseTo(0);
    expect(p.offRouteM).toBeCloseTo(50);
  });
});

describe('guideTarget', () => {
  it('looks ahead along the route when on it', () => {
    const t = guideTarget(north, progressAlong(north, { x: 0, y: 0, z: -10 }), 30, 40);
    expect(t.x).toBeCloseTo(0);
    expect(t.z).toBeCloseTo(-40);
  });

  it('stops at the end of the route', () => {
    const t = guideTarget(north, progressAlong(north, { x: 0, y: 0, z: -95 }), 30, 40);
    expect(t.z).toBeCloseTo(-100);
  });

  it('points back to the nearest route point when off the route', () => {
    const t = guideTarget(north, progressAlong(north, { x: 60, y: 0, z: -50 }), 30, 40);
    expect(t.x).toBeCloseTo(0);
    expect(t.z).toBeCloseTo(-50);
  });
});

describe('bearingTo', () => {
  const origin = { x: 0, y: 0, z: 0 };
  it('is 0 straight ahead and positive to the right (camera yaw 0 looks north)', () => {
    expect(bearingTo(origin, { x: 0, y: 0, z: -10 }, 0)).toBeCloseTo(0);
    expect(bearingTo(origin, { x: 10, y: 0, z: 0 }, 0)).toBeCloseTo(Math.PI / 2);
    expect(bearingTo(origin, { x: -10, y: 0, z: 0 }, 0)).toBeCloseTo(-Math.PI / 2);
  });

  it('follows the camera yaw', () => {
    // yaw -PI/2 looks east, so an eastern target is straight ahead
    expect(bearingTo(origin, { x: 10, y: 0, z: 0 }, -Math.PI / 2)).toBeCloseTo(0);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/engine/systems/routeMath.test.ts`
Expected: FAIL with `Failed to resolve import "./routeMath"`.

- [ ] **Step 3: Implement**

`src/engine/systems/routeMath.ts`:

```ts
import { clamp, type Vec3 } from '../core/math';
import type { RouteDef } from '../world/terrainData';

export interface RouteProgress {
  /** Segment index (points[index] -> points[index + 1]). */
  index: number;
  /** 0–1 position along that segment. */
  t: number;
  /** Horizontal distance from the player to the route. */
  offRouteM: number;
  /** 3D route length from the nearest point to the end. */
  remainingM: number;
}

type P3 = [number, number, number];

const length3 = (a: P3, b: P3): number => Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);

export function activeRoute(
  routes: readonly RouteDef[] | undefined,
  fromCampId: string,
): RouteDef | null {
  return routes?.find((r) => r.from === fromCampId) ?? null;
}

export function pointOnRoute(route: RouteDef, index: number, t: number): Vec3 {
  const a = route.points[index];
  const b = route.points[Math.min(index + 1, route.points.length - 1)];
  return { x: a[0] + (b[0] - a[0]) * t, y: a[1] + (b[1] - a[1]) * t, z: a[2] + (b[2] - a[2]) * t };
}

export function progressAlong(route: RouteDef, feet: Vec3): RouteProgress {
  const p = route.points;
  let index = 0;
  let t = 0;
  let bestD2 = Infinity;
  for (let i = 0; i < p.length - 1; i++) {
    const [ax, , az] = p[i];
    const [bx, , bz] = p[i + 1];
    const dx = bx - ax;
    const dz = bz - az;
    const len2 = dx * dx + dz * dz;
    const s = len2 > 0 ? clamp(((feet.x - ax) * dx + (feet.z - az) * dz) / len2, 0, 1) : 0;
    const qx = ax + dx * s;
    const qz = az + dz * s;
    const d2 = (feet.x - qx) ** 2 + (feet.z - qz) ** 2;
    if (d2 < bestD2) {
      bestD2 = d2;
      index = i;
      t = s;
    }
  }
  let remainingM = length3(p[index], p[index + 1]) * (1 - t);
  for (let i = index + 1; i < p.length - 1; i++) remainingM += length3(p[i], p[i + 1]);
  return { index, t, offRouteM: Math.sqrt(bestD2), remainingM };
}

export function guideTarget(
  route: RouteDef,
  progress: RouteProgress,
  lookAheadM: number,
  offRouteThresholdM: number,
): Vec3 {
  let from = pointOnRoute(route, progress.index, progress.t);
  if (progress.offRouteM > offRouteThresholdM) return from;
  let need = lookAheadM;
  for (let i = progress.index + 1; i < route.points.length; i++) {
    const [x, y, z] = route.points[i];
    const to = { x, y, z };
    const step = Math.hypot(to.x - from.x, to.z - from.z);
    if (step >= need) {
      const k = step > 0 ? need / step : 0;
      return { x: from.x + (to.x - from.x) * k, y: from.y + (to.y - from.y) * k, z: from.z + (to.z - from.z) * k };
    }
    need -= step;
    from = to;
  }
  return from;
}

export function bearingTo(from: Vec3, to: Vec3, cameraYaw: number): number {
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  const ahead = -Math.sin(cameraYaw) * dx - Math.cos(cameraYaw) * dz;
  const right = Math.cos(cameraYaw) * dx - Math.sin(cameraYaw) * dz;
  return Math.atan2(right, ahead);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/engine/systems/routeMath.test.ts`
Expected: PASS, 9 tests.

- [ ] **Step 5: Commit**

```bash
npm run format && git add src/engine/systems/routeMath.ts src/engine/systems/routeMath.test.ts
git commit -m "feat(engine): add route progress, look-ahead target and bearing math"
```

---

### Task 5: RouteGuide system (ribbon, markers, HUD data)

**Files:**
- Create: `src/engine/systems/RouteGuide.ts`
- Modify: `src/engine/config/game.config.ts`, `src/engine/config/controls.config.ts`
- Test: `src/engine/systems/RouteGuide.test.ts`

**Interfaces:**
- Consumes: `RouteDef` (Task 3), `progressAlong`, `guideTarget`, `bearingTo` (Task 4).
- Produces:
  - `interface GuideHud { label: string; distanceM: number; bearingRad: number; offRoute: boolean }`
  - `class RouteGuide(parent: THREE.Object3D)` with:
    - `setRoute(route: RouteDef | null, label: string): void`
    - `update(feet: Vec3, cameraYaw: number): GuideHud | null`
    - `toggleRibbon(): boolean` (returns the new visibility)
    - `dispose(): void`
  - Scene object names: `route-ribbon`, `route-marker-poles`, `route-marker-flags`.
  - `GAME_CONFIG.guide` (values below). `CONTROLS.toggleRoute = ['KeyT']`.

- [ ] **Step 1: Add the config and the key binding**

In `src/engine/config/game.config.ts`, add this key just before the closing `} as const;`:

```ts
  guide: {
    ribbonWidthM: 1.2,
    ribbonLiftM: 0.15,
    ribbonColor: 0xff8a1f,
    ribbonOpacity: 0.75,
    aheadM: 400,
    behindM: 50,
    windowStepM: 10,
    lookAheadM: 30,
    offRouteThresholdM: 40,
    markerPoleHeightM: 2,
    markerPoleColor: 0x8b6b3d,
    markerFlagColor: 0xd7263d,
  },
```

In `src/engine/config/controls.config.ts`, add `toggleRoute: ['KeyT'],` after `cameraDistance`.

- [ ] **Step 2: Write the failing test**

`src/engine/systems/RouteGuide.test.ts`:

```ts
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import type { RouteDef } from '../world/terrainData';
import { RouteGuide } from './RouteGuide';

// 1000 m north (toward -Z), a point every 20 m, nine markers.
const route: RouteDef = {
  from: 'a',
  to: 'b',
  lengthM: 1000,
  points: Array.from({ length: 51 }, (_, i) => [0, 5000, -20 * i] as [number, number, number]),
  markers: Array.from({ length: 9 }, (_, i) => [0, 5000, -100 * (i + 1)] as [number, number, number]),
};

function setup() {
  const parent = new THREE.Group();
  const guide = new RouteGuide(parent);
  guide.setRoute(route, 'High Camp');
  const ribbon = () => parent.getObjectByName('route-ribbon') as THREE.Mesh | undefined;
  return { parent, guide, ribbon };
}

describe('RouteGuide', () => {
  it('builds a ribbon strip and instanced markers', () => {
    const { parent, ribbon } = setup();
    expect(ribbon()!.geometry.index!.count).toBe(50 * 6);
    expect((parent.getObjectByName('route-marker-poles') as THREE.InstancedMesh).count).toBe(9);
    expect((parent.getObjectByName('route-marker-flags') as THREE.InstancedMesh).count).toBe(9);
  });

  it('draws only the window around the player', () => {
    const { guide, ribbon } = setup();
    guide.update({ x: 0, y: 5000, z: 0 }, 0);
    expect(ribbon()!.geometry.drawRange).toMatchObject({ start: 0, count: 21 * 6 });
    guide.update({ x: 0, y: 5000, z: -500 }, 0);
    expect(ribbon()!.geometry.drawRange).toMatchObject({ start: 22 * 6, count: 24 * 6 });
  });

  it('reports label, remaining distance, bearing and off-route state', () => {
    const { guide } = setup();
    const on = guide.update({ x: 0, y: 5000, z: -500 }, 0)!;
    expect(on.label).toBe('High Camp');
    expect(on.distanceM).toBeCloseTo(500);
    expect(on.bearingRad).toBeCloseTo(0);
    expect(on.offRoute).toBe(false);
    const off = guide.update({ x: 100, y: 5000, z: -500 }, 0)!;
    expect(off.offRoute).toBe(true);
    expect(off.bearingRad).toBeCloseTo(-Math.PI / 2);
  });

  it('toggles only the ribbon', () => {
    const { parent, guide, ribbon } = setup();
    expect(guide.toggleRibbon()).toBe(false);
    expect(ribbon()!.visible).toBe(false);
    expect(parent.getObjectByName('route-marker-poles')!.visible).toBe(true);
    expect(guide.toggleRibbon()).toBe(true);
    expect(ribbon()!.visible).toBe(true);
  });

  it('keeps the ribbon hidden across route changes once toggled off', () => {
    const { guide, ribbon } = setup();
    guide.toggleRibbon();
    guide.setRoute(route, 'High Camp');
    expect(ribbon()!.visible).toBe(false);
  });

  it('clears everything for a null route and on dispose', () => {
    const { parent, guide } = setup();
    guide.setRoute(null, '');
    expect(parent.children).toHaveLength(0);
    expect(guide.update({ x: 0, y: 0, z: 0 }, 0)).toBeNull();
    guide.setRoute(route, 'High Camp');
    guide.dispose();
    expect(parent.children).toHaveLength(0);
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npx vitest run src/engine/systems/RouteGuide.test.ts`
Expected: FAIL with `Failed to resolve import "./RouteGuide"`.

- [ ] **Step 4: Implement**

`src/engine/systems/RouteGuide.ts`:

```ts
import * as THREE from 'three';
import { GAME_CONFIG } from '../config/game.config';
import type { Vec3 } from '../core/math';
import type { RouteDef } from '../world/terrainData';
import { bearingTo, guideTarget, progressAlong } from './routeMath';

const g = GAME_CONFIG.guide;

export interface GuideHud {
  label: string;
  distanceM: number;
  bearingRad: number;
  offRoute: boolean;
}

/** Draws the active route (ribbon + trail markers) and computes the HUD arrow. */
export class RouteGuide {
  private route: RouteDef | null = null;
  private label = '';
  private ribbon: THREE.Mesh | null = null;
  private poles: THREE.InstancedMesh | null = null;
  private flags: THREE.InstancedMesh | null = null;
  private ribbonVisible = true;
  /** Horizontal distance from the route start to each point. */
  private along: number[] = [];
  private windowAt = -Infinity;
  private readonly ribbonMaterial = new THREE.MeshBasicMaterial({
    color: g.ribbonColor,
    transparent: true,
    opacity: g.ribbonOpacity,
    depthWrite: false,
    fog: false,
    side: THREE.DoubleSide,
  });
  private readonly poleMaterial = new THREE.MeshLambertMaterial({ color: g.markerPoleColor });
  private readonly flagMaterial = new THREE.MeshLambertMaterial({
    color: g.markerFlagColor,
    side: THREE.DoubleSide,
  });
  private readonly poleGeometry = new THREE.CylinderGeometry(0.03, 0.03, g.markerPoleHeightM, 6).translate(
    0,
    g.markerPoleHeightM / 2,
    0,
  );
  private readonly flagGeometry = new THREE.PlaneGeometry(0.6, 0.4).translate(
    0.3,
    g.markerPoleHeightM - 0.2,
    0,
  );

  constructor(private readonly parent: THREE.Object3D) {}

  setRoute(route: RouteDef | null, label: string): void {
    this.clearObjects();
    this.route = route;
    this.label = label;
    this.windowAt = -Infinity;
    if (!route) return;
    this.along = [0];
    for (let i = 1; i < route.points.length; i++) {
      const [ax, , az] = route.points[i - 1];
      const [bx, , bz] = route.points[i];
      this.along.push(this.along[i - 1] + Math.hypot(bx - ax, bz - az));
    }
    this.ribbon = this.buildRibbon(route);
    this.ribbon.visible = this.ribbonVisible;
    this.parent.add(this.ribbon);
    if (route.markers.length > 0) {
      this.poles = this.buildMarkers(route, this.poleGeometry, this.poleMaterial, 'route-marker-poles');
      this.flags = this.buildMarkers(route, this.flagGeometry, this.flagMaterial, 'route-marker-flags');
    }
  }

  update(feet: Vec3, cameraYaw: number): GuideHud | null {
    const route = this.route;
    if (!route) return null;
    const progress = progressAlong(route, feet);
    const segment = this.along[progress.index + 1] - this.along[progress.index];
    const alongM = this.along[progress.index] + segment * progress.t;
    if (Math.abs(alongM - this.windowAt) >= g.windowStepM) this.updateWindow(alongM);
    const target = guideTarget(route, progress, g.lookAheadM, g.offRouteThresholdM);
    return {
      label: this.label,
      distanceM: progress.remainingM,
      bearingRad: bearingTo(feet, target, cameraYaw),
      offRoute: progress.offRouteM > g.offRouteThresholdM,
    };
  }

  toggleRibbon(): boolean {
    this.ribbonVisible = !this.ribbonVisible;
    if (this.ribbon) this.ribbon.visible = this.ribbonVisible;
    return this.ribbonVisible;
  }

  dispose(): void {
    this.clearObjects();
    this.route = null;
    this.ribbonMaterial.dispose();
    this.poleMaterial.dispose();
    this.flagMaterial.dispose();
    this.poleGeometry.dispose();
    this.flagGeometry.dispose();
  }

  private updateWindow(alongM: number): void {
    if (!this.ribbon) return;
    const from = alongM - g.behindM;
    const to = alongM + g.aheadM;
    const segments = this.along.length - 1;
    let first = 0;
    while (first < segments - 1 && this.along[first + 1] < from) first++;
    let last = first;
    while (last + 1 < segments && this.along[last + 1] <= to) last++;
    this.ribbon.geometry.setDrawRange(first * 6, (last - first + 1) * 6);
    this.windowAt = alongM;
  }

  private buildRibbon(route: RouteDef): THREE.Mesh {
    const p = route.points;
    const half = g.ribbonWidthM / 2;
    const positions = new Float32Array(p.length * 2 * 3);
    for (let i = 0; i < p.length; i++) {
      const a = p[Math.max(0, i - 1)];
      const b = p[Math.min(p.length - 1, i + 1)];
      const tx = b[0] - a[0];
      const tz = b[2] - a[2];
      const len = Math.hypot(tx, tz) || 1;
      const nx = -tz / len;
      const nz = tx / len;
      const y = p[i][1] + g.ribbonLiftM;
      positions.set([p[i][0] + nx * half, y, p[i][2] + nz * half], i * 6);
      positions.set([p[i][0] - nx * half, y, p[i][2] - nz * half], i * 6 + 3);
    }
    const indices: number[] = [];
    for (let i = 0; i < p.length - 1; i++) {
      const a = i * 2;
      indices.push(a, a + 1, a + 2, a + 2, a + 1, a + 3);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setIndex(indices);
    geometry.computeBoundingSphere();
    const mesh = new THREE.Mesh(geometry, this.ribbonMaterial);
    mesh.name = 'route-ribbon';
    mesh.renderOrder = 1;
    return mesh;
  }

  private buildMarkers(
    route: RouteDef,
    geometry: THREE.BufferGeometry,
    material: THREE.Material,
    name: string,
  ): THREE.InstancedMesh {
    const mesh = new THREE.InstancedMesh(geometry, material, route.markers.length);
    const m = new THREE.Matrix4();
    route.markers.forEach(([x, y, z], i) => mesh.setMatrixAt(i, m.makeTranslation(x, y, z)));
    mesh.instanceMatrix.needsUpdate = true;
    mesh.frustumCulled = false;
    mesh.castShadow = true;
    mesh.name = name;
    this.parent.add(mesh);
    return mesh;
  }

  private clearObjects(): void {
    if (this.ribbon) {
      this.ribbon.removeFromParent();
      this.ribbon.geometry.dispose();
      this.ribbon = null;
    }
    for (const mesh of [this.poles, this.flags]) {
      if (!mesh) continue;
      mesh.removeFromParent();
      mesh.dispose();
    }
    this.poles = null;
    this.flags = null;
  }
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run src/engine/systems && npm run typecheck && npm run lint`
Expected: PASS, with the 6 new RouteGuide tests; clean.

- [ ] **Step 6: Commit**

```bash
npm run format && git add src/engine/systems/RouteGuide.ts src/engine/systems/RouteGuide.test.ts src/engine/config/game.config.ts src/engine/config/controls.config.ts
git commit -m "feat(engine): add RouteGuide with ground ribbon, trail markers and HUD bearing"
```

---

### Task 6: Wire the guide into the game and HUD

**Files:**
- Create: `src/ui/formatDistance.ts`, `src/ui/formatDistance.test.ts`
- Modify: `src/engine/core/hud.ts`, `src/engine/core/Game.ts`, `src/ui/Hud.tsx`, `src/app/app.css`, `e2e/smoke.spec.ts`, `docs/playtest/m1-checklist.md`, `CLAUDE.md`

**Interfaces:**
- Consumes: `RouteGuide`, `GuideHud` (Task 5); `activeRoute` (Task 4); `CONTROLS.toggleRoute` (Task 5).
- Produces: `HudState.guide: GuideHud | null`; `formatDistance(m: number): string`; the HUD element `data-testid="guide"`.

- [ ] **Step 1: Write the failing unit test**

`src/ui/formatDistance.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { formatDistance } from './formatDistance';

describe('formatDistance', () => {
  it('uses metres below 1 km and kilometres with one decimal above', () => {
    expect(formatDistance(0)).toBe('0 m');
    expect(formatDistance(849.6)).toBe('850 m');
    expect(formatDistance(999.4)).toBe('999 m');
    expect(formatDistance(1000)).toBe('1.0 km');
    expect(formatDistance(3449)).toBe('3.4 km');
  });
});
```

Run: `npx vitest run src/ui/formatDistance.test.ts`
Expected: FAIL with `Failed to resolve import "./formatDistance"`.

- [ ] **Step 2: Implement `formatDistance`**

`src/ui/formatDistance.ts`:

```ts
/** "850 m" below 1 km, "3.4 km" from 1 km up. */
export function formatDistance(m: number): string {
  const rounded = Math.round(m);
  return rounded < 1000 ? `${rounded} m` : `${(m / 1000).toFixed(1)} km`;
}
```

Run: `npx vitest run src/ui/formatDistance.test.ts`
Expected: PASS.

- [ ] **Step 3: Extend the E2E test (it fails until the wiring is done)**

In `e2e/smoke.spec.ts`, add this line after the `altitude` assertion in the first test:

```ts
  await expect(page.getByTestId('guide')).toContainText(/High Camp · \d+(\.\d)? (m|km)/);
```

- [ ] **Step 4: Add the HUD field**

In `src/engine/core/hud.ts`, add `import type { GuideHud } from '../systems/RouteGuide';`, add `guide: GuideHud | null;` to `HudState`, and add `guide: null,` to `initialHudState`.

- [ ] **Step 5: Wire `Game`**

In `src/engine/core/Game.ts`:

1. Imports:
   ```ts
   import { activeRoute } from '../systems/routeMath';
   import { RouteGuide, type GuideHud } from '../systems/RouteGuide';
   ```
2. Add `guide: RouteGuide;` to the `World` interface, and add the field `private guideHud: GuideHud | null = null;` to the class.
3. In `init()`, just before `this.w = {`, create the guide:
   ```ts
   const guide = new RouteGuide(this.scene);
   this.cleanup.push(() => guide.dispose());
   ```
   Add `guide,` to the `this.w = { ... }` object literal. Right after `this.wireEvents();`, add:
   ```ts
   this.setActiveRoute(start.id);
   ```
4. Add the method:
   ```ts
   /** Show the route leaving the given camp (hidden when there is none). */
   private setActiveRoute(campId: string): void {
     const w = this.w;
     if (!w) return;
     const route = activeRoute(w.manifest.routes, campId);
     const destination = route ? w.manifest.camps.find((c) => c.id === route.to) : undefined;
     w.guide.setRoute(route, destination?.name ?? '');
   }
   ```
5. In `wireEvents()`, change the `checkpoint:reached` handler to:
   ```ts
   this.events.on('checkpoint:reached', ({ id, name }) => {
     this.showToast(`Checkpoint reached: ${name}`);
     this.o.publish({ lastCheckpoint: name });
     this.setActiveRoute(id);
   }),
   ```
6. In `respawn()`, inside the `try` block after `w.cameraCtrl.snap();`, add:
   ```ts
   this.setActiveRoute(camp.id);
   ```
7. In `step()`, after the `cameraDistance` line, add:
   ```ts
   if (this.input.consumePressed('toggleRoute')) w.guide.toggleRibbon();
   ```
8. In `render()`, after `w.cameraCtrl.update(...)`, add:
   ```ts
   this.guideHud = w.guide.update(feet, w.cameraCtrl.yaw);
   ```
9. In `publishHud()`, add `guide: this.guideHud,` to the published object.

- [ ] **Step 6: Render the guide in the HUD**

In `src/ui/Hud.tsx`, add `import { formatDistance } from './formatDistance';`. Insert this after the `hud__panel` div:

```tsx
      {s.guide && (
        <div
          className={`hud__guide${s.guide.offRoute ? ' hud__guide--off' : ''}`}
          data-testid="guide"
        >
          <div
            className="hud__guide-arrow"
            style={{ transform: `rotate(${s.guide.bearingRad}rad)` }}
            aria-hidden="true"
          >
            ▲
          </div>
          <div className="hud__guide-label">
            {s.guide.label} · {formatDistance(s.guide.distanceM)}
          </div>
          {s.guide.offRoute && (
            <div className="hud__guide-warning">Off route — follow the arrow</div>
          )}
        </div>
      )}
```

Change the pause overlay text to:

```
Click to play · WASD move · Shift run · Space jump · E grab · C camera · T route · Esc pause
```

In `src/app/app.css`, change `.hud__toast`'s `top: 24px;` to `top: 96px;` so it sits below the guide, and append:

```css
.hud__guide {
  position: absolute;
  top: 18px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  padding: 8px 16px;
  border-radius: 10px;
  background: rgba(13, 17, 23, 0.55);
}

.hud__guide-arrow {
  font-size: 22px;
  line-height: 1;
  color: #ff8a1f;
  transition: transform 100ms linear;
}

.hud__guide--off .hud__guide-arrow {
  color: #ff5a4a;
}

.hud__guide-label {
  font-size: 14px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

.hud__guide-warning {
  font-size: 12px;
  color: #ffb4a8;
}
```

- [ ] **Step 7: Docs**

In `docs/playtest/m1-checklist.md`, add under "## Movement":

```markdown
- [ ] Following the orange ribbon from Khare reaches High Camp on Mera without sliding or climbing.
- [ ] `T` hides and shows the ribbon; flags and the HUD arrow stay visible.
```

In `CLAUDE.md`, in the "Terrain is data, not code" list, add a bullet after the offline-bake bullet:

```markdown
- The bake also writes `routes` (A* over the walkable grid, string-pulled, points ≤ 20 m apart, markers every 100 m and at turns) for each pair of consecutive camps. `RouteGuide` draws them as a ground ribbon (`T` toggles) plus flags, and `routeMath.ts` feeds the HUD arrow.
```

- [ ] **Step 8: Run the full verification**

```bash
npm run format && npm run lint && npm run typecheck && npm test && npm run build && npm run e2e
.venv/bin/python -m pytest tools/terrain -q
```

Expected: everything passes. E2E gives 2 passed, and the guide assertion finds "High Camp · 8xx m".

- [ ] **Step 9: Re-bake Mera and check it locally**

Run: `source .venv/bin/activate && npm run terrain:mera`
Expected: the camp lines are unchanged (khare ≈ 4,996 m, high-camp ≈ 5,774 m), plus a line like `route khare -> high-camp: ~5000 m, ~260 points, ~55 markers`.

- [ ] **Step 10: Commit**

```bash
git add src/ui/formatDistance.ts src/ui/formatDistance.test.ts src/engine/core/hud.ts src/engine/core/Game.ts src/ui/Hud.tsx src/app/app.css e2e/smoke.spec.ts docs/playtest/m1-checklist.md CLAUDE.md
git commit -m "feat: show the route guide in game with HUD arrow, distance and T toggle"
```
