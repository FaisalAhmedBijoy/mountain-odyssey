# Keokradong Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Keokradong (Bangladesh, ≈ 986 m) playable from the menu as a green, forested hill. It gets a walking route from Boga Lake to the summit.

**Architecture:**
- **Bake:** the terrain bake gains a `summitWalkable` option, so routes reach the summit.
- **Biomes:** a mountain declares a `biome`. `GAME_CONFIG.biomes[biome]` supplies a terrain palette (applied in `gridGeometry`, which runs in the mesh worker), sky and fog settings (`Environment`), and tree rules.
- **Trees:** a pure `placeTrees` function picks deterministic tree spots per tile. `TreeSystem` draws them with `InstancedMesh`es for the 3 × 3 tiles around the player.
- **Data:** the mountain itself is data: a bake config, `keokradong.json`, and a `mountainId` in the catalog.

**Tech Stack:** TypeScript 5.9, Three.js, Vitest (Node), Python 3 + numpy/rasterio (bake), Playwright.

**Spec:** `docs/superpowers/specs/2026-11-06-keokradong-design.md`.

## Global Constraints

- Work on branch `keokradong`, created from `main`.
- `src/engine/**` never imports React. React never touches Three.js or Rapier objects. UI may import `src/engine/config/*`.
- Every tunable number lives in `GAME_CONFIG` (`src/engine/config/game.config.ts`). Biome and tree values live in `GAME_CONFIG.biomes`.
- Biomes change only looks: palette, sky, fog and trees. Gameplay rules stay global (`SurfaceRules`, climbability, survival).
- The `himalaya` biome must reproduce today's look exactly: the same surface colours and the same sky colour `0xa9c4dd`, fog near 800 and fog far 7000. Mera Peak must not change.
- Show the DEM attribution verbatim: `Contains modified Copernicus DEM data`.
- `routeMaxSlopeDeg` never exceeds `GAME_CONFIG.movement.maxWalkSlopeDeg` (33).
- Run `npm run format` before every commit. CI runs `format:check`, `lint`, `typecheck`, `test`, `build` and `e2e`. Python tests: `.venv/bin/python -m pytest tools/terrain -q`.
- Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Verified bake values (trial bake, 2026-11-06)

A trial bake with centre 21.95° N, 92.52° E, 24 × 256 cells at 2 m, the DEM tile `N21_00_E092_00`, and the summit included in the routes produced:

| Item | Value |
|---|---|
| Boga Lake (target 400 m) | 401.4 m at x = −1792, z = 5872 |
| Ridge Camp (target 700 m) | 701.0 m at x = −16, z = 4016 |
| Summit | 981.5 m at x = −576, z = −770 |
| Route Boga Lake → Ridge Camp | 3,589 m, max slope 32.82° |
| Route Ridge Camp → Summit | 5,008 m, max slope 32.38° |
| Height range | 52–983 m |

---

### Task 1: Bake: `summitWalkable`, Keokradong config, scripts and deploy

**Files:**
- Modify: `tools/terrain/bake.py`
- Modify: `tools/terrain/test_terrain_lib.py`, or create `tools/terrain/test_bake.py` if bake helpers are not tested in the existing file
- Create: `tools/terrain/keokradong.config.json`
- Modify: `package.json` (scripts), `.github/workflows/deploy.yml`

**Interfaces:**
- Produces: `walk_targets(camp_cfgs: list[dict], cells: list[tuple[int, int]], summit: tuple[int, int], summit_walkable: bool) -> list[tuple[str, tuple[int, int]]]` in `bake.py`.
- Produces: the npm script `terrain:keokradong`, and the baked output `public/terrain/keokradong/`.

- [ ] **Step 1: Write the failing test**

Add to the Python tests. Import `walk_targets` from `bake`; check how the existing tests import modules first, because `bake.py` is a script in the same folder.

```python
from bake import walk_targets


def test_walk_targets_excludes_summit_by_default():
    camps = [{"id": "a"}, {"id": "b"}]
    cells = [(1, 1), (2, 2)]
    assert walk_targets(camps, cells, (9, 9), False) == [("a", (1, 1)), ("b", (2, 2))]


def test_walk_targets_appends_summit_when_walkable():
    camps = [{"id": "a"}]
    assert walk_targets(camps, [(1, 1)], (9, 9), True) == [("a", (1, 1)), ("summit", (9, 9))]
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `.venv/bin/python -m pytest tools/terrain -q`
Expected: FAIL, because `walk_targets` cannot be imported.

- [ ] **Step 3: Implement in `bake.py`**

Add above `bake_dem`:

```python
def walk_targets(camp_cfgs: list[dict], cells: list[tuple[int, int]], summit: tuple[int, int],
                 summit_walkable: bool) -> list[tuple[str, tuple[int, int]]]:
    """Camps that must be reached on foot, in route order.

    On mountains climbed to the top (Mera), the summit is reached by climbing (M2) and
    is exempt. With `summitWalkable` (e.g. Keokradong) it must be walk-connected too,
    and gets a route from the last camp.
    """
    targets = [(c["id"], rc) for c, rc in zip(camp_cfgs, cells)]
    if summit_walkable:
        targets.append(("summit", summit))
    return targets
```

In `bake_dem`, replace these two lines:

```python
    # The summit camp is reached by climbing (M2), so it is not part of the walkable check.
    walk_cells = [(c["id"], rc) for c, rc in zip(cfg["camps"], cells)]
```

with:

```python
    walk_cells = walk_targets(cfg["camps"], cells, summit, bool(cfg.get("summitWalkable", False)))
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `.venv/bin/python -m pytest tools/terrain -q`
Expected: all PASS.

- [ ] **Step 5: Config, script and deploy**

`tools/terrain/keokradong.config.json`:

```json
{
  "id": "keokradong",
  "centerLat": 21.95,
  "centerLon": 92.52,
  "tiles": 24,
  "tileCells": 256,
  "spacingM": 2,
  "coarseSpacingM": 8,
  "backdropSpacingM": 64,
  "noiseSeed": 986,
  "summitSearchRadiusM": 1500,
  "summitWalkable": true,
  "campPlacement": {
    "maxWalkSlopeDeg": 30,
    "routeMaxSlopeDeg": 33,
    "analysisSpacingM": 8,
    "toleranceM": 100,
    "spawnRadiusM": 6
  },
  "demUrl": "/vsicurl/https://copernicus-dem-30m.s3.amazonaws.com/Copernicus_DSM_COG_10_N21_00_E092_00_DEM/Copernicus_DSM_COG_10_N21_00_E092_00_DEM.tif",
  "attribution": "Contains modified Copernicus DEM data",
  "camps": [
    { "id": "boga-lake", "name": "Boga Lake", "targetElevationM": 400 },
    { "id": "ridge-camp", "name": "Ridge Camp", "targetElevationM": 700 }
  ]
}
```

`package.json` scripts: add after `terrain:mera`:

```json
    "terrain:keokradong": "python3 tools/terrain/bake.py --config tools/terrain/keokradong.config.json --out public/terrain/keokradong"
```

`.github/workflows/deploy.yml`:
- In the bake step, rename it to `Bake terrain (synthetic test-peak, Mera Peak and Keokradong from Copernicus DEM)` and add `npm run terrain:keokradong` after `npm run terrain:mera`.
- In the bundle check, add `test -f dist/terrain/keokradong/manifest.json`.

- [ ] **Step 6: Run the real bake**

This needs the network and takes a few minutes. Run: `.venv/bin/python tools/terrain/bake.py --config tools/terrain/keokradong.config.json --out public/terrain/keokradong`

Expected: exit 0. Routes `boga-lake -> ridge-camp` and `ridge-camp -> summit` both have a max slope below 33°, and the values are close to the "Verified bake values" table. Paste the printed camp and route lines into the report.

Also run `npm run terrain:mera` (or check that `public/terrain/mera-peak/manifest.json` already exists and has no `summit` route) to confirm that Mera's routes are unchanged: only `khare -> high-camp`.

- [ ] **Step 7: Commit**

```bash
npm run format
git add tools/terrain package.json .github/workflows/deploy.yml
git commit -m "feat(terrain): summitWalkable bake option and Keokradong bake config

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Biomes: config, terrain palette and sky

**Files:**
- Modify: `src/engine/config/game.config.ts`
- Create: `src/engine/world/palette.ts`, `src/engine/world/palette.test.ts`
- Modify: `src/engine/world/gridGeometry.ts` (+ `gridGeometry.test.ts` call sites), `src/engine/world/ChunkManager.ts` (+ its test's deps), `src/engine/world/Environment.ts`, `src/engine/core/Game.ts`
- Modify: `src/data/mountains/index.ts`, `mera-peak.json`, `test-peak.json`
- Create: `src/data/mountains/mountains.test.ts`
- Modify: `src/app/GameView.tsx`

**Interfaces:**
- Produces in `game.config.ts`:
  - `GAME_CONFIG.biomes` (shape below)
  - `type BiomeId = keyof typeof GAME_CONFIG.biomes`
  - `isBiomeId(v: string): v is BiomeId`
- Produces in `palette.ts`:
  - `type TerrainPalette`
  - `linearPalette(p: TerrainPalette): LinearPalette`
  - `terrainColor(slopeDeg, altitudeM, surface: SurfaceRules, p: LinearPalette): readonly [number, number, number]`
- Produces in `gridGeometry.ts`: `GridGeometryArgs.palette: TerrainPalette`, required.
- Produces in `ChunkManager.ts`: `ChunkManagerDeps.palette: TerrainPalette`.
- Produces in `Environment.ts`: the constructor becomes `new Environment(scene, shadows, sky: { color: number; fogNear: number; fogFar: number })`.
- Produces in `Game.ts`: `GameOptions.biome: BiomeId`.
- Produces in `src/data/mountains/index.ts`: `MountainDef.biome: BiomeId`.

- [ ] **Step 1: Config**

In `GAME_CONFIG.world`, keep `sunDirection` and remove `skyColor`, `fogNear` and `fogFar`, which move into the biomes. Add a top-level `biomes` section:

```ts
  /** Per-mountain looks (Keokradong spec §3). Gameplay rules stay global. */
  biomes: {
    himalaya: {
      palette: { kind: 'surface' },
      sky: { color: 0xa9c4dd, fogNear: 800, fogFar: 7000 },
      trees: null,
    },
    'tropical-hills': {
      palette: {
        kind: 'slope',
        /** sRGB; the first band whose maxSlopeDeg exceeds the slope wins. */
        bands: [
          { maxSlopeDeg: 15, color: [0.36, 0.55, 0.24] },
          { maxSlopeDeg: 35, color: [0.17, 0.36, 0.16] },
          { maxSlopeDeg: 90, color: [0.55, 0.33, 0.2] },
        ],
      },
      sky: { color: 0xc4d6cf, fogNear: 300, fogFar: 3500 },
      trees: {
        seed: 986,
        spacingM: 7,
        density: 0.35,
        maxSlopeDeg: 40,
        routeClearanceM: 4,
        campClearanceM: 20,
        ringRadius: 1,
        minScale: 0.8,
        maxScale: 1.4,
        castShadow: false,
      },
    },
  },
```

After the `GAME_CONFIG` object, add:

```ts
export type BiomeId = keyof typeof GAME_CONFIG.biomes;

export const isBiomeId = (v: string): v is BiomeId => Object.hasOwn(GAME_CONFIG.biomes, v);
```

Update every reader of `GAME_CONFIG.world.skyColor`, `fogNear` and `fogFar`. Find them with `grep -rn "world\.\(skyColor\|fog\)" src`. Today that is `Environment.ts`.

- [ ] **Step 2: Write the failing palette test**

`src/engine/world/palette.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { GAME_CONFIG } from '../config/game.config';
import { linearPalette, terrainColor } from './palette';
import { SURFACE_COLORS } from './surface';

const surface = GAME_CONFIG.surface;
const srgbToLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const lin = (rgb: readonly number[]) => rgb.map(srgbToLinear);

describe('terrainColor', () => {
  it('himalaya reproduces the surface colours (rock, snow)', () => {
    const p = linearPalette(GAME_CONFIG.biomes.himalaya.palette);
    expect(terrainColor(10, 5000, surface, p)).toEqual(lin(SURFACE_COLORS.rock));
    expect(terrainColor(10, 5350, surface, p)).toEqual(lin(SURFACE_COLORS.snow));
    expect(terrainColor(45, 6000, surface, p)).toEqual(lin(SURFACE_COLORS.rock));
  });

  it('tropical-hills picks grass, forest and soil by slope', () => {
    const p = linearPalette(GAME_CONFIG.biomes['tropical-hills'].palette);
    const bands = GAME_CONFIG.biomes['tropical-hills'].palette.bands;
    expect(terrainColor(5, 600, surface, p)).toEqual(lin(bands[0].color));
    expect(terrainColor(20, 600, surface, p)).toEqual(lin(bands[1].color));
    expect(terrainColor(50, 600, surface, p)).toEqual(lin(bands[2].color));
    expect(terrainColor(15, 600, surface, p)).toEqual(lin(bands[1].color));
  });
});
```

Check the expectations against `surfaceAt` in `surface.ts` before running:
- 10° at 5,000 m: below the 5,300 m snowline, so rock.
- 10° at 5,350 m: above the snowline and below the ice altitude of 5,400 m, so snow.
- 45° at 6,000 m: `rockMinSlopeDeg` is 40, so rock.

- [ ] **Step 3: Run it to verify it fails**

Run: `npx vitest run src/engine/world/palette.test.ts`
Expected: FAIL, because `./palette` cannot be resolved.

- [ ] **Step 4: Implement `src/engine/world/palette.ts`**

```ts
import { SURFACE_COLORS, surfaceAt, type Surface, type SurfaceRules } from './surface';

type Rgb = readonly [number, number, number];

/** How a biome colours terrain: by gameplay surface (rock/snow/ice) or by slope bands. */
export type TerrainPalette =
  | { readonly kind: 'surface' }
  | {
      readonly kind: 'slope';
      readonly bands: readonly { readonly maxSlopeDeg: number; readonly color: Rgb }[];
    };

/** Same palette with colours converted to linear space once, for per-vertex use. */
export type LinearPalette =
  | { kind: 'surface'; colors: Record<Surface, Rgb> }
  | { kind: 'slope'; bands: { maxSlopeDeg: number; color: Rgb }[] };

const srgbToLinear = (c: number): number =>
  c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;

const toLinear = (rgb: Rgb): Rgb => [srgbToLinear(rgb[0]), srgbToLinear(rgb[1]), srgbToLinear(rgb[2])];

export function linearPalette(p: TerrainPalette): LinearPalette {
  if (p.kind === 'surface') {
    return {
      kind: 'surface',
      colors: {
        rock: toLinear(SURFACE_COLORS.rock),
        snow: toLinear(SURFACE_COLORS.snow),
        ice: toLinear(SURFACE_COLORS.ice),
      },
    };
  }
  return {
    kind: 'slope',
    bands: p.bands.map((b) => ({ maxSlopeDeg: b.maxSlopeDeg, color: toLinear(b.color) })),
  };
}

/** Linear-space vertex colour for a terrain point. */
export function terrainColor(
  slopeDeg: number,
  altitudeM: number,
  surface: SurfaceRules,
  p: LinearPalette,
): Rgb {
  if (p.kind === 'surface') return p.colors[surfaceAt(slopeDeg, altitudeM, surface)];
  return (p.bands.find((b) => slopeDeg < b.maxSlopeDeg) ?? p.bands[p.bands.length - 1]).color;
}
```

- [ ] **Step 5: Use it in `gridGeometry.ts`**

- Add `palette: TerrainPalette` to `GridGeometryArgs`.
- Delete the local `srgbToLinear`, `toLinear` and `LINEAR_COLORS`, and the now-unused imports.
- In `buildGridGeometry`, compute `const palette = linearPalette(a.palette);` once.
- In `writeVertex`, replace `const c = LINEAR_COLORS[surfaceAt(slopeDeg, y, a.surface)];` with `const c = terrainColor(slopeDeg, y, a.surface, palette);`.
- Update `gridGeometry.test.ts` and any other `buildGridGeometry` or `build({...})` callers in tests to pass `palette: GAME_CONFIG.biomes.himalaya.palette`. Find them with `grep -rn "surface:" src --include` across the test files.

The args cross into the mesh worker by structured clone, so the palette must stay plain data.

- [ ] **Step 6: Wire through the engine**

- `ChunkManager.ts`: add `palette: TerrainPalette` to `ChunkManagerDeps`. Pass `palette: this.d.palette` in both `builder.build({...})` calls. Update `ChunkManager.test.ts` deps.
- `Environment.ts`: replace the module-level `w` reads of sky and fog with a third constructor parameter `sky: { color: number; fogNear: number; fogFar: number }`. Use `sky.color`, `sky.fogNear` and `sky.fogFar`; `sunDirection` still comes from `GAME_CONFIG.world`.
- `Game.ts`:
  - Add `biome: BiomeId` to `GameOptions`.
  - Pass `cfg.biomes[o.biome].sky` to `new Environment(...)`.
  - Pass `palette: cfg.biomes[this.o.biome].palette` to `ChunkManager`.
  - The constructor uses `o`, and `init` uses `this.o` or `o`.

- [ ] **Step 7: Mountain data and the UI**

`src/data/mountains/index.ts`:
- Add `biome: BiomeId` to `MountainDef`, importing the type from `../../engine/config/game.config`.
- The JSON imports must type-check. The JSON's `biome` is inferred as `string`, so validate it. Map the raw JSON through a small `parseMountain(raw)` that throws when `!isBiomeId(raw.biome)` and otherwise returns a `MountainDef`, and build `MOUNTAINS` from it.

Add `"biome": "himalaya"` to `mera-peak.json` and `test-peak.json`.

`src/data/mountains/mountains.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { isBiomeId } from '../../engine/config/game.config';
import { getMountain } from '.';

describe('mountains', () => {
  it('declares a known biome for every mountain', () => {
    for (const id of ['mera-peak', 'test-peak']) {
      const m = getMountain(id);
      expect(m).not.toBeNull();
      expect(isBiomeId(m!.biome)).toBe(true);
    }
  });
});
```

`src/app/GameView.tsx`: pass `biome` to `Game.create`. A `?biome=<id>` debug override wins when it is a known id:

```tsx
const override = new URLSearchParams(window.location.search).get('biome');
const biome = override && isBiomeId(override) ? override : mountain.biome;
```

Compute `biome` inside the effect, where `Game.create` is called. Do not add it to the dependency array; it is derived from `mountain` and the URL.

- [ ] **Step 8: Verify**

Run: `npm run format && npm run lint && npm run typecheck && npm test && npm run build && npm run e2e`
Expected: all PASS. Mera and test-peak look identical to before, because they use the `himalaya` biome.

- [ ] **Step 9: Commit**

```bash
git add src
git commit -m "feat(world): per-mountain biomes for terrain palette, sky and fog

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Tree placement (pure)

**Files:**
- Create: `src/engine/world/treePlacement.ts`, `src/engine/world/treePlacement.test.ts`

**Interfaces:**
- Produces:
  - `interface TreeRules { seed; spacingM; density; maxSlopeDeg; routeClearanceM; campClearanceM; minScale; maxScale }`
  - `interface TreeGround { heightAt(x, z): number | null; slopeDegAt(x, z): number | null }`, which `TerrainSampler` satisfies
  - `interface TreeAvoid { routes: readonly (readonly (readonly [number, number, number])[])[]; camps: readonly (readonly [number, number, number])[] }`
  - `interface TreeInstance { x; y; z; scale; rotation; variant }`
  - `placeTrees(area: { minX; minZ; maxX; maxZ }, ground, rules, avoid, variants: number): TreeInstance[]`

- [ ] **Step 1: Write the failing test**

`src/engine/world/treePlacement.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { placeTrees, type TreeAvoid, type TreeGround, type TreeRules } from './treePlacement';

const rules: TreeRules = {
  seed: 1,
  spacingM: 10,
  density: 1,
  maxSlopeDeg: 40,
  routeClearanceM: 4,
  campClearanceM: 20,
  minScale: 0.8,
  maxScale: 1.4,
};
const flat: TreeGround = { heightAt: () => 100, slopeDegAt: () => 5 };
const none: TreeAvoid = { routes: [], camps: [] };
const area = { minX: 0, minZ: 0, maxX: 200, maxZ: 200 };

describe('placeTrees', () => {
  it('fills a jittered grid inside the area at full density', () => {
    const trees = placeTrees(area, flat, rules, none, 3);
    expect(trees.length).toBeGreaterThan(380);
    expect(trees.length).toBeLessThanOrEqual(420);
    for (const t of trees) {
      expect(t.x).toBeGreaterThanOrEqual(0);
      expect(t.x).toBeLessThan(200);
      expect(t.z).toBeGreaterThanOrEqual(0);
      expect(t.z).toBeLessThan(200);
      expect(t.y).toBe(100);
      expect(t.scale).toBeGreaterThanOrEqual(0.8);
      expect(t.scale).toBeLessThanOrEqual(1.4);
      expect([0, 1, 2]).toContain(t.variant);
    }
  });

  it('is deterministic and seamless across neighbouring areas', () => {
    expect(placeTrees(area, flat, rules, none, 3)).toEqual(placeTrees(area, flat, rules, none, 3));
    const left = placeTrees({ minX: 0, minZ: 0, maxX: 100, maxZ: 200 }, flat, rules, none, 3);
    const right = placeTrees({ minX: 100, minZ: 0, maxX: 200, maxZ: 200 }, flat, rules, none, 3);
    expect(left.length + right.length).toBe(placeTrees(area, flat, rules, none, 3).length);
  });

  it('thins out by density', () => {
    const full = placeTrees(area, flat, rules, none, 3).length;
    const third = placeTrees(area, flat, { ...rules, density: 0.35 }, none, 3).length;
    expect(third / full).toBeGreaterThan(0.25);
    expect(third / full).toBeLessThan(0.45);
  });

  it('skips steep ground and unloaded ground', () => {
    const steep: TreeGround = { heightAt: () => 100, slopeDegAt: () => 45 };
    expect(placeTrees(area, steep, rules, none, 3)).toEqual([]);
    const missing: TreeGround = { heightAt: () => null, slopeDegAt: () => null };
    expect(placeTrees(area, missing, rules, none, 3)).toEqual([]);
  });

  it('keeps clear of routes and camps', () => {
    const avoid: TreeAvoid = {
      routes: [
        [
          [0, 100, 100],
          [200, 100, 100],
        ],
      ],
      camps: [[50, 100, 50]],
    };
    const trees = placeTrees(area, flat, rules, avoid, 3);
    for (const t of trees) {
      expect(Math.abs(t.z - 100)).toBeGreaterThanOrEqual(4);
      expect(Math.hypot(t.x - 50, t.z - 50)).toBeGreaterThanOrEqual(20);
    }
    expect(trees.length).toBeLessThan(placeTrees(area, flat, rules, none, 3).length);
  });
});
```

The first test's bounds come from the grid: 200 / 10 = 20, so 20 × 20 = 400 cells, and each cell holds one jittered point that stays inside its own cell.

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/engine/world/treePlacement.test.ts`
Expected: FAIL, because `./treePlacement` cannot be resolved.

- [ ] **Step 3: Implement `src/engine/world/treePlacement.ts`**

```ts
type P3 = readonly [number, number, number];

export interface TreeRules {
  seed: number;
  spacingM: number;
  /** Probability (0–1) that a grid cell holds a tree. */
  density: number;
  maxSlopeDeg: number;
  routeClearanceM: number;
  campClearanceM: number;
  minScale: number;
  maxScale: number;
}

export interface TreeGround {
  heightAt(x: number, z: number): number | null;
  slopeDegAt(x: number, z: number): number | null;
}

export interface TreeAvoid {
  routes: readonly (readonly P3[])[];
  camps: readonly P3[];
}

export interface TreeInstance {
  x: number;
  y: number;
  z: number;
  scale: number;
  rotation: number;
  variant: number;
}

/** Deterministic 0–1 hash of integer cell coordinates and a salt. */
function hash(i: number, j: number, salt: number): number {
  let h = Math.imul(i, 374761393) ^ Math.imul(j, 668265263) ^ Math.imul(salt, 2246822519);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/** Squared distance from (px, pz) to segment a–b in the XZ plane. */
function segmentDistSq(px: number, pz: number, a: P3, b: P3): number {
  const dx = b[0] - a[0];
  const dz = b[2] - a[2];
  const len = dx * dx + dz * dz;
  const t = len === 0 ? 0 : Math.max(0, Math.min(1, ((px - a[0]) * dx + (pz - a[2]) * dz) / len));
  const x = a[0] + t * dx - px;
  const z = a[2] + t * dz - pz;
  return x * x + z * z;
}

/**
 * Trees for one area (a terrain tile) on a world-aligned jittered grid, so neighbouring
 * areas join without seams and the same area always gets the same trees (spec §4).
 */
export function placeTrees(
  area: { minX: number; minZ: number; maxX: number; maxZ: number },
  ground: TreeGround,
  rules: TreeRules,
  avoid: TreeAvoid,
  variants: number,
): TreeInstance[] {
  const s = rules.spacingM;
  const pad = Math.max(rules.routeClearanceM, rules.campClearanceM);
  const nearArea = (p: P3) =>
    p[0] > area.minX - pad && p[0] < area.maxX + pad && p[2] > area.minZ - pad && p[2] < area.maxZ + pad;
  const segments: [P3, P3][] = [];
  for (const route of avoid.routes) {
    for (let k = 0; k + 1 < route.length; k++) {
      if (nearArea(route[k]) || nearArea(route[k + 1])) segments.push([route[k], route[k + 1]]);
    }
  }
  const camps = avoid.camps.filter(nearArea);
  const routeSq = rules.routeClearanceM ** 2;
  const campSq = rules.campClearanceM ** 2;

  const trees: TreeInstance[] = [];
  for (let i = Math.floor(area.minX / s); i * s < area.maxX; i++) {
    for (let j = Math.floor(area.minZ / s); j * s < area.maxZ; j++) {
      if (hash(i, j, rules.seed) >= rules.density) continue;
      const x = (i + hash(i, j, rules.seed + 1)) * s;
      const z = (j + hash(i, j, rules.seed + 2)) * s;
      if (x < area.minX || x >= area.maxX || z < area.minZ || z >= area.maxZ) continue;
      const slope = ground.slopeDegAt(x, z);
      const y = ground.heightAt(x, z);
      if (slope === null || y === null || slope > rules.maxSlopeDeg) continue;
      if (camps.some((c) => (c[0] - x) ** 2 + (c[2] - z) ** 2 < campSq)) continue;
      if (segments.some(([a, b]) => segmentDistSq(x, z, a, b) < routeSq)) continue;
      trees.push({
        x,
        y,
        z,
        scale: rules.minScale + (rules.maxScale - rules.minScale) * hash(i, j, rules.seed + 3),
        rotation: hash(i, j, rules.seed + 4) * Math.PI * 2,
        variant: Math.floor(hash(i, j, rules.seed + 5) * variants),
      });
    }
  }
  return trees;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/engine/world/treePlacement.test.ts && npm run typecheck && npm run lint`
Expected: all PASS. If the density ratio test lands just outside 0.25–0.45, the hash distribution is skewed. Report the measured ratio rather than loosening the bounds.

- [ ] **Step 5: Commit**

```bash
npm run format
git add src/engine/world/treePlacement.ts src/engine/world/treePlacement.test.ts
git commit -m "feat(world): deterministic tree placement avoiding routes and camps

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: TreeSystem: draw trees around the player

**Files:**
- Modify: `src/engine/world/ChunkManager.ts` (export a pure `tileIndexAt`)
- Create: `src/engine/world/TreeSystem.ts`, `src/engine/world/TreeSystem.test.ts`
- Modify: `src/engine/core/Game.ts`

**Interfaces:**
- Consumes:
  - Task 3: `placeTrees`, `TreeRules`, `TreeGround`, `TreeAvoid`.
  - Task 2: `GAME_CONFIG.biomes[biome].trees`, which is `null` or a tree rules object plus `ringRadius` and `castShadow`.
- Produces:
  - `tileIndexAt(m: TerrainManifest, x, z): { tx; tz }`, exported from `ChunkManager.ts`. The class's private method delegates to it.
  - `class TreeSystem`, with:
    - `constructor(parent: THREE.Object3D, manifest: TerrainManifest, ground: TreeGround & { hasTile(tx, tz): boolean }, rules: TreeRules & { ringRadius: number; castShadow: boolean })`
    - `update(x: number, z: number): void`
    - `get tileCount(): number`
    - `dispose(): void`

- [ ] **Step 1: Export `tileIndexAt`**

In `ChunkManager.ts`, move the body of the private `tileIndexAt` into an exported function, `export function tileIndexAt(m: TerrainManifest, x: number, z: number): TileIndex`, with the same clamp logic. The method becomes `return tileIndexAt(this.d.manifest, x, z);`. Export the `TileIndex` type if it is not already exported.

- [ ] **Step 2: Write the failing test**

`src/engine/world/TreeSystem.test.ts`:

```ts
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import type { TerrainManifest } from './terrainData';
import { TreeSystem } from './TreeSystem';

// 5 x 5 tiles of 64 m (65 samples at 1 m), origin at 0,0.
const manifest: TerrainManifest = {
  id: 't',
  spacingM: 1,
  tileSamples: 65,
  tilesX: 5,
  tilesZ: 5,
  originX: 0,
  originZ: 0,
  minHeightM: 0,
  maxHeightM: 10,
  backdrop: { file: 'b.u16', samples: 2, spacingM: 320 },
  camps: [],
  routes: [],
  attribution: '',
};
const ground = { heightAt: () => 1, slopeDegAt: () => 5, hasTile: () => true };
const rules = {
  seed: 1,
  spacingM: 8,
  density: 0.5,
  maxSlopeDeg: 40,
  routeClearanceM: 4,
  campClearanceM: 20,
  minScale: 0.8,
  maxScale: 1.4,
  ringRadius: 1,
  castShadow: false,
};

describe('TreeSystem', () => {
  it('builds at most one tile per update and fills the 3 x 3 ring', () => {
    const scene = new THREE.Scene();
    const trees = new TreeSystem(scene, manifest, ground, rules);
    trees.update(160, 160); // centre tile (2, 2)
    expect(trees.tileCount).toBe(1);
    for (let i = 0; i < 20; i++) trees.update(160, 160);
    expect(trees.tileCount).toBe(9);
    expect(scene.children.length).toBeGreaterThan(0);
    trees.dispose();
    expect(scene.children.length).toBe(0);
  });

  it('drops tiles that leave the ring', () => {
    const scene = new THREE.Scene();
    const trees = new TreeSystem(scene, manifest, ground, rules);
    for (let i = 0; i < 20; i++) trees.update(32, 32); // corner tile (0, 0): 2 x 2 ring
    expect(trees.tileCount).toBe(4);
    for (let i = 0; i < 20; i++) trees.update(288, 288); // far corner (4, 4)
    expect(trees.tileCount).toBe(4);
  });

  it('waits for tiles whose terrain is not loaded', () => {
    const scene = new THREE.Scene();
    const trees = new TreeSystem(scene, manifest, { ...ground, hasTile: () => false }, rules);
    for (let i = 0; i < 5; i++) trees.update(160, 160);
    expect(trees.tileCount).toBe(0);
  });
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `npx vitest run src/engine/world/TreeSystem.test.ts`
Expected: FAIL, because `./TreeSystem` cannot be resolved.

- [ ] **Step 4: Implement `src/engine/world/TreeSystem.ts`**

**Behaviour:**
- **Variants.** In the constructor, build `VARIANTS` once. Each is a merged `BufferGeometry` with a `color` attribute: brown trunk vertices and green crown vertices.
  - Use `CylinderGeometry` for trunks, and `ConeGeometry` or `IcosahedronGeometry(r, 0)` for crowns.
  - Merge with `mergeGeometries` from `three/examples/jsm/utils/BufferGeometryUtils.js`.
  - Keep the geometries non-indexed, or make them consistent before merging.
  - Three variants:
    0. A conifer: trunk radius 0.15 and height 2; crown cone radius 1.6, height 4, centred at y = 4.
    1. A broadleaf: trunk radius 0.2 and height 2.5; crown icosahedron radius 2 at y = 3.8.
    2. A bush: no trunk; icosahedron radius 1.1 at y = 0.9.
  - Colours are sRGB converted to linear with `THREE.Color.convertSRGBToLinear`. Trunk is `0x5a3b22`; crowns are `0x2f6b2a`, `0x3d7a2e` and `0x4f8a36`.
  - These shape numbers are visual constants. Declare them as named constants at the top of the file, not in `GAME_CONFIG`, which holds gameplay and tuning numbers. `density`, `spacing` and `scale` are the tuning values, and they are in `GAME_CONFIG`.
- **Material.** One shared `MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.9 })`.
- **Avoid data.** Built once: `manifest.routes?.map((r) => r.points) ?? []` and `manifest.camps.map((c) => c.position)`.
- **Per-tile data.** `tiles: Map<string, THREE.InstancedMesh[]>`, keyed `` `${tx}_${tz}` ``.
- **`update(x, z)`:**
  - Compute `c = tileIndexAt(manifest, x, z)`.
  - The desired keys are all `(tx, tz)` within `|tx − c.tx| ≤ ringRadius` and `|tz − c.tz| ≤ ringRadius`, clamped to the grid.
  - Remove every tile not desired: remove its meshes from the parent and dispose them. The variant geometries are shared, so do not dispose them here.
  - Then build at most **one** missing desired tile whose `ground.hasTile(tx, tz)` is true. Nearest to `c` first, by Chebyshev distance.
- **Building a tile:**
  - The tile size is `(manifest.tileSamples − 1) × manifest.spacingM`. The area is `[originX + tx·size, originX + (tx+1)·size) × [originZ + tz·size, originZ + (tz+1)·size)`.
  - Call `placeTrees(area, ground, rules, avoid, VARIANTS.length)`.
  - For each variant with at least one instance, create an `InstancedMesh(variantGeometry, material, count)`. Set each matrix from position (x, y, z), a Y-rotation and a uniform scale. Set `castShadow = rules.castShadow`, `receiveShadow = false` and `frustumCulled = true`. Call `computeBoundingSphere()` so culling works.
  - Add the meshes to the parent.
- **`dispose()`:** remove and dispose all instanced meshes, the variant geometries and the material.

- [ ] **Step 5: Wire into `Game.ts`**

- Add `trees: TreeSystem | null` to `World`.
- In `init`, after `ChunkManager` is created: if `cfg.biomes[o.biome].trees` is not null, construct `new TreeSystem(this.scene, manifest, sampler, rules)`. `TerrainSampler` already has `heightAt`, `slopeDegAt` and `hasTile`. Push `() => trees.dispose()` to `this.cleanup`.
- In `render()`, after `w.chunks.update(...)`, call `w.trees?.update(feet.x, feet.z)`, skipping it while `this.respawning`.

- [ ] **Step 6: Run the tests and the full verification**

Run: `npx vitest run src/engine/world && npm run format && npm run lint && npm run typecheck && npm test && npm run build && npm run e2e`
Expected: all PASS.

- [ ] **Step 7: Commit**

```bash
git add src/engine
git commit -m "feat(world): instanced low-poly trees around the player for forested biomes

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Keokradong data, catalog, e2e and docs

**Files:**
- Create: `src/data/mountains/keokradong.json`
- Modify: `src/data/mountains/index.ts`, `src/data/mountains/mountains.test.ts`, `src/data/catalog.ts`, `src/data/catalog.test.ts`
- Modify: `e2e/menu.spec.ts` (or `e2e/smoke.spec.ts`)
- Modify: `README.md`, `CLAUDE.md`, `docs/playtest/m1-checklist.md`, and `docs/superpowers/specs/2026-11-06-keokradong-design.md` (record the bake values)

**Interfaces:**
- Consumes: `MountainDef.biome` and `parseMountain` (Task 2), and the bake output path `terrain/keokradong` (Task 1).

- [ ] **Step 1: Write the failing tests**

In `src/data/catalog.test.ts`:
- Change the "makes Mera Peak playable…" test to expect `['mera-peak', 'keokradong']` from `PEAKS.filter(isPlayable).map((p) => p.id)`.
- Change the Bangladesh ordering expectation to `['keokradong', 'saka-haphong']`, because playable peaks come first.
- Rename the test to "makes Mera Peak and Keokradong playable and everything else coming soon".

In `src/data/mountains/mountains.test.ts`:
- Add `'keokradong'` to the list.
- Add `expect(getMountain('keokradong')!.biome).toBe('tropical-hills');`.

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run src/data`
Expected: FAIL. Keokradong is neither defined nor playable yet.

- [ ] **Step 3: Implement**

`src/data/mountains/keokradong.json`:

```json
{
  "id": "keokradong",
  "facts": {
    "name": "Keokradong",
    "country": "BD",
    "elevationM": 986,
    "location": { "lat": 21.95, "lon": 92.52 },
    "sources": ["Copernicus GLO-30 DEM"]
  },
  "terrainBaseUrl": "terrain/keokradong",
  "biome": "tropical-hills"
}
```

- Register it in `src/data/mountains/index.ts`, next to Mera Peak and Test Peak, through `parseMountain`.
- In `src/data/catalog.ts`, add `mountainId: 'keokradong'` to the Keokradong entry.

- [ ] **Step 4: e2e**

In `e2e/menu.spec.ts`, add a test:

```ts
test('shows Keokradong as playable and loads a forested biome on the test peak', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await page.getByRole('button', { name: /Bangladesh/ }).click();
  const keo = page.getByRole('button', { name: /Keokradong/ });
  await expect(keo).toBeEnabled();
  await expect(keo).toContainText('Climb');
  await page.goto('/?mountain=test-peak&biome=tropical-hills');
  await expect(page.getByTestId('hud')).toBeVisible({ timeout: 45_000 });
  expect(errors).toEqual([]);
});
```

If the existing Bangladesh assertions in `menu.spec.ts` assume Keokradong is disabled, update them. Its card now shows "Climb" and keeps "≈ 986 m".

- [ ] **Step 5: Docs**

- **`README.md`.** The Mountains table gains a row for Keokradong (Bangladesh, ≈ 986 m), with a deep link `/?mountain=keokradong` in the same style as the Mera row. Remove Keokradong from the "coming soon" sentence, and add a one-line feature bullet: "Biomes: green forested hills with trees on Keokradong; snow and rock on Mera Peak."
- **`CLAUDE.md`.**
  - Commands: add `npm run terrain:keokradong   # bake Keokradong (Bangladesh) from Copernicus DEM (network)`.
  - Terrain section: mention `"summitWalkable": true`, which adds the summit to the walk check and routes, for mountains walked to the top.
  - Architecture: add a short **Biomes** paragraph. A mountain's `biome` selects `GAME_CONFIG.biomes[id]`: the terrain palette (applied in `gridGeometry` in the mesh worker), sky and fog (`Environment`), and optional trees (`TreeSystem`, pure placement in `treePlacement.ts`, 3 × 3 tiles, no colliders). `?biome=<id>` overrides it for development.
- **`docs/playtest/m1-checklist.md`.** Add a `## Keokradong` section in the existing checkbox style:
  - Bangladesh → Keokradong → Climb loads a green hill with trees.
  - The orange route runs Boga Lake → Ridge Camp → Summit with no trees on it.
  - The Summit checkpoint is reachable on foot.
  - FPS stays ≥ 30 among the trees.
- **`docs/superpowers/specs/2026-11-06-keokradong-design.md`.** Append `## 7. Bake results`, with the camp and route lines printed by the Task 1 bake.

- [ ] **Step 6: Verify everything**

Run: `npm run format && npm run lint && npm run typecheck && npm test && npm run build && npm run e2e && .venv/bin/python -m pytest tools/terrain -q`
Expected: all PASS.

Then run `npm run dev` and open `/?mountain=keokradong` (the terrain is baked in Task 1) to check that it loads. Note the FPS from the HUD in the report.

- [ ] **Step 7: Commit**

```bash
git add src e2e README.md CLAUDE.md docs
git commit -m "feat(menu): Keokradong playable from the Bangladesh menu

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
