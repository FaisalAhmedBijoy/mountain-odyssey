import { describe, expect, it } from 'vitest';
import { GAME_CONFIG } from '../config/game.config';
import { applyInjury, fullStamina, staminaRate, updateStamina } from './stamina';

const r = GAME_CONFIG.stamina;

describe('stamina', () => {
  it('uses the spec rates', () => {
    expect(staminaRate('run', true, r)).toBe(-8);
    expect(staminaRate('climb', true, r)).toBe(-5);
    expect(staminaRate('climb', false, r)).toBe(-1.5);
    expect(staminaRate('walk', true, r)).toBe(6);
    expect(staminaRate('walk', false, r)).toBe(6);
    expect(staminaRate('fall', false, r)).toBe(0);
    expect(staminaRate('slide', false, r)).toBe(0);
  });

  it('drains and recovers within 0..cap', () => {
    const s = updateStamina(fullStamina(r), 'run', true, 2, r);
    expect(s.value).toBe(84);
    expect(updateStamina(s, 'walk', false, 10, r).value).toBe(100);
    expect(updateStamina({ value: 1, cap: 100 }, 'climb', true, 1, r).value).toBe(0);
  });

  it('injury lowers the cap by the penalty, never below the minimum', () => {
    const injured = applyInjury(fullStamina(r), 30, r);
    expect(injured).toEqual({ value: 70, cap: 70 });
    expect(updateStamina(injured, 'walk', false, 10, r).value).toBe(70);
    expect(applyInjury({ value: 15, cap: 20 }, 30, r)).toEqual({ value: 10, cap: 10 });
  });

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
});
