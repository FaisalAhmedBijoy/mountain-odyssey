import { afterEach, describe, expect, it } from 'vitest';
import type { TerrainManifest } from '../world/terrainData';
import { PhysicsWorld } from './PhysicsWorld';

const manifest: TerrainManifest = {
  id: 't',
  spacingM: 1,
  tileSamples: 5,
  tilesX: 1,
  tilesZ: 1,
  originX: 0,
  originZ: 0,
  minHeightM: 0,
  maxHeightM: 20,
  backdrop: { file: 'backdrop.u16', samples: 2, spacingM: 4 },
  camps: [],
  attribution: '',
};

// height = x + 2z: asymmetric, so a transposed row/column mapping is caught.
const heights = new Float32Array(25);
for (let z = 0; z < 5; z++) for (let x = 0; x < 5; x++) heights[z * 5 + x] = x + 2 * z;

let physics: PhysicsWorld | null = null;
afterEach(() => physics?.dispose());

async function worldWithTile() {
  physics = await PhysicsWorld.create(-9.81);
  physics.addTerrainTile({ tx: 0, tz: 0, heights }, manifest);
  physics.step(1 / 60);
  return physics;
}

const down = { x: 0, y: -1, z: 0 };

describe('PhysicsWorld terrain', () => {
  it('places heightfield samples at the right world positions', async () => {
    const p = await worldWithTile();
    expect(p.castRay({ x: 1, y: 100, z: 3 }, down, 200)!.point.y).toBeCloseTo(7, 3);
    expect(p.castRay({ x: 3.5, y: 100, z: 0.5 }, down, 200)!.point.y).toBeCloseTo(4.5, 3);
  });

  it('reports hit distance and an upward-facing normal', async () => {
    const p = await worldWithTile();
    const hit = p.castRay({ x: 2, y: 50, z: 2 }, down, 200)!;
    expect(hit.distance).toBeCloseTo(44, 3);
    expect(hit.normal.y).toBeGreaterThan(0);
  });

  it('removes terrain tiles by key', async () => {
    const p = await worldWithTile();
    expect(p.terrainTileKeys()).toEqual(['0_0']);
    p.removeTerrainTile('0_0');
    p.step(1 / 60);
    expect(p.hasTerrainTile('0_0')).toBe(false);
    expect(p.castRay({ x: 1, y: 100, z: 3 }, down, 200)).toBeNull();
  });
});
