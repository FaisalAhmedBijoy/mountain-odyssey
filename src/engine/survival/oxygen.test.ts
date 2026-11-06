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
