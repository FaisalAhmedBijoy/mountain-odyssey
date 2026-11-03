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

export function updateStamina(
  s: StaminaState,
  state: MoveState,
  moving: boolean,
  dt: number,
  r: StaminaRules,
): StaminaState {
  return { value: clamp(s.value + staminaRate(state, moving, r) * dt, 0, s.cap), cap: s.cap };
}

export function applyInjury(s: StaminaState, penalty: number, r: StaminaRules): StaminaState {
  const cap = Math.max(r.minCap, s.cap - penalty);
  return { value: Math.min(s.value, cap), cap };
}
