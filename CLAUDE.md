# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project status

Mountain Odyssey is a free, browser-based, third-person mountaineering game (desktop only, keyboard + mouse, WebGL2). The repository currently contains only design documents; implementation starts with the plan below.

- Design spec (source of truth for gameplay numbers and scope): `docs/superpowers/specs/2026-11-03-mountain-odyssey-design.md`
- Current implementation plan (Phase 0 + M1 vertical slice, 16 TDD tasks): `docs/superpowers/plans/2026-11-03-m1-vertical-slice.md`

When code and these documents disagree, check the plan's "Deliberate deviations from the spec" section before changing either. Record any new deviation in the spec.

## Commands

These are defined by the plan (Task 1); they apply once the project is scaffolded.

```bash
npm run dev            # Vite dev server (http://localhost:5173)
npm run build          # tsc --noEmit && vite build
npm run lint           # ESLint
npm run typecheck      # tsc --noEmit
npm run format         # Prettier (run before every commit; CI runs format:check)
npm test               # Vitest, all unit tests (src/**/*.test.ts)
npx vitest run src/engine/player/Player.test.ts   # single test file
npx vitest run -t "climbs it"                     # tests matching a name
npm run e2e            # Playwright; needs `npm run terrain:test` first

# Terrain pipeline (Python 3.9+, use the venv)
python3 -m venv .venv && .venv/bin/pip install -r tools/terrain/requirements.txt
.venv/bin/python -m pytest tools/terrain -q
npm run terrain:test   # bake synthetic test-peak  -> public/terrain/test-peak
npm run terrain:mera   # bake Mera Peak from Copernicus DEM (network, ~25 MB) -> public/terrain/mera-peak
```

Load a specific mountain with `?mountain=<id>` (e.g. `/?mountain=test-peak`); default is `mera-peak`.

## Architecture

**Layer rule (enforced by ESLint):** `src/engine/**` is pure TypeScript and must never import React. React (`src/app`, `src/ui`) never touches Three.js or Rapier objects; it only calls `Game.create / start / dispose`. The engine pushes HUD state through a `publish(patch)` callback into a Zustand vanilla store (`src/state/gameStore.ts`) at most every 100 ms, never per frame.

**Game loop:** `GameLoop` runs simulation at a fixed 60 Hz (accumulator, max 5 steps per frame) and renders with interpolation. Per step, `Game` does: input → `player.step()` → `physics.step()` → `player.afterPhysics()` → checkpoints. Respawns are deferred until after the step (never teleport inside an event handler), and wait for terrain chunks around the camp to load.

**Rendering vs physics:** Three.js only renders; Rapier (`@dimforge/rapier3d-compat`, WASM) only simulates. The player is a kinematic capsule driven by Rapier's character controller. While climbing, the controller's slope limits and snap-to-ground are switched off (`setClimbMode`).

**Movement logic is pure and separate from physics:** `movementState.ts` (state machine: walk/run/slide/climb/fall), `stamina.ts` and `fallDamage.ts` are pure functions unit-tested without Rapier. `Player.ts` glues them to physics and raycasts. Fall damage is measured from the peak height across both `fall` and `slide` states.

**Terrain is data, not code:**

- Offline: `tools/terrain/bake.py` crops the Copernicus GLO-30 DEM, resamples it to a 2 m local metric grid, adds detail noise, places camps on one connected walkable region (slope < 30°) near each target elevation, validates that consecutive camps are walk-connected (bake fails otherwise) and writes `manifest.json`, `backdrop.u16` and `tiles/<tx>_<tz>.u16`.
- Tiles are raw little-endian `uint16`, 257 × 257 samples, row-major with row = z, and neighbouring tiles share edge samples. Height = `min + v / 65535 * (max - min)` from the manifest.
- World axes: x = east, z = south, y = up (real elevation in metres). Camera yaw 0 looks toward −Z (north).
- Runtime: `ChunkManager` streams tiles around the player in LOD rings (`GAME_CONFIG.terrain.lodRings`), builds meshes off-thread (`meshBuilder.worker.ts`), keeps Rapier heightfield colliders only for the 3 × 3 tiles around the player, and redraws a low-res backdrop mesh with a hole where chunks are. `TerrainSampler` answers CPU height, normal and slope queries for gameplay and the camera.
- Rapier heightfields are column-major; `PhysicsWorld.addTerrainTile` transposes. Its test uses an asymmetric surface to catch mistakes.
- Adding a mountain = a bake config + `src/data/mountains/<id>.json`, with no engine changes. `public/terrain/` is generated and git-ignored.

**Tuning:** every gameplay number (speeds, slope thresholds, stamina rates, fall heights, camera, LOD) lives in `src/engine/config/game.config.ts`. Systems must read from it rather than hard-code values.

## Project constraints

- Assets must be CC0 (or Mixamo terms) and listed in `CREDITS.md`.
- Show the DEM attribution verbatim: `Contains modified Copernicus DEM data`.
- Keep `typescript@~5.9` (TypeScript 7 is not supported by typescript-eslint yet).
- Out of scope until later phases: backend/accounts (Phase 2), mobile/touch, multiplayer. Check spec §2.2 before adding features.
