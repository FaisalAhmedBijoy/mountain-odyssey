import { describe, expect, it } from 'vitest';
import { isBiomeId } from '../../engine/config/game.config';
import { ITEM_IDS } from '../../engine/equipment/items';
import { packWeightKg, validateLoadout } from '../../engine/equipment/loadout';
import { getMountain } from '.';

describe('mountains', () => {
  it('declares a known biome for every mountain', () => {
    for (const id of ['mera-peak', 'test-peak', 'keokradong', 'patharia']) {
      const m = getMountain(id);
      expect(m).not.toBeNull();
      expect(isBiomeId(m!.biome)).toBe(true);
    }
    expect(getMountain('keokradong')!.biome).toBe('tropical-hills');
    expect(getMountain('patharia')!.biome).toBe('tea-garden');
  });

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
});
