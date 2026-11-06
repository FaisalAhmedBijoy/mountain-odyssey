# M2a — Survival stats: design

**Status:** approved in brainstorming (2026-11-06). First of the M2 sub-projects.

**Parent spec:** `2026-11-03-mountain-odyssey-design.md` (§5.2 survival stats, §5.5 camps, §12 M2). Numbers here override §5.2 where marked **Deviation**, and each deviation is copied into the parent spec.

## 1. M2 decomposition

M2 (Public v1.0) is split into sub-projects. Each one gets its own spec, plan and implementation, and leaves the game playable when it is done.

| # | Sub-project | Depends on |
|---|---|---|
| **M2a** | **Survival stats** (this document) | none |
| M2b | Equipment, inventory, pack weight, climbability gating | M2a |
| M2c | Weather timeline, day/night clock, wind | M2a |
| M2d | Full route to the summit, ice and snow surfaces, fixed ropes, summit camera | M2b |
| M2e | Menus and screens, save/load/migration, settings and rebinding | M2b |
| M2f | Graphics presets, adaptive resolution, audio | none |

## 2. Goal and scope

Add oxygen, body temperature and supplies next to stamina, and make them interact. Add resting at camps, eating and drinking, bottled oxygen, two new causes of death, and losing supplies on respawn.

**In scope:**
- The four stats and their interactions.
- A fixed starting pack: 4 food rations, 4 water and 2 O₂ bottles.
- Actions: `F` eat or drink, `O` start a bottled-O₂ bottle, `R` rest at a camp.
- HUD bars, item counts, the O₂ timer, warnings and the rest prompt.

**Out of scope here:**
- Choosing items, pack weight, tent, stove, jacket and gloves as separate items (M2b).
- Wind, weather and the in-game clock (M2c).
- Save (M2e). Reloading the page starts a fresh expedition.

## 3. Architecture

All survival logic is pure TypeScript in a new folder, `src/engine/survival/`. Each module has its own Vitest file and needs no Rapier, the same pattern as `stamina.ts` and `fallDamage.ts`.

| File | Responsibility |
|---|---|
| `oxygen.ts` | `oxygenCeiling(altitudeM, acclimatizationM, bottledActive, rules)`, `updateOxygen(value, ceiling, exerting, dt, rules)` |
| `bodyTemp.ts` | `airTempC(altitudeM, rules)`, `bodyTempDelta(inputs, rules)`, `updateBodyTemp(...)` |
| `supplies.ts` | `updateSupplies(value, dt, rules)`, the stamina-recovery multiplier, the supplies stamina cap |
| `inventory.ts` | `Inventory` type (`food`, `water`, `o2` counts), `consumeNext(inv, supplies, rules)`, `loseOnRespawn(inv, fraction)` |
| `survival.ts` | `SurvivalState`, `initialSurvival(rules)`, `stepSurvival(state, inputs, dt, rules)` returning `{ state, death: 'collapse' \| 'hypothermia' \| null, warnings }`, plus `restAtCamp(state, rules)` and `respawnSurvival(state, rules)` |
| `SurvivalSystem.ts` | Glue. Reads the actions, the player's altitude, move state and "moving" flag, and whether the player is at a camp. Calls the pure functions, tells `Player` its multipliers, raises deaths through `Game`'s existing deferred respawn, and returns HUD fields. |

**Changes to existing code:**
- `stamina.ts`: `updateStamina` gains a `recoveryMultiplier` argument (default 1). `StaminaState.cap` becomes the injury cap. The effective cap is `min(injuryCap, suppliesCap)`.
- `Player.ts`: gains `setSurvivalModifiers({ staminaRecoveryMul, staminaCap, walkSpeedMul, climbSpeedMul })` and exposes `exerting` (running while moving, or moving while climbing). `restoreStamina()` resets value and injury cap.
- `Game.ts`: owns a `SurvivalSystem` and calls it each fixed step after `player.afterPhysics()`. Respawn takes a cause (`fall | collapse | hypothermia | outOfWorld`) and the toast names it. Respawn calls `respawnSurvival`.
- `events.ts`: `player:respawned` gains `cause`. A new event, `player:rested: { campId }`.
- `controls.config.ts`: `eat: ['KeyF']`, `oxygen: ['KeyO']`, `rest: ['KeyR']`. `controlHints.ts` gains "Eat / drink", "Bottled O₂" and "Rest at camp".
- `hud.ts`, `Hud.tsx`: new fields `oxygen`, `bodyTemp`, `supplies`, `items: { food, water, o2 }`, `o2SecondsLeft: number | null`, `warning: string | null` and `resting: boolean`. `prompt` shows "R — Rest" at a camp.
- `game.config.ts`: a new `survival` section that holds every number below.

"At a camp" means within `checkpoints.radiusM` (15 m) horizontally and `maxHeightDiffM` (10 m) vertically of any camp. The check moves into a shared helper, so `CheckpointSystem` and `SurvivalSystem` agree.

## 4. Rules and defaults

All stats range 0–100 and start at 100. Every number lives in `GAME_CONFIG.survival`.

### 4.1 Oxygen

```
effectiveAltitude = altitude − acclimatizationM − (bottledActive ? 2000 : 0)
ceiling           = clamp(100 − max(0, effectiveAltitude − 3000) / 40, 20, 100)
exerting          → oxygen −= 1/s (no recovery while exerting)
not exerting      → oxygen moves toward ceiling: up at +1/s, down at −2/s if above it
oxygen = 0        → death 'collapse'
warnings at < 25 ("Low oxygen — stop and breathe") and < 10 ("Oxygen critical")
```

**Deviation from §5.2:** §5.2 recovered toward the ceiling at 2/s even while exerting and drained only 1/s for exertion, so oxygen could never reach 0. Exertion now pauses recovery. Example: unacclimatized at High Camp (5,800 m, ceiling 30), about 30 s of continuous exertion causes a collapse. Stopping recovers it.

**Bottled O₂:**
- `O` starts one bottle when none is active and `o2 > 0`. It lasts 600 s of real time.
- It cannot be stopped early.
- The HUD shows the seconds left.

**Acclimatization:** +250 m per rest, capped at 1,000 m. It is kept through respawn.

### 4.2 Body temperature

```
airTempC        = 25 − 6.5 × altitudeM / 1000        (Khare ≈ −7.5 °C, summit ≈ −17 °C)
windSpeedMs     = 0                                   (M2c supplies it)
coldExposure    = max(0, 10 − airTempC) × (1 + windSpeedMs / 10)
insulation      = 20                                  (starting clothing; M2b splits it into items)
activityHeat    = idle 0, walk 3, run/climb 6         (moving only; climb-holding counts as idle)
shelterHeat     = 30 at a camp, else 0
bodyTemp       += (insulation + activityHeat + shelterHeat − coldExposure) / 60 × dt, clamped 0–100
bodyTemp < 30   → climb speed × 0.7
bodyTemp = 0    → death 'hypothermia'
warnings at < 40 ("You are getting cold") and < 15 ("Hypothermia — get to camp")
```

`airTempC` and `insulation` are new: §5.2 used them without values. Walking near High Camp is roughly neutral. The summit push drains body temperature to 0 in about 24 minutes.

### 4.3 Supplies

- Supplies drop by 1 every 30 s (−1/30 per second).
- `F` consumes one item if supplies are below 100. It takes food first (+25), then water (+15), and the result is clamped to 100. If there is nothing to consume, a toast says "No food or water left".
- Supplies at 0 cap stamina at 50 and halve stamina recovery.
- Warning at < 20: "Low supplies — eat or drink (F)".

### 4.4 Stamina interactions

```
staminaRecovery = 6/s × (oxygen / 100) × (supplies > 0 ? 1 : 0.5)
effective cap   = min(injury cap, supplies > 0 ? 100 : 50)
stamina = 0 while walking → walk speed × 0.5
```

### 4.5 Rest (`R`)

- Rest is allowed only at a camp, when grounded and not climbing.
- The screen fades for 3 s. Input is ignored and survival does not tick during the fade.
- After the rest:
  - Stamina is full and the injury is cleared.
  - Body temperature is 100.
  - Acclimatization rises by 250 m, then oxygen is set to the new ceiling.
  - Supplies drop by 10.
- The toast shows the new acclimatization, for example "Rested — acclimatized to +500 m".

The −10 supplies cost stops free acclimatization farming, because there is no clock until M2c.

### 4.6 Death and respawn

- **Causes:** `fall` (existing), `collapse`, `hypothermia` and `outOfWorld` (existing).
- **Toasts:**
  - Fall: "You fell. Back at {camp}."
  - Collapse: "You collapsed from lack of oxygen. Back at {camp}."
  - Hypothermia: "Hypothermia. Back at {camp}."
- **After respawn:**
  - Each item stack loses `floor(count × 0.2)`.
  - Stamina and body temperature return to 100.
  - Oxygen goes to the ceiling at the camp.
  - Supplies keep their value, but are at least 30.
  - Any active O₂ bottle ends.
  - Acclimatization is kept.
- The respawn count is tracked in `SurvivalSystem` (Results screen in M2e).

## 5. HUD

- **Bars:**
  - Stamina (existing).
  - Oxygen, blue.
  - Warmth, orange.
  - Supplies, green.
  - A bar flashes when its stat is below its warning level.
- **Item row:** 🍖 food, 💧 water and O₂ counts. While a bottle is active, the row shows "O₂ 7:42".
- **Warning line:** shows the most severe active warning. Priority: oxygen critical, then hypothermia, then low oxygen, then cold, then low supplies.
- **Prompts and fade:** the prompt shows "R — Rest" at a camp, and a full-screen fade covers the rest.

## 6. Testing

- **Unit tests** (Vitest) for each pure module:
  - The ceiling at 3,000 / 5,000 / 5,800 / 6,476 m, with and without acclimatization and O₂.
  - Exertion drains oxygen to collapse.
  - Oxygen recovers toward the ceiling and drops when above it.
  - The air temperature lapse.
  - The body temperature delta sign at Khare idle, walking at High Camp, and at a camp.
  - The hypothermia threshold.
  - The supplies drain.
  - The consumption order and the clamp at 100.
  - The respawn loss with `floor`.
  - The stamina multiplier and the effective cap.
  - The speed multipliers.
  - Rest effects.
  - Warning priority.
- **`SurvivalSystem` tests** with a fake player and fake inputs:
  - `F` consumes an item.
  - `O` starts a bottle that expires.
  - `R` works only at a camp.
  - A collapse requests a respawn with its cause.
- **`controlHints` test:** updated for the three new keys.
- **e2e:** the existing smoke test still passes, and the HUD shows the oxygen bar.
- **Playtest checklist:** add an M2a section covering a collapse from sprinting at altitude, eating, an O₂ bottle, and resting at High Camp.

## 7. Deviations during planning (2026-11-06)

1. **No "stamina 0 while walking → walk speed × 0.5".** Walking always recovers stamina, so stamina is 0 while walking for a single step at most. The rule would never be felt, so it is left out. `Player` gets no `walkSpeedMul`.
2. **No `player:rested` event.** Nothing listens to it until save arrives in M2e (YAGNI).
3. **Out-of-world uses the `fall` respawn cause.** The toast is the same, so there is no separate `outOfWorld` cause.
4. **`Player` does not expose `exerting`.** `activityOf(state, moving)` in `bodyTemp.ts` derives `idle | walk | exert` from the existing snapshot, and exertion means `activity === 'exert'`.
