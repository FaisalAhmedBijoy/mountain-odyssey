import { clamp } from '../core/math';
import type { MoveState } from '../player/movementState';

export type Activity = 'idle' | 'walk' | 'exert';

export interface TemperatureRules {
  seaLevelAirC: number;
  lapseCPerKm: number;
  comfortC: number;
  windFactorPerMs: number;
  activityHeat: Readonly<Record<Activity, number>>;
  campShelterHeat: number;
  rateDivisor: number;
}

export interface BodyTempInputs {
  altitudeM: number;
  windMs: number;
  activity: Activity;
  atCamp: boolean;
  /** Base clothing plus packed items (M2b spec §3). */
  insulation: number;
}

/** Moving while running or climbing exerts; walking warms a little; everything else is idle. */
export function activityOf(state: MoveState, moving: boolean): Activity {
  if (!moving) return 'idle';
  if (state === 'run' || state === 'climb') return 'exert';
  return state === 'walk' ? 'walk' : 'idle';
}

export const airTempC = (altitudeM: number, r: TemperatureRules): number =>
  r.seaLevelAirC - (r.lapseCPerKm * altitudeM) / 1000;

export const coldExposure = (airC: number, windMs: number, r: TemperatureRules): number =>
  Math.max(0, r.comfortC - airC) * (1 + windMs * r.windFactorPerMs);

/** Body temperature change per second (M2a spec §4.2). */
export function bodyTempRate(i: BodyTempInputs, r: TemperatureRules): number {
  const heat = i.insulation + r.activityHeat[i.activity] + (i.atCamp ? r.campShelterHeat : 0);
  return (heat - coldExposure(airTempC(i.altitudeM, r), i.windMs, r)) / r.rateDivisor;
}

export function updateBodyTemp(
  value: number,
  i: BodyTempInputs,
  dt: number,
  r: TemperatureRules,
  max = 100,
): number {
  return clamp(value + bodyTempRate(i, r) * dt, 0, max);
}
