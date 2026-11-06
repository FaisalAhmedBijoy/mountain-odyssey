import { describe, expect, it } from 'vitest';
import { GAME_CONFIG } from '../config/game.config';
import { fullStamina, updateStamina } from '../player/stamina';
import { oxygenCeiling, updateOxygen } from './oxygen';

const DT = 1 / 60;
const or = GAME_CONFIG.survival.oxygen;
const sr = GAME_CONFIG.stamina;

/**
 * Climb while moving from full stamina until stamina runs out (climb move drain 5/s, so 20 s),
 * draining oxygen at the real exertion rate. Returns the lowest oxygen reached.
 */
function climbUntilExhausted(altitudeM: number): { minOxygen: number; seconds: number } {
  const ceiling = oxygenCeiling(altitudeM, 0, false, or);
  let stamina = fullStamina(sr);
  let oxygen = ceiling;
  let minOxygen = oxygen;
  let steps = 0;
  while (stamina.value > 0 && oxygen > 0 && steps < 60 * 60) {
    stamina = updateStamina(stamina, 'climb', true, DT, sr);
    oxygen = updateOxygen(oxygen, ceiling, true, DT, or);
    minOxygen = Math.min(minOxygen, oxygen);
    steps++;
  }
  return { minOxygen, seconds: steps * DT };
}

describe('exertion: stamina and oxygen together', () => {
  it('at an unacclimatized High Camp (5,800 m, ceiling 30) oxygen runs out after 15 s, before stamina', () => {
    const { minOxygen, seconds } = climbUntilExhausted(5800);
    expect(minOxygen).toBe(0);
    expect(seconds).toBeCloseTo(15, 1);
  });

  it('at Khare (5,000 m, ceiling 50) stamina runs out first after 20 s, leaving about 10 oxygen', () => {
    const { minOxygen, seconds } = climbUntilExhausted(5000);
    expect(minOxygen).toBeGreaterThan(0);
    expect(seconds).toBeCloseTo(20, 1);
    expect(minOxygen).toBeCloseTo(10, 1);
  });
});
