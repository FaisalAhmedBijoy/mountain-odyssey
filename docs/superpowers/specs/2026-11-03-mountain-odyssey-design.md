# Mountain Odyssey — Game Design & Technical Specification

| Field | Value |
|---|---|
| Document status | Draft for review |
| Version | 1.0 |
| Date | 2026-11-03 |
| Owner | Faisal Ahmed (solo developer, AI-assisted) |
| Supersedes | "Realistic 3D Mountain Climbing Game — Architecture & MVP Design" (initial draft) |

---

## 1. Overview

### 1.1 Summary

Mountain Odyssey is a free, browser-based, third-person mountaineering game. Players prepare an expedition, then climb terrain built from real-world elevation data while managing stamina, oxygen, body temperature and supplies against changing weather.

The first public release (v1.0) contains one complete expedition: **Mera Peak, Nepal (≈6,476 m)**. The engine is data-driven, so later mountains are added as content (a JSON definition plus baked terrain tiles), not as new code.

### 1.2 Design pillars

Every feature must serve at least one pillar. Features that serve none are cut.

1. **Real places.** Mountain shape comes from real Digital Elevation Model (DEM) data. Geographic facts shown to the player are accurate and sourced.
2. **Earned summits.** Preparation and decisions matter. Mistakes cost time and supplies, but failure is never unfair or run-ending.
3. **Readable simulation.** Systems are deep but legible. The HUD always tells the player *why* something is happening.

### 1.3 Target audience and platform

| Item | Decision |
|---|---|
| Audience | General public; free to play, no account required |
| Platform | Desktop web browsers (latest Chrome, Edge, Firefox, Safari) with WebGL2 |
| Input | Keyboard and mouse |
| Minimum hardware | 8 GB RAM laptop with integrated GPU (e.g. Intel Iris Xe) |
| Unsupported | Mobile and tablet devices (show an "unsupported device" screen) |

### 1.4 Success criteria for v1.0

| Metric | Target |
|---|---|
| Frame rate, minimum hardware, "Low" preset | ≥ 30 FPS sustained |
| Frame rate, modern desktop, "High" preset | ≥ 60 FPS sustained |
| First load to playable menu (25 Mbps connection) | < 15 s |
| Total initial download | < 25 MB |
| Full expedition play time | 45–90 minutes |
| Crash-free sessions (manual playtest pool) | ≥ 95% |

---

## 2. Scope and release plan

### 2.1 Releases

| Release | Goal | Contents |
|---|---|---|
| **M1 — Vertical Slice** | Prove the core loop is fun | One terrain segment (Khare → High Camp), character, third-person camera, walk/run/slide/climb, stamina, one checkpoint. No menus. |
| **M2 — Public v1.0** | First public release | Full Mera Peak route (Section 4), all four survival stats, weather, equipment, expedition prep, menu flow, local save, settings, audio, deployment. |
| **M3 — Content expansion** | More mountains | Additional mountains via the same engine (candidates: Island Peak, Mont Blanc), country explorer (3D globe), achievements, player profile. |
| **Phase 2 — Online services** | Accounts and social | Backend API, accounts, cloud save, leaderboards (Section 13). |

### 2.2 Out of scope for v1.0

- Multiplayer of any kind.
- Mobile/touch and gamepad input.
- 3D globe (v1.0 uses a static Nepal map screen).
- Separate hydration and energy stats (merged into one **Supplies** stat).
- Real-time weather data feeds.
- Accounts, cloud save, leaderboards, backend of any kind.
- User-generated routes.

---

## 3. Player experience

### 3.1 Player journey (v1.0)

1. **Main Menu** — continue, new expedition, settings, credits.
2. **Mountain Select** — Nepal map with Mera Peak card (other peaks shown as "coming soon").
3. **Mountain Details** — elevation, location, route overview, difficulty, season notes, data sources.
4. **Expedition Prep** — choose equipment and supplies within a weight budget.
5. **Gameplay** — climb from Khare to the summit, resting and saving at camps.
6. **Results** — outcome (summit / abandoned), total time, falls, camps used, supplies remaining.

### 3.2 Core loop

```
Prepare  →  Move & climb  →  Manage stats / read weather  →  Reach camp (rest, save)
   ↑                                                                  │
   └────────────────────────── next stage ───────────────────────────┘
```

---

## 4. The Mera Peak expedition (v1.0 content)

The route is **game-designed and inspired by the real standard route**. It is not a reproduction of the real route and must not be presented as climbing guidance.

| # | Stage | Approx. elevation | Terrain | Gameplay focus |
|---|---|---|---|---|
| 0 | Khare (start camp, checkpoint) | 5,000 m | Village, moraine | Tutorial prompts, final gear check |
| 1 | Moraine trail | 5,000–5,300 m | Rock, scree | Walking, run/stamina, loose-rock slides |
| 2 | Snow slopes to Mera La | 5,300–5,400 m | Snow | Slower movement, cold, first weather change |
| 3 | Mera Glacier | 5,400–5,800 m | Ice, snow, crevasses | Crampons required, fixed ropes, route finding |
| 4 | High Camp (checkpoint) | 5,800 m | Rock outcrop | Rest, acclimatize, storm decision; rock climb section |
| 5 | Summit push | 5,800–6,450 m | Snow, ice | Night start, oxygen pressure, cold |
| 6 | Summit ridge (summit = checkpoint) | 6,450–6,476 m | Steep snow/ice | Fixed rope to summit, summit camera |

Mera Peak approximate coordinates: 27.70° N, 86.87° E.

---

## 5. Gameplay systems

All numeric values below are **defaults** and live in `engine/config/game.config.ts` so they can be tuned through playtesting.

**Time convention:** durations in this document are real time unless stated otherwise. The in-game clock (used for day/night and the HUD clock) runs at 20× real time. Resting at a camp or in a tent advances the in-game clock by 2 hours and fast-forwards the weather timeline by 6 real-time minutes.

### 5.1 Movement state machine

The player is in exactly one state at a time.

| State | Entry condition | Speed | Stamina |
|---|---|---|---|
| Walk | Surface slope < 33° (see note) | 2.0 m/s | Recovers |
| Run (`Shift`) | Slope < 20° and stamina > 10 | 5.0 m/s | −8 /s |
| Slide | Slope 33–50° with no grip, or ice without crampons | Uncontrolled | No cost; hazard |
| Climb (`E` at wall) | Slope > 50° and surface climbable with current gear | 0.5 m/s | −5 /s while moving, −1.5 /s while holding |
| Rope (`E` at fixed rope) | Within 1 m of a fixed rope; harness + ascender equipped | 0.8 m/s | −3 /s while moving |
| Fall | Stamina reaches 0 while climbing, or ungrounded drop | Gravity | — |

**Deviation (speed tuning, 2026-11-06):** walk speed raised from 1.4 to 2.0 m/s and run speed from 3.5 to 5.0 m/s at the developer's request, so moving across the large terrain feels less slow.

**Deviation (route guide, 2026-11-04):** the walk/slide threshold (`GAME_CONFIG.movement.maxWalkSlopeDeg`, which also sets Rapier's max climb angle) is 33°, not the original 30°. Routes derived from the 30 m DEM, judged at the engine's 2 m resolution, need it: on Mera no camp-to-camp route stays below 30° at 2 m, while one below 33° exists. The run limit stays 20°, and camp spawns stay ≤ 30° (see §6.9).

**Climbability rules**

| Surface | Requirements to climb |
|---|---|
| Rock | None |
| Snow (steep) | Ice axe |
| Ice | Ice axe and crampons |

If the requirement is not met, the HUD shows the missing item (e.g. "Requires ice axe + crampons") instead of a grab prompt.

**Fall damage**

| Drop height | Outcome |
|---|---|
| < 6 m | No effect |
| 6–15 m | Injury: −30 stamina cap until next camp rest |
| > 15 m | Fatal: respawn at last checkpoint |

### 5.2 Survival stats

Each stat ranges 0–100.

| Stat | Decreases from | Restored by | At zero |
|---|---|---|---|
| **Stamina** | Running, climbing, heavy pack | Rest; rate depends on oxygen and supplies | Climbing → fall; walking speed −50% |
| **Oxygen** | Altitude, exertion | Acclimatization at camps, bottled O₂ | Collapse → respawn |
| **Body temperature** | Low air temperature, wind, low insulation, inactivity | Tent, stove, movement | Hypothermia → respawn |
| **Supplies** | Time (−1 every 30 s) | Eating/drinking from inventory (`F`) | Stamina cap reduced to 50 |

**Interactions (default formulas)**

```
staminaRecovery   = 6/s × (oxygen / 100) × (supplies > 0 ? 1.0 : 0.5)

effectiveAltitude = altitude − acclimatizationBonus − (bottledO2Active ? 2000 : 0)
oxygenCeiling     = clamp(100 − max(0, effectiveAltitude − 3000) / 40, 20, 100)
oxygen            → moves toward oxygenCeiling at 2/s; exertion subtracts 1/s while running or climbing

coldExposure      = max(0, 10 − airTempC) × (1 + windSpeedMs / 10)
bodyTempDelta/s   = (insulation + activityHeat + shelterHeat − coldExposure) / 60

bodyTemp < 30     → climb speed −30%
```

`acclimatizationBonus` grows by 250 m per completed camp rest, capped at 1,000 m.

**Deviation (M2a survival, 2026-11-06):** with the formula above, oxygen could never reach 0 (recovery 2/s outweighed the 1/s exertion drain). Exertion now pauses recovery and drains 2/s; without exertion oxygen rises toward the ceiling at 1/s. Air temperature is `25 − 6.5 °C/km`, baseline insulation is 20, resting costs 10 supplies, and acclimatization is granted only on the first rest at each camp. Full rules: `2026-11-06-m2a-survival-design.md` §4.

### 5.3 Equipment and inventory

Each item has `id`, `name`, `slot`, `weightKg` and `effects`.

| Item | Slot | Effect |
|---|---|---|
| Mountaineering boots | Feet | Required to leave Khare |
| Crampons | Feet (add-on) | Grip on ice; enables ice climbing |
| Ice axe | Hand | Enables snow/ice climbing; self-arrest reduces slide distance |
| Harness | Body | Required for fixed ropes |
| Ascender | Hand (add-on) | Required for fixed ropes |
| Insulated jacket | Body | +insulation |
| Gloves | Hands | +insulation; climbing allowed below −15 °C |
| Tent | Pack | Enables rest outside camps |
| Stove | Pack | +shelterHeat while resting; melts snow to water |
| Food ration | Pack (stack) | +25 supplies |
| Water | Pack (stack) | +15 supplies |
| O₂ bottle | Pack (stack) | 10 minutes of bottled O₂ |

**Weight rule:** above 20 kg total pack weight, each additional kg applies −2% movement speed and +3% stamina cost. The prep screen shows the budget live.

The ice axe is used automatically when climbing snow or ice. There is no separate "use equipment" key.

### 5.4 Weather

- Each mountain defines a **weather timeline**: a sequence of states with base durations, randomized ±30% per expedition.
- States: **Clear**, **Wind**, **Snowfall**, **Storm**.
- Effects: visibility (fog distance), air temperature offset, wind speed, and climb stability (a storm adds a periodic sway that costs extra stamina while climbing).
- The HUD warns 1 minute before a storm, so the player can decide to wait at camp or push on.

### 5.5 Camps and checkpoints

- Camps: Khare, High Camp and the summit.
- At a camp the player can rest (advances time and restores stats), acclimatize (via rest) and save automatically.
- **Respawn rule:** on death the player returns to the last camp and loses 20% of current supplies items (rounded down). The Results screen records the number of respawns.

### 5.6 Controls

| Input | Action |
|---|---|
| `W` `A` `S` `D` | Move / climb direction |
| `Shift` | Run |
| `Space` | Jump; release grip while climbing |
| `E` | Grab wall / attach to rope / interact |
| `R` | Rest (camp or tent) |
| `F` | Eat / drink |
| `I` | Inventory |
| `Tab` | Route map |
| `C` | Cycle camera distance |
| `Esc` | Pause |
| Mouse move | Orbit camera |
| Mouse wheel | Zoom |

All keys are rebindable in Settings.

### 5.7 Camera

- Third-person follow camera with smoothed position and rotation.
- Sphere-cast collision against terrain to prevent clipping.
- Zoom range 2–8 m. Mouse orbit with a vertical clamp of −30° to +70°.
- While climbing, the camera pulls back and to the side so the wall above is visible.
- Summit cinematic: a scripted orbit when the summit checkpoint is reached.

---

## 6. Technical architecture

### 6.1 Technology stack

| Concern | Choice |
|---|---|
| Build tool | Vite |
| Language | TypeScript (strict mode) |
| UI (menus, HUD) | React 19 |
| Rendering | Three.js (WebGL2) |
| Physics | Rapier (`@dimforge/rapier3d-compat`, WASM) |
| UI ↔ engine state | Zustand |
| Unit tests | Vitest |
| End-to-end tests | Playwright |
| Terrain tooling | Python 3 (`rasterio`, `numpy`, `Pillow`), offline only |
| Hosting | GitHub Pages (static), deployed by GitHub Actions |
| CI | GitHub Actions |

### 6.2 Layer boundaries

```
React UI (menus, HUD) ──reads──▶ Zustand store ◀──writes── Game Engine (pure TypeScript)
        │                                                     │
        └──── commands (start, pause, equip) ────────────────▶│
                                                              ├─ Three.js  (rendering only)
                                                              └─ Rapier    (physics only)
```

Rules:

1. The engine never imports React.
2. React never touches Three.js or Rapier objects directly; it sends commands through the engine's public API.
3. The engine publishes HUD state to the store at most every 100 ms, not every frame.
4. Three.js renders; Rapier simulates. Neither owns the other's state.

### 6.3 Game loop

- Simulation and physics run on a **fixed 60 Hz step** using an accumulator; a maximum of 5 steps per frame prevents spiral-of-death.
- Rendering runs on `requestAnimationFrame` and interpolates transforms between the last two simulation states.
- The game pauses automatically when the tab is hidden (`visibilitychange`).

### 6.4 Source layout

```
src/
├── app/              # React routes and screens: MainMenu, MountainSelect, MountainDetails,
│                     #   ExpeditionPrep, Loading, Results, Settings
├── ui/               # React HUD, PauseMenu, shared components
├── state/            # Zustand stores: gameStore, settingsStore, profileStore
├── engine/
│   ├── core/         # Game, GameLoop, EventBus, AssetLoader, InputManager
│   ├── world/        # TerrainSystem, ChunkManager, TerrainMaterials, Sky, WeatherFX
│   ├── player/       # Player, MovementStateMachine, ClimbController, ProceduralAnimator
│   ├── camera/       # ThirdPersonCamera
│   ├── physics/      # PhysicsWorld (Rapier wrapper)
│   ├── systems/      # SurvivalSystem, WeatherSystem, EquipmentSystem,
│   │                 #   CheckpointSystem, AudioSystem
│   └── config/       # game.config.ts, controls.config.ts, graphics.config.ts
├── data/
│   ├── mountains/    # mera-peak.json, ...
│   └── equipment.json
└── persistence/      # SaveService (versioned localStorage)

tools/terrain/        # Offline DEM pipeline (not shipped)
public/terrain/       # Baked heightmap tiles and splat maps per mountain
```

Each engine system exposes a small public interface (`init`, `update(dt)`, `dispose`, plus system-specific methods) and communicates with other systems through the `EventBus` (e.g. `checkpoint:reached`, `player:fell`, `weather:changed`).

### 6.5 Terrain pipeline

**Offline (run once per mountain):**

1. Download Copernicus GLO-30 DEM tiles covering a ≈12 × 12 km area around the summit.
2. Crop, reproject to a local metric grid and resample to the playable resolution (≈2 m), adding procedural detail noise where the 30 m source lacks detail.
3. Export:
   - Raw little-endian `uint16` heightmap tiles (`.u16`, 257 × 257 samples; neighbouring tiles share edge samples). 16-bit PNG was rejected because browsers cannot decode it losslessly through canvas.
   - Splat map tiles (rock / snow / ice weights) — added in M2. M1 classifies surfaces at runtime from slope and altitude.
   - Route spline, camp positions and fixed-rope placements (JSON).
4. Write a manifest (`public/terrain/<mountain-id>/manifest.json`) with tile grid, scale and checksums.

**Runtime (browser):**

1. `ChunkManager` loads tiles around the player and builds meshes at three LOD levels (near / medium / far). Beyond the far ring, a single low-resolution backdrop mesh is used.
2. Rapier heightfield colliders exist only for the 3 × 3 chunks around the player.
3. Chunks load and unload as the player moves; building happens off the main thread in a Web Worker.

### 6.6 Mountain definition (data-driven content)

Adding a mountain requires a JSON file and baked terrain, not code changes. Facts and gameplay settings are kept separate.

```json
{
  "id": "mera-peak",
  "facts": {
    "name": "Mera Peak",
    "country": "NP",
    "elevationM": 6476,
    "location": { "lat": 27.70, "lon": 86.87 },
    "sources": ["Copernicus GLO-30 DEM"]
  },
  "gameplay": {
    "difficulty": "challenging",
    "terrainManifest": "/terrain/mera-peak/manifest.json",
    "camps": [
      { "id": "khare", "name": "Khare", "position": [0, 0, 0] },
      { "id": "high-camp", "name": "High Camp", "position": [0, 0, 0] },
      { "id": "summit", "name": "Summit", "position": [0, 0, 0] }
    ],
    "weatherTimeline": [
      { "state": "clear", "minutes": 20 },
      { "state": "wind", "minutes": 10 },
      { "state": "snowfall", "minutes": 15 },
      { "state": "storm", "minutes": 8 },
      { "state": "clear", "minutes": 30 }
    ],
    "airTempCurve": { "baseAltitudeM": 5000, "baseTempC": -5, "lapseRateCPer1000m": -6.5 },
    "requiredGear": ["boots"]
  }
}
```

Camp `position` values are produced by the terrain pipeline (step 3) and written into this file. The zeros above are illustrative only.

### 6.7 Assets

| Asset | Source | Format |
|---|---|---|
| Character model | CC0 library (e.g. Quaternius) | GLB, Draco-compressed |
| Animations | Mixamo (walk, run, climb idle/move, fall, rest) | GLB |
| Terrain textures | CC0 (e.g. Poly Haven, ambientCG) | KTX2 |
| Props (rocks, tents, flags) | CC0 or self-made in Blender | GLB, instanced |
| Audio | CC0 (e.g. Freesound CC0 filter) | OGG/MP3 |

Every asset and its licence is listed in `CREDITS.md`. Climbing hand placement uses procedural IK on top of base animations; no per-hold authoring is needed.

### 6.8 Persistence

- Storage: `localStorage` key `mountain-odyssey.save`, JSON.
- Contents: `schemaVersion`, unlocked mountains, best times, settings, and the active expedition (last checkpoint, inventory, stats, elapsed time, weather seed).
- Save triggers: reaching a camp, resting, and quitting to menu.
- A `migrate(save)` function upgrades older schema versions on load.

### 6.9 M1 implementation notes

- Camp positions are generated by the terrain pipeline and stored in the terrain `manifest.json`. Placement is walkability-aware: the bake marks walkable ground (slope below `campPlacement.maxWalkSlopeDeg`, 30°, stricter than the engine's 33° walk limit) on an 8 m analysis grid, labels its connected components, and picks the largest component that has ground within `toleranceM` (100 m) of every camp's `targetElevationM`. Each camp is the cell of that component closest to its target elevation, preferring flatter cells, whose spawn neighbourhood (±`spawnRadiusM`, 6 m, at full resolution) is walkable. `bearingFromSummitDeg` is an optional, mild preference, not a hard direction.
- Every bake (synthetic and DEM) validates its camps and exits non-zero on failure: each spawn neighbourhood must be walkable, and each pair of consecutive camps must lie in the same walkable component. The summit camp is exempt because it is reached by climbing (M2). The synthetic `test-peak` has a walkable ramp through its cliff ring on the south side so it passes the same check.
- **Deviation: walk limit 33°, camps 30°.** The engine's walk/slide threshold is 33° (§5.1) because DEM-derived routes at 2 m need it. Camp placement and spawn neighbourhoods keep the stricter `campPlacement.maxWalkSlopeDeg` of 30°. Baked routes use `campPlacement.routeMaxSlopeDeg` (33°, must equal `GAME_CONFIG.movement.maxWalkSlopeDeg`), judged on every 2 m cell they cross; the manifest records it as `routeMaxSlopeDeg` and a contract test keeps the two equal.
- **Traversability requirement for every mountain:** consecutive camps that the route expects players to walk between must be connected by walkable ground at the engine's walk-slope limit. Sections that need climbing must be short (one stamina bar of climbing is about 10 m of rise). A new mountain's bake config is not accepted until its bake validates.
- Camera collision samples the terrain heightfield along the camera boom instead of using a physics sphere-cast.
- M1 uses the CC0 "RobotExpressive" model as a placeholder character; it has no climbing animation.
- Baked terrain is generated, not committed (`public/terrain/` is git-ignored). CI bakes and tests a small synthetic `test-peak`.
- The Mera bake restricts the summit search to `summitSearchRadiusM` (1500 m) around the crop centre because a taller neighbouring peak sits at the crop edge. Bearing tuning is no longer used: an earlier bearing-based placement put Khare on the steep north face, cut off from High Camp. With walkability-aware placement, Khare (~4,996 m) and High Camp (~5,774 m) sit about 2.1 km apart on the eastern slopes (the Mera La side) and are connected by walkable ground.

---

## 7. User interface

### 7.1 Screens

| Screen | Key contents |
|---|---|
| Main Menu | Continue (if save exists), New Expedition, Settings, Credits |
| Mountain Select | Nepal map; Mera Peak card (image, elevation, difficulty, est. duration, season); locked "coming soon" cards |
| Mountain Details | Facts with sources, route overview by stage, required gear |
| Expedition Prep | Gear grid, selected loadout, live weight bar and warnings, Start button |
| Loading | Progress bar, tips |
| Gameplay HUD | Stats (Section 7.2), interaction prompts, weather warning, compass |
| Pause | Resume, Settings, Return to camp, Quit to menu |
| Results | Outcome, time, falls, respawns, camps, supplies remaining |
| Settings | Graphics preset, render scale, key bindings, mouse sensitivity, audio volumes |

The visual direction is an adventure-game interface (large photography-style backgrounds from in-game renders, high-contrast type), not a dashboard.

### 7.2 HUD

- Four stat bars: Stamina, Oxygen, Body temperature, Supplies. Each shows a cause icon when it is falling quickly (e.g. wind icon next to body temperature).
- Altitude, distance to next camp, weather state and air temperature.
- Context prompt (e.g. "E — Grab", "Requires ice axe + crampons").
- The HUD fades when stats are healthy and the player is idle, and reappears on any change.

---

## 8. Performance

### 8.1 Graphics presets

| Setting | Low | Medium | High |
|---|---|---|---|
| Render scale | 0.75 | 1.0 | 1.0 |
| Shadows | Off | 1 cascade, player area | 2 cascades |
| Terrain LOD distance | Short | Medium | Long |
| Snow particles | 1,000 | 4,000 | 10,000 |
| Post-processing | None | Fog + tone mapping | Fog + tone mapping + bloom |

A preset is auto-selected on first launch from a GPU tier check. If FPS stays below 25 for 5 seconds, render scale drops in 0.1 steps (minimum 0.5).

### 8.2 Budgets

| Resource | Budget |
|---|---|
| Draw calls | < 300 |
| Triangles on screen | < 1.5 M |
| JS heap | < 500 MB |
| Initial download | < 25 MB |
| Per-chunk tile download | < 200 KB |

Techniques: instanced meshes for rocks and ice debris, KTX2 textures, lazy loading of non-starting chunks, frustum culling, and building terrain meshes in a Web Worker.

---

## 9. Error handling

| Failure | Behaviour |
|---|---|
| WebGL2 unavailable | Show a clear message with supported-browser guidance |
| Mobile/tablet detected | Show the "desktop only" screen |
| Rapier WASM fails to load | Error screen with a Retry button |
| Asset or tile fails to load | Retry 3 times with backoff, then return to menu with a message |
| Save is corrupt or fails validation | Back up the raw value to `mountain-odyssey.save.bak`, start a fresh save, notify the player |
| `localStorage` full or unavailable | Continue in session-only mode; show a "progress will not be saved" banner |
| WebGL context lost | Pause, then reinitialize renderer resources on restore |

---

## 10. Quality and testing

| Level | Tool | Covers |
|---|---|---|
| Unit | Vitest | Survival formulas, movement state transitions, equipment weight rules, save migration, weather timeline generation |
| Integration | Vitest + headless Rapier | Slope classification, slide/climb transitions on test heightfields, fall-damage thresholds |
| End-to-end | Playwright | Menu → prep → gameplay start, pause/resume, save and reload restores checkpoint |
| Manual | Playtest checklist | Run at the end of each milestone on minimum hardware |

CI (GitHub Actions) runs lint, type-check, unit and integration tests and a production build on every push, and deploys a preview build for each pull request.

---

## 11. Deployment, legal and credits

- **Hosting:** GitHub Pages at `https://faisalahmedbijoy.github.io/mountain-odyssey/`. The `Deploy to GitHub Pages` workflow runs after CI passes on `main` (or manually): it bakes test-peak and Mera Peak, builds with `VITE_BASE=/mountain-odyssey/`, and publishes `dist/`. GitHub Pages does not allow custom cache headers, so the long-lived immutable caching planned for Cloudflare is not available; hashed JS/CSS file names still make updates safe. (Changed from Cloudflare Pages on 2026-11-04 to keep everything in GitHub.)
- **DEM attribution:** "Contains modified Copernicus DEM data" (displayed in Credits and the Mountain Details screen).
- **Asset licences:** CC0 and Mixamo terms; all listed in `CREDITS.md`.
- **Disclaimer** (shown in Mountain Details and Credits): "Routes are game-designed and inspired by real mountains. This game is not a guide for real-world climbing."
- **Privacy:** no accounts, no analytics in v1.0, no personal data collected.

---

## 12. Milestones and acceptance criteria

Estimates assume one developer working ≈15–20 hours per week with AI assistance.

### Phase 0 — Setup (1 week)

- Vite + TypeScript + React project with lint, format and Vitest configured.
- CI pipeline running on GitHub Actions.
- Engine skeleton: `Game`, `GameLoop`, `EventBus` rendering an empty scene.
- Terrain pipeline produces one Mera Peak heightmap tile that renders in the browser.

### M1 — Vertical slice (5–6 weeks)

Acceptance criteria:

- Khare → High Camp segment loads via `ChunkManager` with three LOD levels.
- Character walks, runs, slides and climbs on rock with correct state transitions.
- Third-person camera follows, orbits, zooms and does not clip through terrain.
- Stamina drains and recovers per Section 5.2; climbing at 0 stamina causes a fall.
- Fall damage per Section 5.1; fatal falls respawn at Khare.
- Reaching High Camp triggers a checkpoint event.
- ≥ 30 FPS on minimum hardware.

**Playtest gate:** at least three external players try the slice. If the climb loop is not fun, mechanics are revised before starting M2.

### M2 — Public v1.0 (8–10 weeks)

Acceptance criteria:

- Full route (Section 4) playable from Khare to summit.
- All four survival stats and their interactions per Section 5.2.
- Weather timeline with all four states and the storm warning.
- Equipment, weight rules and climbability requirements per Section 5.3.
- Fixed-rope traversal on the glacier and summit ridge.
- All screens in Section 7.1 implemented.
- Save, load, migration and error cases per Sections 6.8 and 9.
- Graphics presets and adaptive resolution per Section 8.
- Audio: wind, footsteps (per surface), climbing, breathing at altitude.
- Credits and disclaimer in place; deployed to production.
- All success criteria in Section 1.4 met.

**Total estimate to v1.0: ≈14–17 weeks.**

---

## 13. Future phases

### 13.1 M3 — Content expansion

- New mountains added through the data-driven definition (Section 6.6).
- Country explorer with an interactive 3D globe.
- Achievements and a player profile (local first).

Candidate regions: Nepal (Island Peak, Everest region), Pakistan (K2 region), India (Kangchenjunga region), France/Italy (Mont Blanc).

### 13.2 Phase 2 — Online services

Introduced only when accounts or shared features are needed.

| Concern | Choice |
|---|---|
| API | FastAPI, modular structure (`modules/<feature>/{routes,service,schemas,models}.py`) |
| Database | PostgreSQL (+ PostGIS if spatial queries are needed) |
| Asset storage | Object storage (S3-compatible); never store meshes in the database |

Planned endpoints (all under `/api/v1`):

| Method | Endpoint | Purpose |
|---|---|---|
| POST | `/auth/register`, `/auth/login` | Accounts |
| GET | `/mountains`, `/mountains/{id}` | Catalog (replaces static JSON) |
| GET/PUT | `/players/me/save` | Cloud save (same schema as local save) |
| POST | `/expeditions/{id}/complete` | Record a completed expedition |
| GET | `/leaderboards/{mountainId}` | Fastest summits |

Principle carried forward: movement and physics always run locally. The backend receives only meaningful events (checkpoints, completions, saves), never per-frame positions.

Later candidates: cooperative rope climbing, rescue missions, seasonal weather, user-created routes.

---

## 14. Risks and mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Climbing feels clunky | Core loop fails | Playtest gate after M1; keep climbing contextual, not per-hold |
| 30 m DEM looks too smooth up close | Weak visuals | Procedural detail noise and rock props at near LOD |
| Browser performance on integrated GPUs | Unplayable for many users | Budgets in Section 8, presets, adaptive resolution, early profiling |
| Solo developer scope creep | Release slips | Strict out-of-scope list (Section 2.2); pillar test for new features |
| Asset quality and licensing | Inconsistent look, legal risk | CC0 sources only, `CREDITS.md` maintained per asset |
| Survival tuning too punishing | Players quit | All values in config; respawn at camps; HUD explains causes |

---

## 15. Decision log

| Decision | Choice | Rationale |
|---|---|---|
| Release target | Free, public, no login | Lowest barrier to play; zero server cost |
| Platform | Desktop browser, keyboard + mouse | Climbing controls and performance are far simpler |
| Build stack | Vite + React (UI only) + pure TypeScript engine | Engine independent of React; static hosting; no SSR needed |
| Rendering / physics | Three.js / Rapier | Mature, well-documented, clear separation of concerns |
| Climbing model | Contextual grab-and-climb with gear requirements | Accessible yet challenging; feasible with procedural animation |
| Failure model | Respawn at last camp with supplies penalty | Mistakes cost something without ending the run |
| Art direction | Stylized realistic | Achievable solo; runs well in browsers; fits CC0 assets |
| Terrain source | Copernicus GLO-30 DEM, baked offline | Global, free with attribution; no runtime GIS processing |
| Persistence | Versioned `localStorage` | No backend required for v1.0 |
| Backend | Deferred to Phase 2 | Not needed for single-player v1.0 |

---

## 16. Changes from the initial draft

- Removed all external image links and references to commercial games.
- Replaced Next.js + React Three Fiber with Vite + React + a standalone TypeScript engine.
- Moved FastAPI, PostgreSQL/PostGIS, database tables and API endpoints to Phase 2.
- Merged hydration and energy into a single Supplies stat.
- Removed the `Q` "use equipment" key (equipment is used automatically) and added `R`, `F` and `Tab`.
- Replaced the 25-item checklist with milestone acceptance criteria.
- Added success metrics, failure model, art direction, error handling, testing, legal/attribution and risk sections.
- Re-estimated the timeline for a solo, AI-assisted developer.
