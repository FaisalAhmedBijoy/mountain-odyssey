# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project status

Mountain Odyssey is a free, browser-based, third-person mountaineering game (desktop only, keyboard + mouse, WebGL2). Phase 0 + M1 (vertical slice: Khare → High Camp on Mera Peak) is implemented; the manual playtest gate in `docs/playtest/m1-checklist.md` is pending. M2a (survival stats, spec `docs/superpowers/specs/2026-11-06-m2a-survival-design.md`, plan `docs/superpowers/plans/2026-11-06-m2a-survival.md`) is implemented. The rest of M2 (M2b–M2f, per that spec's §1) is next; each sub-project gets its own spec and plan. Keokradong (Bangladesh; spec `docs/superpowers/specs/2026-11-06-keokradong-design.md`) is playable as a second mountain, with the `tropical-hills` biome and trees.

- Design spec (source of truth for gameplay numbers and scope): `docs/superpowers/specs/2026-11-03-mountain-odyssey-design.md`
- Implemented plan (Phase 0 + M1 vertical slice, 16 TDD tasks): `docs/superpowers/plans/2026-11-03-m1-vertical-slice.md`

When code and these documents disagree, check the plan's "Deliberate deviations from the spec" section before changing either. Record any new deviation in the spec.

## Commands

```bash
npm run dev            # Vite dev server (http://localhost:5173)
npm run build          # tsc --noEmit && vite build
npm run lint           # ESLint
npm run typecheck      # tsc --noEmit
npm run format         # Prettier (run before every commit; CI runs format:check)
npm test               # Vitest, all unit tests (src/**/*.test.ts)
npx vitest run src/engine/player/Player.test.ts   # single test file
npx vitest run -t "climbs it"                     # tests matching a name
npm run e2e            # Playwright; `pree2e` bakes the synthetic test-peak first

# Terrain pipeline (Python 3.9+, use the venv)
python3 -m venv .venv && .venv/bin/pip install -r tools/terrain/requirements.txt
.venv/bin/python -m pytest tools/terrain -q
npm run terrain:test   # bake synthetic test-peak  -> public/terrain/test-peak
npm run terrain:mera   # bake Mera Peak from Copernicus DEM (network, ~25 MB) -> public/terrain/mera-peak
npm run terrain:keokradong   # bake Keokradong (Bangladesh) from Copernicus DEM (network)
```

Production: pushes to `main` that pass CI are deployed to GitHub Pages (`.github/workflows/deploy.yml`, site under `/mountain-odyssey/`). Static files in `public/` must be referenced through `assetUrl()` (`src/app/assetUrl.ts`), never with a leading `/`, so they resolve under that base path. Local check: `VITE_BASE=/mountain-odyssey/ npm run build && npx vite preview --base /mountain-odyssey/`.

Without a query the app opens on the country menu (country → mountain → game). `?mountain=<id>` (e.g. `/?mountain=test-peak`) skips the menus and loads that mountain directly.

## Architecture

**Layer rule (enforced by ESLint):** `src/engine/**` is pure TypeScript and must never import React. React (`src/app`, `src/ui`) never touches Three.js or Rapier objects; it only calls `Game.create / start / dispose`. The engine pushes HUD state through a `publish(patch)` callback into a Zustand vanilla store (`src/state/gameStore.ts`) at most every 100 ms, never per frame.

**Game loop:** `GameLoop` runs simulation at a fixed 60 Hz (accumulator, max 5 steps per frame) and renders with interpolation. Per step, `Game` does: input → `player.step()` → `physics.step()` → `player.afterPhysics()` → checkpoints. Respawns are deferred until after the step (never teleport inside an event handler), and wait for terrain chunks around the camp to load.

**Rendering vs physics:** Three.js only renders; Rapier (`@dimforge/rapier3d-compat`, WASM) only simulates. The player is a kinematic capsule driven by Rapier's character controller. While climbing, the controller's slope limits and snap-to-ground are switched off (`setClimbMode`).

**Movement logic is pure and separate from physics:** `movementState.ts` (state machine: walk/run/slide/climb/fall), `stamina.ts` and `fallDamage.ts` are pure functions unit-tested without Rapier. `Player.ts` glues them to physics and raycasts. Fall damage is scored per segment: airborne falls plus sliding on ground ≥ 50° (`minClimbSlopeDeg`) accumulate; a gentle (33–50°) slide, a landing, or grabbing a wall scores the pending segment. Gentle slides never damage.

**Survival is pure too:** `src/engine/survival/` holds oxygen, body temperature, supplies and inventory rules (`survival.ts` combines them). `SurvivalSystem` turns `F` / `O` / `R` into state changes and toasts, and `Game` runs it every step after the player, forwards `survival.modifiers` to `Player` (stamina recovery, stamina cap, climb speed), and respawns on `collapse` or `hypothermia` like a fatal fall. Rest pauses survival for `restSeconds`.

**Terrain is data, not code:**

- Offline: `tools/terrain/bake.py` crops the Copernicus GLO-30 DEM, resamples it to a 2 m local metric grid, adds detail noise, places camps on one connected walkable region (slope < 30°, stricter than the engine) near each target elevation, validates that consecutive camps are walk-connected and that every route stays below `routeMaxSlopeDeg` (33°, equal to `GAME_CONFIG.movement.maxWalkSlopeDeg`) on the 2 m cells it crosses (bake fails otherwise) and writes `manifest.json`, `backdrop.u16` and `tiles/<tx>_<tz>.u16`.
- A bake config with `"summitWalkable": true` adds the summit to the walk check and routes, for mountains walked to the top.
- The bake also writes `routes` (A* over the walkable grid, string-pulled, points ≤ 20 m apart, markers every 100 m and at turns) for each pair of consecutive camps. `RouteGuide` draws them as a ground ribbon (`T` toggles) plus flags, and `routeMath.ts` feeds the HUD arrow.
- Tiles are raw little-endian `uint16`, 257 × 257 samples, row-major with row = z, and neighbouring tiles share edge samples. Height = `min + v / 65535 * (max - min)` from the manifest.
- World axes: x = east, z = south, y = up (real elevation in metres). Camera yaw 0 looks toward −Z (north).
- Runtime: `ChunkManager` streams tiles around the player in LOD rings (`GAME_CONFIG.terrain.lodRings`), builds meshes off-thread (`meshBuilder.worker.ts`), keeps Rapier heightfield colliders only for the 3 × 3 tiles around the player, and redraws a low-res backdrop mesh with a hole where chunks are. `TerrainSampler` answers CPU height, normal and slope queries for gameplay and the camera.
- Rapier heightfields are column-major; `PhysicsWorld.addTerrainTile` transposes. Its test uses an asymmetric surface to catch mistakes.
- Adding a mountain = a bake config + `src/data/mountains/<id>.json` + setting `mountainId` on its entry in `src/data/catalog.ts` (which lists every country and peak on the menu), with no engine changes. `public/terrain/` is generated and git-ignored.

**Biomes:** a mountain's `biome` selects `GAME_CONFIG.biomes[id]`: the terrain palette (applied in `gridGeometry` in the mesh worker), sky and fog (`Environment`), and optional trees (`TreeSystem`, pure placement in `treePlacement.ts`, 3 × 3 tiles, no colliders). `?biome=<id>` overrides it for development.

**Tuning:** every gameplay number (speeds, slope thresholds, stamina rates, fall heights, camera, LOD) lives in `src/engine/config/game.config.ts`. Systems must read from it rather than hard-code values.

## Project constraints

- Assets must be CC0 (or Mixamo terms) and listed in `CREDITS.md`.
- Show the DEM attribution verbatim: `Contains modified Copernicus DEM data`.
- Keep `typescript@~5.9` (TypeScript 7 is not supported by typescript-eslint yet).
- Out of scope until later phases: backend/accounts (Phase 2), mobile/touch, multiplayer. Check spec §2.2 before adding features.
