import { describe, expect, it } from 'vitest';
import type { CampDef } from '../world/terrainData';
import { campAt, isNearCamp } from './camps';

const camps: CampDef[] = [
  { id: 'khare', name: 'Khare', position: [0, 5000, 800] },
  { id: 'high-camp', name: 'High Camp', position: [0, 5248, 0] },
];
const zone = { radiusM: 15, maxHeightDiffM: 10 };

describe('camps', () => {
  it('is near a camp within the radius and the height window', () => {
    expect(isNearCamp({ x: 10, y: 5250, z: 5 }, camps[1]!, zone)).toBe(true);
    expect(isNearCamp({ x: 20, y: 5248, z: 0 }, camps[1]!, zone)).toBe(false);
    expect(isNearCamp({ x: 0, y: 5270, z: 0 }, camps[1]!, zone)).toBe(false);
  });

  it('finds the camp the feet are at, or null', () => {
    expect(campAt({ x: 3, y: 5001, z: 797 }, camps, zone)?.id).toBe('khare');
    expect(campAt({ x: 0, y: 5100, z: 400 }, camps, zone)).toBeNull();
  });
});
