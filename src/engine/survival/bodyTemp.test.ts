import { describe, expect, it } from 'vitest';
import { GAME_CONFIG } from '../config/game.config';
import {
  activityOf,
  airTempC,
  bodyTempRate,
  coldExposure,
  updateBodyTemp,
  type BodyTempInputs,
} from './bodyTemp';

const r = GAME_CONFIG.survival.temperature;
const at = (altitudeM: number, over: Partial<BodyTempInputs> = {}): BodyTempInputs => ({
  altitudeM,
  windMs: 0,
  activity: 'idle',
  atCamp: false,
  ...over,
});

describe('air temperature and cold exposure', () => {
  it('lapses 6.5 °C per km from 25 °C at sea level', () => {
    expect(airTempC(0, r)).toBe(25);
    expect(airTempC(5000, r)).toBeCloseTo(-7.5, 6);
    expect(airTempC(6476, r)).toBeCloseTo(-17.094, 3);
  });

  it('is zero above 10 °C and grows with wind', () => {
    expect(coldExposure(15, 0, r)).toBe(0);
    expect(coldExposure(-10, 0, r)).toBe(20);
    expect(coldExposure(-10, 10, r)).toBe(40);
  });
});

describe('activityOf', () => {
  it('maps move state and movement to activity heat levels', () => {
    expect(activityOf('walk', true)).toBe('walk');
    expect(activityOf('run', true)).toBe('exert');
    expect(activityOf('climb', true)).toBe('exert');
    expect(activityOf('climb', false)).toBe('idle');
    expect(activityOf('run', false)).toBe('idle');
    expect(activityOf('walk', false)).toBe('idle');
    expect(activityOf('slide', true)).toBe('idle');
    expect(activityOf('fall', true)).toBe('idle');
  });
});

describe('body temperature', () => {
  it('warms idling at Khare, is about neutral walking at High Camp and cools idling there', () => {
    expect(bodyTempRate(at(5000), r)).toBeCloseTo(2.5 / 60, 6);
    expect(bodyTempRate(at(5800, { activity: 'walk' }), r)).toBeCloseTo(0.3 / 60, 6);
    expect(bodyTempRate(at(5800), r)).toBeCloseTo(-2.7 / 60, 6);
  });

  it('warms quickly at a camp', () => {
    expect(bodyTempRate(at(5800, { atCamp: true }), r)).toBeCloseTo(27.3 / 60, 6);
  });

  it('walking the summit push empties body temperature in about 24 minutes', () => {
    const rate = bodyTempRate(at(6476, { activity: 'walk' }), r);
    expect(100 / -rate / 60).toBeCloseTo(24.4, 1);
  });

  it('clamps to 0..100', () => {
    expect(updateBodyTemp(100, at(5000), 10, r)).toBe(100);
    expect(updateBodyTemp(0.01, at(6476), 1, r)).toBe(0);
  });
});
