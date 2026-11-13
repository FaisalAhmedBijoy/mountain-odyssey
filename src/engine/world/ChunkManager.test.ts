import * as THREE from 'three';
import { afterEach, describe, expect, it } from 'vitest';
import { GAME_CONFIG } from '../config/game.config';
import { PhysicsWorld } from '../physics/PhysicsWorld';
import { ChunkManager, chunkBounds, colliderChunks, desiredChunks } from './ChunkManager';
import type { GridGeometryArgs } from './gridGeometry';
import { SyncMeshBuilder } from './meshBuilder';
import type { SurfaceMask } from './surfaceMask';
import type { TerrainManifest } from './terrainData';
import { TerrainSampler } from './TerrainSampler';

describe('chunk planning', () => {
  const rings = GAME_CONFIG.terrain.lodRings;

  it('covers a 7x7 area with LOD steps by ring', () => {
    const chunks = desiredChunks(5, 5, 24, 24, rings);
    expect(chunks).toHaveLength(49);
    expect(chunks.filter((c) => c.step === 1)).toEqual([{ tx: 5, tz: 5, step: 1 }]);
    expect(chunks.filter((c) => c.step === 2)).toHaveLength(8);
    expect(chunks.filter((c) => c.step === 8)).toHaveLength(16);
    expect(chunks.filter((c) => c.step === 32)).toHaveLength(24);
  });

  it('clips at the world edge', () => {
    expect(desiredChunks(0, 0, 24, 24, rings)).toHaveLength(16);
    expect(colliderChunks(0, 0, 24, 24)).toHaveLength(4);
    expect(colliderChunks(5, 5, 24, 24)).toHaveLength(9);
  });

  it('computes world bounds of a chunk set', () => {
    const m = { originX: -10, originZ: -20, tileSamples: 5, spacingM: 2 } as TerrainManifest;
    expect(
      chunkBounds(
        [
          { tx: 0, tz: 0, step: 1 },
          { tx: 1, tz: 2, step: 1 },
        ],
        m,
      ),
    ).toEqual({
      minX: -10,
      minZ: -20,
      maxX: 6,
      maxZ: 4,
    });
  });
});

const manifest: TerrainManifest = {
  id: 't',
  spacingM: 1,
  tileSamples: 5,
  tilesX: 3,
  tilesZ: 3,
  originX: 0,
  originZ: 0,
  minHeightM: 0,
  maxHeightM: 10,
  backdrop: { file: 'backdrop.u16', samples: 7, spacingM: 2 },
  camps: [],
  attribution: '',
};

const fakeFetch = (async (url: string) =>
  new Response(new Uint16Array(url.includes('backdrop') ? 49 : 25).buffer)) as typeof fetch;

let physics: PhysicsWorld | null = null;
afterEach(() => physics?.dispose());

class RecordingBuilder extends SyncMeshBuilder {
  readonly calls: GridGeometryArgs[] = [];
  override async build(args: GridGeometryArgs) {
    this.calls.push(args);
    return super.build(args);
  }
}

async function setup(opts: { glacier?: SurfaceMask | null; builder?: SyncMeshBuilder } = {}) {
  physics = await PhysicsWorld.create(-9.81);
  const group = new THREE.Group();
  const sampler = new TerrainSampler(manifest);
  const manager = new ChunkManager({
    manifest,
    baseUrl: '/terrain/t',
    parent: group,
    physics,
    sampler,
    builder: opts.builder ?? new SyncMeshBuilder(),
    glacier: opts.glacier,
    material: new THREE.MeshBasicMaterial(),
    rings: [
      { maxRing: 0, step: 1 },
      { maxRing: 1, step: 2 },
    ],
    skirtDepthM: 20,
    surface: GAME_CONFIG.surface,
    palette: GAME_CONFIG.biomes.himalaya.palette,
    fetchFn: fakeFetch,
  });
  await manager.loadBackdrop();
  return { manager, group, physics, sampler };
}

const chunkMeshes = (g: THREE.Group) => g.children.filter((c) => c.name.startsWith('terrain-'));

describe('ChunkManager', () => {
  it('gives each tile a crop of the glacier mask and the backdrop a sampled copy', async () => {
    const m = manifest;
    const size = (m.tileSamples - 1) * m.tilesX * m.spacingM;
    const n = size / m.spacingM + 1;
    const glacier = {
      samplesX: n,
      samplesZ: n,
      spacingM: m.spacingM,
      originX: m.originX,
      originZ: m.originZ,
      data: new Uint8Array(n * n).fill(1),
    };
    const builder = new RecordingBuilder();
    const { manager } = await setup({ glacier, builder });
    expect(manager.backdropGlacier).toMatchObject({
      samplesX: m.backdrop.samples,
      spacingM: m.backdrop.spacingM,
    });
    await manager.update(0, 0);
    const tileCall = builder.calls.find((c) => c.skirtDepthM > 0)!;
    expect(tileCall.glacier).toBeDefined();
    expect(tileCall.glacier!.samplesX).toBeLessThan(n + 1);
    const backdropCall = builder.calls.find((c) => c.hole)!;
    expect(backdropCall.glacier).toBe(manager.backdropGlacier);
  });

  it('loads meshes, colliders and sampler data around the player', async () => {
    const { manager, group, physics, sampler } = await setup();
    await manager.update(6, 6);
    expect(chunkMeshes(group)).toHaveLength(10);
    expect(physics.terrainTileKeys()).toHaveLength(9);
    expect(sampler.heightAt(6, 6)).toBeCloseTo(0);
    const centre = group.getObjectByName('terrain-1_1') as THREE.Mesh;
    expect(centre.geometry.getAttribute('position').count).toBe(25 + 20);
    const corner = group.getObjectByName('terrain-0_0') as THREE.Mesh;
    expect(corner.geometry.getAttribute('position').count).toBe(9 + 12);
    expect(centre.geometry.getAttribute('uv').count).toBe(25 + 20);
    const backdrop = group.getObjectByName('terrain-backdrop') as THREE.Mesh;
    expect(backdrop.geometry.getAttribute('uv')).toBeDefined();
  });

  it('unloads chunks that leave the area', async () => {
    const { manager, group, physics, sampler } = await setup();
    await manager.update(6, 6);
    await manager.update(1, 1);
    expect(chunkMeshes(group)).toHaveLength(5);
    expect(physics.terrainTileKeys()).toHaveLength(4);
    expect(sampler.hasTile(2, 2)).toBe(false);
  });
});
