import type { Surface } from '../world/surface';

export type MoveState = 'walk' | 'run' | 'slide' | 'climb' | 'fall';

export interface MoveInput {
  forward: number;
  right: number;
  run: boolean;
  /** True only on the step the key was pressed. */
  grab: boolean;
  /** True only on the step the key was pressed. */
  jump: boolean;
}

export const NO_INPUT: MoveInput = { forward: 0, right: 0, run: false, grab: false, jump: false };

export interface WallInfo {
  slopeDeg: number;
  surface: Surface;
  climbable: boolean;
}

export interface MoveContext {
  grounded: boolean;
  groundSlopeDeg: number;
  wall: WallInfo | null;
  stamina: number;
}

export interface MovementRules {
  maxWalkSlopeDeg: number;
  maxRunSlopeDeg: number;
  minClimbSlopeDeg: number;
  runMinStamina: number;
}

export const isMoving = (i: MoveInput): boolean => i.forward !== 0 || i.right !== 0;

/** Pure movement state transitions (spec §5.1). */
export function nextMoveState(
  current: MoveState,
  input: MoveInput,
  ctx: MoveContext,
  rules: MovementRules,
): MoveState {
  const wall = ctx.wall;
  const steepWall = wall !== null && wall.slopeDeg >= rules.minClimbSlopeDeg;
  const climbableWall = steepWall && wall !== null && wall.climbable;

  if (current === 'climb') {
    if (ctx.stamina <= 0 || input.jump) return 'fall';
    if (ctx.grounded && input.forward < 0) return 'walk';
    if (!steepWall) return 'walk';
    if (!climbableWall) return 'fall';
    return 'climb';
  }

  if (input.grab && climbableWall && ctx.stamina > 0) return 'climb';
  if (!ctx.grounded) return 'fall';
  if (ctx.groundSlopeDeg >= rules.maxWalkSlopeDeg) return 'slide';

  const staminaOk = current === 'run' ? ctx.stamina > 0 : ctx.stamina > rules.runMinStamina;
  if (input.run && isMoving(input) && staminaOk && ctx.groundSlopeDeg < rules.maxRunSlopeDeg) {
    return 'run';
  }
  return 'walk';
}
