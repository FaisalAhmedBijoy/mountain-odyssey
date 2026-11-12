# M2b Equipment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The player packs a loadout on a new Prep screen before each climb. The loadout decides what they can climb (ice axe, crampons, gloves), how warm they stay (jacket, gloves), whether they can rest outside camps (tent, stove), what food, water and O₂ they start with, and how much a heavy pack slows them.

**Architecture:**
- Pure equipment rules live in a new folder, `src/engine/equipment/` (`items.ts`, `loadout.ts`). They import no three.js, Rapier or React, so React may import them, as it already imports `game.config.ts`.
- `Game.create` validates the loadout once and derives four things from it: gear booleans, the weight penalty, insulation and the starting inventory. It hands these to `Player` and `SurvivalSystem`. Nothing changes during a climb.
- The Prep screen is a React screen between Mountain Select and the game. Its counting logic sits in a pure `prepModel.ts` so it can be unit-tested; Vitest here runs in `node` and has no DOM.

**Tech Stack:** TypeScript 5.9, Vitest, React 19 + Zustand, Playwright.

**Spec:** `docs/superpowers/specs/2026-11-11-m2b-equipment-design.md`. All numbers below come from its §3–§4.

## Global Constraints

- Work on branch `m2b-equipment`, created from `dev`.
- `src/engine/**` must never import React. React (`src/ui`, `src/app`) never touches Three.js or Rapier objects. UI may import `src/engine/config/*` and `src/engine/equipment/*`.
- Every gameplay number lives in `GAME_CONFIG` (`src/engine/config/game.config.ts`). Item data is in `GAME_CONFIG.items`, equipment rules in `GAME_CONFIG.equipment`. Systems never hard-code numbers.
- Static files in `public/` go through `assetUrl()`; never use a leading `/`.
- HUD state is published through `publish()` at most every 100 ms, never per frame. `packKg` is published once at load.
- Show the DEM attribution verbatim: `Contains modified Copernicus DEM data` (the menu frame already does).
- Run `npm run format` before every commit. CI runs `format:check`, `lint`, `typecheck`, `test`, `build` and `e2e`.
- Every commit must pass `npm run typecheck` and `npm test`.
- Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Keep `typescript@~5.9`.

## Deliberate deviations from the M2b spec

1. **What tent and stove heat do.** Survival does not tick during a rest; a finished rest just sets body temperature to full. So "shelter heat during the rest" from spec §5.2 would have no effect. Instead, a finished rest sets body temperature to `max(current, 100 × min(1, warmth / campShelterHeat))`, where:
   - `warmth = (campShelterHeat at a camp, or tentShelterHeat in a tent) + (stoveHeat with a stove)`.
   - A camp rest still warms to full (30 / 30).
   - A tent rest warms to 50 (15 / 30).
   - A tent rest with a stove warms to about 83 (25 / 30).
2. **Toast for a tent rest:** `Rested in the tent`. The spec gives none.
3. **The weight bar shows `28.7 / 20 kg` only.** The penalty text appears once, in the warning list (`Over 20 kg: −17 % speed, +26 % stamina use.`), not repeated next to the bar.
4. **The Patharia e2e test checks that Prep → Start opens the game for `patharia`, but not the HUD's `Pack 12.2 kg`.** CI bakes only `test-peak` (`pree2e`), so Patharia never finishes loading there. `Pack 12.2 kg` is covered on the Prep screen (`12.2 / 20 kg`) and by the unit test in Task 6. The HUD pack text is covered on test-peak (`Pack 28.7 kg`).
5. **The `R — Rest` prompt still appears only at camps.** With a tent, `R` works anywhere on the ground, and the controls hint changes to `Rest at camp or tent`. A prompt shown everywhere would be noise.
6. **`weightPenalty` rounds the over-weight kilograms to 0.001 kg.** Otherwise float sums such as 20.000000000000004 kg would produce a `−0 %` warning.

Task 9 copies these deviations into the M2b spec.

## File map

| File | Status | Responsibility |
|---|---|---|
| `src/engine/config/game.config.ts` | modify | `items`, `equipment`; temperature `baseInsulation`, `tentShelterHeat`, `stoveHeat`; drop `insulation`, `startingPack` |
| `src/engine/equipment/items.ts` (+ test) | create | `ItemId`, `ITEM_IDS`, `isItemId` |
| `src/engine/equipment/loadout.ts` (+ test) | create | `Loadout`, `MountainGear`, `Load`, weight, penalty, gear, insulation, inventory, validation, warnings |
| `src/engine/world/surface.ts` (+ test) | modify | bigger `Gear`, gloves rule |
| `src/engine/player/stamina.ts` (+ test) | modify | `drainMul` |
| `src/engine/player/Player.ts` (+ test) | modify | `load` (speed and stamina), air temperature into `climbRequirement` |
| `src/engine/survival/bodyTemp.ts` (+ test) | modify | insulation comes from inputs |
| `src/engine/survival/survival.ts` (+ test) | modify | `insulation` input, starting inventory parameter, rest warmth |
| `src/engine/survival/SurvivalSystem.ts` (+ test) | modify | `SurvivalKit`, tent rest, stove |
| `src/data/mountains/*.json`, `index.ts`, `mountains.test.ts` | modify | `gear` blocks, parsing, default |
| `src/engine/core/hud.ts`, `Game.ts` | modify | `packKg`, loadout options, wiring |
| `src/ui/Hud.tsx`, `src/ui/controlHints.ts` (+ test) | modify | pack weight in the item row, rest hint |
| `src/app/App.tsx`, `src/app/GameView.tsx` | modify | prep screen in the flow, loadout to the game |
| `src/ui/prep/prepModel.ts` (+ test) | create | count changes, kg formatting |
| `src/ui/prep/PrepScreen.tsx` | create | the Prep screen |
| `src/ui/menu/MenuScreen.tsx`, `src/app/app.css` | modify | optional footer, prep styles |
| `e2e/smoke.spec.ts`, `e2e/menu.spec.ts`, `e2e/prep.spec.ts` | modify / create | e2e |
| design spec §5.3, M2b spec, `CLAUDE.md`, `docs/playtest/m1-checklist.md` | modify | docs |

---

### Task 0: Branch

- [ ] **Step 1: Create the branch**

```bash
git checkout dev && git pull --ff-only && git checkout -b m2b-equipment
```

---

### Task 1: Item catalog and equipment config

**Files:**
- Modify: `src/engine/config/game.config.ts`
- Create: `src/engine/equipment/items.ts`
- Test: `src/engine/equipment/items.test.ts`

**Interfaces:**
- Produces:
  - `GAME_CONFIG.items[id]: { name, kind: 'gear' | 'stack', weightKg, maxCount, insulation, effect }`
  - `GAME_CONFIG.equipment = { basePackKg, glovesMinAirTempC, weight: { freeKg, speedLossPerKg, staminaCostPerKg, minSpeedMul } }`
  - `GAME_CONFIG.survival.temperature.baseInsulation / tentShelterHeat / stoveHeat`
  - `items.ts`: `type ItemId`, `ITEM_IDS: readonly ItemId[]`, `isItemId(v: string): v is ItemId`

- [ ] **Step 1: Write the failing test**

`src/engine/equipment/items.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { GAME_CONFIG } from '../config/game.config';
import { isItemId, ITEM_IDS } from './items';

describe('items', () => {
  it('lists the twelve M2b items in catalog order', () => {
    expect(ITEM_IDS).toEqual([
      'boots',
      'crampons',
      'iceAxe',
      'harness',
      'ascender',
      'jacket',
      'gloves',
      'tent',
      'stove',
      'food',
      'water',
      'o2',
    ]);
  });

  it('recognises item ids only', () => {
    expect(isItemId('iceAxe')).toBe(true);
    expect(isItemId('rope')).toBe(false);
    expect(isItemId('toString')).toBe(false);
  });

  it('uses the spec weights, stack sizes and insulation', () => {
    const it = GAME_CONFIG.items;
    expect(it.boots.weightKg).toBe(2);
    expect(it.o2.weightKg).toBe(3.5);
    expect(it.o2.maxCount).toBe(4);
    expect(it.food.maxCount).toBe(8);
    expect(it.food.kind).toBe('stack');
    expect(it.tent.kind).toBe('gear');
    expect(it.jacket.insulation).toBe(12);
    expect(it.gloves.insulation).toBe(4);
    expect(GAME_CONFIG.equipment.basePackKg).toBe(6);
    expect(GAME_CONFIG.survival.temperature.baseInsulation).toBe(6);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/engine/equipment/items.test.ts`
Expected: FAIL, `Failed to resolve import "./items"`.

- [ ] **Step 3: Add the config**

In `src/engine/config/game.config.ts`, inside `survival.temperature`, add three keys after `insulation: 20,`. Leave `insulation` in place; Task 5 removes it.

```ts
      /** Clothing always worn; items add to it (M2b spec §3). */
      baseInsulation: 6,
      /** Shelter heat of a tent rest away from a camp. */
      tentShelterHeat: 15,
      /** Added to the shelter heat of any rest when a stove is packed. */
      stoveHeat: 10,
```

After the `survival` block (before `surface:`), add:

```ts
  /** Items the player can pack (M2b spec §3). weightKg is per unit. */
  items: {
    boots: {
      name: 'Mountaineering boots',
      kind: 'gear',
      weightKg: 2,
      maxCount: 1,
      insulation: 0,
      effect: 'Required on every mountain',
    },
    crampons: {
      name: 'Crampons',
      kind: 'gear',
      weightKg: 1,
      maxCount: 1,
      insulation: 0,
      effect: 'Climb ice (with an ice axe)',
    },
    iceAxe: {
      name: 'Ice axe',
      kind: 'gear',
      weightKg: 0.7,
      maxCount: 1,
      insulation: 0,
      effect: 'Climb snow and ice',
    },
    harness: {
      name: 'Harness',
      kind: 'gear',
      weightKg: 0.5,
      maxCount: 1,
      insulation: 0,
      effect: 'For fixed ropes (coming later)',
    },
    ascender: {
      name: 'Ascender',
      kind: 'gear',
      weightKg: 0.3,
      maxCount: 1,
      insulation: 0,
      effect: 'For fixed ropes (coming later)',
    },
    jacket: {
      name: 'Insulated jacket',
      kind: 'gear',
      weightKg: 1.5,
      maxCount: 1,
      insulation: 12,
      effect: 'Warmth +12',
    },
    gloves: {
      name: 'Gloves',
      kind: 'gear',
      weightKg: 0.3,
      maxCount: 1,
      insulation: 4,
      effect: 'Warmth +4; climb below −15 °C',
    },
    tent: {
      name: 'Tent',
      kind: 'gear',
      weightKg: 3,
      maxCount: 1,
      insulation: 0,
      effect: 'Rest anywhere (R)',
    },
    stove: {
      name: 'Stove',
      kind: 'gear',
      weightKg: 1.5,
      maxCount: 1,
      insulation: 0,
      effect: 'Warmer rests',
    },
    food: {
      name: 'Food ration',
      kind: 'stack',
      weightKg: 0.6,
      maxCount: 8,
      insulation: 0,
      effect: '+25 supplies (F)',
    },
    water: {
      name: 'Water',
      kind: 'stack',
      weightKg: 1,
      maxCount: 8,
      insulation: 0,
      effect: '+15 supplies (F)',
    },
    o2: {
      name: 'O₂ bottle',
      kind: 'stack',
      weightKg: 3.5,
      maxCount: 4,
      insulation: 0,
      effect: '10 min of bottled oxygen (O)',
    },
  },
  /** Pack weight and gear rules (M2b spec §3). */
  equipment: {
    /** Sleeping bag, clothes and first aid: always carried, not shown as an item. */
    basePackKg: 6,
    /** Below this air temperature, climbing needs gloves. */
    glovesMinAirTempC: -15,
    weight: { freeKg: 20, speedLossPerKg: 0.02, staminaCostPerKg: 0.03, minSpeedMul: 0.5 },
  },
```

- [ ] **Step 4: Write `items.ts`**

`src/engine/equipment/items.ts`:

```ts
import { GAME_CONFIG } from '../config/game.config';

/** Item data lives in GAME_CONFIG.items (M2b spec §3). */
export type ItemId = keyof typeof GAME_CONFIG.items;

export const ITEM_IDS = Object.keys(GAME_CONFIG.items) as readonly ItemId[];

export const isItemId = (v: string): v is ItemId => Object.hasOwn(GAME_CONFIG.items, v);
```

- [ ] **Step 5: Run the tests and typecheck**

Run: `npx vitest run src/engine/equipment && npm run typecheck`
Expected: 3 tests pass and typecheck is clean.

- [ ] **Step 6: Commit**

```bash
npm run format
git add src/engine/config/game.config.ts src/engine/equipment
git commit -m "feat(equipment): item catalog and equipment config

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Bigger `Gear` and the gloves rule

**Files:**
- Modify: `src/engine/world/surface.ts`
- Modify: `src/engine/player/Player.ts` (the `senseWall` call only)
- Test: `src/engine/world/surface.test.ts`

**Interfaces:**
- Consumes: `GAME_CONFIG.equipment.glovesMinAirTempC` (Task 1); `airTempC(altitudeM, rules)` from `src/engine/survival/bodyTemp.ts` (exists).
- Produces:
  - `Gear = { iceAxe, crampons, gloves, harness, ascender, tent, stove: boolean }`
  - `NO_GEAR` (all false)
  - `climbRequirement(surface: Surface, gear: Gear, airTempC: number, glovesMinAirTempC: number): string | null`

- [ ] **Step 1: Replace the `climbRequirement` tests**

In `src/engine/world/surface.test.ts`, replace the whole `describe('climbRequirement', …)` block with:

```ts
describe('climbRequirement', () => {
  const MILD = 0;
  const LIMIT = GAME_CONFIG.equipment.glovesMinAirTempC;
  const axe = { ...NO_GEAR, iceAxe: true };
  const axeAndCrampons = { ...axe, crampons: true };

  it('allows rock with no gear', () => {
    expect(climbRequirement('rock', NO_GEAR, MILD, LIMIT)).toBeNull();
  });
  it('requires an ice axe on snow', () => {
    expect(climbRequirement('snow', NO_GEAR, MILD, LIMIT)).toBe('Requires ice axe');
    expect(climbRequirement('snow', axe, MILD, LIMIT)).toBeNull();
  });
  it('requires ice axe and crampons on ice', () => {
    expect(climbRequirement('ice', axe, MILD, LIMIT)).toBe('Requires ice axe + crampons');
    expect(climbRequirement('ice', axeAndCrampons, MILD, LIMIT)).toBeNull();
  });
  it('refuses every surface below −15 °C without gloves', () => {
    const cold = LIMIT - 1;
    for (const s of ['rock', 'snow', 'ice'] as const) {
      expect(climbRequirement(s, axeAndCrampons, cold, LIMIT)).toBe('Requires gloves (too cold)');
    }
    // The gloves rule comes first, even when other gear is missing too.
    expect(climbRequirement('ice', NO_GEAR, cold, LIMIT)).toBe('Requires gloves (too cold)');
  });
  it('allows the cold with gloves, and the limit itself without them', () => {
    const gloved = { ...axeAndCrampons, gloves: true };
    for (const s of ['rock', 'snow', 'ice'] as const) {
      expect(climbRequirement(s, gloved, LIMIT - 5, LIMIT)).toBeNull();
    }
    expect(climbRequirement('rock', NO_GEAR, LIMIT, LIMIT)).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/engine/world/surface.test.ts`
Expected: FAIL. The gloves tests get `null` (or the axe message) instead of `'Requires gloves (too cold)'`.

- [ ] **Step 3: Implement**

In `src/engine/world/surface.ts`, replace the `Gear` interface, `NO_GEAR` and `climbRequirement` with:

```ts
/** What the loadout lets the player do (M2b spec §5.2). */
export interface Gear {
  iceAxe: boolean;
  crampons: boolean;
  gloves: boolean;
  harness: boolean;
  ascender: boolean;
  tent: boolean;
  stove: boolean;
}

export const NO_GEAR: Gear = {
  iceAxe: false,
  crampons: false,
  gloves: false,
  harness: false,
  ascender: false,
  tent: false,
  stove: false,
};

/** Null when climbable with this gear, otherwise the HUD message (spec §5.1, M2b §3). */
export function climbRequirement(
  surface: Surface,
  gear: Gear,
  airTempC: number,
  glovesMinAirTempC: number,
): string | null {
  if (airTempC < glovesMinAirTempC && !gear.gloves) return 'Requires gloves (too cold)';
  if (surface === 'snow') return gear.iceAxe ? null : 'Requires ice axe';
  if (surface === 'ice') return gear.iceAxe && gear.crampons ? null : 'Requires ice axe + crampons';
  return null;
}
```

- [ ] **Step 4: Pass the air temperature from `Player`**

In `src/engine/player/Player.ts`, add an import:

```ts
import { airTempC } from '../survival/bodyTemp';
```

In `senseWall`, replace

```ts
    const requirement = climbRequirement(surface, this.gear);
```

with

```ts
    const airC = airTempC(this.feetOf(center).y, cfg.survival.temperature);
    const requirement = climbRequirement(
      surface,
      this.gear,
      airC,
      cfg.equipment.glovesMinAirTempC,
    );
```

- [ ] **Step 5: Run the tests and typecheck**

Run: `npx vitest run src/engine/world src/engine/player && npm run typecheck`
Expected: all pass. The Player tests run at 100 m (about 24 °C), so the gloves rule does not trigger there.

- [ ] **Step 6: Commit**

```bash
npm run format
git add src/engine/world/surface.ts src/engine/world/surface.test.ts src/engine/player/Player.ts
git commit -m "feat(equipment): gloves rule and full gear set in climb checks

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Loadout rules

**Files:**
- Create: `src/engine/equipment/loadout.ts`
- Test: `src/engine/equipment/loadout.test.ts`

**Interfaces:**
- Consumes: `ItemId`, `ITEM_IDS`, `isItemId` (Task 1); `Gear` (Task 2); `Inventory` from `src/engine/survival/inventory.ts` (exists: `{ food, water, o2 }`).
- Produces:
  - `type Loadout = Partial<Record<ItemId, number>>`
  - `interface MountainGear { available: ItemId[]; required: ItemId[]; defaults: Loadout }`
  - `DEFAULT_GEAR: MountainGear`
  - `interface Load { speedMul: number; staminaCostMul: number }`, `NO_LOAD: Load`
  - `packWeightKg(l): number`, `weightPenalty(kg): Load`, `gearOf(l): Gear`, `insulationOf(l): number`, `startingInventory(l): Inventory`
  - `validateLoadout(l, g: MountainGear): string[]`, `loadoutWarnings(l, g: MountainGear): string[]`

- [ ] **Step 1: Write the failing tests**

`src/engine/equipment/loadout.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { NO_GEAR } from '../world/surface';
import { ITEM_IDS } from './items';
import {
  DEFAULT_GEAR,
  gearOf,
  insulationOf,
  loadoutWarnings,
  packWeightKg,
  startingInventory,
  validateLoadout,
  weightPenalty,
  type Loadout,
  type MountainGear,
} from './loadout';

const MERA_DEFAULTS: Loadout = {
  boots: 1,
  crampons: 1,
  iceAxe: 1,
  harness: 1,
  ascender: 1,
  jacket: 1,
  gloves: 1,
  tent: 1,
  food: 4,
  water: 4,
  o2: 2,
};
const ALL: MountainGear = { available: [...ITEM_IDS], required: ['boots'], defaults: MERA_DEFAULTS };
const HILLS: MountainGear = {
  available: ['boots', 'tent', 'stove', 'food', 'water'],
  required: ['boots'],
  defaults: { boots: 1, food: 2, water: 3 },
};

describe('packWeightKg', () => {
  it('adds the 6 kg base pack to every item', () => {
    expect(packWeightKg({})).toBe(6);
    expect(packWeightKg(MERA_DEFAULTS)).toBeCloseTo(28.7, 9);
    expect(packWeightKg(HILLS.defaults)).toBeCloseTo(12.2, 9);
  });
});

describe('weightPenalty', () => {
  it('has no penalty up to 20 kg', () => {
    expect(weightPenalty(12)).toEqual({ speedMul: 1, staminaCostMul: 1 });
    expect(weightPenalty(20)).toEqual({ speedMul: 1, staminaCostMul: 1 });
    expect(weightPenalty(20.000000000000004)).toEqual({ speedMul: 1, staminaCostMul: 1 });
  });
  it('costs 2 % speed and 3 % stamina per kg above 20', () => {
    const p = weightPenalty(21);
    expect(p.speedMul).toBeCloseTo(0.98, 9);
    expect(p.staminaCostMul).toBeCloseTo(1.03, 9);
  });
  it('never slows below half speed', () => {
    const p = weightPenalty(50);
    expect(p.speedMul).toBe(0.5);
    expect(p.staminaCostMul).toBeCloseTo(1.9, 9);
  });
});

describe('gearOf, insulationOf, startingInventory', () => {
  it('turns non-stack items into gear flags', () => {
    expect(gearOf({})).toEqual(NO_GEAR);
    expect(gearOf({ iceAxe: 1, tent: 1, food: 3 })).toEqual({
      ...NO_GEAR,
      iceAxe: true,
      tent: true,
    });
    expect(gearOf({ iceAxe: 0 })).toEqual(NO_GEAR);
  });
  it('adds jacket and gloves insulation to the base 6', () => {
    expect(insulationOf({})).toBe(6);
    expect(insulationOf({ jacket: 1 })).toBe(18);
    expect(insulationOf(MERA_DEFAULTS)).toBe(22);
  });
  it('starts with the packed food, water and O₂', () => {
    expect(startingInventory(MERA_DEFAULTS)).toEqual({ food: 4, water: 4, o2: 2 });
    expect(startingInventory({ boots: 1 })).toEqual({ food: 0, water: 0, o2: 0 });
  });
});

describe('validateLoadout', () => {
  it('accepts the defaults', () => {
    expect(validateLoadout(MERA_DEFAULTS, ALL)).toEqual([]);
    expect(validateLoadout(HILLS.defaults, HILLS)).toEqual([]);
    expect(validateLoadout(DEFAULT_GEAR.defaults, DEFAULT_GEAR)).toEqual([]);
  });
  it('reports each problem', () => {
    expect(validateLoadout({ boots: 1, iceAxe: 1 }, HILLS)).toEqual([
      'Ice axe is not available on this mountain',
    ]);
    expect(validateLoadout({ food: 2 }, HILLS)).toEqual(['Mountaineering boots is required']);
    expect(validateLoadout({ boots: 1, food: -1 }, HILLS)).toEqual([
      'Food ration: count must be a whole number, 0 or more',
    ]);
    expect(validateLoadout({ boots: 1, food: 1.5 }, HILLS)).toEqual([
      'Food ration: count must be a whole number, 0 or more',
    ]);
    expect(validateLoadout({ boots: 1, food: 9 }, HILLS)).toEqual(['Food ration: at most 8']);
    expect(validateLoadout({ boots: 1, rope: 1 } as Loadout, HILLS)).toEqual([
      'Unknown item "rope"',
    ]);
  });
  it('allows a count of 0 for an item the mountain does not offer', () => {
    expect(validateLoadout({ boots: 1, iceAxe: 0 }, HILLS)).toEqual([]);
  });
});

describe('loadoutWarnings', () => {
  it('warns about missing gear in order, then about weight', () => {
    expect(loadoutWarnings({ boots: 1 }, ALL)).toEqual([
      'No ice axe: you cannot climb snow or ice.',
      'No gloves: no climbing below −15 °C.',
      'No jacket: you will get cold fast high up.',
    ]);
    expect(loadoutWarnings({ ...MERA_DEFAULTS, crampons: 0 }, ALL)).toEqual([
      'No crampons: you cannot climb ice.',
      'Over 20 kg: −15 % speed, +23 % stamina use.',
    ]);
    expect(loadoutWarnings(MERA_DEFAULTS, ALL)).toEqual([
      'Over 20 kg: −17 % speed, +26 % stamina use.',
    ]);
  });
  it('says nothing about items the mountain does not offer', () => {
    expect(loadoutWarnings(HILLS.defaults, HILLS)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/engine/equipment/loadout.test.ts`
Expected: FAIL, `Failed to resolve import "./loadout"`.

- [ ] **Step 3: Implement**

`src/engine/equipment/loadout.ts`:

```ts
import { GAME_CONFIG } from '../config/game.config';
import type { Inventory } from '../survival/inventory';
import type { Gear } from '../world/surface';
import { isItemId, ITEM_IDS, type ItemId } from './items';

const ITEMS = GAME_CONFIG.items;
const EQ = GAME_CONFIG.equipment;

/** Item counts the player packed. A missing id means 0. */
export type Loadout = Partial<Record<ItemId, number>>;

/** Per-mountain gear list (M2b spec §4). */
export interface MountainGear {
  available: ItemId[];
  required: ItemId[];
  defaults: Loadout;
}

/** Used for a mountain JSON without a `gear` block. */
export const DEFAULT_GEAR: MountainGear = {
  available: ['boots', 'food', 'water'],
  required: ['boots'],
  defaults: { boots: 1, food: 4, water: 4 },
};

/** Pack weight penalty, fixed when the climb starts. */
export interface Load {
  speedMul: number;
  staminaCostMul: number;
}

export const NO_LOAD: Load = { speedMul: 1, staminaCostMul: 1 };

const countOf = (l: Loadout, id: ItemId): number => l[id] ?? 0;
const has = (l: Loadout, id: ItemId): boolean => countOf(l, id) > 0;

export function packWeightKg(l: Loadout): number {
  return ITEM_IDS.reduce((kg, id) => kg + countOf(l, id) * ITEMS[id].weightKg, EQ.basePackKg);
}

export function weightPenalty(kg: number): Load {
  const w = EQ.weight;
  // Rounded so float sums such as 20.000000000000004 kg are not over the limit.
  const over = Math.max(0, Math.round((kg - w.freeKg) * 1000) / 1000);
  return {
    speedMul: Math.max(w.minSpeedMul, 1 - w.speedLossPerKg * over),
    staminaCostMul: 1 + w.staminaCostPerKg * over,
  };
}

export function gearOf(l: Loadout): Gear {
  return {
    iceAxe: has(l, 'iceAxe'),
    crampons: has(l, 'crampons'),
    gloves: has(l, 'gloves'),
    harness: has(l, 'harness'),
    ascender: has(l, 'ascender'),
    tent: has(l, 'tent'),
    stove: has(l, 'stove'),
  };
}

export function insulationOf(l: Loadout): number {
  return ITEM_IDS.reduce(
    (sum, id) => sum + (has(l, id) ? ITEMS[id].insulation : 0),
    GAME_CONFIG.survival.temperature.baseInsulation,
  );
}

export function startingInventory(l: Loadout): Inventory {
  return { food: countOf(l, 'food'), water: countOf(l, 'water'), o2: countOf(l, 'o2') };
}

/** [] when the loadout is valid for this mountain, otherwise readable errors. */
export function validateLoadout(l: Loadout, g: MountainGear): string[] {
  const errors: string[] = [];
  for (const [key, value] of Object.entries(l)) {
    if (!isItemId(key)) {
      errors.push(`Unknown item "${key}"`);
      continue;
    }
    const item = ITEMS[key];
    const n = value ?? 0;
    if (!Number.isInteger(n) || n < 0) {
      errors.push(`${item.name}: count must be a whole number, 0 or more`);
    } else if (n > item.maxCount) {
      errors.push(`${item.name}: at most ${item.maxCount}`);
    } else if (n > 0 && !g.available.includes(key)) {
      errors.push(`${item.name} is not available on this mountain`);
    }
  }
  for (const id of g.required) {
    if (!has(l, id)) errors.push(`${ITEMS[id].name} is required`);
  }
  return errors;
}

/** "−15" with a real minus sign for negative numbers. */
const signed = (n: number): string => (n < 0 ? `−${-n}` : `${n}`);

/** Prep screen warnings, in spec order, only for items this mountain offers. */
export function loadoutWarnings(l: Loadout, g: MountainGear): string[] {
  const offered = (id: ItemId) => g.available.includes(id);
  const out: string[] = [];
  if (offered('iceAxe') && !has(l, 'iceAxe')) {
    out.push('No ice axe: you cannot climb snow or ice.');
  } else if (offered('crampons') && has(l, 'iceAxe') && !has(l, 'crampons')) {
    out.push('No crampons: you cannot climb ice.');
  }
  if (offered('gloves') && !has(l, 'gloves')) {
    out.push(`No gloves: no climbing below ${signed(EQ.glovesMinAirTempC)} °C.`);
  }
  if (offered('jacket') && !has(l, 'jacket')) {
    out.push('No jacket: you will get cold fast high up.');
  }
  const p = weightPenalty(packWeightKg(l));
  if (p.staminaCostMul > 1) {
    const speed = Math.round((1 - p.speedMul) * 100);
    const stamina = Math.round((p.staminaCostMul - 1) * 100);
    out.push(`Over ${EQ.weight.freeKg} kg: −${speed} % speed, +${stamina} % stamina use.`);
  }
  return out;
}
```

The warning numbers come from the spec formula:
- Mera defaults, 28.7 kg (8.7 kg over): speed 0.174 → 17 %, stamina 0.261 → 26 %.
- Mera without crampons, 27.7 kg (7.7 kg over): 0.154 → 15 %, 0.231 → 23 %.

- [ ] **Step 4: Run the tests and typecheck**

Run: `npx vitest run src/engine/equipment && npm run typecheck`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
npm run format
git add src/engine/equipment
git commit -m "feat(equipment): loadout weight, penalty, gear, insulation, validation and warnings

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Pack weight slows the player and costs stamina

**Files:**
- Modify: `src/engine/player/stamina.ts`, `src/engine/player/Player.ts`
- Test: `src/engine/player/stamina.test.ts`, `src/engine/player/Player.test.ts`

**Interfaces:**
- Consumes: `Load`, `NO_LOAD` (Task 3).
- Produces:
  - `StaminaModifiers` gains `drainMul?: number` (default 1, applied to negative rates only).
  - `new Player(physics, sampler, events, spawnFeet, gear, load = NO_LOAD)`.

- [ ] **Step 1: Write the failing stamina test**

Append inside `describe('stamina', …)` in `src/engine/player/stamina.test.ts`:

```ts
  it('scales drain, but not recovery, by drainMul', () => {
    const heavy = { recoveryMul: 1, capLimit: 100, drainMul: 1.5 };
    expect(updateStamina(fullStamina(r), 'run', true, 1, r, heavy).value).toBe(88);
    expect(updateStamina({ value: 50, cap: 100 }, 'walk', false, 1, r, heavy).value).toBe(56);
  });
```

- [ ] **Step 2: Write the failing Player tests**

In `src/engine/player/Player.test.ts`:
1. Add `import { NO_LOAD, type Load } from '../equipment/loadout';`.
2. Change `setup` to take a fourth parameter `load: Load = NO_LOAD`.
3. Construct the player with `new Player(physics, sampler, events, spawn, NO_GEAR, load)`.
4. Add these tests after `'drains stamina while running'`:

```ts
  it('walks slower under a heavy pack', async () => {
    const heavy: Load = { speedMul: 0.5, staminaCostMul: 1.9 };
    const { player, run } = await setup({ x: 0, y: 100.05, z: 0 }, cliffHeight, manifest, heavy);
    run({ forward: 1 }, 60);
    const walked = -player.snapshot.feet.z;
    expect(walked).toBeGreaterThan(GAME_CONFIG.movement.walkSpeed * 0.5 * 0.85);
    expect(walked).toBeLessThan(GAME_CONFIG.movement.walkSpeed * 0.5 * 1.05);
  });

  it('drains stamina faster under a heavy pack', async () => {
    const heavy: Load = { speedMul: 0.5, staminaCostMul: 1.9 };
    const { player, run } = await setup({ x: 0, y: 100.05, z: 0 }, cliffHeight, manifest, heavy);
    run({}, 10);
    run({ forward: 1, run: true }, 60);
    expect(player.snapshot.state).toBe('run');
    // 8/s × 1.9 for one second.
    expect(player.snapshot.stamina.value).toBeCloseTo(84.8, 0);
  });
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx vitest run src/engine/player/stamina.test.ts src/engine/player/Player.test.ts`
Expected:
- The stamina test fails (`92` instead of `88`).
- The heavy-walk test fails (walked about 3 m).
- Typecheck errors on the sixth `Player` argument are fine at this stage; Vitest still runs.

- [ ] **Step 4: Implement `drainMul`**

In `src/engine/player/stamina.ts`, replace the `StaminaModifiers` block and the `scaled` line:

```ts
/** Survival and pack effects on stamina (M2a spec §4.4, M2b spec §3). */
export interface StaminaModifiers {
  recoveryMul: number;
  capLimit: number;
  /** Multiplies drain (negative rates). Default 1. */
  drainMul?: number;
}
```

```ts
  const scaled = rate > 0 ? rate * mods.recoveryMul : rate * (mods.drainMul ?? 1);
```

- [ ] **Step 5: Implement the load in `Player`**

In `src/engine/player/Player.ts`:

1. Add `import { NO_LOAD, type Load } from '../equipment/loadout';`.
2. Add the constructor parameter after `gear`:
   ```ts
       private readonly gear: Gear,
       private readonly load: Load = NO_LOAD,
     ) {
   ```
3. In `step`, pass the drain multiplier:
   ```ts
       this.stamina = updateStamina(this.stamina, next, this.moving, dt, cfg.stamina, {
         recoveryMul: this.survival.staminaRecoveryMul,
         capLimit: this.survival.staminaCapLimit,
         drainMul: this.load.staminaCostMul,
       });
   ```
4. In `groundTranslation`, after `const g = cfg.physics.gravity;` add `const k = this.load.speedMul;`. Then:
   - `walk`/`run`: `const speed = (state === 'run' ? m.runSpeed : m.walkSpeed) * k;`
   - `slide`: use `m.walkSpeed * m.airControl * k` for both `x` and `z`.
   - `fall`: use `m.walkSpeed * m.airControl * k * dt` for both `x` and `z`.
5. In `climbTranslation`, multiply the climb speed:
   ```ts
       t = scale(
         normalize(t),
         cfg.movement.climbSpeed * this.survival.climbSpeedMul * this.load.speedMul * dt,
       );
   ```

- [ ] **Step 6: Run the tests and typecheck**

Run: `npx vitest run src/engine/player && npm run typecheck`
Expected: all pass, including the existing Player tests, which use `NO_LOAD`.

- [ ] **Step 7: Commit**

```bash
npm run format
git add src/engine/player
git commit -m "feat(player): pack weight slows movement and raises stamina drain

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Insulation, starting pack, tent and stove in survival

**Files:**
- Modify: `src/engine/config/game.config.ts` (remove `temperature.insulation` and `survival.startingPack`)
- Modify: `src/engine/survival/bodyTemp.ts`, `survival.ts`, `SurvivalSystem.ts`
- Modify: `src/engine/core/Game.ts` (temporary kit; Task 7 replaces it)
- Test: `bodyTemp.test.ts`, `survival.test.ts`, `SurvivalSystem.test.ts`

**Interfaces:**
- Consumes: `insulationOf` (Task 3), `temperature.baseInsulation / tentShelterHeat / stoveHeat` (Task 1).
- Produces:
  - `BodyTempInputs` and `SurvivalInputs` gain `insulation: number`. `TemperatureRules` loses `insulation`.
  - `initialSurvival(r, altitudeM, inventory: Inventory)`
  - `restAtCamp(s, altitudeM, r, acclimatize, warmth = r.temperature.campShelterHeat)`
  - `interface SurvivalKit { insulation: number; inventory: Inventory; tent: boolean; stove: boolean }`
  - `new SurvivalSystem(r, startAltitudeM, kit: SurvivalKit)`

- [ ] **Step 1: Update the existing tests to the new signatures**

1. `src/engine/survival/bodyTemp.test.ts`: in the `at()` helper, add `insulation: 20,` after `atCamp: false,`. The M2a numbers were derived with insulation 20, so every expectation stays.
2. `src/engine/survival/survival.test.ts`:
   - In `idleAt()`, add `insulation: 20,` after `atCamp: false,`.
   - Below `const r = …`, add `const PACK = { food: 4, water: 4, o2: 2 };`.
   - Then run:
     ```bash
     sed -i '' 's/initialSurvival(r, \([0-9]*\))/initialSurvival(r, \1, PACK)/g' src/engine/survival/survival.test.ts
     ```
3. `src/engine/survival/SurvivalSystem.test.ts`:
   - Change the import to `import { SurvivalSystem, type SurvivalActions, type SurvivalFrame, type SurvivalKit } from './SurvivalSystem';`.
   - Below `const DT = …`, add:
     ```ts
     const KIT: SurvivalKit = {
       insulation: 20,
       inventory: { food: 4, water: 4, o2: 2 },
       tent: false,
       stove: false,
     };
     ```
   - Then run:
     ```bash
     sed -i '' 's/new SurvivalSystem(r, \([0-9]*\))/new SurvivalSystem(r, \1, KIT)/g' src/engine/survival/SurvivalSystem.test.ts
     ```

- [ ] **Step 2: Write the new failing tests**

Append to the `describe('restAtCamp', …)` block in `survival.test.ts`:

```ts
  it('warms only as far as the shelter allows: tent 50, tent and stove about 83, never colder', () => {
    const t = r.temperature;
    expect(restAtCamp(state({ bodyTemp: 40 }), 5800, r, false, t.tentShelterHeat).bodyTemp).toBe(
      50,
    );
    expect(
      restAtCamp(state({ bodyTemp: 40 }), 5800, r, false, t.tentShelterHeat + t.stoveHeat)
        .bodyTemp,
    ).toBeCloseTo(83.33, 2);
    expect(restAtCamp(state({ bodyTemp: 70 }), 5800, r, false, t.tentShelterHeat).bodyTemp).toBe(
      70,
    );
    expect(
      restAtCamp(state({ bodyTemp: 40 }), 5800, r, true, t.campShelterHeat + t.stoveHeat).bodyTemp,
    ).toBe(100);
  });
```

Append to `describe('SurvivalSystem', …)` in `SurvivalSystem.test.ts`:

```ts
  const restAway = (sys: SurvivalSystem, at: Partial<SurvivalFrame>): string | null => {
    sys.step(press('rest', at), DT);
    for (let i = 0; i < 400; i++) {
      const out = sys.step(frame(at), DT);
      if (out.restFinished) return out.toast;
    }
    return null;
  };

  it('starts with the kit inventory', () => {
    const sys = new SurvivalSystem(r, 5000, { ...KIT, inventory: { food: 1, water: 0, o2: 3 } });
    expect(sys.state.inventory).toEqual({ food: 1, water: 0, o2: 3 });
  });

  it('with a tent, R rests away from a camp without acclimatizing', () => {
    const sys = new SurvivalSystem(r, 5800, { ...KIT, tent: true });
    const at = { altitudeM: 5800 };
    sys.step(frame(at), 600);
    const before = sys.state.supplies;
    expect(sys.step(press('rest', at), DT).toast).toBe('Resting…');
    let toast: string | null = null;
    for (let i = 0; i < 400 && toast === null; i++) {
      const out = sys.step(frame(at), DT);
      if (out.restFinished) toast = out.toast;
    }
    expect(toast).toBe('Rested in the tent');
    expect(sys.state.acclimatizationM).toBe(0);
    expect(sys.state.supplies).toBeCloseTo(before - r.supplies.restCost, 1);
  });

  it('a tent rest still needs solid ground', () => {
    const sys = new SurvivalSystem(r, 5800, { ...KIT, tent: true });
    const out = sys.step(press('rest', { altitudeM: 5800, grounded: false }), DT);
    expect(out.toast).toBe('Stand on the ground to rest');
    expect(sys.resting).toBe(false);
  });

  it('a stove makes a tent rest warmer', () => {
    const cold = { altitudeM: 6476 };
    const plain = new SurvivalSystem(r, 6476, { ...KIT, tent: true });
    plain.step(frame(cold), 500);
    restAway(plain, cold);
    const stove = new SurvivalSystem(r, 6476, { ...KIT, tent: true, stove: true });
    stove.step(frame(cold), 500);
    restAway(stove, cold);
    expect(plain.state.bodyTemp).toBe(50);
    expect(stove.state.bodyTemp).toBeCloseTo(83.33, 1);
  });
```

The existing test `'R rests only on the ground at a camp'` already covers the no-tent refusal (`KIT.tent` is false).

The stove test relies on one fact: after 500 s idle at 6,476 m with insulation 20, body temperature is about 41, which is below 50 and still alive. The rate there is (20 − 27.09) / 60 ≈ −0.118/s, so 500 s takes off about 59 points.

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx vitest run src/engine/survival`
Expected: FAIL. You will see type errors on the new parameters, `'You can only rest at a camp'` instead of `'Resting…'`, and `100` instead of `50`.

- [ ] **Step 4: Implement `bodyTemp.ts`**

1. In `TemperatureRules`, delete the line `insulation: number;`.
2. In `BodyTempInputs`, add:
   ```ts
     /** Base clothing plus packed items (M2b spec §3). */
     insulation: number;
   ```
3. In `bodyTempRate`, use `i.insulation`:
   ```ts
     const heat = i.insulation + r.activityHeat[i.activity] + (i.atCamp ? r.campShelterHeat : 0);
   ```

- [ ] **Step 5: Implement `survival.ts`**

1. In `SurvivalInputs`, add `insulation: number;`.
2. Change `initialSurvival`:
   ```ts
   export function initialSurvival(
     r: SurvivalRules,
     altitudeM: number,
     inventory: Inventory,
   ): SurvivalState {
     const s: SurvivalState = {
       oxygen: r.max,
       bodyTemp: r.max,
       supplies: r.max,
       acclimatizationM: 0,
       inventory: { ...inventory },
       o2SecondsLeft: 0,
     };
     return { ...s, oxygen: ceilingAt(s, altitudeM, r) };
   }
   ```
3. Change `restAtCamp`: add the parameter and replace the `bodyTemp: r.max,` line.
   ```ts
   /**
    * Effects of a completed rest (M2a spec §4.5, M2b plan deviation 1). Stamina is restored by Player.
    * `acclimatize` is false when this camp already granted its acclimatization, and for tent rests.
    * `warmth` is the rest's shelter heat; a camp's warms fully, less warms proportionally.
    */
   export function restAtCamp(
     s: SurvivalState,
     altitudeM: number,
     r: SurvivalRules,
     acclimatize: boolean,
     warmth: number = r.temperature.campShelterHeat,
   ): SurvivalState {
     const warmed = r.max * Math.min(1, warmth / r.temperature.campShelterHeat);
     const rested: SurvivalState = {
       ...s,
       acclimatizationM: acclimatize
         ? Math.min(r.acclimatization.maxM, s.acclimatizationM + r.acclimatization.perRestM)
         : s.acclimatizationM,
       bodyTemp: Math.max(s.bodyTemp, warmed),
       supplies: Math.max(0, s.supplies - r.supplies.restCost),
     };
     return { ...rested, oxygen: ceilingAt(rested, altitudeM, r) };
   }
   ```

- [ ] **Step 6: Implement `SurvivalSystem.ts`**

1. Add `import type { Inventory } from './inventory';` (keep the `consumeNext` import).
2. Add above the class:
   ```ts
   /** What the loadout gives survival (M2b spec §5.2), fixed for the climb. */
   export interface SurvivalKit {
     insulation: number;
     inventory: Inventory;
     tent: boolean;
     stove: boolean;
   }
   ```
3. Constructor:
   ```ts
     constructor(
       private readonly r: SurvivalRules,
       startAltitudeM: number,
       private readonly kit: SurvivalKit,
     ) {
       this.s = initialSurvival(r, startAltitudeM, kit.inventory);
     }
   ```
4. In `step`, replace the `if (f.actions.rest) { … }` block:
   ```ts
       if (f.actions.rest) {
         const sheltered = f.campId !== null || this.kit.tent;
         if (sheltered && f.grounded && f.state !== 'climb') {
           this.restLeftSec = this.r.restSeconds;
           this.restCampId = f.campId;
           return { death: null, toast: 'Resting…', restFinished: false };
         }
         toast = sheltered ? 'Stand on the ground to rest' : 'You can only rest at a camp';
       }
   ```
5. In the `stepSurvival(...)` inputs object, add `insulation: this.kit.insulation,`.
6. Replace `continueRest`:
   ```ts
     private continueRest(altitudeM: number, dt: number): SurvivalOutput {
       this.restLeftSec = Math.max(0, this.restLeftSec - dt);
       if (this.restLeftSec > 0) return { death: null, toast: null, restFinished: false };
       const campId = this.restCampId;
       this.restCampId = null;
       const t = this.r.temperature;
       const warmth =
         (campId !== null ? t.campShelterHeat : t.tentShelterHeat) +
         (this.kit.stove ? t.stoveHeat : 0);
       if (campId === null) {
         this.s = restAtCamp(this.s, altitudeM, this.r, false, warmth);
         return { death: null, toast: 'Rested in the tent', restFinished: true };
       }
       const acclimatize = !this.acclimatizedAt.has(campId);
       if (acclimatize) this.acclimatizedAt.add(campId);
       this.s = restAtCamp(this.s, altitudeM, this.r, acclimatize, warmth);
       const m = this.s.acclimatizationM;
       return {
         death: null,
         toast: acclimatize
           ? `Rested — acclimatized to +${m} m`
           : `Rested — already acclimatized here (+${m} m)`,
         restFinished: true,
       };
     }
   ```

- [ ] **Step 7: Remove the old config keys**

In `src/engine/config/game.config.ts`, delete:
- `startingPack: { food: 4, water: 4, o2: 2 },` from `survival`
- `insulation: 20,` from `survival.temperature`

- [ ] **Step 8: Keep `Game.ts` compiling (temporary)**

In `src/engine/core/Game.ts`:
1. Add `import { insulationOf } from '../equipment/loadout';`.
2. Replace `survival: new SurvivalSystem(cfg.survival, player.snapshot.feet.y),` with:
   ```ts
         // Temporary M2a-equivalent kit; Task 7 derives it from the loadout.
         survival: new SurvivalSystem(cfg.survival, player.snapshot.feet.y, {
           insulation: insulationOf({ jacket: 1, gloves: 1 }),
           inventory: { food: 4, water: 4, o2: 2 },
           tent: false,
           stove: false,
         }),
   ```

- [ ] **Step 9: Run all unit tests and typecheck**

Run: `npm test && npm run typecheck`
Expected: all pass. If `grep -rn "startingPack\|temperature.insulation\|\.insulation\b" src` finds anything other than `kit.insulation`, `i.insulation` or `items[...].insulation`, fix that user.

- [ ] **Step 10: Commit**

```bash
npm run format
git add src/engine
git commit -m "feat(survival): insulation and starting pack from the kit, tent and stove rests

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Per-mountain gear

**Files:**
- Modify: `src/data/mountains/mera-peak.json`, `test-peak.json`, `keokradong.json`, `patharia.json`
- Modify: `src/data/mountains/index.ts`
- Test: `src/data/mountains/mountains.test.ts`

**Interfaces:**
- Consumes: `isItemId`, `ItemId` (Task 1); `DEFAULT_GEAR`, `Loadout`, `MountainGear`, `validateLoadout`, `packWeightKg` (Task 3).
- Produces: `MountainDef.gear: MountainGear`.

- [ ] **Step 1: Write the failing test**

Append inside `describe('mountains', …)` in `src/data/mountains/mountains.test.ts`, and add the imports at the top:

```ts
import { ITEM_IDS } from '../../engine/equipment/items';
import { packWeightKg, validateLoadout } from '../../engine/equipment/loadout';
```

```ts
  it('gives every mountain a valid gear list with boots required', () => {
    for (const id of ['mera-peak', 'test-peak', 'keokradong', 'patharia']) {
      const g = getMountain(id)!.gear;
      expect(validateLoadout(g.defaults, g)).toEqual([]);
      expect(g.required).toContain('boots');
      for (const item of [...g.available, ...g.required]) expect(ITEM_IDS).toContain(item);
    }
  });

  it('packs the spec default weights', () => {
    expect(packWeightKg(getMountain('mera-peak')!.gear.defaults)).toBeCloseTo(28.7, 9);
    expect(packWeightKg(getMountain('test-peak')!.gear.defaults)).toBeCloseTo(28.7, 9);
    expect(packWeightKg(getMountain('keokradong')!.gear.defaults)).toBeCloseTo(12.2, 9);
    expect(packWeightKg(getMountain('patharia')!.gear.defaults)).toBeCloseTo(12.2, 9);
    expect(getMountain('mera-peak')!.gear.available).toHaveLength(12);
    expect(getMountain('patharia')!.gear.available).toEqual([
      'boots',
      'tent',
      'stove',
      'food',
      'water',
    ]);
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/data/mountains`
Expected: FAIL, `Cannot read properties of undefined (reading 'defaults')`.

- [ ] **Step 3: Add the gear blocks**

Add to both `mera-peak.json` and `test-peak.json`, as the last key (add a comma after `"terrainBaseUrl"` or `"biome"`, whichever is last):

```json
  "gear": {
    "available": ["boots", "crampons", "iceAxe", "harness", "ascender", "jacket", "gloves", "tent", "stove", "food", "water", "o2"],
    "required": ["boots"],
    "defaults": { "boots": 1, "crampons": 1, "iceAxe": 1, "harness": 1, "ascender": 1, "jacket": 1, "gloves": 1, "tent": 1, "food": 4, "water": 4, "o2": 2 }
  }
```

Add to both `keokradong.json` and `patharia.json`:

```json
  "gear": {
    "available": ["boots", "tent", "stove", "food", "water"],
    "required": ["boots"],
    "defaults": { "boots": 1, "food": 2, "water": 3 }
  }
```

- [ ] **Step 4: Parse the gear block**

Replace `src/data/mountains/index.ts` with:

```ts
import { isBiomeId, type BiomeId } from '../../engine/config/game.config';
import { isItemId, type ItemId } from '../../engine/equipment/items';
import { DEFAULT_GEAR, type Loadout, type MountainGear } from '../../engine/equipment/loadout';
import meraPeak from './mera-peak.json';
import testPeak from './test-peak.json';
import keokradong from './keokradong.json';
import patharia from './patharia.json';

export interface MountainDef {
  id: string;
  facts: {
    name: string;
    country: string;
    elevationM: number;
    location: { lat: number; lon: number };
    sources: string[];
  };
  /** Path under `public/`, without a leading slash; resolve with `assetUrl`. */
  terrainBaseUrl: string;
  biome: BiomeId;
  /** Items offered, required and packed by default (M2b spec §4). */
  gear: MountainGear;
}

interface RawGear {
  available: string[];
  required: string[];
  defaults: Record<string, number>;
}

type RawMountain = Omit<MountainDef, 'biome' | 'gear'> & { biome: string; gear?: RawGear };

function itemId(mountainId: string, id: string): ItemId {
  if (!isItemId(id)) throw new Error(`Mountain ${mountainId}: unknown item "${id}"`);
  return id;
}

function parseGear(mountainId: string, raw: RawGear | undefined): MountainGear {
  if (!raw) return DEFAULT_GEAR;
  const defaults: Loadout = {};
  for (const [id, n] of Object.entries(raw.defaults)) defaults[itemId(mountainId, id)] = n;
  return {
    available: raw.available.map((id) => itemId(mountainId, id)),
    required: raw.required.map((id) => itemId(mountainId, id)),
    defaults,
  };
}

function parseMountain(raw: RawMountain): MountainDef {
  if (!isBiomeId(raw.biome)) throw new Error(`Mountain ${raw.id}: unknown biome "${raw.biome}"`);
  return { ...raw, biome: raw.biome, gear: parseGear(raw.id, raw.gear) };
}

const MOUNTAINS: MountainDef[] = [meraPeak, testPeak, keokradong, patharia].map(parseMountain);

export function getMountain(id: string): MountainDef | null {
  return MOUNTAINS.find((m) => m.id === id) ?? null;
}
```

- [ ] **Step 5: Run the tests and typecheck**

Run: `npx vitest run src/data && npm run typecheck`
Expected: all pass.

- [ ] **Step 6: Commit**

```bash
npm run format
git add src/data/mountains
git commit -m "feat(data): per-mountain gear lists and default loadouts

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Wire the loadout into the game and the HUD

**Files:**
- Modify: `src/engine/core/hud.ts`, `src/engine/core/Game.ts`
- Modify: `src/ui/Hud.tsx`, `src/ui/controlHints.ts`, `src/ui/controlHints.test.ts`
- Modify: `src/app/GameView.tsx`, `src/app/App.tsx`
- Test: `e2e/smoke.spec.ts`

**Interfaces:**
- Consumes: everything from Tasks 3–6.
- Produces:
  - `GameOptions.loadout: Loadout`, `GameOptions.mountainGear: MountainGear`
  - `HudState.packKg: number`
  - `GameView` prop `loadout: Loadout`
  - `Screen` `'game'` variant gains `loadout: Loadout`

- [ ] **Step 1: Update the e2e and hint tests first**

- `e2e/smoke.spec.ts`: change the items assertion to
  ```ts
    await expect(page.getByTestId('items')).toHaveText('Food 4 · Water 4 · O₂ 2 · Pack 28.7 kg');
  ```
- `src/ui/controlHints.test.ts`: change `byLabel('Rest at camp')` to `byLabel('Rest at camp or tent')`.

- [ ] **Step 2: Run the hint test to verify it fails**

Run: `npx vitest run src/ui/controlHints.test.ts`
Expected: FAIL (label not found).

- [ ] **Step 3: HUD state and view**

1. `src/engine/core/hud.ts`:
   - In `HudState`, after `items: Inventory;`, add
     ```ts
       /** Pack weight in kg, one decimal, published once at load. */
       packKg: number;
     ```
   - In `initialHudState`, after `items: …`, add `packKg: 0,`.
2. `src/ui/Hud.tsx`: change the items line to
   ```tsx
             {`Food ${s.items.food} · Water ${s.items.water} · O₂ ${s.items.o2} · Pack ${s.packKg.toFixed(1)} kg`}
   ```
3. `src/ui/controlHints.ts`: change `label: 'Rest at camp'` to `label: 'Rest at camp or tent'`.

- [ ] **Step 4: Wire `Game`**

In `src/engine/core/Game.ts`:

1. Replace the Task 5 import `import { insulationOf } from '../equipment/loadout';` with:
   ```ts
   import {
     gearOf,
     insulationOf,
     packWeightKg,
     startingInventory,
     validateLoadout,
     weightPenalty,
     type Loadout,
     type MountainGear,
   } from '../equipment/loadout';
   ```
2. Delete `import { NO_GEAR } from '../world/surface';`.
3. In `GameOptions`, add:
   ```ts
     /** Packed on the Prep screen (or the mountain's defaults for a deep link). */
     loadout: Loadout;
     mountainGear: MountainGear;
   ```
4. At the top of `init()`, right after `const o = this.o;`, add:
   ```ts
       const errors = validateLoadout(o.loadout, o.mountainGear);
       if (errors.length > 0) throw new Error(`Invalid loadout: ${errors.join('; ')}`);
       const gear = gearOf(o.loadout);
       const packKg = packWeightKg(o.loadout);
   ```
5. In the `new Player(...)` call, replace `NO_GEAR,` with `gear, weightPenalty(packKg),`.
6. Replace the temporary `survival: new SurvivalSystem(...)` block from Task 5 with:
   ```ts
         survival: new SurvivalSystem(cfg.survival, player.snapshot.feet.y, {
           insulation: insulationOf(o.loadout),
           inventory: startingInventory(o.loadout),
           tent: gear.tent,
           stove: gear.stove,
         }),
   ```
7. In the final `o.publish({...})` of `init()`, add `packKg: Math.round(packKg * 10) / 10,`.

- [ ] **Step 5: Pass the loadout from React**

1. `src/app/GameView.tsx`:
   - Add `import type { Loadout } from '../engine/equipment/loadout';`.
   - Change the signature to
     ```tsx
     export function GameView({
       mountain,
       loadout,
       onExit,
     }: {
       mountain: MountainDef;
       loadout: Loadout;
       onExit: () => void;
     }) {
     ```
   - In `Game.create({...})`, add `loadout,` and `mountainGear: mountain.gear,`.
   - Change the effect deps to `[mountain, loadout, attempt]`.
2. `src/app/App.tsx`:
   - Add `import type { Loadout } from '../engine/equipment/loadout';`.
   - Change the `'game'` variant to
     `| { screen: 'game'; mountain: MountainDef; country: CountryCode | null; loadout: Loadout }`.
   - In `initialScreen`, build the deep-link game with `loadout: mountain.gear.defaults`.
   - In `MountainSelect`'s `onClimb`, use
     `setScreen({ screen: 'game', mountain, country: screen.country, loadout: mountain.gear.defaults })`.
     Task 8 sends it to the Prep screen instead.
   - Render `<GameView mountain={screen.mountain} loadout={screen.loadout} onExit={…} />`.

- [ ] **Step 6: Run everything**

```bash
npm test && npm run typecheck && npm run lint && npm run e2e
```

Expected: all green. The smoke test now sees `Food 4 · Water 4 · O₂ 2 · Pack 28.7 kg` on test-peak.

- [ ] **Step 7: Commit**

```bash
npm run format
git add src e2e
git commit -m "feat(game): loadout drives gear, pack penalty, insulation and starting items

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Expedition Prep screen

**Files:**
- Create: `src/ui/prep/prepModel.ts`, `src/ui/prep/prepModel.test.ts`, `src/ui/prep/PrepScreen.tsx`, `e2e/prep.spec.ts`
- Modify: `src/ui/menu/MenuScreen.tsx`, `src/app/App.tsx`, `src/app/app.css`, `e2e/menu.spec.ts`

**Interfaces:**
- Consumes: `Loadout`, `MountainGear`, `packWeightKg`, `weightPenalty`, `validateLoadout`, `loadoutWarnings` (Task 3); `MountainDef.gear` (Task 6); `GameView` `loadout` prop (Task 7).
- Produces:
  - `adjustCount(l: Loadout, id: ItemId, delta: number, g: MountainGear): Loadout`
  - `toggleItem(l: Loadout, id: ItemId, g: MountainGear): Loadout`
  - `formatKg(kg: number): string`
  - `<PrepScreen mountain onBack onStart />`
  - `MenuScreen` prop `footer?: ReactNode`

- [ ] **Step 1: Write the failing model test**

`src/ui/prep/prepModel.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { MountainGear } from '../../engine/equipment/loadout';
import { adjustCount, formatKg, toggleItem } from './prepModel';

const G: MountainGear = {
  available: ['boots', 'tent', 'food', 'o2'],
  required: ['boots'],
  defaults: { boots: 1, food: 2 },
};

describe('prepModel', () => {
  it('steps stack counts within 0..maxCount', () => {
    expect(adjustCount({ food: 2 }, 'food', 1, G)).toEqual({ food: 3 });
    expect(adjustCount({ food: 0 }, 'food', -1, G)).toEqual({ food: 0 });
    expect(adjustCount({ o2: 4 }, 'o2', 1, G)).toEqual({ o2: 4 });
    expect(adjustCount({}, 'o2', 1, G)).toEqual({ o2: 1 });
  });
  it('never drops a required item below 1', () => {
    expect(adjustCount({ boots: 1 }, 'boots', -1, G)).toEqual({ boots: 1 });
    expect(toggleItem({ boots: 1 }, 'boots', G)).toEqual({ boots: 1 });
  });
  it('toggles gear on and off', () => {
    expect(toggleItem({}, 'tent', G)).toEqual({ tent: 1 });
    expect(toggleItem({ tent: 1 }, 'tent', G)).toEqual({ tent: 0 });
  });
  it('does not change the loadout it was given', () => {
    const l = { food: 2 };
    adjustCount(l, 'food', 1, G);
    expect(l).toEqual({ food: 2 });
  });
  it('formats kilograms with one decimal', () => {
    expect(formatKg(28.700000000000003)).toBe('28.7');
    expect(formatKg(12)).toBe('12.0');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/ui/prep`
Expected: FAIL, `Failed to resolve import "./prepModel"`.

- [ ] **Step 3: Implement the model**

`src/ui/prep/prepModel.ts`:

```ts
import { GAME_CONFIG } from '../../engine/config/game.config';
import type { ItemId } from '../../engine/equipment/items';
import type { Loadout, MountainGear } from '../../engine/equipment/loadout';

/** New loadout with `id` changed by `delta`, kept within 0..maxCount (1.. for required items). */
export function adjustCount(l: Loadout, id: ItemId, delta: number, g: MountainGear): Loadout {
  const min = g.required.includes(id) ? 1 : 0;
  const max = GAME_CONFIG.items[id].maxCount;
  const next = Math.min(max, Math.max(min, (l[id] ?? 0) + delta));
  return { ...l, [id]: next };
}

/** Pack or leave behind a single item. */
export function toggleItem(l: Loadout, id: ItemId, g: MountainGear): Loadout {
  return adjustCount(l, id, (l[id] ?? 0) > 0 ? -1 : 1, g);
}

export const formatKg = (kg: number): string => kg.toFixed(1);
```

- [ ] **Step 4: Run the model test**

Run: `npx vitest run src/ui/prep`
Expected: 5 tests pass.

- [ ] **Step 5: Give `MenuScreen` a footer slot**

In `src/ui/menu/MenuScreen.tsx`:
1. Add `footer?: ReactNode;` to `MenuScreenProps`.
2. Destructure `footer`.
3. Render `{footer}` between the grid `<div>` and `<footer className="menu__credit">`.

- [ ] **Step 6: Write the screen**

`src/ui/prep/PrepScreen.tsx`:

```tsx
import { useState } from 'react';
import type { MountainDef } from '../../data/mountains';
import { GAME_CONFIG } from '../../engine/config/game.config';
import {
  loadoutWarnings,
  packWeightKg,
  validateLoadout,
  weightPenalty,
  type Loadout,
} from '../../engine/equipment/loadout';
import { MenuScreen } from '../menu/MenuScreen';
import { adjustCount, formatKg, toggleItem } from './prepModel';

interface PrepScreenProps {
  mountain: MountainDef;
  onBack: () => void;
  onStart: (loadout: Loadout) => void;
}

/** Expedition Prep (M2b spec §5.3): pick the loadout, see weight and warnings, start. */
export function PrepScreen({ mountain, onBack, onStart }: PrepScreenProps) {
  const gear = mountain.gear;
  const [loadout, setLoadout] = useState<Loadout>(gear.defaults);
  const kg = packWeightKg(loadout);
  const freeKg = GAME_CONFIG.equipment.weight.freeKg;
  const over = weightPenalty(kg).staminaCostMul > 1;
  const errors = validateLoadout(loadout, gear);
  const warnings = loadoutWarnings(loadout, gear);

  const footer = (
    <div className="prep">
      <div className={`prep__weight${over ? ' prep__weight--over' : ''}`}>
        <span className="prep__weight-label">Pack</span>
        <div className="prep__weight-bar" aria-hidden="true">
          <div
            className="prep__weight-fill"
            style={{ width: `${Math.min(100, (kg / freeKg) * 100)}%` }}
          />
        </div>
        <span data-testid="pack-weight">{`${formatKg(kg)} / ${freeKg} kg`}</span>
      </div>
      {warnings.length > 0 && (
        <ul className="prep__warnings" data-testid="prep-warnings">
          {warnings.map((w) => (
            <li key={w}>{w}</li>
          ))}
        </ul>
      )}
      {errors.length > 0 && (
        <ul className="prep__errors" role="alert">
          {errors.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      )}
      <button
        type="button"
        className="overlay__action prep__start"
        disabled={errors.length > 0}
        onClick={() => onStart(loadout)}
      >
        Start climb
      </button>
    </div>
  );

  return (
    <MenuScreen
      subtitle={`${mountain.facts.name} — pack your gear`}
      back={{ label: 'Mountains', onClick: onBack }}
      footer={footer}
    >
      {gear.available.map((id) => {
        const item = GAME_CONFIG.items[id];
        const n = loadout[id] ?? 0;
        if (item.kind === 'stack') {
          return (
            <div key={id} className="card card--item" role="group" aria-label={item.name}>
              <span className="card__name">{item.name}</span>
              <span className="card__meta">{`${item.weightKg} kg each`}</span>
              <span className="card__note">{item.effect}</span>
              <div className="stepper">
                <button
                  type="button"
                  aria-label={`Remove ${item.name}`}
                  disabled={n <= 0}
                  onClick={() => setLoadout(adjustCount(loadout, id, -1, gear))}
                >
                  −
                </button>
                <span className="stepper__count" data-testid={`count-${id}`}>
                  {n}
                </span>
                <button
                  type="button"
                  aria-label={`Add ${item.name}`}
                  disabled={n >= item.maxCount}
                  onClick={() => setLoadout(adjustCount(loadout, id, 1, gear))}
                >
                  +
                </button>
              </div>
            </div>
          );
        }
        const required = gear.required.includes(id);
        return (
          <button
            key={id}
            type="button"
            className={`card card--item${n > 0 ? ' card--packed' : ''}`}
            aria-pressed={n > 0}
            disabled={required}
            onClick={() => setLoadout(toggleItem(loadout, id, gear))}
          >
            <span className="card__name">{item.name}</span>
            <span className="card__meta">{`${item.weightKg} kg`}</span>
            <span className="card__note">{item.effect}</span>
            <span className="card__action">
              {required ? 'Required' : n > 0 ? 'Packed' : 'Left behind'}
            </span>
          </button>
        );
      })}
    </MenuScreen>
  );
}
```

- [ ] **Step 7: Styles**

Append to `src/app/app.css`, before the `@media (prefers-reduced-motion: reduce)` block that styles `.card`:

```css
.card--item {
  cursor: default;
}

button.card--item {
  cursor: pointer;
}

button.card--item:disabled {
  cursor: default;
}

.card--packed {
  border-color: rgba(242, 184, 75, 0.7);
}

.stepper {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 8px;
}

.stepper button {
  width: 32px;
  height: 32px;
  border: 1px solid rgba(255, 255, 255, 0.25);
  border-radius: 6px;
  background: transparent;
  color: inherit;
  font: inherit;
  font-size: 18px;
  cursor: pointer;
}

.stepper button:disabled {
  cursor: default;
  opacity: 0.4;
}

.stepper button:focus-visible {
  outline: 2px solid #f2b84b;
  outline-offset: 2px;
}

.stepper__count {
  min-width: 2ch;
  text-align: center;
  font-variant-numeric: tabular-nums;
  font-weight: 700;
}

.prep {
  display: grid;
  gap: 12px;
}

.prep__weight {
  display: grid;
  grid-template-columns: auto 1fr auto;
  align-items: center;
  gap: 12px;
  font-variant-numeric: tabular-nums;
}

.prep__weight-bar {
  height: 10px;
  border-radius: 5px;
  background: rgba(255, 255, 255, 0.12);
  overflow: hidden;
}

.prep__weight-fill {
  height: 100%;
  background: #7cc47f;
}

.prep__weight--over .prep__weight-fill {
  background: #f28c28;
}

.prep__weight--over [data-testid='pack-weight'] {
  color: #f28c28;
}

.prep__warnings,
.prep__errors {
  margin: 0;
  padding-left: 20px;
  font-size: 14px;
}

.prep__warnings {
  color: #f2b84b;
}

.prep__errors {
  color: #ff7a7a;
}

.prep__start {
  justify-self: start;
}

.prep__start:disabled {
  cursor: not-allowed;
  opacity: 0.5;
}
```

- [ ] **Step 8: Put the Prep screen into the flow**

In `src/app/App.tsx`:

1. Add `import { PrepScreen } from '../ui/prep/PrepScreen';`.
2. Add a variant to `Screen`:
   ```ts
     | { screen: 'prep'; mountain: MountainDef; country: CountryCode }
   ```
3. In `MountainSelect`'s `onClimb`, use `if (mountain) setScreen({ screen: 'prep', mountain, country: screen.country });`.
4. Add a case before `'game'`:
   ```tsx
       case 'prep':
         return (
           <PrepScreen
             mountain={screen.mountain}
             onBack={() => setScreen({ screen: 'mountains', country: screen.country })}
             onStart={(loadout) =>
               setScreen({ screen: 'game', mountain: screen.mountain, country: screen.country, loadout })
             }
           />
         );
   ```

The deep link (`initialScreen`) keeps going straight to `'game'` with `mountain.gear.defaults`.

- [ ] **Step 9: Update the menu e2e and add the prep e2e**

In `e2e/menu.spec.ts`, replace the last two lines of the first test (from `await page.getByRole('button', { name: /Mera Peak/ }).click();` on) with:

```ts
  await page.getByRole('button', { name: /Mera Peak/ }).click();
  await expect(page.getByRole('heading', { name: 'Mera Peak — pack your gear' })).toBeVisible();
  await page.getByRole('button', { name: 'Start climb' }).click();
  await expect(page.getByTestId('game-root')).toHaveAttribute('data-mountain', 'mera-peak');
  expect(errors).toEqual([]);
```

`e2e/prep.spec.ts`:

```ts
import { expect, test } from '@playwright/test';

test('Mera prep shows the pack weight, the over-weight warning and keeps boots', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await page.getByRole('button', { name: /Nepal/ }).click();
  await page.getByRole('button', { name: /Mera Peak/ }).click();
  await expect(page.getByTestId('pack-weight')).toHaveText('28.7 / 20 kg');
  await expect(page.getByTestId('prep-warnings')).toContainText(
    'Over 20 kg: −17 % speed, +26 % stamina use.',
  );
  await expect(page.getByRole('button', { name: /Mountaineering boots/ })).toBeDisabled();

  await page.getByRole('button', { name: 'Remove O₂ bottle' }).click();
  await page.getByRole('button', { name: 'Remove O₂ bottle' }).click();
  await expect(page.getByTestId('count-o2')).toHaveText('0');
  await expect(page.getByTestId('pack-weight')).toHaveText('21.7 / 20 kg');

  await page.getByRole('button', { name: /Ice axe/ }).click();
  await expect(page.getByTestId('prep-warnings')).toContainText(
    'No ice axe: you cannot climb snow or ice.',
  );

  await page.getByRole('button', { name: 'Mountains', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Nepal — choose a mountain' })).toBeVisible();
  expect(errors).toEqual([]);
});

test('Patharia prep is light and starts that mountain', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /Bangladesh/ }).click();
  await page.getByRole('button', { name: /Patharia Hills/ }).click();
  await expect(page.getByTestId('pack-weight')).toHaveText('12.2 / 20 kg');
  await expect(page.getByTestId('prep-warnings')).toHaveCount(0);
  await page.getByRole('button', { name: 'Start climb' }).click();
  await expect(page.getByTestId('game-root')).toHaveAttribute('data-mountain', 'patharia');
});
```

- [ ] **Step 10: Run everything**

```bash
npm test && npm run typecheck && npm run lint && npm run build && npm run e2e
```

Expected: all green.

- [ ] **Step 11: Look at it**

Run `npm run dev` and open http://localhost:5173. Go Nepal → Mera Peak and check:
- The cards wrap in the grid.
- The bar turns orange over 20 kg.
- Warnings appear and disappear as you toggle items.
- Start opens the game.
- Back returns to Mountain Select.

- [ ] **Step 12: Commit**

```bash
npm run format
git add src e2e
git commit -m "feat(ui): expedition prep screen between mountain select and the game

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Documentation

**Files:**
- Modify: `docs/superpowers/specs/2026-11-03-mountain-odyssey-design.md` (§5.3)
- Modify: `docs/superpowers/specs/2026-11-11-m2b-equipment-design.md`
- Modify: `CLAUDE.md`, `docs/playtest/m1-checklist.md`

- [ ] **Step 1: Design spec §5.3**

1. Add a `weightKg` column to the item table: boots 2.0, crampons 1.0, ice axe 0.7, harness 0.5, ascender 0.3, jacket 1.5, gloves 0.3, tent 3.0, stove 1.5, food 0.6, water 1.0, O₂ 3.5.
2. Under the table, add:

> **Update (M2b, 2026-11-11):**
> - A fixed 6 kg base pack (sleeping bag, clothes, first aid) is always carried.
> - Insulation is a base of 6 plus jacket +12 and gloves +4.
> - Starting food, water and O₂ come from the loadout.
> - The weight penalty is fixed when the climb starts, with speed never below 50 %.
>
> See `2026-11-11-m2b-equipment-design.md`.

- [ ] **Step 2: M2b spec**

1. Set the status row to `implemented (plan docs/superpowers/plans/2026-11-12-m2b-equipment.md)`.
2. Add a section `## 9. Deviations recorded during implementation` that copies the six numbered items from this plan's "Deliberate deviations" section.

- [ ] **Step 3: `CLAUDE.md`**

1. In "Project status", after the M2a sentence, add:
   > M2b (equipment, spec `docs/superpowers/specs/2026-11-11-m2b-equipment-design.md`, plan `docs/superpowers/plans/2026-11-12-m2b-equipment.md`) is implemented. The rest of M2 (M2c–M2f) is next.

   Remove "M2b" from the existing "M2b–M2f is next" wording.
2. Change "(country → mountain → game)" to "(country → mountain → prep → game)". Add: "`?mountain=<id>` starts with that mountain's default loadout."
3. In Architecture, after the "Survival is pure too" paragraph, add:

> **Equipment:**
> - Item data is in `GAME_CONFIG.items`. Rules are pure in `src/engine/equipment/` (`loadout.ts`: weight, penalty, gear flags, insulation, starting inventory, validation, Prep warnings). React may import that folder.
> - Each mountain JSON has an optional `gear` block (`available`, `required`, `defaults`). Without one, it gets boots, food and water.
> - `PrepScreen` (`src/ui/prep/`) builds a `Loadout`. `Game.create` validates it, then derives:
>   - `Gear` for `Player` and `climbRequirement`. Gloves are needed below `equipment.glovesMinAirTempC`, on every surface.
>   - a `Load`: speed and stamina-drain multipliers, fixed for the climb.
>   - a `SurvivalKit` (insulation, inventory, tent, stove). A tent lets `R` rest away from camps, without acclimatization. Rest warmth is shelter heat ÷ `campShelterHeat`.

- [ ] **Step 4: Playtest checklist**

Append to `docs/playtest/m1-checklist.md`:

```markdown
## Equipment (M2b)

- [ ] Nepal → Mera Peak opens the Prep screen with 28.7 / 20 kg, an orange bar and the over-weight warning.
- [ ] Removing O₂ bottles and the tent lowers the weight; under 20 kg the bar turns green and the warning goes.
- [ ] Boots cannot be removed; Back returns to Mountain Select.
- [ ] Without crampons, a steep ice face on the glacier says "Requires ice axe + crampons" and cannot be grabbed.
- [ ] Without gloves, a wall near the summit (below −15 °C) says "Requires gloves (too cold)".
- [ ] Without the jacket, Warmth falls clearly faster above High Camp.
- [ ] With a tent, R away from a camp rests ("Rested in the tent") and does not acclimatize; without one it says "You can only rest at a camp".
- [ ] A heavy pack (all O₂, food and water) feels clearly slower than a light one.
- [ ] The HUD item row shows the pack weight.
```

- [ ] **Step 5: Commit**

```bash
npm run format
git add CLAUDE.md docs
git commit -m "docs: record M2b equipment

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Self-review notes

- **Spec coverage:**
  - §3 items, base pack, insulation, gloves rule and weight: Tasks 1–5
  - §4 per-mountain gear and its default: Task 6
  - §5.1 pure rules: Tasks 1, 3
  - §5.2 changes to existing code: Tasks 2, 4, 5, 7
  - §5.3 Prep screen and flow, deep link: Tasks 7, 8
  - §6 errors: Tasks 6 (parse throws, mountain test) and 7 (`Game.create` throws into the existing error screen)
  - §7 tests: every listed unit test is in Tasks 2–6 and 8; e2e is in Tasks 7–8, with deviation 4
  - §8 docs: Task 9
- **Type names used across tasks:** `ItemId`, `Loadout`, `MountainGear`, `Load`, `NO_LOAD`, `Gear`, `SurvivalKit`, `packKg`, `adjustCount`, `toggleItem`, `formatKg`.
