import { describe, expect, it } from 'vitest';
import { GAME_CONFIG } from '../config/game.config';
import {
  SurvivalSystem,
  type SurvivalActions,
  type SurvivalFrame,
  type SurvivalKit,
} from './SurvivalSystem';

const r = GAME_CONFIG.survival;
const DT = 1 / 60;
const KIT: SurvivalKit = {
  insulation: 20,
  inventory: { food: 4, water: 4, o2: 2 },
  tent: false,
  stove: false,
};
const NONE: SurvivalActions = { eat: false, oxygen: false, rest: false };
const frame = (over: Partial<SurvivalFrame> = {}): SurvivalFrame => ({
  altitudeM: 5000,
  state: 'walk',
  moving: false,
  grounded: true,
  campId: null,
  windMs: 0,
  actions: NONE,
  ...over,
});
const press = (action: keyof SurvivalActions, over: Partial<SurvivalFrame> = {}) =>
  frame({ ...over, actions: { ...NONE, [action]: true } });

describe('SurvivalSystem', () => {
  it('starts with the starting pack and oxygen at the ceiling', () => {
    const sys = new SurvivalSystem(r, 5000, KIT);
    expect(sys.state.inventory).toEqual({ food: 4, water: 4, o2: 2 });
    expect(sys.state.oxygen).toBe(50);
    expect(sys.resting).toBe(false);
    expect(sys.respawns).toBe(0);
    expect(sys.modifiers.staminaRecoveryMul).toBe(0.5);
  });

  it('F eats when supplies have room and says why when it cannot', () => {
    const sys = new SurvivalSystem(r, 5000, KIT);
    expect(sys.step(press('eat'), DT).toast).toBe('Supplies are already full');
    sys.step(frame(), 600);
    const out = sys.step(press('eat'), DT);
    expect(out.toast).toBe('Ate a food ration (+25 supplies)');
    expect(sys.state.inventory.food).toBe(3);
    expect(sys.state.supplies).toBeCloseTo(100, 2);
  });

  it('F drinks water when the food is gone, then reports an empty pack', () => {
    const sys = new SurvivalSystem(r, 5000, KIT);
    sys.step(frame(), 3000);
    for (let i = 0; i < 4; i++) {
      sys.step(frame(), 3000);
      sys.step(press('eat'), DT);
    }
    sys.step(frame(), 3000);
    expect(sys.step(press('eat'), DT).toast).toBe('Drank water (+15 supplies)');
    for (let i = 0; i < 3; i++) {
      sys.step(frame(), 3000);
      sys.step(press('eat'), DT);
    }
    sys.step(frame(), 3000);
    expect(sys.step(press('eat'), DT).toast).toBe('No food or water left');
  });

  it('O starts one bottle at a time until none are left', () => {
    const sys = new SurvivalSystem(r, 6476, KIT);
    const at = { altitudeM: 6476 };
    expect(sys.step(press('oxygen', at), DT).toast).toBe('Bottled oxygen on — 10 min');
    expect(sys.state.inventory.o2).toBe(1);
    expect(sys.step(press('oxygen', at), DT).toast).toBe('Bottled oxygen is already flowing');
    sys.step(frame(at), 60);
    expect(sys.state.oxygen).toBeCloseTo(63.1, 6);
    sys.step(frame(at), 600);
    expect(sys.state.o2SecondsLeft).toBe(0);
    sys.step(press('oxygen', at), DT);
    sys.step(frame(at), 700);
    expect(sys.step(press('oxygen', at), DT).toast).toBe('No oxygen bottles left');
  });

  it('R rests only on the ground at a camp', () => {
    const sys = new SurvivalSystem(r, 5800, KIT);
    const at = { altitudeM: 5800 };
    expect(sys.step(press('rest', at), DT).toast).toBe('You can only rest at a camp');
    expect(
      sys.step(press('rest', { ...at, campId: 'high', state: 'climb', grounded: false }), DT).toast,
    ).toBe('Stand on the ground to rest');
    expect(sys.resting).toBe(false);
  });

  it('a 3 s rest pauses survival, then restores and acclimatizes', () => {
    const sys = new SurvivalSystem(r, 5800, KIT);
    const at = { altitudeM: 5800, campId: 'high' };
    expect(sys.step(press('rest', at), DT).toast).toBe('Resting…');
    expect(sys.resting).toBe(true);
    let finishedAt = -1;
    let toast: string | null = null;
    for (let i = 0; i < 200 && finishedAt < 0; i++) {
      const out = sys.step(press('eat', at), DT);
      if (out.restFinished) {
        finishedAt = i;
        toast = out.toast;
      }
    }
    expect(finishedAt).toBeGreaterThanOrEqual(178);
    expect(toast).toBe('Rested — acclimatized to +250 m');
    expect(sys.state.inventory.food).toBe(4);
    expect(sys.state.acclimatizationM).toBe(250);
    expect(sys.state.oxygen).toBe(36.25);
    expect(sys.state.supplies).toBeCloseTo(90, 1);
    expect(sys.resting).toBe(false);
  });

  it('acclimatizes only on the first rest at each camp', () => {
    const sys = new SurvivalSystem(r, 5800, KIT);
    const restAt = (campId: string): string | null => {
      const at = { altitudeM: 5800, campId };
      sys.step(press('rest', at), DT);
      for (let i = 0; i < 400; i++) {
        const out = sys.step(frame(at), DT);
        if (out.restFinished) return out.toast;
      }
      return null;
    };
    expect(restAt('high')).toBe('Rested — acclimatized to +250 m');
    expect(restAt('high')).toBe('Rested — already acclimatized here (+250 m)');
    expect(sys.state.acclimatizationM).toBe(250);
    expect(restAt('khare')).toBe('Rested — acclimatized to +500 m');
    expect(sys.state.acclimatizationM).toBe(500);
    sys.respawn(5800);
    expect(restAt('khare')).toBe('Rested — already acclimatized here (+500 m)');
    expect(sys.state.acclimatizationM).toBe(500);
  });

  it('reports a collapse after about 15 s of climbing at High Camp', () => {
    const sys = new SurvivalSystem(r, 5800, KIT);
    let death = null;
    let steps = 0;
    for (; steps < 20 * 60 && !death; steps++) {
      death = sys.step(frame({ altitudeM: 5800, state: 'climb', moving: true }), DT).death;
    }
    expect(death).toBe('collapse');
    // Ceiling 30 at 2/s: 15 s = 900 steps (one extra allowed for float rounding).
    expect(steps).toBeGreaterThanOrEqual(900);
    expect(steps).toBeLessThanOrEqual(901);
  });

  it('reports hypothermia when standing still near the summit for long enough', () => {
    const sys = new SurvivalSystem(r, 6476, KIT);
    expect(sys.step(frame({ altitudeM: 6476 }), 2000).death).toBe('hypothermia');
  });

  it('respawn refills, keeps supplies above the minimum and counts', () => {
    const sys = new SurvivalSystem(r, 5000, KIT);
    sys.step(frame(), 3000);
    sys.respawn(5000);
    expect(sys.state.supplies).toBe(30);
    expect(sys.state.bodyTemp).toBe(100);
    expect(sys.state.oxygen).toBe(50);
    expect(sys.respawns).toBe(1);
  });

  const restAway = (sys: SurvivalSystem, at: Partial<SurvivalFrame>): string | null => {
    sys.step(press('rest', at), DT);
    for (let i = 0; i < 400; i++) {
      const out = sys.step(frame(at), DT);
      if (out.restFinished) return out.toast;
    }
    return null;
  };

  it('starts with the kit inventory', () => {
    const sys = new SurvivalSystem(r, 5000, { ...KIT, inventory: { food: 1, water: 0, o2: 3 } });
    expect(sys.state.inventory).toEqual({ food: 1, water: 0, o2: 3 });
  });

  it('with a tent, R rests away from a camp without acclimatizing', () => {
    const sys = new SurvivalSystem(r, 5800, { ...KIT, tent: true });
    const at = { altitudeM: 5800 };
    sys.step(frame(at), 600);
    const before = sys.state.supplies;
    expect(sys.step(press('rest', at), DT).toast).toBe('Resting…');
    let toast: string | null = null;
    for (let i = 0; i < 400 && toast === null; i++) {
      const out = sys.step(frame(at), DT);
      if (out.restFinished) toast = out.toast;
    }
    expect(toast).toBe('Rested in the tent');
    expect(sys.state.acclimatizationM).toBe(0);
    expect(sys.state.supplies).toBeCloseTo(before - r.supplies.restCost, 1);
  });

  it('a tent rest still needs solid ground', () => {
    const sys = new SurvivalSystem(r, 5800, { ...KIT, tent: true });
    const out = sys.step(press('rest', { altitudeM: 5800, grounded: false }), DT);
    expect(out.toast).toBe('Stand on the ground to rest');
    expect(sys.resting).toBe(false);
  });

  it('a stove makes a tent rest warmer', () => {
    const cold = { altitudeM: 6476 };
    const plain = new SurvivalSystem(r, 6476, { ...KIT, tent: true });
    plain.step(frame(cold), 500);
    restAway(plain, cold);
    const stove = new SurvivalSystem(r, 6476, { ...KIT, tent: true, stove: true });
    stove.step(frame(cold), 500);
    restAway(stove, cold);
    expect(plain.state.bodyTemp).toBe(50);
    expect(stove.state.bodyTemp).toBeCloseTo(83.33, 1);
  });
});
