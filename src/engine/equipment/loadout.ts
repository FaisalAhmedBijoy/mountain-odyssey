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
  return ITEM_IDS.reduce<number>(
    (kg, id) => kg + countOf(l, id) * ITEMS[id].weightKg,
    EQ.basePackKg,
  );
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
  return ITEM_IDS.reduce<number>(
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
    // Rounded up (so any over-weight shows at least 1 %), minus a margin for float noise.
    const speed = Math.ceil((1 - p.speedMul) * 100 - 1e-9);
    const stamina = Math.ceil((p.staminaCostMul - 1) * 100 - 1e-9);
    out.push(`Over ${EQ.weight.freeKg} kg: −${speed} % speed, +${stamina} % stamina use.`);
  }
  return out;
}
