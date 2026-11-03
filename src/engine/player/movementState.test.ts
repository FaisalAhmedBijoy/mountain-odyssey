import { describe, expect, it } from 'vitest';
import { GAME_CONFIG } from '../config/game.config';
import { nextMoveState, NO_INPUT, type MoveContext, type MoveInput } from './movementState';

const rules = GAME_CONFIG.movement;
const input = (o: Partial<MoveInput> = {}): MoveInput => ({ ...NO_INPUT, ...o });
const ctx = (o: Partial<MoveContext> = {}): MoveContext => ({
  grounded: true,
  groundSlopeDeg: 0,
  wall: null,
  stamina: 100,
  ...o,
});
const rockWall = { slopeDeg: 80, surface: 'rock' as const, climbable: true };

describe('nextMoveState', () => {
  it('walks on gentle ground', () => {
    expect(nextMoveState('walk', input({ forward: 1 }), ctx(), rules)).toBe('walk');
  });

  it('runs when Shift is held, moving, with stamina, on slopes under 20 degrees', () => {
    const run = input({ forward: 1, run: true });
    expect(nextMoveState('walk', run, ctx(), rules)).toBe('run');
    expect(nextMoveState('walk', run, ctx({ groundSlopeDeg: 25 }), rules)).toBe('walk');
    expect(nextMoveState('walk', run, ctx({ stamina: 10 }), rules)).toBe('walk');
    expect(nextMoveState('walk', input({ run: true }), ctx(), rules)).toBe('walk');
  });

  it('keeps running until stamina is empty', () => {
    const run = input({ forward: 1, run: true });
    expect(nextMoveState('run', run, ctx({ stamina: 5 }), rules)).toBe('run');
    expect(nextMoveState('run', run, ctx({ stamina: 0 }), rules)).toBe('walk');
  });

  it('slides on slopes of 30 degrees or more', () => {
    expect(nextMoveState('walk', input(), ctx({ groundSlopeDeg: 35 }), rules)).toBe('slide');
  });

  it('falls when not grounded', () => {
    expect(nextMoveState('walk', input(), ctx({ grounded: false }), rules)).toBe('fall');
  });

  it('grabs a climbable steep wall with E, even mid-air', () => {
    expect(nextMoveState('walk', input({ grab: true }), ctx({ wall: rockWall }), rules)).toBe(
      'climb',
    );
    expect(
      nextMoveState('fall', input({ grab: true }), ctx({ grounded: false, wall: rockWall }), rules),
    ).toBe('climb');
  });

  it('refuses walls that are too gentle, need gear, or with no stamina', () => {
    const gentle = { ...rockWall, slopeDeg: 45 };
    const ice = { slopeDeg: 80, surface: 'ice' as const, climbable: false };
    expect(nextMoveState('walk', input({ grab: true }), ctx({ wall: gentle }), rules)).toBe('walk');
    expect(nextMoveState('walk', input({ grab: true }), ctx({ wall: ice }), rules)).toBe('walk');
    expect(
      nextMoveState('walk', input({ grab: true }), ctx({ wall: rockWall, stamina: 0 }), rules),
    ).toBe('walk');
  });

  it('stays climbing while the wall continues', () => {
    expect(
      nextMoveState(
        'climb',
        input({ forward: 1 }),
        ctx({ grounded: false, wall: rockWall }),
        rules,
      ),
    ).toBe('climb');
  });

  it('falls off when stamina runs out or Space is pressed', () => {
    expect(nextMoveState('climb', input(), ctx({ wall: rockWall, stamina: 0 }), rules)).toBe(
      'fall',
    );
    expect(nextMoveState('climb', input({ jump: true }), ctx({ wall: rockWall }), rules)).toBe(
      'fall',
    );
  });

  it('falls off when the wall turns unclimbable', () => {
    const ice = { slopeDeg: 80, surface: 'ice' as const, climbable: false };
    expect(
      nextMoveState('climb', input({ forward: 1 }), ctx({ grounded: false, wall: ice }), rules),
    ).toBe('fall');
  });

  it('tops out to walk when the wall ends', () => {
    expect(
      nextMoveState('climb', input({ forward: 1 }), ctx({ grounded: false, wall: null }), rules),
    ).toBe('walk');
  });

  it('steps off at the bottom when climbing down onto ground', () => {
    expect(
      nextMoveState(
        'climb',
        input({ forward: -1 }),
        ctx({ grounded: true, wall: rockWall }),
        rules,
      ),
    ).toBe('walk');
  });
});
