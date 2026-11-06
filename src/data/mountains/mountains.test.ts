import { describe, expect, it } from 'vitest';
import { isBiomeId } from '../../engine/config/game.config';
import { getMountain } from '.';

describe('mountains', () => {
  it('declares a known biome for every mountain', () => {
    for (const id of ['mera-peak', 'test-peak']) {
      const m = getMountain(id);
      expect(m).not.toBeNull();
      expect(isBiomeId(m!.biome)).toBe(true);
    }
  });
});
