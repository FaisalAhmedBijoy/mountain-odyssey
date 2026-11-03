import { describe, expect, it } from 'vitest';
import type { TerrainManifest } from './terrainData';
import { isOutOfWorld } from './worldBounds';

// Two 3x3-sample tiles along x at 1 m spacing: the world spans x 0..4, z 0..2.
const manifest: TerrainManifest = {
  id: 't',
  spacingM: 1,
  tileSamples: 3,
  tilesX: 2,
  tilesZ: 1,
  originX: 0,
  originZ: 0,
  minHeightM: 100,
  maxHeightM: 110,
  backdrop: { file: 'backdrop.u16', samples: 3, spacingM: 2 },
  camps: [],
  attribution: '',
};

describe('isOutOfWorld', () => {
  it('is false over the terrain, down to the drop margin below the lowest point', () => {
    expect(isOutOfWorld({ x: 2, y: 105, z: 1 }, manifest, 50)).toBe(false);
    expect(isOutOfWorld({ x: 0, y: 105, z: 0 }, manifest, 50)).toBe(false);
    expect(isOutOfWorld({ x: 4, y: 105, z: 2 }, manifest, 50)).toBe(false);
    expect(isOutOfWorld({ x: 2, y: 50.5, z: 1 }, manifest, 50)).toBe(false);
  });

  it('is true beyond any edge of the world', () => {
    expect(isOutOfWorld({ x: -0.1, y: 105, z: 1 }, manifest, 50)).toBe(true);
    expect(isOutOfWorld({ x: 4.1, y: 105, z: 1 }, manifest, 50)).toBe(true);
    expect(isOutOfWorld({ x: 2, y: 105, z: -0.1 }, manifest, 50)).toBe(true);
    expect(isOutOfWorld({ x: 2, y: 105, z: 2.1 }, manifest, 50)).toBe(true);
  });

  it('is true more than the drop margin below the lowest terrain', () => {
    expect(isOutOfWorld({ x: 2, y: 49.9, z: 1 }, manifest, 50)).toBe(true);
  });
});
