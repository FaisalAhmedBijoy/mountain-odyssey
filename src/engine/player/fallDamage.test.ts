import { describe, expect, it } from 'vitest';
import { GAME_CONFIG } from '../config/game.config';
import { classifyFall } from './fallDamage';

const r = GAME_CONFIG.fall;

describe('classifyFall', () => {
  it.each([
    [0, 'none'],
    [5.99, 'none'],
    [6, 'injury'],
    [15, 'injury'],
    [15.01, 'fatal'],
  ] as const)('a %s m drop is %s', (drop, outcome) => {
    expect(classifyFall(drop, r)).toBe(outcome);
  });
});
