# M2a Survival Stats Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add oxygen, body temperature and supplies next to stamina, with eating (`F`), bottled oxygen (`O`), resting at camps (`R`), two new deaths (collapse, hypothermia) and item loss on respawn.

**Architecture:**
- Survival rules are pure TypeScript functions in `src/engine/survival/`. They are unit-tested without Rapier, the same way as `stamina.ts`.
- A small `SurvivalSystem` class owns the survival state and turns key presses into actions and toasts.
- `Game` calls it every fixed step and forwards its modifiers to `Player`, which scales stamina recovery and caps stamina and climb speed.
- HUD fields are published through the existing throttled `publish()`.

**Tech Stack:** TypeScript 5.9, Vitest, React 19 + Zustand (HUD), Playwright (e2e).

**Spec:** `docs/superpowers/specs/2026-11-06-m2a-survival-design.md`. All numbers below come from its §4.

## Global Constraints

- Work on branch `m2a-survival`, created from `main`.
- `src/engine/**` must never import React. React (`src/ui`, `src/app`) never touches Three.js or Rapier objects. UI may import `src/engine/config/*` for constants.
- Every gameplay number lives in `GAME_CONFIG.survival` (`src/engine/config/game.config.ts`). Systems read from it and never hard-code numbers.
- All survival stats range 0–100 (`GAME_CONFIG.survival.max`).
- HUD state is published at most every 100 ms via `publishHud`, never per frame.
- Run `npm run format` before every commit. CI runs `format:check`, `lint`, `typecheck`, `test`, `build` and `e2e`.
- Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Keep `typescript@~5.9`.

## Deliberate deviations from the M2a spec

1. **No "stamina 0 while walking → walk speed × 0.5".** Walking always recovers stamina, so stamina is 0 while walking for a single step at most. The rule would never be felt, so it is left out. `Player` gets no `walkSpeedMul`.
2. **No `player:rested` event.** Nothing listens to it until save arrives in M2e (YAGNI).
3. **Out-of-world uses the `fall` respawn cause.** The toast is the same, so there is no separate `outOfWorld` cause.
4. **`Player` does not expose `exerting`.** `activityOf(state, moving)` in `bodyTemp.ts` derives `idle | walk | exert` from the existing snapshot, and exertion means `activity === 'exert'`.

Task 6 copies these four deviations into the M2a spec.

## File map

| File | Status | Responsibility |
|---|---|---|
| `src/engine/config/game.config.ts` | modify | `survival` section |
| `src/engine/survival/oxygen.ts` (+ test) | create | ceiling and oxygen update |
| `src/engine/survival/bodyTemp.ts` (+ test) | create | air temperature, cold exposure, activity, body temperature update |
| `src/engine/survival/supplies.ts` (+ test) | create | supplies drain |
| `src/engine/survival/inventory.ts` (+ test) | create | `Inventory`, eating order, respawn loss |
| `src/engine/survival/survival.ts` (+ test) | create | combined state, step, modifiers, warnings, bottle, rest, respawn |
| `src/engine/survival/SurvivalSystem.ts` (+ test) | create | actions → state changes and toasts, rest countdown |
| `src/engine/systems/camps.ts` (+ test) | create | `isNearCamp`, `campAt` |
| `src/engine/systems/CheckpointSystem.ts` | modify | use `isNearCamp` |
| `src/engine/player/stamina.ts` (+ test) | modify | recovery multiplier and cap limit |
| `src/engine/player/Player.ts` (+ test) | modify | `setSurvivalModifiers`, `restoreStamina`, cold climb speed |
| `src/engine/config/controls.config.ts` | modify | `eat`, `oxygen`, `rest` |
| `src/engine/core/events.ts` | modify | `RespawnCause`, `cause` on `player:respawned` |
| `src/engine/core/hud.ts` | modify | survival HUD fields |
| `src/engine/core/Game.ts` | modify | wire `SurvivalSystem`, respawn causes, rest |
| `src/ui/formatMinSec.ts` (+ test) | create | `7:42` formatting |
| `src/ui/controlHints.ts` (+ test) | modify | three new hints |
| `src/ui/Hud.tsx`, `src/app/app.css` | modify | bars, items, warning, rest overlay |
| `e2e/smoke.spec.ts` | modify | survival HUD visible |
| `README.md`, `CLAUDE.md`, `docs/playtest/m1-checklist.md`, M2a spec | modify | docs |

---

### Task 1: Survival config, oxygen, body temperature and supplies

**Files:**
- Modify: `src/engine/config/game.config.ts` (add the `survival` block after `fall`)
- Create: `src/engine/survival/oxygen.ts`, `src/engine/survival/oxygen.test.ts`
- Create: `src/engine/survival/bodyTemp.ts`, `src/engine/survival/bodyTemp.test.ts`
- Create: `src/engine/survival/supplies.ts`, `src/engine/survival/supplies.test.ts`

**Interfaces:**
- Produces: `GAME_CONFIG.survival` (exact shape below).
- Produces: `oxygenCeiling(altitudeM, acclimatizationM, bottledActive, r: OxygenRules, max = 100): number` and `updateOxygen(value, ceiling, exerting, dt, r: OxygenRules): number`.
- Produces: `type Activity = 'idle' | 'walk' | 'exert'`, `activityOf(state: MoveState, moving: boolean): Activity`, `airTempC(altitudeM, r)`, `coldExposure(airC, windMs, r)`, `interface BodyTempInputs { altitudeM; windMs; activity; atCamp }`, `bodyTempRate(i, r)` and `updateBodyTemp(value, i, dt, r, max = 100)`.
- Produces: `updateSupplies(value, dt, r: SuppliesRules): number`.

- [ ] **Step 1: Add the config block**

In `src/engine/config/game.config.ts`, insert after the `fall: {...},` line:

```ts
  /** Survival stats (M2a spec §4). Every stat ranges 0..max. */
  survival: {
    max: 100,
    restSeconds: 3,
    respawnItemLossFraction: 0.2,
    startingPack: { food: 4, water: 4, o2: 2 },
    acclimatization: { perRestM: 250, maxM: 1000 },
    oxygen: {
      ceilingRefAltitudeM: 3000,
      ceilingMetresPerPoint: 40,
      minCeiling: 20,
      exertionDrainPerSec: 1,
      recoverPerSec: 1,
      dropToCeilingPerSec: 2,
      bottleAltitudeBonusM: 2000,
      bottleSeconds: 600,
      warnLow: 25,
      warnCritical: 10,
    },
    temperature: {
      seaLevelAirC: 25,
      lapseCPerKm: 6.5,
      comfortC: 10,
      windFactorPerMs: 0.1,
      insulation: 20,
      activityHeat: { idle: 0, walk: 3, exert: 6 },
      campShelterHeat: 30,
      rateDivisor: 60,
      slowClimbBelow: 30,
      coldClimbSpeedMul: 0.7,
      warnCold: 40,
      warnHypothermia: 15,
    },
    supplies: {
      drainPerSec: 1 / 30,
      foodGain: 25,
      waterGain: 15,
      emptyStaminaCap: 50,
      emptyRecoveryMul: 0.5,
      warnLow: 20,
      restCost: 10,
      respawnMin: 30,
    },
  },
```

- [ ] **Step 2: Write the failing tests**

`src/engine/survival/oxygen.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { GAME_CONFIG } from '../config/game.config';
import { oxygenCeiling, updateOxygen } from './oxygen';

const r = GAME_CONFIG.survival.oxygen;

describe('oxygenCeiling', () => {
  it('follows 100 - (altitude - 3000) / 40 with a floor of 20', () => {
    expect(oxygenCeiling(1000, 0, false, r)).toBe(100);
    expect(oxygenCeiling(3000, 0, false, r)).toBe(100);
    expect(oxygenCeiling(5000, 0, false, r)).toBe(50);
    expect(oxygenCeiling(5800, 0, false, r)).toBe(30);
    expect(oxygenCeiling(6476, 0, false, r)).toBe(20);
  });

  it('rises with acclimatization and bottled oxygen', () => {
    expect(oxygenCeiling(5800, 1000, false, r)).toBe(55);
    expect(oxygenCeiling(6476, 0, true, r)).toBeCloseTo(63.1, 6);
    expect(oxygenCeiling(6476, 1000, true, r)).toBeCloseTo(88.1, 6);
  });
});

describe('updateOxygen', () => {
  it('drains 1/s while exerting, even below the ceiling, never below 0', () => {
    expect(updateOxygen(30, 30, true, 1, r)).toBe(29);
    expect(updateOxygen(10, 50, true, 2, r)).toBe(8);
    expect(updateOxygen(0.5, 30, true, 1, r)).toBe(0);
  });

  it('recovers toward the ceiling at 1/s and stops there', () => {
    expect(updateOxygen(20, 30, false, 1, r)).toBe(21);
    expect(updateOxygen(29.5, 30, false, 1, r)).toBe(30);
  });

  it('drops toward a lower ceiling at 2/s and stops there', () => {
    expect(updateOxygen(100, 50, false, 1, r)).toBe(98);
    expect(updateOxygen(51, 50, false, 1, r)).toBe(50);
  });

  it('runs out after about 30 s of exertion at an unacclimatized High Camp', () => {
    const ceiling = oxygenCeiling(5800, 0, false, r);
    let o = ceiling;
    for (let i = 0; i < 30 * 60; i++) o = updateOxygen(o, ceiling, true, 1 / 60, r);
    expect(o).toBeLessThan(1e-9);
  });
});
```

`src/engine/survival/bodyTemp.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { GAME_CONFIG } from '../config/game.config';
import {
  activityOf,
  airTempC,
  bodyTempRate,
  coldExposure,
  updateBodyTemp,
  type BodyTempInputs,
} from './bodyTemp';

const r = GAME_CONFIG.survival.temperature;
const at = (altitudeM: number, over: Partial<BodyTempInputs> = {}): BodyTempInputs => ({
  altitudeM,
  windMs: 0,
  activity: 'idle',
  atCamp: false,
  ...over,
});

describe('air temperature and cold exposure', () => {
  it('lapses 6.5 °C per km from 25 °C at sea level', () => {
    expect(airTempC(0, r)).toBe(25);
    expect(airTempC(5000, r)).toBeCloseTo(-7.5, 6);
    expect(airTempC(6476, r)).toBeCloseTo(-17.094, 3);
  });

  it('is zero above 10 °C and grows with wind', () => {
    expect(coldExposure(15, 0, r)).toBe(0);
    expect(coldExposure(-10, 0, r)).toBe(20);
    expect(coldExposure(-10, 10, r)).toBe(40);
  });
});

describe('activityOf', () => {
  it('maps move state and movement to activity heat levels', () => {
    expect(activityOf('walk', true)).toBe('walk');
    expect(activityOf('run', true)).toBe('exert');
    expect(activityOf('climb', true)).toBe('exert');
    expect(activityOf('climb', false)).toBe('idle');
    expect(activityOf('run', false)).toBe('idle');
    expect(activityOf('walk', false)).toBe('idle');
    expect(activityOf('slide', true)).toBe('idle');
    expect(activityOf('fall', true)).toBe('idle');
  });
});

describe('body temperature', () => {
  it('warms idling at Khare, is about neutral walking at High Camp and cools idling there', () => {
    expect(bodyTempRate(at(5000), r)).toBeCloseTo(2.5 / 60, 6);
    expect(bodyTempRate(at(5800, { activity: 'walk' }), r)).toBeCloseTo(0.3 / 60, 6);
    expect(bodyTempRate(at(5800), r)).toBeCloseTo(-2.7 / 60, 6);
  });

  it('warms quickly at a camp', () => {
    expect(bodyTempRate(at(5800, { atCamp: true }), r)).toBeCloseTo(27.3 / 60, 6);
  });

  it('walking the summit push empties body temperature in about 24 minutes', () => {
    const rate = bodyTempRate(at(6476, { activity: 'walk' }), r);
    expect(100 / -rate / 60).toBeCloseTo(24.4, 1);
  });

  it('clamps to 0..100', () => {
    expect(updateBodyTemp(100, at(5000), 10, r)).toBe(100);
    expect(updateBodyTemp(0.01, at(6476), 1, r)).toBe(0);
  });
});
```

`src/engine/survival/supplies.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { GAME_CONFIG } from '../config/game.config';
import { updateSupplies } from './supplies';

const r = GAME_CONFIG.survival.supplies;

describe('updateSupplies', () => {
  it('drops 1 every 30 s and never below 0', () => {
    expect(updateSupplies(100, 30, r)).toBeCloseTo(99, 9);
    expect(updateSupplies(100, 3000, r)).toBeCloseTo(0, 9);
    expect(updateSupplies(0.5, 30, r)).toBe(0);
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx vitest run src/engine/survival`
Expected: FAIL, because the modules `./oxygen`, `./bodyTemp` and `./supplies` cannot be resolved.

- [ ] **Step 4: Implement**

`src/engine/survival/oxygen.ts`:

```ts
import { clamp } from '../core/math';

export interface OxygenRules {
  ceilingRefAltitudeM: number;
  ceilingMetresPerPoint: number;
  minCeiling: number;
  exertionDrainPerSec: number;
  recoverPerSec: number;
  dropToCeilingPerSec: number;
  bottleAltitudeBonusM: number;
}

/** Highest oxygen level the body settles at (M2a spec §4.1). */
export function oxygenCeiling(
  altitudeM: number,
  acclimatizationM: number,
  bottledActive: boolean,
  r: OxygenRules,
  max = 100,
): number {
  const effective = altitudeM - acclimatizationM - (bottledActive ? r.bottleAltitudeBonusM : 0);
  const ceiling = max - Math.max(0, effective - r.ceilingRefAltitudeM) / r.ceilingMetresPerPoint;
  return clamp(ceiling, r.minCeiling, max);
}

/** Exertion drains and pauses recovery; otherwise oxygen moves toward the ceiling. */
export function updateOxygen(
  value: number,
  ceiling: number,
  exerting: boolean,
  dt: number,
  r: OxygenRules,
): number {
  if (exerting) return Math.max(0, value - r.exertionDrainPerSec * dt);
  if (value < ceiling) return Math.min(ceiling, value + r.recoverPerSec * dt);
  return Math.max(ceiling, value - r.dropToCeilingPerSec * dt);
}
```

`src/engine/survival/bodyTemp.ts`:

```ts
import { clamp } from '../core/math';
import type { MoveState } from '../player/movementState';

export type Activity = 'idle' | 'walk' | 'exert';

export interface TemperatureRules {
  seaLevelAirC: number;
  lapseCPerKm: number;
  comfortC: number;
  windFactorPerMs: number;
  insulation: number;
  activityHeat: Readonly<Record<Activity, number>>;
  campShelterHeat: number;
  rateDivisor: number;
}

export interface BodyTempInputs {
  altitudeM: number;
  windMs: number;
  activity: Activity;
  atCamp: boolean;
}

/** Moving while running or climbing exerts; walking warms a little; everything else is idle. */
export function activityOf(state: MoveState, moving: boolean): Activity {
  if (!moving) return 'idle';
  if (state === 'run' || state === 'climb') return 'exert';
  return state === 'walk' ? 'walk' : 'idle';
}

export const airTempC = (altitudeM: number, r: TemperatureRules): number =>
  r.seaLevelAirC - (r.lapseCPerKm * altitudeM) / 1000;

export const coldExposure = (airC: number, windMs: number, r: TemperatureRules): number =>
  Math.max(0, r.comfortC - airC) * (1 + windMs * r.windFactorPerMs);

/** Body temperature change per second (M2a spec §4.2). */
export function bodyTempRate(i: BodyTempInputs, r: TemperatureRules): number {
  const heat = r.insulation + r.activityHeat[i.activity] + (i.atCamp ? r.campShelterHeat : 0);
  return (heat - coldExposure(airTempC(i.altitudeM, r), i.windMs, r)) / r.rateDivisor;
}

export function updateBodyTemp(
  value: number,
  i: BodyTempInputs,
  dt: number,
  r: TemperatureRules,
  max = 100,
): number {
  return clamp(value + bodyTempRate(i, r) * dt, 0, max);
}
```

`src/engine/survival/supplies.ts`:

```ts
export interface SuppliesRules {
  drainPerSec: number;
}

/** Supplies fall steadily over real time (M2a spec §4.3). */
export const updateSupplies = (value: number, dt: number, r: SuppliesRules): number =>
  Math.max(0, value - r.drainPerSec * dt);
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run src/engine/survival && npm run typecheck && npm run lint`
Expected: all PASS, with no type or lint errors.

- [ ] **Step 6: Commit**

```bash
npm run format
git add src/engine/config/game.config.ts src/engine/survival
git commit -m "feat(survival): oxygen, body temperature and supplies rules

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Inventory and the combined survival state

**Files:**
- Create: `src/engine/survival/inventory.ts`, `src/engine/survival/inventory.test.ts`
- Create: `src/engine/survival/survival.ts`, `src/engine/survival/survival.test.ts`

**Interfaces:**
- Consumes: Task 1 functions and `GAME_CONFIG.survival`.
- Produces from `inventory.ts`:
  - `interface Inventory { food: number; water: number; o2: number }`
  - `type ConsumeOutcome = 'food' | 'water' | 'full' | 'empty'`
  - `consumeNext(inv, supplies, r: ConsumeRules, max = 100): { inventory; supplies; outcome }`
  - `loseOnRespawn(inv, fraction): Inventory`
- Produces from `survival.ts`:
  - `type SurvivalRules = typeof GAME_CONFIG.survival`
  - `type DeathCause = 'collapse' | 'hypothermia'`
  - `type Warning`
  - `WARNING_TEXT: Record<Warning, string>`
  - `interface SurvivalState { oxygen; bodyTemp; supplies; acclimatizationM; inventory: Inventory; o2SecondsLeft }`
  - `interface SurvivalInputs { altitudeM; activity: Activity; atCamp; windMs }`
  - `interface SurvivalModifiers { staminaRecoveryMul; staminaCapLimit; climbSpeedMul }`
  - `initialSurvival(r, altitudeM)`
  - `stepSurvival(s, i, dt, r): { state; death: DeathCause | null }`
  - `survivalModifiers(s, r)`
  - `topWarning(s, r): Warning | null`
  - `startBottle(s, r): { state; result: 'started' | 'active' | 'empty' }`
  - `restAtCamp(s, altitudeM, r)`
  - `respawnSurvival(s, altitudeM, r)`

- [ ] **Step 1: Write the failing tests**

`src/engine/survival/inventory.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { GAME_CONFIG } from '../config/game.config';
import { consumeNext, loseOnRespawn } from './inventory';

const r = GAME_CONFIG.survival.supplies;
const pack = { food: 2, water: 1, o2: 2 };

describe('consumeNext', () => {
  it('eats food first, clamped to 100', () => {
    expect(consumeNext(pack, 60, r)).toEqual({
      inventory: { food: 1, water: 1, o2: 2 },
      supplies: 85,
      outcome: 'food',
    });
    expect(consumeNext(pack, 90, r).supplies).toBe(100);
  });

  it('drinks water when the food is gone', () => {
    expect(consumeNext({ food: 0, water: 1, o2: 0 }, 50, r)).toEqual({
      inventory: { food: 0, water: 0, o2: 0 },
      supplies: 65,
      outcome: 'water',
    });
  });

  it('consumes nothing when supplies are full or nothing is left', () => {
    expect(consumeNext(pack, 100, r)).toEqual({ inventory: pack, supplies: 100, outcome: 'full' });
    const empty = { food: 0, water: 0, o2: 3 };
    expect(consumeNext(empty, 40, r)).toEqual({ inventory: empty, supplies: 40, outcome: 'empty' });
  });
});

describe('loseOnRespawn', () => {
  it('removes floor(20%) of each stack', () => {
    expect(loseOnRespawn({ food: 10, water: 7, o2: 4 }, 0.2)).toEqual({ food: 8, water: 6, o2: 4 });
    expect(loseOnRespawn({ food: 5, water: 0, o2: 1 }, 0.2)).toEqual({ food: 4, water: 0, o2: 1 });
  });
});
```

`src/engine/survival/survival.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { GAME_CONFIG } from '../config/game.config';
import {
  initialSurvival,
  respawnSurvival,
  restAtCamp,
  startBottle,
  stepSurvival,
  survivalModifiers,
  topWarning,
  type SurvivalInputs,
  type SurvivalState,
} from './survival';

const r = GAME_CONFIG.survival;
const idleAt = (altitudeM: number, over: Partial<SurvivalInputs> = {}): SurvivalInputs => ({
  altitudeM,
  activity: 'idle',
  atCamp: false,
  windMs: 0,
  ...over,
});
const state = (over: Partial<SurvivalState> = {}): SurvivalState => ({
  ...initialSurvival(r, 5000),
  ...over,
});

describe('initialSurvival', () => {
  it('starts full, with the starting pack and oxygen at the ceiling', () => {
    expect(initialSurvival(r, 5000)).toEqual({
      oxygen: 50,
      bodyTemp: 100,
      supplies: 100,
      acclimatizationM: 0,
      inventory: { food: 4, water: 4, o2: 2 },
      o2SecondsLeft: 0,
    });
  });
});

describe('stepSurvival', () => {
  it('advances oxygen, body temperature, supplies and the bottle timer together', () => {
    const { state: s, death } = stepSurvival(
      state({ oxygen: 40, o2SecondsLeft: 5 }),
      idleAt(5000),
      3,
      r,
    );
    expect(s.oxygen).toBe(43);
    expect(s.bodyTemp).toBe(100);
    expect(s.supplies).toBeCloseTo(99.9, 9);
    expect(s.o2SecondsLeft).toBe(2);
    expect(death).toBeNull();
  });

  it('uses the bottled ceiling while a bottle is active', () => {
    const s = stepSurvival(state({ oxygen: 20, o2SecondsLeft: 600 }), idleAt(6476), 100, r).state;
    expect(s.oxygen).toBeCloseTo(63.1, 6);
  });

  it('reports collapse when oxygen reaches 0 and hypothermia when body temperature does', () => {
    expect(stepSurvival(state({ oxygen: 0.5 }), idleAt(5000, { activity: 'exert' }), 1, r).death).toBe(
      'collapse',
    );
    expect(stepSurvival(state({ bodyTemp: 1, oxygen: 20 }), idleAt(6476), 60, r).death).toBe(
      'hypothermia',
    );
  });
});

describe('survivalModifiers', () => {
  it('scales recovery by oxygen and halves it without supplies', () => {
    expect(survivalModifiers(state({ oxygen: 50 }), r)).toEqual({
      staminaRecoveryMul: 0.5,
      staminaCapLimit: 100,
      climbSpeedMul: 1,
    });
    expect(survivalModifiers(state({ oxygen: 50, supplies: 0 }), r)).toEqual({
      staminaRecoveryMul: 0.25,
      staminaCapLimit: 50,
      climbSpeedMul: 1,
    });
  });

  it('slows climbing below 30 body temperature', () => {
    expect(survivalModifiers(state({ bodyTemp: 29 }), r).climbSpeedMul).toBe(0.7);
    expect(survivalModifiers(state({ bodyTemp: 30 }), r).climbSpeedMul).toBe(1);
  });
});

describe('topWarning', () => {
  it('returns the most severe warning', () => {
    expect(topWarning(state(), r)).toBeNull();
    expect(topWarning(state({ supplies: 10 }), r)).toBe('suppliesLow');
    expect(topWarning(state({ supplies: 10, bodyTemp: 39 }), r)).toBe('cold');
    expect(topWarning(state({ bodyTemp: 39, oxygen: 24 }), r)).toBe('oxygenLow');
    expect(topWarning(state({ oxygen: 24, bodyTemp: 14 }), r)).toBe('hypothermia');
    expect(topWarning(state({ bodyTemp: 14, oxygen: 9 }), r)).toBe('oxygenCritical');
  });
});

describe('startBottle', () => {
  it('uses one bottle for 600 s, refuses while one is active or when none are left', () => {
    const started = startBottle(state(), r);
    expect(started.result).toBe('started');
    expect(started.state.inventory.o2).toBe(1);
    expect(started.state.o2SecondsLeft).toBe(600);
    expect(startBottle(started.state, r).result).toBe('active');
    const none = state({ inventory: { food: 1, water: 1, o2: 0 } });
    expect(startBottle(none, r)).toEqual({ state: none, result: 'empty' });
  });
});

describe('restAtCamp', () => {
  it('acclimatizes by 250 m (max 1000), warms fully, sets oxygen to the new ceiling and costs 10 supplies', () => {
    const s = restAtCamp(state({ bodyTemp: 40, oxygen: 10, supplies: 50 }), 5800, r);
    expect(s.acclimatizationM).toBe(250);
    expect(s.bodyTemp).toBe(100);
    expect(s.oxygen).toBe(36.25);
    expect(s.supplies).toBe(40);
    expect(restAtCamp(state({ acclimatizationM: 1000 }), 5800, r).acclimatizationM).toBe(1000);
    expect(restAtCamp(state({ supplies: 4 }), 5800, r).supplies).toBe(0);
  });
});

describe('respawnSurvival', () => {
  it('loses 20% of items, refills body temperature and oxygen, ends the bottle, keeps acclimatization', () => {
    const s = respawnSurvival(
      state({
        inventory: { food: 10, water: 5, o2: 1 },
        bodyTemp: 0,
        oxygen: 0,
        supplies: 12,
        o2SecondsLeft: 100,
        acclimatizationM: 500,
      }),
      5000,
      r,
    );
    expect(s.inventory).toEqual({ food: 8, water: 4, o2: 1 });
    expect(s.bodyTemp).toBe(100);
    expect(s.oxygen).toBe(62.5);
    expect(s.supplies).toBe(30);
    expect(s.o2SecondsLeft).toBe(0);
    expect(s.acclimatizationM).toBe(500);
  });

  it('keeps supplies above the respawn minimum', () => {
    expect(respawnSurvival(state({ supplies: 70 }), 5000, r).supplies).toBe(70);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/engine/survival/inventory.test.ts src/engine/survival/survival.test.ts`
Expected: FAIL, because the modules cannot be resolved.

- [ ] **Step 3: Implement**

`src/engine/survival/inventory.ts`:

```ts
export interface Inventory {
  food: number;
  water: number;
  o2: number;
}

export interface ConsumeRules {
  foodGain: number;
  waterGain: number;
}

export type ConsumeOutcome = 'food' | 'water' | 'full' | 'empty';

/** `F`: eat food first, then drink water, only when supplies have room (M2a spec §4.3). */
export function consumeNext(
  inv: Inventory,
  supplies: number,
  r: ConsumeRules,
  max = 100,
): { inventory: Inventory; supplies: number; outcome: ConsumeOutcome } {
  if (supplies >= max) return { inventory: inv, supplies, outcome: 'full' };
  if (inv.food > 0) {
    return {
      inventory: { ...inv, food: inv.food - 1 },
      supplies: Math.min(max, supplies + r.foodGain),
      outcome: 'food',
    };
  }
  if (inv.water > 0) {
    return {
      inventory: { ...inv, water: inv.water - 1 },
      supplies: Math.min(max, supplies + r.waterGain),
      outcome: 'water',
    };
  }
  return { inventory: inv, supplies, outcome: 'empty' };
}

/** Each stack loses floor(count × fraction) on respawn (spec §5.5). */
export function loseOnRespawn(inv: Inventory, fraction: number): Inventory {
  const keep = (n: number) => n - Math.floor(n * fraction);
  return { food: keep(inv.food), water: keep(inv.water), o2: keep(inv.o2) };
}
```

`src/engine/survival/survival.ts`:

```ts
import type { GAME_CONFIG } from '../config/game.config';
import { updateBodyTemp, type Activity } from './bodyTemp';
import { loseOnRespawn, type Inventory } from './inventory';
import { oxygenCeiling, updateOxygen } from './oxygen';
import { updateSupplies } from './supplies';

export type SurvivalRules = typeof GAME_CONFIG.survival;
export type DeathCause = 'collapse' | 'hypothermia';
export type Warning = 'oxygenCritical' | 'hypothermia' | 'oxygenLow' | 'cold' | 'suppliesLow';

export const WARNING_TEXT: Record<Warning, string> = {
  oxygenCritical: 'Oxygen critical',
  hypothermia: 'Hypothermia — get to camp',
  oxygenLow: 'Low oxygen — stop and breathe',
  cold: 'You are getting cold',
  suppliesLow: 'Low supplies — eat or drink (F)',
};

export interface SurvivalState {
  oxygen: number;
  bodyTemp: number;
  supplies: number;
  acclimatizationM: number;
  inventory: Inventory;
  /** Seconds of bottled oxygen left; 0 when no bottle is active. */
  o2SecondsLeft: number;
}

export interface SurvivalInputs {
  altitudeM: number;
  activity: Activity;
  atCamp: boolean;
  windMs: number;
}

/** What survival does to the player's stamina and climbing (M2a spec §4.2, §4.4). */
export interface SurvivalModifiers {
  staminaRecoveryMul: number;
  staminaCapLimit: number;
  climbSpeedMul: number;
}

const ceilingAt = (s: SurvivalState, altitudeM: number, r: SurvivalRules): number =>
  oxygenCeiling(altitudeM, s.acclimatizationM, s.o2SecondsLeft > 0, r.oxygen, r.max);

export function initialSurvival(r: SurvivalRules, altitudeM: number): SurvivalState {
  const s: SurvivalState = {
    oxygen: r.max,
    bodyTemp: r.max,
    supplies: r.max,
    acclimatizationM: 0,
    inventory: { ...r.startingPack },
    o2SecondsLeft: 0,
  };
  return { ...s, oxygen: ceilingAt(s, altitudeM, r) };
}

export function stepSurvival(
  s: SurvivalState,
  i: SurvivalInputs,
  dt: number,
  r: SurvivalRules,
): { state: SurvivalState; death: DeathCause | null } {
  const ceiling = ceilingAt(s, i.altitudeM, r);
  const state: SurvivalState = {
    ...s,
    oxygen: updateOxygen(s.oxygen, ceiling, i.activity === 'exert', dt, r.oxygen),
    bodyTemp: updateBodyTemp(s.bodyTemp, i, dt, r.temperature, r.max),
    supplies: updateSupplies(s.supplies, dt, r.supplies),
    o2SecondsLeft: Math.max(0, s.o2SecondsLeft - dt),
  };
  const death: DeathCause | null =
    state.oxygen <= 0 ? 'collapse' : state.bodyTemp <= 0 ? 'hypothermia' : null;
  return { state, death };
}

export function survivalModifiers(s: SurvivalState, r: SurvivalRules): SurvivalModifiers {
  const fed = s.supplies > 0;
  return {
    staminaRecoveryMul: (s.oxygen / r.max) * (fed ? 1 : r.supplies.emptyRecoveryMul),
    staminaCapLimit: fed ? r.max : r.supplies.emptyStaminaCap,
    climbSpeedMul:
      s.bodyTemp < r.temperature.slowClimbBelow ? r.temperature.coldClimbSpeedMul : 1,
  };
}

/** Most severe active warning (M2a spec §5). */
export function topWarning(s: SurvivalState, r: SurvivalRules): Warning | null {
  if (s.oxygen < r.oxygen.warnCritical) return 'oxygenCritical';
  if (s.bodyTemp < r.temperature.warnHypothermia) return 'hypothermia';
  if (s.oxygen < r.oxygen.warnLow) return 'oxygenLow';
  if (s.bodyTemp < r.temperature.warnCold) return 'cold';
  if (s.supplies < r.supplies.warnLow) return 'suppliesLow';
  return null;
}

export function startBottle(
  s: SurvivalState,
  r: SurvivalRules,
): { state: SurvivalState; result: 'started' | 'active' | 'empty' } {
  if (s.o2SecondsLeft > 0) return { state: s, result: 'active' };
  if (s.inventory.o2 <= 0) return { state: s, result: 'empty' };
  return {
    state: {
      ...s,
      inventory: { ...s.inventory, o2: s.inventory.o2 - 1 },
      o2SecondsLeft: r.oxygen.bottleSeconds,
    },
    result: 'started',
  };
}

/** Effects of a completed rest at a camp (M2a spec §4.5). Stamina is restored by Player. */
export function restAtCamp(s: SurvivalState, altitudeM: number, r: SurvivalRules): SurvivalState {
  const rested: SurvivalState = {
    ...s,
    acclimatizationM: Math.min(
      r.acclimatization.maxM,
      s.acclimatizationM + r.acclimatization.perRestM,
    ),
    bodyTemp: r.max,
    supplies: Math.max(0, s.supplies - r.supplies.restCost),
  };
  return { ...rested, oxygen: ceilingAt(rested, altitudeM, r) };
}

/** State after a respawn at a camp (M2a spec §4.6). */
export function respawnSurvival(
  s: SurvivalState,
  altitudeM: number,
  r: SurvivalRules,
): SurvivalState {
  const base: SurvivalState = {
    ...s,
    inventory: loseOnRespawn(s.inventory, r.respawnItemLossFraction),
    bodyTemp: r.max,
    supplies: Math.max(s.supplies, r.supplies.respawnMin),
    o2SecondsLeft: 0,
  };
  return { ...base, oxygen: ceilingAt(base, altitudeM, r) };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/engine/survival && npm run typecheck && npm run lint`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
npm run format
git add src/engine/survival
git commit -m "feat(survival): inventory and combined survival state

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Stamina modifiers and Player hooks

**Files:**
- Modify: `src/engine/player/stamina.ts`, `src/engine/player/stamina.test.ts`
- Modify: `src/engine/player/Player.ts`, `src/engine/player/Player.test.ts`

**Interfaces:**
- Consumes: `SurvivalModifiers` (type) from `src/engine/survival/survival.ts`.
- Produces from `stamina.ts`:
  - `interface StaminaModifiers { recoveryMul: number; capLimit: number }`
  - `updateStamina(s, state, moving, dt, r, mods?: StaminaModifiers)`
- Produces from `Player`:
  - `setSurvivalModifiers(m: SurvivalModifiers): void`
  - `restoreStamina(): void`
  - `snapshot.stamina.cap` is now the effective cap, `min(injury cap, staminaCapLimit)`.

- [ ] **Step 1: Write the failing tests**

Append to `src/engine/player/stamina.test.ts`, inside `describe('stamina', ...)`:

```ts
  it('scales recovery, but not drain, and clamps to the cap limit', () => {
    const half = { recoveryMul: 0.5, capLimit: 100 };
    expect(updateStamina({ value: 50, cap: 100 }, 'walk', false, 1, r, half).value).toBe(53);
    expect(updateStamina(fullStamina(r), 'run', true, 1, r, half).value).toBe(92);
    const capped = updateStamina({ value: 80, cap: 100 }, 'walk', false, 1, r, {
      recoveryMul: 1,
      capLimit: 50,
    });
    expect(capped).toEqual({ value: 50, cap: 100 });
  });
```

Append to `src/engine/player/Player.test.ts`, inside `describe('Player', ...)`:

```ts
  it('scales stamina recovery and caps stamina by the survival modifiers', async () => {
    const { player, run } = await setup({ x: 0, y: 100.05, z: 0 });
    run({}, 10);
    run({ forward: 1, run: true }, 60);
    const before = player.snapshot.stamina.value;
    player.setSurvivalModifiers({ staminaRecoveryMul: 0.5, staminaCapLimit: 100, climbSpeedMul: 1 });
    run({}, 60);
    expect(player.snapshot.stamina.value).toBeCloseTo(before + 3, 1);
    player.setSurvivalModifiers({ staminaRecoveryMul: 1, staminaCapLimit: 50, climbSpeedMul: 1 });
    run({}, 1);
    expect(player.snapshot.stamina).toEqual({ value: 50, cap: 50 });
  });

  it('climbs slower when the survival modifiers say it is cold', async () => {
    async function climbedMetres(climbSpeedMul: number): Promise<number> {
      const { player, run } = await setup({ x: 0, y: 100.05, z: -9 });
      player.setSurvivalModifiers({ staminaRecoveryMul: 1, staminaCapLimit: 100, climbSpeedMul });
      run({}, 10);
      run({ grab: true }, 1);
      const y0 = player.snapshot.feet.y;
      run({ forward: 1 }, 120);
      expect(player.snapshot.state).toBe('climb');
      const dy = player.snapshot.feet.y - y0;
      physics?.dispose();
      physics = null;
      return dy;
    }
    const warm = await climbedMetres(1);
    const cold = await climbedMetres(0.7);
    expect(cold / warm).toBeCloseTo(0.7, 1);
  });

  it('restoreStamina refills stamina and clears an injury', async () => {
    const { player, run } = await setup({ x: 0, y: 108.05, z: -14 });
    run({}, 10);
    run({ forward: -1 }, 240);
    expect(player.snapshot.stamina.cap).toBe(70);
    player.restoreStamina();
    expect(player.snapshot.stamina).toEqual({ value: 100, cap: 100 });
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/engine/player`
Expected: FAIL. TypeScript or runtime errors appear because `setSurvivalModifiers` and `restoreStamina` do not exist, and the new stamina assertions fail.

- [ ] **Step 3: Implement `stamina.ts`**

Replace `updateStamina` in `src/engine/player/stamina.ts` with:

```ts
/** Survival effects on stamina (M2a spec §4.4). */
export interface StaminaModifiers {
  recoveryMul: number;
  capLimit: number;
}

const NO_MODIFIERS: StaminaModifiers = { recoveryMul: 1, capLimit: Infinity };

export function updateStamina(
  s: StaminaState,
  state: MoveState,
  moving: boolean,
  dt: number,
  r: StaminaRules,
  mods: StaminaModifiers = NO_MODIFIERS,
): StaminaState {
  const rate = staminaRate(state, moving, r);
  const scaled = rate > 0 ? rate * mods.recoveryMul : rate;
  return { value: clamp(s.value + scaled * dt, 0, Math.min(s.cap, mods.capLimit)), cap: s.cap };
}
```

- [ ] **Step 4: Implement `Player.ts`**

Add an import:

```ts
import type { SurvivalModifiers } from '../survival/survival';
```

After the `UNCONTROLLED` constant, add:

```ts
const NEUTRAL_SURVIVAL: SurvivalModifiers = {
  staminaRecoveryMul: 1,
  staminaCapLimit: cfg.stamina.max,
  climbSpeedMul: 1,
};
```

Add a field next to `private stamina`:

```ts
  private survival: SurvivalModifiers = NEUTRAL_SURVIVAL;
```

In `get snapshot()`, replace `stamina: this.stamina,` with:

```ts
      stamina: {
        value: this.stamina.value,
        cap: Math.min(this.stamina.cap, this.survival.staminaCapLimit),
      },
```

In `step()`, replace the `updateStamina` line with:

```ts
    this.stamina = updateStamina(this.stamina, next, this.moving, dt, cfg.stamina, {
      recoveryMul: this.survival.staminaRecoveryMul,
      capLimit: this.survival.staminaCapLimit,
    });
```

Add public methods after `teleport()`:

```ts
  /** Survival effects, refreshed by Game every step. */
  setSurvivalModifiers(m: SurvivalModifiers): void {
    this.survival = m;
  }

  /** Full stamina with the injury cleared (camp rest). */
  restoreStamina(): void {
    this.stamina = fullStamina(cfg.stamina);
  }
```

In `climbTranslation`, replace `cfg.movement.climbSpeed * dt` with `cfg.movement.climbSpeed * this.survival.climbSpeedMul * dt`.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run src/engine/player && npm run typecheck && npm run lint`
Expected: all PASS. If the cold-climb ratio misses `toBeCloseTo(0.7, 1)` because of the wall-distance correction, check that both runs use the same steps. Do not loosen the assertion beyond ±0.05.

- [ ] **Step 6: Commit**

```bash
npm run format
git add src/engine/player
git commit -m "feat(player): survival modifiers for stamina recovery, cap and climb speed

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Camp helper, SurvivalSystem and key bindings

**Files:**
- Create: `src/engine/systems/camps.ts`, `src/engine/systems/camps.test.ts`
- Modify: `src/engine/systems/CheckpointSystem.ts`
- Modify: `src/engine/config/controls.config.ts`
- Create: `src/engine/survival/SurvivalSystem.ts`, `src/engine/survival/SurvivalSystem.test.ts`

**Interfaces:**
- Consumes: everything from Task 2, plus `activityOf` from Task 1.
- Produces from `camps.ts`:
  - `interface CampZone { radiusM; maxHeightDiffM }`
  - `isNearCamp(feet: Vec3, camp: CampDef, zone: CampZone): boolean`
  - `campAt(feet, camps, zone): CampDef | null`
- Produces from `controls.config.ts`: actions `eat` (`KeyF`), `oxygen` (`KeyO`) and `rest` (`KeyR`).
- Produces from `SurvivalSystem.ts`:
  - `interface SurvivalActions { eat; oxygen; rest }`
  - `interface SurvivalFrame { altitudeM; state: MoveState; moving; grounded; atCamp; windMs; actions }`
  - `interface SurvivalOutput { death: DeathCause | null; toast: string | null; restFinished: boolean }`
  - `class SurvivalSystem`, with:
    - `constructor(r: SurvivalRules, startAltitudeM: number)`
    - getters `state`, `resting`, `respawns`, `modifiers` and `warning`
    - `step(frame, dt): SurvivalOutput`
    - `respawn(campAltitudeM): void`

- [ ] **Step 1: Write the failing tests**

`src/engine/systems/camps.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { CampDef } from '../world/terrainData';
import { campAt, isNearCamp } from './camps';

const camps: CampDef[] = [
  { id: 'khare', name: 'Khare', position: [0, 5000, 800] },
  { id: 'high-camp', name: 'High Camp', position: [0, 5248, 0] },
];
const zone = { radiusM: 15, maxHeightDiffM: 10 };

describe('camps', () => {
  it('is near a camp within the radius and the height window', () => {
    expect(isNearCamp({ x: 10, y: 5250, z: 5 }, camps[1]!, zone)).toBe(true);
    expect(isNearCamp({ x: 20, y: 5248, z: 0 }, camps[1]!, zone)).toBe(false);
    expect(isNearCamp({ x: 0, y: 5270, z: 0 }, camps[1]!, zone)).toBe(false);
  });

  it('finds the camp the feet are at, or null', () => {
    expect(campAt({ x: 3, y: 5001, z: 797 }, camps, zone)?.id).toBe('khare');
    expect(campAt({ x: 0, y: 5100, z: 400 }, camps, zone)).toBeNull();
  });
});
```

`src/engine/survival/SurvivalSystem.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { GAME_CONFIG } from '../config/game.config';
import { SurvivalSystem, type SurvivalActions, type SurvivalFrame } from './SurvivalSystem';

const r = GAME_CONFIG.survival;
const DT = 1 / 60;
const NONE: SurvivalActions = { eat: false, oxygen: false, rest: false };
const frame = (over: Partial<SurvivalFrame> = {}): SurvivalFrame => ({
  altitudeM: 5000,
  state: 'walk',
  moving: false,
  grounded: true,
  atCamp: false,
  windMs: 0,
  actions: NONE,
  ...over,
});
const press = (action: keyof SurvivalActions, over: Partial<SurvivalFrame> = {}) =>
  frame({ ...over, actions: { ...NONE, [action]: true } });

describe('SurvivalSystem', () => {
  it('starts with the starting pack and oxygen at the ceiling', () => {
    const sys = new SurvivalSystem(r, 5000);
    expect(sys.state.inventory).toEqual({ food: 4, water: 4, o2: 2 });
    expect(sys.state.oxygen).toBe(50);
    expect(sys.resting).toBe(false);
    expect(sys.respawns).toBe(0);
    expect(sys.modifiers.staminaRecoveryMul).toBe(0.5);
  });

  it('F eats when supplies have room and says why when it cannot', () => {
    const sys = new SurvivalSystem(r, 5000);
    expect(sys.step(press('eat'), DT).toast).toBe('Supplies are already full');
    sys.step(frame(), 600);
    const out = sys.step(press('eat'), DT);
    expect(out.toast).toBe('Ate a food ration (+25 supplies)');
    expect(sys.state.inventory.food).toBe(3);
    expect(sys.state.supplies).toBeCloseTo(100, 2);
  });

  it('F drinks water when the food is gone, then reports an empty pack', () => {
    const sys = new SurvivalSystem(r, 5000);
    sys.step(frame(), 3000);
    for (let i = 0; i < 4; i++) {
      sys.step(frame(), 3000);
      sys.step(press('eat'), DT);
    }
    sys.step(frame(), 3000);
    expect(sys.step(press('eat'), DT).toast).toBe('Drank water (+15 supplies)');
    for (let i = 0; i < 3; i++) {
      sys.step(frame(), 3000);
      sys.step(press('eat'), DT);
    }
    sys.step(frame(), 3000);
    expect(sys.step(press('eat'), DT).toast).toBe('No food or water left');
  });

  it('O starts one bottle at a time until none are left', () => {
    const sys = new SurvivalSystem(r, 6476);
    const at = { altitudeM: 6476 };
    expect(sys.step(press('oxygen', at), DT).toast).toBe('Bottled oxygen on — 10 min');
    expect(sys.state.inventory.o2).toBe(1);
    expect(sys.step(press('oxygen', at), DT).toast).toBe('Bottled oxygen is already flowing');
    sys.step(frame(at), 60);
    expect(sys.state.oxygen).toBeCloseTo(63.1, 6);
    sys.step(frame(at), 600);
    expect(sys.state.o2SecondsLeft).toBe(0);
    sys.step(press('oxygen', at), DT);
    sys.step(frame(at), 700);
    expect(sys.step(press('oxygen', at), DT).toast).toBe('No oxygen bottles left');
  });

  it('R rests only on the ground at a camp', () => {
    const sys = new SurvivalSystem(r, 5800);
    const at = { altitudeM: 5800 };
    expect(sys.step(press('rest', at), DT).toast).toBe('You can only rest at a camp');
    expect(
      sys.step(press('rest', { ...at, atCamp: true, state: 'climb', grounded: false }), DT).toast,
    ).toBe('Stand on the ground to rest');
    expect(sys.resting).toBe(false);
  });

  it('a 3 s rest pauses survival, then restores and acclimatizes', () => {
    const sys = new SurvivalSystem(r, 5800);
    const at = { altitudeM: 5800, atCamp: true };
    expect(sys.step(press('rest', at), DT).toast).toBe('Resting…');
    expect(sys.resting).toBe(true);
    let finishedAt = -1;
    let toast: string | null = null;
    for (let i = 0; i < 200 && finishedAt < 0; i++) {
      const out = sys.step(press('eat', at), DT);
      if (out.restFinished) {
        finishedAt = i;
        toast = out.toast;
      }
    }
    expect(finishedAt).toBeGreaterThanOrEqual(178);
    expect(toast).toBe('Rested — acclimatized to +250 m');
    expect(sys.state.inventory.food).toBe(4);
    expect(sys.state.acclimatizationM).toBe(250);
    expect(sys.state.oxygen).toBe(36.25);
    expect(sys.state.supplies).toBeCloseTo(90, 1);
    expect(sys.resting).toBe(false);
  });

  it('reports a collapse when climbing drains oxygen at High Camp', () => {
    const sys = new SurvivalSystem(r, 5800);
    let death = null;
    for (let i = 0; i < 40 * 60 && !death; i++) {
      death = sys.step(frame({ altitudeM: 5800, state: 'climb', moving: true }), DT).death;
    }
    expect(death).toBe('collapse');
  });

  it('reports hypothermia when standing still near the summit for long enough', () => {
    const sys = new SurvivalSystem(r, 6476);
    expect(sys.step(frame({ altitudeM: 6476 }), 2000).death).toBe('hypothermia');
  });

  it('respawn refills, keeps supplies above the minimum and counts', () => {
    const sys = new SurvivalSystem(r, 5000);
    sys.step(frame(), 3000);
    sys.respawn(5000);
    expect(sys.state.supplies).toBe(30);
    expect(sys.state.bodyTemp).toBe(100);
    expect(sys.state.oxygen).toBe(50);
    expect(sys.respawns).toBe(1);
  });
});
```

The rest test presses `F` on every step during the rest to prove that actions are ignored while resting: `food` stays 4.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/engine/systems/camps.test.ts src/engine/survival/SurvivalSystem.test.ts`
Expected: FAIL, because the modules cannot be resolved.

- [ ] **Step 3: Implement `camps.ts` and use it in `CheckpointSystem`**

`src/engine/systems/camps.ts`:

```ts
import type { Vec3 } from '../core/math';
import type { CampDef } from '../world/terrainData';

export interface CampZone {
  radiusM: number;
  maxHeightDiffM: number;
}

/** Within the camp's radius horizontally and its height window vertically. */
export function isNearCamp(feet: Vec3, camp: CampDef, zone: CampZone): boolean {
  const [x, y, z] = camp.position;
  return (
    Math.hypot(feet.x - x, feet.z - z) <= zone.radiusM &&
    Math.abs(feet.y - y) <= zone.maxHeightDiffM
  );
}

export function campAt(feet: Vec3, camps: readonly CampDef[], zone: CampZone): CampDef | null {
  return camps.find((camp) => isNearCamp(feet, camp, zone)) ?? null;
}
```

In `src/engine/systems/CheckpointSystem.ts`, add `import { isNearCamp } from './camps';`. Then replace the body of the `forEach` callback in `update` with:

```ts
      if (this.reached.has(camp.id)) return;
      const zone = { radiusM: this.radiusM, maxHeightDiffM: this.maxHeightDiffM };
      if (!isNearCamp(feet, camp, zone)) return;
      this.reached.add(camp.id);
      this.lastIndex = index;
      this.events.emit('checkpoint:reached', { id: camp.id, name: camp.name });
```

- [ ] **Step 4: Add the key bindings**

In `src/engine/config/controls.config.ts`, add after `grab: ['KeyE'],`:

```ts
  eat: ['KeyF'],
  oxygen: ['KeyO'],
  rest: ['KeyR'],
```

- [ ] **Step 5: Implement `SurvivalSystem.ts`**

```ts
import type { MoveState } from '../player/movementState';
import { activityOf } from './bodyTemp';
import { consumeNext } from './inventory';
import {
  initialSurvival,
  respawnSurvival,
  restAtCamp,
  startBottle,
  stepSurvival,
  survivalModifiers,
  topWarning,
  type DeathCause,
  type SurvivalModifiers,
  type SurvivalRules,
  type SurvivalState,
  type Warning,
} from './survival';

export interface SurvivalActions {
  eat: boolean;
  oxygen: boolean;
  rest: boolean;
}

export interface SurvivalFrame {
  altitudeM: number;
  state: MoveState;
  moving: boolean;
  grounded: boolean;
  atCamp: boolean;
  windMs: number;
  actions: SurvivalActions;
}

export interface SurvivalOutput {
  death: DeathCause | null;
  toast: string | null;
  restFinished: boolean;
}

/** Owns the survival state; turns key actions into state changes and toasts. */
export class SurvivalSystem {
  private s: SurvivalState;
  private restLeftSec = 0;
  private respawnCount = 0;

  constructor(
    private readonly r: SurvivalRules,
    startAltitudeM: number,
  ) {
    this.s = initialSurvival(r, startAltitudeM);
  }

  get state(): SurvivalState {
    return this.s;
  }

  get resting(): boolean {
    return this.restLeftSec > 0;
  }

  get respawns(): number {
    return this.respawnCount;
  }

  get modifiers(): SurvivalModifiers {
    return survivalModifiers(this.s, this.r);
  }

  get warning(): Warning | null {
    return topWarning(this.s, this.r);
  }

  /** One fixed step. Survival does not tick and actions are ignored while resting. */
  step(f: SurvivalFrame, dt: number): SurvivalOutput {
    if (this.resting) return this.continueRest(f.altitudeM, dt);
    let toast: string | null = null;
    if (f.actions.rest) {
      if (f.atCamp && f.grounded && f.state !== 'climb') {
        this.restLeftSec = this.r.restSeconds;
        return { death: null, toast: 'Resting…', restFinished: false };
      }
      toast = f.atCamp ? 'Stand on the ground to rest' : 'You can only rest at a camp';
    }
    if (f.actions.eat) toast = this.eat();
    if (f.actions.oxygen) toast = this.useOxygen();
    const { state, death } = stepSurvival(
      this.s,
      {
        altitudeM: f.altitudeM,
        activity: activityOf(f.state, f.moving),
        atCamp: f.atCamp,
        windMs: f.windMs,
      },
      dt,
      this.r,
    );
    this.s = state;
    return { death, toast, restFinished: false };
  }

  respawn(campAltitudeM: number): void {
    this.s = respawnSurvival(this.s, campAltitudeM, this.r);
    this.restLeftSec = 0;
    this.respawnCount++;
  }

  private continueRest(altitudeM: number, dt: number): SurvivalOutput {
    this.restLeftSec = Math.max(0, this.restLeftSec - dt);
    if (this.restLeftSec > 0) return { death: null, toast: null, restFinished: false };
    this.s = restAtCamp(this.s, altitudeM, this.r);
    return {
      death: null,
      toast: `Rested — acclimatized to +${this.s.acclimatizationM} m`,
      restFinished: true,
    };
  }

  private eat(): string {
    const c = consumeNext(this.s.inventory, this.s.supplies, this.r.supplies, this.r.max);
    this.s = { ...this.s, inventory: c.inventory, supplies: c.supplies };
    switch (c.outcome) {
      case 'food':
        return `Ate a food ration (+${this.r.supplies.foodGain} supplies)`;
      case 'water':
        return `Drank water (+${this.r.supplies.waterGain} supplies)`;
      case 'full':
        return 'Supplies are already full';
      case 'empty':
        return 'No food or water left';
    }
  }

  private useOxygen(): string {
    const { state, result } = startBottle(this.s, this.r);
    this.s = state;
    switch (result) {
      case 'started':
        return `Bottled oxygen on — ${this.r.oxygen.bottleSeconds / 60} min`;
      case 'active':
        return 'Bottled oxygen is already flowing';
      case 'empty':
        return 'No oxygen bottles left';
    }
  }
}
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npx vitest run src/engine && npm run typecheck && npm run lint`
Expected: all PASS, and the existing `CheckpointSystem.test.ts` still passes unchanged.

- [ ] **Step 7: Commit**

```bash
npm run format
git add src/engine/systems src/engine/survival src/engine/config/controls.config.ts
git commit -m "feat(survival): SurvivalSystem with eat, bottled oxygen and camp rest

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Wire survival into Game, respawn causes and HUD state

**Files:**
- Modify: `src/engine/core/events.ts`
- Modify: `src/engine/core/hud.ts`
- Modify: `src/engine/core/Game.ts`

**Interfaces:**
- Consumes: `SurvivalSystem` (Task 4), `campAt` (Task 4), `WARNING_TEXT` and `DeathCause` (Task 2), and `Player.setSurvivalModifiers` / `restoreStamina` (Task 3).
- Produces in `events.ts`: `type RespawnCause = 'fall' | DeathCause`. `'player:respawned'` gains `cause: RespawnCause`.
- Produces in `HudState`:
  - `oxygen: number`, `bodyTemp: number` and `supplies: number` (rounded)
  - `items: Inventory`
  - `o2SecondsLeft: number | null` (ceil seconds, or null)
  - `warning: string | null`
  - `resting: boolean`
  - `prompt` shows `'R — Rest'` at a camp

`Game` has no unit test, because it needs WebGL. This task is verified by typecheck, the full unit suite, build and e2e. Task 6 extends the e2e test to read the new fields.

- [ ] **Step 1: Events**

Replace `src/engine/core/events.ts` with:

```ts
import type { FallOutcome } from '../player/fallDamage';
import type { DeathCause } from '../survival/survival';

export type RespawnCause = 'fall' | DeathCause;

export type GameEvents = {
  'checkpoint:reached': { id: string; name: string };
  'player:fell': { dropM: number; outcome: FallOutcome };
  'player:respawned': { checkpointId: string; checkpointName: string; cause: RespawnCause };
};
```

- [ ] **Step 2: HUD state**

In `src/engine/core/hud.ts`, add `import type { Inventory } from '../survival/inventory';`. Add these fields to `HudState`, after `staminaCap`:

```ts
  oxygen: number;
  bodyTemp: number;
  supplies: number;
  items: Inventory;
  /** Whole seconds of bottled oxygen left, or null when no bottle is active. */
  o2SecondsLeft: number | null;
  /** Most severe survival warning, already worded for the player. */
  warning: string | null;
  /** True during the camp-rest fade. */
  resting: boolean;
```

Add these values to `initialHudState`, after `staminaCap: 100,`:

```ts
  oxygen: 100,
  bodyTemp: 100,
  supplies: 100,
  items: { food: 0, water: 0, o2: 0 },
  o2SecondsLeft: null,
  warning: null,
  resting: false,
```

- [ ] **Step 3: Game**

In `src/engine/core/Game.ts`:

1. Add imports:

```ts
import { SurvivalSystem, type SurvivalActions } from '../survival/SurvivalSystem';
import { WARNING_TEXT } from '../survival/survival';
import { campAt } from '../systems/camps';
```

Change the events import to `import type { GameEvents, RespawnCause } from './events';`.

2. Add a module-level constant after the imports:

```ts
const RESPAWN_TOAST: Record<RespawnCause, string> = {
  fall: 'You fell.',
  collapse: 'You collapsed from lack of oxygen.',
  hypothermia: 'Hypothermia.',
};
```

3. Add `survival: SurvivalSystem;` to `interface World`.
4. Replace `private pendingRespawn = false;` with `private pendingRespawn: RespawnCause | null = null;`.
5. In `init()`, add `survival: new SurvivalSystem(cfg.survival, player.snapshot.feet.y),` to the `this.w = {...}` object.
6. In `wireEvents()`:
   - Change the fell handler to `if (outcome === 'fatal') this.pendingRespawn ??= 'fall';`.
   - Change the respawned handler to:

```ts
      this.events.on('player:respawned', ({ checkpointName, cause }) =>
        this.showToast(`${RESPAWN_TOAST[cause]} Back at ${checkpointName}.`),
      ),
```

7. Replace `step()` with:

```ts
  private step(dt: number): void {
    const w = this.w;
    if (!w || this.respawning) return;
    const actions: SurvivalActions = {
      eat: this.input.consumePressed('eat'),
      oxygen: this.input.consumePressed('oxygen'),
      rest: this.input.consumePressed('rest'),
    };
    if (w.survival.resting) {
      // The player stands still during the rest fade; drop any keys pressed meanwhile.
      this.input.reset();
      this.stepSurvival(w, actions, dt);
      return;
    }
    const axis = this.input.axis();
    const move: MoveInput = {
      forward: axis.forward,
      right: axis.right,
      run: this.input.isDown('run'),
      grab: this.input.consumePressed('grab'),
      jump: this.input.consumePressed('jump'),
    };
    if (this.input.consumePressed('cameraDistance')) w.cameraCtrl.cycleDistance();
    if (this.input.consumePressed('toggleRoute')) w.guide.toggleRibbon();
    w.player.step(move, w.cameraCtrl.yaw, dt);
    w.physics.step(dt);
    w.player.afterPhysics();
    this.stepSurvival(w, actions, dt);
    const feet = w.player.snapshot.feet;
    // Beyond the outer tiles there is no collider: treat it like a fatal fall.
    if (isOutOfWorld(feet, w.manifest, cfg.terrain.outOfWorldDropM)) this.pendingRespawn ??= 'fall';
    else w.checkpoints.update(feet);
    if (this.pendingRespawn) {
      const cause = this.pendingRespawn;
      this.pendingRespawn = null;
      void this.respawn(cause);
    }
  }

  private stepSurvival(w: World, actions: SurvivalActions, dt: number): void {
    const s = w.player.snapshot;
    const out = w.survival.step(
      {
        altitudeM: s.feet.y,
        state: s.state,
        moving: s.moving,
        grounded: s.grounded,
        atCamp: campAt(s.feet, w.manifest.camps, cfg.checkpoints) !== null,
        windMs: 0, // calm until the weather system (M2c)
        actions,
      },
      dt,
    );
    w.player.setSurvivalModifiers(w.survival.modifiers);
    if (out.restFinished) w.player.restoreStamina();
    if (out.toast) this.showToast(out.toast);
    if (out.death) this.pendingRespawn ??= out.death;
  }
```

8. In `render()`, so the character does not walk in place during the rest fade, change the `w.visual.update(...)` call's fourth argument from `snap.moving` to `snap.moving && !w.survival.resting`.
9. Change `private async respawn(): Promise<void>` to `private async respawn(cause: RespawnCause): Promise<void>`. In its second `try` block, replace the body with:

```ts
      const spawn = this.spawnPoint(w.sampler, camp);
      w.player.teleport(spawn);
      w.survival.respawn(spawn.y);
      w.player.setSurvivalModifiers(w.survival.modifiers);
      w.cameraCtrl.snap();
      this.setActiveRoute(camp.id);
      this.events.emit('player:respawned', {
        checkpointId: camp.id,
        checkpointName: camp.name,
        cause,
      });
```

10. In `publishHud()`, after `const s = w.player.snapshot;`, add:

```ts
    const sv = w.survival.state;
    const warning = w.survival.warning;
    const canRest =
      !w.survival.resting &&
      s.grounded &&
      s.state !== 'climb' &&
      campAt(s.feet, w.manifest.camps, cfg.checkpoints) !== null;
```

In the `this.o.publish({...})` call, replace `prompt: s.prompt,` with:

```ts
      prompt: s.prompt ?? (canRest ? 'R — Rest' : null),
      oxygen: Math.round(sv.oxygen),
      bodyTemp: Math.round(sv.bodyTemp),
      supplies: Math.round(sv.supplies),
      items: { ...sv.inventory },
      o2SecondsLeft: sv.o2SecondsLeft > 0 ? Math.ceil(sv.o2SecondsLeft) : null,
      warning: warning ? WARNING_TEXT[warning] : null,
      resting: w.survival.resting,
```

- [ ] **Step 4: Verify**

Run: `npm run typecheck && npm run lint && npm test && npm run build && npm run e2e`
Expected: all PASS. The existing e2e still passes because the HUD markup has not changed yet.

- [ ] **Step 5: Commit**

```bash
npm run format
git add src/engine/core
git commit -m "feat(game): run survival each step, respawn causes and survival HUD state

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: HUD, control hints, e2e and docs

**Files:**
- Create: `src/ui/formatMinSec.ts`, `src/ui/formatMinSec.test.ts`
- Modify: `src/ui/controlHints.ts`, `src/ui/controlHints.test.ts`
- Modify: `src/ui/Hud.tsx`, `src/app/app.css`
- Modify: `e2e/smoke.spec.ts`
- Modify: `README.md` (controls table), `CLAUDE.md` (architecture), `docs/playtest/m1-checklist.md`, and `docs/superpowers/specs/2026-11-06-m2a-survival-design.md` (deviations)

**Interfaces:**
- Consumes: the `HudState` fields from Task 5, `GAME_CONFIG.survival` warning thresholds, and the `eat`, `oxygen` and `rest` actions.
- Produces: `formatMinSec(seconds: number): string`.

- [ ] **Step 1: Write the failing tests**

`src/ui/formatMinSec.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { formatMinSec } from './formatMinSec';

describe('formatMinSec', () => {
  it('formats whole seconds as m:ss', () => {
    expect(formatMinSec(600)).toBe('10:00');
    expect(formatMinSec(462)).toBe('7:42');
    expect(formatMinSec(5)).toBe('0:05');
    expect(formatMinSec(0)).toBe('0:00');
  });
});
```

In `src/ui/controlHints.test.ts`, add to the `'derives keys from the bindings in controls.config'` test:

```ts
    expect(byLabel('Eat / drink')).toEqual(['F']);
    expect(byLabel('Bottled O₂')).toEqual(['O']);
    expect(byLabel('Rest at camp')).toEqual(['R']);
```

In `e2e/smoke.spec.ts`, in the first test, after the `guide` assertion, add:

```ts
  for (const name of ['Stamina', 'Oxygen', 'Warmth', 'Supplies']) {
    await expect(page.getByRole('meter', { name })).toBeVisible();
  }
  await expect(page.getByTestId('items')).toHaveText('Food 4 · Water 4 · O₂ 2');
```

Then, after the existing `await expect(controls).toContainText('Grab wall');` line (the first one), add:

```ts
  await expect(controls).toContainText('Rest at camp');
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/ui`
Expected: FAIL, because `./formatMinSec` is missing and the new hint labels are undefined.

- [ ] **Step 3: Implement `formatMinSec` and the hints**

`src/ui/formatMinSec.ts`:

```ts
/** Whole seconds as m:ss (e.g. 462 -> "7:42"). */
export function formatMinSec(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
```

In `src/ui/controlHints.ts`, insert after the `'Grab wall'` entry:

```ts
  { keys: keysFor('eat'), label: 'Eat / drink' },
  { keys: keysFor('oxygen'), label: 'Bottled O₂' },
  { keys: keysFor('rest'), label: 'Rest at camp' },
```

- [ ] **Step 4: HUD**

In `src/ui/Hud.tsx`:

1. Add imports:

```tsx
import { GAME_CONFIG } from '../engine/config/game.config';
import { formatMinSec } from './formatMinSec';
```

2. Above `export function Hud()`, add:

```tsx
const WARN = GAME_CONFIG.survival;

interface StatBarProps {
  label: string;
  value: number;
  tone: 'stamina' | 'oxygen' | 'warmth' | 'supplies';
  cap?: number;
  warn?: boolean;
}

function StatBar({ label, value, tone, cap = 100, warn = false }: StatBarProps) {
  return (
    <>
      <div className="hud__label">{label}</div>
      <div
        className={`bar${warn ? ' bar--warn' : ''}`}
        role="meter"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={value}
      >
        <div className="bar__cap" style={{ width: `${cap}%` }} />
        <div className={`bar__fill bar__fill--${tone}`} style={{ width: `${value}%` }} />
      </div>
    </>
  );
}
```

3. Replace the Stamina label and its `<div className="bar" ...>...</div>` block inside `hud__panel` with:

```tsx
        <StatBar label="Stamina" value={s.stamina} cap={s.staminaCap} tone="stamina" />
        <StatBar
          label="Oxygen"
          value={s.oxygen}
          tone="oxygen"
          warn={s.oxygen < WARN.oxygen.warnLow}
        />
        <StatBar
          label="Warmth"
          value={s.bodyTemp}
          tone="warmth"
          warn={s.bodyTemp < WARN.temperature.warnCold}
        />
        <StatBar
          label="Supplies"
          value={s.supplies}
          tone="supplies"
          warn={s.supplies < WARN.supplies.warnLow}
        />
        <div className="hud__items" data-testid="items">
          {`Food ${s.items.food} · Water ${s.items.water} · O₂ ${s.items.o2}`}
        </div>
        {s.o2SecondsLeft !== null && (
          <div className="hud__o2">{`O₂ flowing ${formatMinSec(s.o2SecondsLeft)}`}</div>
        )}
```

4. After the `{s.prompt && ...}` line, add:

```tsx
      {s.warning && (
        <div className="hud__warning" aria-live="polite">
          {s.warning}
        </div>
      )}
```

5. Before the `{s.paused && ...}` line, add:

```tsx
      {s.resting && <div className="overlay overlay--rest">Resting…</div>}
```

- [ ] **Step 5: CSS**

Append to `src/app/app.css`:

```css
.bar__fill--stamina {
  background: #f2b84b;
}

.bar__fill--oxygen {
  background: #5aa9e6;
}

.bar__fill--warmth {
  background: #f07f3c;
}

.bar__fill--supplies {
  background: #6cc070;
}

.bar--warn {
  animation: bar-warn 1s ease-in-out infinite;
}

@keyframes bar-warn {
  50% {
    box-shadow: 0 0 0 2px rgba(255, 90, 90, 0.9);
  }
}

.hud__items,
.hud__o2 {
  margin-top: 10px;
  font-size: 13px;
  font-variant-numeric: tabular-nums;
}

.hud__o2 {
  margin-top: 4px;
  color: #9fd0f5;
}

.hud__warning {
  position: absolute;
  bottom: 30%;
  left: 50%;
  transform: translateX(-50%);
  padding: 8px 16px;
  border-radius: 6px;
  background: rgba(140, 24, 24, 0.8);
  font-weight: 600;
}

.overlay--rest {
  pointer-events: none;
  background: rgba(0, 0, 0, 0.85);
  animation: rest-fade 600ms ease-out;
}

@keyframes rest-fade {
  from {
    background: rgba(0, 0, 0, 0);
  }
}

@media (prefers-reduced-motion: reduce) {
  .bar--warn {
    animation: none;
    box-shadow: 0 0 0 2px rgba(255, 90, 90, 0.9);
  }

  .overlay--rest {
    animation: none;
  }
}
```

- [ ] **Step 6: Docs**

1. `README.md`: in the controls table, add three rows after the grab row, matching the table's existing column format: `F` → Eat / drink, `O` → Bottled oxygen (10 min per bottle), `R` → Rest at a camp. If the README has a features list, add one bullet: "Survival: oxygen, warmth and supplies that interact with stamina; rest at camps to acclimatize."
2. `CLAUDE.md`: in the Architecture section, after the "Movement logic is pure…" paragraph, add:

   ```
   **Survival is pure too:** `src/engine/survival/` holds oxygen, body temperature, supplies and inventory rules (`survival.ts` combines them). `SurvivalSystem` turns `F` / `O` / `R` into state changes and toasts, and `Game` runs it every step after the player, forwards `survival.modifiers` to `Player` (stamina recovery, stamina cap, climb speed), and respawns on `collapse` or `hypothermia` like a fatal fall. Rest pauses survival for `restSeconds`.
   ```

3. `docs/playtest/m1-checklist.md`: append a section in the file's existing checkbox style:

   ```
   ## Survival (M2a)

   - [ ] Oxygen, Warmth and Supplies bars and the item row (Food 4 · Water 4 · O₂ 2) show at Khare.
   - [ ] Sprinting and climbing near High Camp drains oxygen; a warning appears below 25; stopping recovers it; draining it to 0 respawns with "You collapsed from lack of oxygen".
   - [ ] `F` eats food then water, only when supplies are below full.
   - [ ] `O` starts a 10-minute bottle; the timer shows; oxygen rises.
   - [ ] At a camp, "R — Rest" shows; resting fades the screen ~3 s, refills stamina and warmth and shows the acclimatization toast; away from camp `R` explains why it cannot rest.
   - [ ] Standing still for a long time high up drains warmth; below 30 climbing is visibly slower.
   ```

4. `docs/superpowers/specs/2026-11-06-m2a-survival-design.md`: append a section `## 7. Deviations during planning (2026-11-06)` that lists the four items from this plan's "Deliberate deviations from the M2a spec" section, word for word.

- [ ] **Step 7: Verify everything**

Run: `npm run format && npm run lint && npm run typecheck && npm test && npm run build && npm run e2e`
Expected: all PASS.

- [ ] **Step 8: Commit**

```bash
git add src/ui src/app/app.css e2e README.md CLAUDE.md docs
git commit -m "feat(hud): survival bars, items, warnings, rest overlay and new key hints

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
