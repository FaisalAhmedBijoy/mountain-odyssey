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
