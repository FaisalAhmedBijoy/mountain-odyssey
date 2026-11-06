import { describe, expect, it } from 'vitest';
import { GAME_CONFIG } from '../config/game.config';
import { consumeNext, loseOnRespawn } from './inventory';

const r = GAME_CONFIG.survival.supplies;
const pack = { food: 2, water: 1, o2: 2 };

describe('consumeNext', () => {
  it('eats food first, clamped to 100', () => {
    expect(consumeNext(pack, 60, r)).toEqual({
      inventory: { food: 1, water: 1, o2: 2 },
      supplies: 85,
      outcome: 'food',
    });
    expect(consumeNext(pack, 90, r).supplies).toBe(100);
  });

  it('drinks water when the food is gone', () => {
    expect(consumeNext({ food: 0, water: 1, o2: 0 }, 50, r)).toEqual({
      inventory: { food: 0, water: 0, o2: 0 },
      supplies: 65,
      outcome: 'water',
    });
  });

  it('consumes nothing when supplies are full or nothing is left', () => {
    expect(consumeNext(pack, 100, r)).toEqual({ inventory: pack, supplies: 100, outcome: 'full' });
    const empty = { food: 0, water: 0, o2: 3 };
    expect(consumeNext(empty, 40, r)).toEqual({ inventory: empty, supplies: 40, outcome: 'empty' });
  });
});

describe('loseOnRespawn', () => {
  it('removes floor(20%) of each stack', () => {
    expect(loseOnRespawn({ food: 10, water: 7, o2: 4 }, 0.2)).toEqual({ food: 8, water: 6, o2: 4 });
    expect(loseOnRespawn({ food: 5, water: 0, o2: 1 }, 0.2)).toEqual({ food: 4, water: 0, o2: 1 });
  });
});
