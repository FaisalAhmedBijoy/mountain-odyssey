import { describe, expect, it } from 'vitest';
import { GAME_CONFIG } from '../config/game.config';
import { classifySurface, climbRequirement, NO_GEAR, surfaceAt, surfaceWithMask } from './surface';

const rules = GAME_CONFIG.surface;

describe('surfaceAt', () => {
  it('treats steep ground as rock at any altitude', () => {
    expect(surfaceAt(45, 6000, rules)).toBe('rock');
  });
  it('is rock below the snowline', () => {
    expect(surfaceAt(10, 5100, rules)).toBe('rock');
  });
  it('is snow above the snowline on gentle slopes', () => {
    expect(surfaceAt(10, 5350, rules)).toBe('snow');
    expect(surfaceAt(10, 5600, rules)).toBe('snow');
  });
  it('is ice on moderately steep slopes high up', () => {
    expect(surfaceAt(30, 5600, rules)).toBe('ice');
  });
});

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

describe('surfaceWithMask', () => {
  it('is rock on steep ground, on or off a glacier', () => {
    expect(surfaceWithMask(45, true, rules)).toBe('rock');
    expect(surfaceWithMask(40, true, rules)).toBe('rock');
    expect(surfaceWithMask(45, false, rules)).toBe('rock');
  });
  it('is snow below 25° and ice from 25° on a glacier', () => {
    expect(surfaceWithMask(10, true, rules)).toBe('snow');
    expect(surfaceWithMask(25, true, rules)).toBe('ice');
    expect(surfaceWithMask(39, true, rules)).toBe('ice');
  });
  it('is rock off a glacier', () => {
    expect(surfaceWithMask(10, false, rules)).toBe('rock');
    expect(surfaceWithMask(30, false, rules)).toBe('rock');
  });
});

describe('classifySurface', () => {
  it('falls back to surfaceAt without a mask', () => {
    for (const [slope, alt] of [
      [10, 5100],
      [10, 5350],
      [30, 5600],
      [45, 6000],
    ]) {
      expect(classifySurface(slope, alt, null, rules)).toBe(surfaceAt(slope, alt, rules));
    }
  });
  it('uses the mask when known, whatever the altitude', () => {
    expect(classifySurface(10, 5100, true, rules)).toBe('snow');
    expect(classifySurface(10, 6000, false, rules)).toBe('rock');
  });
});
