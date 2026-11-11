import { describe, expect, it } from 'vitest';
import { GAME_CONFIG } from '../config/game.config';
import { resolveClips, toonGradientData } from './toonMath';

describe('toonGradientData', () => {
  it('turns levels into bytes', () => {
    expect(toonGradientData([0.62, 1])).toEqual(Uint8Array.of(158, 255));
  });
  it('clamps levels to 0–1', () => {
    expect(toonGradientData([-1, 2])).toEqual(Uint8Array.of(0, 255));
  });
  it('rejects an empty list', () => {
    expect(() => toonGradientData([])).toThrow();
  });
});

describe('resolveClips', () => {
  it('keeps the robot clips as before', () => {
    expect(
      resolveClips(['Idle', 'Walking', 'Running', 'Jump'], GAME_CONFIG.character.clips),
    ).toEqual({ idle: 'Idle', walk: 'Walking', run: 'Running', fall: 'Jump', climb: 'Walking' });
  });
  it('gives null for clips the model lacks', () => {
    expect(resolveClips([], GAME_CONFIG.character.clips)).toEqual({
      idle: null,
      walk: null,
      run: null,
      fall: null,
      climb: null,
    });
  });
});
