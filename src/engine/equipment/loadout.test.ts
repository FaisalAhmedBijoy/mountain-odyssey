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
const ALL: MountainGear = {
  available: [...ITEM_IDS],
  required: ['boots'],
  defaults: MERA_DEFAULTS,
};
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
