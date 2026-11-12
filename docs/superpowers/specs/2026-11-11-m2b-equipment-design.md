# M2b — Equipment, inventory, pack weight, climbability gating: design

| | |
| --- | --- |
| Milestone | M2b (see the M2 breakdown in `2026-11-06-m2a-survival-design.md` §1) |
| Depends on | M2a (survival stats) |
| Date | 2026-11-11 |
| Status | implemented (plan docs/superpowers/plans/2026-11-12-m2b-equipment.md) |

## 1. Goal

The player chooses a loadout before each climb. What they carry decides what they can climb, how warm they stay, where they can rest, and how heavy and slow they are. This turns design spec §5.3 into working rules.

## 2. Scope

**In scope**

- An item catalog with weights and effects (`GAME_CONFIG.items`).
- A per-mountain gear list in `src/data/mountains/<id>.json`: which items are offered, which are required, and the default loadout.
- A simple Expedition Prep screen between Mountain Select and the game: item grid, live weight bar, warnings, Start.
- Engine rules: climb gating by ice axe, crampons and gloves; insulation from jacket and gloves; rest outside camps with a tent; extra heat from a stove; starting food, water and O₂ from the loadout; the pack weight penalty.
- Pack weight on the HUD.

**Out of scope** (later sub-projects)

- Harness and ascender effects (fixed ropes, M2d). In M2b they can be chosen and they weigh something; nothing else.
- Ice axe self-arrest and melting snow for water.
- Splat-map surfaces (M2d). Surfaces stay classified at runtime by `surfaceAt`.
- Save and load of loadouts, Prep screen polish, Mountain Details screen (M2e).
- Changing the loadout during a climb.

## 3. Items

All values live in `GAME_CONFIG.items`. `weightKg` is per unit; stack items have a `maxCount`.

| id | Name | Slot | weightKg | maxCount | Effect in M2b |
| --- | --- | --- | --- | --- | --- |
| `boots` | Mountaineering boots | feet | 2.0 | 1 | None by itself; required on every mountain, so Start is disabled without it |
| `crampons` | Crampons | feet add-on | 1.0 | 1 | Needed (with the ice axe) to climb ice |
| `iceAxe` | Ice axe | hand | 0.7 | 1 | Needed to climb snow and ice |
| `harness` | Harness | body | 0.5 | 1 | Weight only (fixed ropes in M2d) |
| `ascender` | Ascender | hand add-on | 0.3 | 1 | Weight only (fixed ropes in M2d) |
| `jacket` | Insulated jacket | body | 1.5 | 1 | Insulation +12 |
| `gloves` | Gloves | hands | 0.3 | 1 | Insulation +4; climbing below −15 °C air temperature needs gloves |
| `tent` | Tent | pack | 3.0 | 1 | `R` rests outside a camp |
| `stove` | Stove | pack | 1.5 | 1 | Extra heat while resting |
| `food` | Food ration | stack | 0.6 | 8 | As M2a (`F`, +25 supplies) |
| `water` | Water | stack | 1.0 | 8 | As M2a (`F`, +15 supplies) |
| `o2` | O₂ bottle | stack | 3.5 | 4 | As M2a (`O`, 10 minutes) |

A base pack (sleeping bag, clothes, first aid) adds a fixed `basePackKg: 6` that is always carried and not shown as an item.

**Insulation.** `survival.temperature.insulation` (20 today) is replaced by `baseInsulation: 6` plus item insulation. Jacket and gloves give 6 + 12 + 4 = 22, about today's value. Without the jacket, body temperature falls about twice as fast near High Camp, which is the intended cost of leaving it.

**Gloves rule.** Air temperature is `airTempC(altitude)` from `bodyTemp.ts` (25 °C at sea level, −6.5 °C per km): about −7 °C at Khare, −13 °C at High Camp and −17 °C at the summit. Below `glovesMinAirTempC: -15`, a climb without gloves is refused with "Requires gloves (too cold)".

**Pack weight.** `packWeightKg = basePackKg + Σ count × weightKg`. Above `weight.freeKg: 20`, each extra kg gives −2 % movement speed (walk, run and climb) and +3 % stamina drain. The penalty is fixed when the climb starts: eating does not change it (YAGNI; food is light).

```
over          = max(0, packWeightKg − freeKg)
speedMul      = max(weight.minSpeedMul, 1 − 0.02 × over)      minSpeedMul = 0.5
staminaCostMul = 1 + 0.03 × over
```

## 4. Per-mountain gear

Each mountain JSON gains a `gear` block:

```json
"gear": {
  "available": ["boots", "crampons", "iceAxe", "harness", "ascender", "jacket", "gloves", "tent", "stove", "food", "water", "o2"],
  "required": ["boots"],
  "defaults": { "boots": 1, "crampons": 1, "iceAxe": 1, "harness": 1, "ascender": 1, "jacket": 1, "gloves": 1, "tent": 1, "food": 4, "water": 4, "o2": 2 }
}
```

| Mountain | available | defaults | Default weight |
| --- | --- | --- | --- |
| mera-peak, test-peak | all 12 | everything except the stove; food 4, water 4, O₂ 2 | 6 + 9.3 + 2.4 + 4 + 7 = 28.7 kg |
| keokradong, patharia | boots, tent, stove, food, water | boots, food 2, water 3 | 6 + 2 + 1.2 + 3 = 12.2 kg |

The Mera defaults are deliberately over 20 kg: the player sees the penalty and decides what to leave behind. Test-peak copies Mera so the e2e and unit tests exercise every item.

A mountain JSON without `gear` gets `{ available: ["boots", "food", "water"], required: ["boots"], defaults: { "boots": 1, "food": 4, "water": 4 } }`.

## 5. Architecture

### 5.1 Pure rules: `src/engine/equipment/`

No three.js, Rapier or React imports. React may import this folder (as it imports `game.config.ts` today).

| File | Contents |
| --- | --- |
| `items.ts` | `ItemId` type, `ITEM_IDS`, `isItemId`. Item data itself is in `GAME_CONFIG.items`. |
| `loadout.ts` | `Loadout = Partial<Record<ItemId, number>>` and the functions below. |

```ts
validateLoadout(l, mountainGear): string[]        // [] when valid; otherwise human-readable errors
packWeightKg(l): number
weightPenalty(kg): { speedMul: number; staminaCostMul: number }
gearOf(l): Gear                                   // booleans for every non-stack item
insulationOf(l): number
startingInventory(l): Inventory                   // food, water, o2 counts
loadoutWarnings(l, mountainGear): string[]        // for the Prep screen
```

`validateLoadout` reports: an id that is not in `available`, a missing `required` item, a count below 0, a non-integer count, or a count above `maxCount`.

`loadoutWarnings` gives, in this order, only for items the mountain offers:

- no ice axe: "No ice axe: you cannot climb snow or ice."
- ice axe but no crampons: "No crampons: you cannot climb ice."
- no gloves: "No gloves: no climbing below −15 °C."
- no jacket: "No jacket: you will get cold fast high up."
- over the free weight: "Over 20 kg: −X % speed, +Y % stamina use." (X and Y rounded to whole numbers)

### 5.2 Existing code that changes

- `surface.ts`: `Gear` grows to `{ iceAxe, crampons, gloves, harness, ascender, tent, stove }`; `NO_GEAR` gets the new fields as `false`. `climbRequirement(surface, gear, airTempC, glovesMinAirTempC)` checks the gloves rule before the surface rules, for every surface.
- `stamina.ts`: `StaminaModifiers` gains `drainMul` (default 1), applied to negative rates.
- `Player.ts`: the constructor takes `load: { speedMul, staminaCostMul }` after `gear`. Walk, run, air control and climb speeds are multiplied by `speedMul`; `staminaCostMul` is passed as `drainMul`. It passes the air temperature at the feet to `climbRequirement`.
- `SurvivalSystem.ts`: takes `{ insulation, inventory, tent, stove }` from the loadout instead of config constants.
  - `R` away from a camp: with a tent it rests with `tentShelterHeat: 15` in place of `campShelterHeat`; without one it keeps today's refusal message.
  - A tent rest grants no acclimatization and the HUD camp label stays empty.
  - With a stove, `stoveHeat: 10` is added to the shelter heat during any rest.
  - Tent rests cost supplies like camp rests.
- `Game.ts`: `GameOptions` gains `loadout: Loadout` and `mountainGear: MountainGear`. `Game.create` calls `validateLoadout` and fails with the joined errors if any (the existing error screen shows them). It derives gear, load, insulation and inventory once and hands them to `Player` and `SurvivalSystem`. It publishes `packKg` once.
- `hud.ts` / `Hud.tsx`: the item row becomes `Food 4 · Water 4 · O₂ 2 · Pack 21.3 kg`.
- `src/data/mountains/*.json` and the mountain loader: the optional `gear` block and its default (§4).

### 5.3 Prep screen and flow

- `App.tsx` adds `{ screen: 'prep'; mountain; country }`. Mountain Select → Prep → Game. Back from Prep returns to Mountain Select.
- `?mountain=<id>` still skips the menus and starts with that mountain's `defaults`, so deep links and existing e2e tests keep working.
- `src/ui/prep/PrepScreen.tsx` in the `MenuScreen` frame:
  - one card per available item: name, weight, one-line effect; gear items toggle, stack items have − and + buttons (0 to `maxCount`); required items show "Required" and cannot be removed
  - a weight bar "21.3 / 20 kg", orange above 20 kg, with the penalty text
  - the warning list from `loadoutWarnings`
  - Start (disabled while `validateLoadout` returns errors) and Back
- `GameView` receives the loadout and passes it to `Game.create`.
- The Prep screen state is not saved (M2e).

## 6. Error handling

- A malformed `gear` block in a mountain JSON fails the existing mountain data test (`mountains.test.ts` checks every id against `ITEM_IDS` and every default against `validateLoadout`).
- An invalid loadout reaching `Game.create` (a bug, since the Prep screen blocks it) raises an error and shows the existing error screen; nothing falls back silently.

## 7. Testing

- `loadout.test.ts`: weight sums with base pack; penalty at 20, 21 and 50 kg (speed floor); `gearOf`, `insulationOf`, `startingInventory`; each `validateLoadout` error; each warning and its order.
- `surface.test.ts`: the gloves rule refuses rock, snow and ice below the limit without gloves and allows them with gloves; above the limit nothing changes.
- `stamina.test.ts`: `drainMul` scales drain, not recovery.
- `Player.test.ts`: a heavy load walks slower than the default; existing tests pass with an unpenalised load.
- `SurvivalSystem.test.ts`: tent rest away from a camp works and grants no acclimatization; no tent keeps today's refusal; the stove adds heat.
- `mountains.test.ts`: every mountain's gear block is valid.
- e2e:
  - Bangladesh → Patharia Hills → Prep → Start loads the game, and the HUD shows `Pack 12.2 kg`.
  - On Mera's Prep screen, the weight bar shows 28.7 kg and the over-weight warning; removing O₂ bottles lowers it; boots cannot be removed.
  - The existing smoke test passes unchanged except the item row text (now with `Pack 28.7 kg` on test-peak).

## 8. Documentation

- Design spec §5.3: add the weight column, base pack, insulation split and the 2026-11-11 note pointing here.
- `CLAUDE.md`: project status (M2b implemented) and an "Equipment" paragraph in Architecture.
- `docs/playtest/m1-checklist.md`: an M2b section (Prep screen weight and warnings, ice gating without crampons, gloves near the summit, tent rest, heavy pack feels slower).

## 9. Deviations recorded during implementation

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
