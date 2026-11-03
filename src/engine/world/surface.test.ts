import { describe, expect, it } from 'vitest';
import { GAME_CONFIG } from '../config/game.config';
import { climbRequirement, NO_GEAR, surfaceAt } from './surface';

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
  it('allows rock with no gear', () => {
    expect(climbRequirement('rock', NO_GEAR)).toBeNull();
  });
  it('requires an ice axe on snow', () => {
    expect(climbRequirement('snow', NO_GEAR)).toBe('Requires ice axe');
    expect(climbRequirement('snow', { iceAxe: true, crampons: false })).toBeNull();
  });
  it('requires ice axe and crampons on ice', () => {
    expect(climbRequirement('ice', { iceAxe: true, crampons: false })).toBe(
      'Requires ice axe + crampons',
    );
    expect(climbRequirement('ice', { iceAxe: true, crampons: true })).toBeNull();
  });
});
