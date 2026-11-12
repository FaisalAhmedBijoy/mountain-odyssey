import { clamp } from '../core/math';
import type { MoveState } from './movementState';

export interface StaminaState {
  value: number;
  cap: number;
}

export interface StaminaRules {
  max: number;
  runDrainPerSec: number;
  climbMoveDrainPerSec: number;
  climbHoldDrainPerSec: number;
  recoveryPerSec: number;
  minCap: number;
}

export const fullStamina = (r: StaminaRules): StaminaState => ({ value: r.max, cap: r.max });

export function staminaRate(state: MoveState, moving: boolean, r: StaminaRules): number {
  switch (state) {
    case 'run':
      return moving ? -r.runDrainPerSec : r.recoveryPerSec;
    case 'climb':
      return moving ? -r.climbMoveDrainPerSec : -r.climbHoldDrainPerSec;
    case 'walk':
      return r.recoveryPerSec;
    default:
      return 0;
  }
}

/** Survival and pack effects on stamina (M2a spec §4.4, M2b spec §3). */
export interface StaminaModifiers {
  recoveryMul: number;
  capLimit: number;
  /** Multiplies drain (negative rates). Default 1. */
  drainMul?: number;
}

const NO_MODIFIERS: StaminaModifiers = { recoveryMul: 1, capLimit: Infinity };

export function updateStamina(
  s: StaminaState,
  state: MoveState,
  moving: boolean,
  dt: number,
  r: StaminaRules,
  mods: StaminaModifiers = NO_MODIFIERS,
): StaminaState {
  const rate = staminaRate(state, moving, r);
  const scaled = rate > 0 ? rate * mods.recoveryMul : rate * (mods.drainMul ?? 1);
  return { value: clamp(s.value + scaled * dt, 0, Math.min(s.cap, mods.capLimit)), cap: s.cap };
}

export function applyInjury(s: StaminaState, penalty: number, r: StaminaRules): StaminaState {
  const cap = Math.max(r.minCap, s.cap - penalty);
  return { value: Math.min(s.value, cap), cap };
}
