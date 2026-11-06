export interface Inventory {
  food: number;
  water: number;
  o2: number;
}

export interface ConsumeRules {
  foodGain: number;
  waterGain: number;
}

export type ConsumeOutcome = 'food' | 'water' | 'full' | 'empty';

/** `F`: eat food first, then drink water, only when supplies have room (M2a spec §4.3). */
export function consumeNext(
  inv: Inventory,
  supplies: number,
  r: ConsumeRules,
  max = 100,
): { inventory: Inventory; supplies: number; outcome: ConsumeOutcome } {
  if (supplies >= max) return { inventory: inv, supplies, outcome: 'full' };
  if (inv.food > 0) {
    return {
      inventory: { ...inv, food: inv.food - 1 },
      supplies: Math.min(max, supplies + r.foodGain),
      outcome: 'food',
    };
  }
  if (inv.water > 0) {
    return {
      inventory: { ...inv, water: inv.water - 1 },
      supplies: Math.min(max, supplies + r.waterGain),
      outcome: 'water',
    };
  }
  return { inventory: inv, supplies, outcome: 'empty' };
}

/** Each stack loses floor(count × fraction) on respawn (spec §5.5). */
export function loseOnRespawn(inv: Inventory, fraction: number): Inventory {
  const keep = (n: number) => n - Math.floor(n * fraction);
  return { food: keep(inv.food), water: keep(inv.water), o2: keep(inv.o2) };
}
