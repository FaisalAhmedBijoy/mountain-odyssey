import { clamp } from '../core/math';

export interface OxygenRules {
  ceilingRefAltitudeM: number;
  ceilingMetresPerPoint: number;
  minCeiling: number;
  exertionDrainPerSec: number;
  recoverPerSec: number;
  dropToCeilingPerSec: number;
  bottleAltitudeBonusM: number;
}

/** Highest oxygen level the body settles at (M2a spec §4.1). */
export function oxygenCeiling(
  altitudeM: number,
  acclimatizationM: number,
  bottledActive: boolean,
  r: OxygenRules,
  max = 100,
): number {
  const effective = altitudeM - acclimatizationM - (bottledActive ? r.bottleAltitudeBonusM : 0);
  const ceiling = max - Math.max(0, effective - r.ceilingRefAltitudeM) / r.ceilingMetresPerPoint;
  return clamp(ceiling, r.minCeiling, max);
}

/** Exertion drains and pauses recovery; otherwise oxygen moves toward the ceiling. */
export function updateOxygen(
  value: number,
  ceiling: number,
  exerting: boolean,
  dt: number,
  r: OxygenRules,
): number {
  if (exerting) return Math.max(0, value - r.exertionDrainPerSec * dt);
  if (value < ceiling) return Math.min(ceiling, value + r.recoverPerSec * dt);
  return Math.max(ceiling, value - r.dropToCeilingPerSec * dt);
}
