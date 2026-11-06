import type { GAME_CONFIG } from '../config/game.config';
import { updateBodyTemp, type Activity } from './bodyTemp';
import { loseOnRespawn, type Inventory } from './inventory';
import { oxygenCeiling, updateOxygen } from './oxygen';
import { updateSupplies } from './supplies';

export type SurvivalRules = typeof GAME_CONFIG.survival;
export type DeathCause = 'collapse' | 'hypothermia';
export type Warning = 'oxygenCritical' | 'hypothermia' | 'oxygenLow' | 'cold' | 'suppliesLow';

export const WARNING_TEXT: Record<Warning, string> = {
  oxygenCritical: 'Oxygen critical',
  hypothermia: 'Hypothermia — get to camp',
  oxygenLow: 'Low oxygen — stop and breathe',
  cold: 'You are getting cold',
  suppliesLow: 'Low supplies — eat or drink (F)',
};

export interface SurvivalState {
  oxygen: number;
  bodyTemp: number;
  supplies: number;
  acclimatizationM: number;
  inventory: Inventory;
  /** Seconds of bottled oxygen left; 0 when no bottle is active. */
  o2SecondsLeft: number;
}

export interface SurvivalInputs {
  altitudeM: number;
  activity: Activity;
  atCamp: boolean;
  windMs: number;
}

/** What survival does to the player's stamina and climbing (M2a spec §4.2, §4.4). */
export interface SurvivalModifiers {
  staminaRecoveryMul: number;
  staminaCapLimit: number;
  climbSpeedMul: number;
}

const ceilingAt = (s: SurvivalState, altitudeM: number, r: SurvivalRules): number =>
  oxygenCeiling(altitudeM, s.acclimatizationM, s.o2SecondsLeft > 0, r.oxygen, r.max);

export function initialSurvival(r: SurvivalRules, altitudeM: number): SurvivalState {
  const s: SurvivalState = {
    oxygen: r.max,
    bodyTemp: r.max,
    supplies: r.max,
    acclimatizationM: 0,
    inventory: { ...r.startingPack },
    o2SecondsLeft: 0,
  };
  return { ...s, oxygen: ceilingAt(s, altitudeM, r) };
}

export function stepSurvival(
  s: SurvivalState,
  i: SurvivalInputs,
  dt: number,
  r: SurvivalRules,
): { state: SurvivalState; death: DeathCause | null } {
  const ceiling = ceilingAt(s, i.altitudeM, r);
  const state: SurvivalState = {
    ...s,
    oxygen: updateOxygen(s.oxygen, ceiling, i.activity === 'exert', dt, r.oxygen),
    bodyTemp: updateBodyTemp(s.bodyTemp, i, dt, r.temperature, r.max),
    supplies: updateSupplies(s.supplies, dt, r.supplies),
    o2SecondsLeft: Math.max(0, s.o2SecondsLeft - dt),
  };
  const death: DeathCause | null =
    state.oxygen <= 0 ? 'collapse' : state.bodyTemp <= 0 ? 'hypothermia' : null;
  return { state, death };
}

export function survivalModifiers(s: SurvivalState, r: SurvivalRules): SurvivalModifiers {
  const fed = s.supplies > 0;
  return {
    staminaRecoveryMul: (s.oxygen / r.max) * (fed ? 1 : r.supplies.emptyRecoveryMul),
    staminaCapLimit: fed ? r.max : r.supplies.emptyStaminaCap,
    climbSpeedMul: s.bodyTemp < r.temperature.slowClimbBelow ? r.temperature.coldClimbSpeedMul : 1,
  };
}

/** Most severe active warning (M2a spec §5). */
export function topWarning(s: SurvivalState, r: SurvivalRules): Warning | null {
  if (s.oxygen < r.oxygen.warnCritical) return 'oxygenCritical';
  if (s.bodyTemp < r.temperature.warnHypothermia) return 'hypothermia';
  if (s.oxygen < r.oxygen.warnLow) return 'oxygenLow';
  if (s.bodyTemp < r.temperature.warnCold) return 'cold';
  if (s.supplies < r.supplies.warnLow) return 'suppliesLow';
  return null;
}

export function startBottle(
  s: SurvivalState,
  r: SurvivalRules,
): { state: SurvivalState; result: 'started' | 'active' | 'empty' } {
  if (s.o2SecondsLeft > 0) return { state: s, result: 'active' };
  if (s.inventory.o2 <= 0) return { state: s, result: 'empty' };
  return {
    state: {
      ...s,
      inventory: { ...s.inventory, o2: s.inventory.o2 - 1 },
      o2SecondsLeft: r.oxygen.bottleSeconds,
    },
    result: 'started',
  };
}

/**
 * Effects of a completed rest at a camp (M2a spec §4.5). Stamina is restored by Player.
 * `acclimatize` is false when this camp already granted its acclimatization.
 */
export function restAtCamp(
  s: SurvivalState,
  altitudeM: number,
  r: SurvivalRules,
  acclimatize: boolean,
): SurvivalState {
  const rested: SurvivalState = {
    ...s,
    acclimatizationM: acclimatize
      ? Math.min(r.acclimatization.maxM, s.acclimatizationM + r.acclimatization.perRestM)
      : s.acclimatizationM,
    bodyTemp: r.max,
    supplies: Math.max(0, s.supplies - r.supplies.restCost),
  };
  return { ...rested, oxygen: ceilingAt(rested, altitudeM, r) };
}

/** State after a respawn at a camp (M2a spec §4.6). */
export function respawnSurvival(
  s: SurvivalState,
  altitudeM: number,
  r: SurvivalRules,
): SurvivalState {
  const base: SurvivalState = {
    ...s,
    inventory: loseOnRespawn(s.inventory, r.respawnItemLossFraction),
    bodyTemp: r.max,
    supplies: Math.max(s.supplies, r.supplies.respawnMin),
    o2SecondsLeft: 0,
  };
  return { ...base, oxygen: ceilingAt(base, altitudeM, r) };
}
