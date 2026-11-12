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
