import { describe, expect, it } from 'vitest';
import { GAME_CONFIG } from '../config/game.config';
import {
  initialSurvival,
  lowStats,
  respawnSurvival,
  restAtCamp,
  startBottle,
  stepSurvival,
  survivalModifiers,
  topWarning,
  type SurvivalInputs,
  type SurvivalState,
} from './survival';

const r = GAME_CONFIG.survival;
const PACK = { food: 4, water: 4, o2: 2 };
const idleAt = (altitudeM: number, over: Partial<SurvivalInputs> = {}): SurvivalInputs => ({
  altitudeM,
  activity: 'idle',
  atCamp: false,
  insulation: 20,
  windMs: 0,
  ...over,
});
const state = (over: Partial<SurvivalState> = {}): SurvivalState => ({
  ...initialSurvival(r, 5000, PACK),
  ...over,
});

describe('initialSurvival', () => {
  it('starts full, with the starting pack and oxygen at the ceiling', () => {
    expect(initialSurvival(r, 5000, PACK)).toEqual({
      oxygen: 50,
      bodyTemp: 100,
      supplies: 100,
      acclimatizationM: 0,
      inventory: { food: 4, water: 4, o2: 2 },
      o2SecondsLeft: 0,
    });
  });
});

describe('stepSurvival', () => {
  it('advances oxygen, body temperature, supplies and the bottle timer together', () => {
    const { state: s, death } = stepSurvival(
      state({ oxygen: 40, o2SecondsLeft: 5 }),
      idleAt(5000),
      3,
      r,
    );
    expect(s.oxygen).toBe(43);
    expect(s.bodyTemp).toBe(100);
    expect(s.supplies).toBeCloseTo(99.9, 9);
    expect(s.o2SecondsLeft).toBe(2);
    expect(death).toBeNull();
  });

  it('uses the bottled ceiling while a bottle is active', () => {
    const s = stepSurvival(state({ oxygen: 20, o2SecondsLeft: 600 }), idleAt(6476), 100, r).state;
    expect(s.oxygen).toBeCloseTo(63.1, 6);
  });

  it('reports collapse when oxygen reaches 0 and hypothermia when body temperature does', () => {
    expect(
      stepSurvival(state({ oxygen: 0.5 }), idleAt(5000, { activity: 'exert' }), 1, r).death,
    ).toBe('collapse');
    expect(stepSurvival(state({ bodyTemp: 1, oxygen: 20 }), idleAt(6476), 60, r).death).toBe(
      'hypothermia',
    );
  });
});

describe('survivalModifiers', () => {
  it('scales recovery by oxygen and halves it without supplies', () => {
    expect(survivalModifiers(state({ oxygen: 50 }), r)).toEqual({
      staminaRecoveryMul: 0.5,
      staminaCapLimit: 100,
      climbSpeedMul: 1,
    });
    expect(survivalModifiers(state({ oxygen: 50, supplies: 0 }), r)).toEqual({
      staminaRecoveryMul: 0.25,
      staminaCapLimit: 50,
      climbSpeedMul: 1,
    });
  });

  it('slows climbing below 30 body temperature', () => {
    expect(survivalModifiers(state({ bodyTemp: 29 }), r).climbSpeedMul).toBe(0.7);
    expect(survivalModifiers(state({ bodyTemp: 30 }), r).climbSpeedMul).toBe(1);
  });
});

describe('topWarning', () => {
  it('returns the most severe warning', () => {
    expect(topWarning(state(), r)).toBeNull();
    expect(topWarning(state({ supplies: 10 }), r)).toBe('suppliesLow');
    expect(topWarning(state({ supplies: 10, bodyTemp: 39 }), r)).toBe('cold');
    expect(topWarning(state({ bodyTemp: 39, oxygen: 24 }), r)).toBe('oxygenLow');
    expect(topWarning(state({ oxygen: 24, bodyTemp: 14 }), r)).toBe('hypothermia');
    expect(topWarning(state({ bodyTemp: 14, oxygen: 9 }), r)).toBe('oxygenCritical');
  });
});

describe('lowStats', () => {
  it('flags each raw stat below its warning threshold (oxygen 25, warmth 40, supplies 20)', () => {
    expect(lowStats(state({ oxygen: 25, bodyTemp: 40, supplies: 20 }), r)).toEqual({
      oxygen: false,
      bodyTemp: false,
      supplies: false,
    });
    expect(lowStats(state({ oxygen: 24.9, bodyTemp: 39.9, supplies: 19.9 }), r)).toEqual({
      oxygen: true,
      bodyTemp: true,
      supplies: true,
    });
    expect(lowStats(state({ oxygen: 50, bodyTemp: 100, supplies: 0.4 }), r)).toEqual({
      oxygen: false,
      bodyTemp: false,
      supplies: true,
    });
  });
});

describe('startBottle', () => {
  it('uses one bottle for 600 s, refuses while one is active or when none are left', () => {
    const started = startBottle(state(), r);
    expect(started.result).toBe('started');
    expect(started.state.inventory.o2).toBe(1);
    expect(started.state.o2SecondsLeft).toBe(600);
    expect(startBottle(started.state, r).result).toBe('active');
    const none = state({ inventory: { food: 1, water: 1, o2: 0 } });
    expect(startBottle(none, r)).toEqual({ state: none, result: 'empty' });
  });
});

describe('restAtCamp', () => {
  it('keeps oxygen when refillOxygen is false, and still costs supplies', () => {
    const t = r.temperature;
    const s = restAtCamp(
      state({ oxygen: 10, supplies: 50 }),
      5800,
      r,
      false,
      t.tentShelterHeat,
      false,
    );
    expect(s.oxygen).toBe(10);
    expect(s.supplies).toBe(50 - r.supplies.restCost);
  });
  it('acclimatizes by 250 m (max 1000), warms fully, sets oxygen to the new ceiling and costs 10 supplies', () => {
    const s = restAtCamp(state({ bodyTemp: 40, oxygen: 10, supplies: 50 }), 5800, r, true);
    expect(s.acclimatizationM).toBe(250);
    expect(s.bodyTemp).toBe(100);
    expect(s.oxygen).toBe(36.25);
    expect(s.supplies).toBe(40);
    expect(restAtCamp(state({ acclimatizationM: 1000 }), 5800, r, true).acclimatizationM).toBe(
      1000,
    );
    expect(restAtCamp(state({ supplies: 4 }), 5800, r, true).supplies).toBe(0);
  });

  it('without acclimatization keeps acclimatizationM but still warms, refills oxygen and costs supplies', () => {
    const s = restAtCamp(
      state({ bodyTemp: 40, oxygen: 10, supplies: 50, acclimatizationM: 250 }),
      5800,
      r,
      false,
    );
    // Ceiling at 5,800 m with +250 m: 100 - (5800 - 250 - 3000) / 40 = 36.25.
    expect(s.acclimatizationM).toBe(250);
    expect(s.bodyTemp).toBe(100);
    expect(s.oxygen).toBe(36.25);
    expect(s.supplies).toBe(40);
  });

  it('warms only as far as the shelter allows: tent 50, tent and stove about 83, never colder', () => {
    const t = r.temperature;
    expect(restAtCamp(state({ bodyTemp: 40 }), 5800, r, false, t.tentShelterHeat).bodyTemp).toBe(
      50,
    );
    expect(
      restAtCamp(state({ bodyTemp: 40 }), 5800, r, false, t.tentShelterHeat + t.stoveHeat).bodyTemp,
    ).toBeCloseTo(83.33, 2);
    expect(restAtCamp(state({ bodyTemp: 70 }), 5800, r, false, t.tentShelterHeat).bodyTemp).toBe(
      70,
    );
    expect(
      restAtCamp(state({ bodyTemp: 40 }), 5800, r, true, t.campShelterHeat + t.stoveHeat).bodyTemp,
    ).toBe(100);
  });
});

describe('respawnSurvival', () => {
  it('loses 20% of items, refills body temperature and oxygen, ends the bottle, keeps acclimatization', () => {
    const s = respawnSurvival(
      state({
        inventory: { food: 10, water: 5, o2: 1 },
        bodyTemp: 0,
        oxygen: 0,
        supplies: 12,
        o2SecondsLeft: 100,
        acclimatizationM: 500,
      }),
      5000,
      r,
    );
    expect(s.inventory).toEqual({ food: 8, water: 4, o2: 1 });
    expect(s.bodyTemp).toBe(100);
    expect(s.oxygen).toBe(62.5);
    expect(s.supplies).toBe(30);
    expect(s.o2SecondsLeft).toBe(0);
    expect(s.acclimatizationM).toBe(500);
  });

  it('keeps supplies above the respawn minimum', () => {
    expect(respawnSurvival(state({ supplies: 70 }), 5000, r).supplies).toBe(70);
  });
});
