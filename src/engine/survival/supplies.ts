export interface SuppliesRules {
  drainPerSec: number;
}

/** Supplies fall steadily over real time (M2a spec §4.3). */
export const updateSupplies = (value: number, dt: number, r: SuppliesRules): number =>
  Math.max(0, value - r.drainPerSec * dt);
