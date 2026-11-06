import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import type { TerrainManifest } from './terrainData';
import { TreeSystem } from './TreeSystem';

// 5 x 5 tiles of 64 m (65 samples at 1 m), origin at 0,0.
const manifest: TerrainManifest = {
  id: 't',
  spacingM: 1,
  tileSamples: 65,
  tilesX: 5,
  tilesZ: 5,
  originX: 0,
  originZ: 0,
  minHeightM: 0,
  maxHeightM: 10,
  backdrop: { file: 'b.u16', samples: 2, spacingM: 320 },
  camps: [],
  routes: [],
  attribution: '',
};
const ground = { heightAt: () => 1, slopeDegAt: () => 5, hasTile: () => true };
const rules = {
  seed: 1,
  spacingM: 8,
  density: 0.5,
  maxSlopeDeg: 40,
  routeClearanceM: 4,
  campClearanceM: 20,
  minScale: 0.8,
  maxScale: 1.4,
  ringRadius: 1,
  castShadow: false,
};

describe('TreeSystem', () => {
  it('builds at most one tile per update and fills the 3 x 3 ring', () => {
    const scene = new THREE.Scene();
    const trees = new TreeSystem(scene, manifest, ground, rules);
    trees.update(160, 160); // centre tile (2, 2)
    expect(trees.tileCount).toBe(1);
    for (let i = 0; i < 20; i++) trees.update(160, 160);
    expect(trees.tileCount).toBe(9);
    expect(scene.children.length).toBeGreaterThan(0);
    trees.dispose();
    expect(scene.children.length).toBe(0);
  });

  it('drops tiles that leave the ring', () => {
    const scene = new THREE.Scene();
    const trees = new TreeSystem(scene, manifest, ground, rules);
    for (let i = 0; i < 20; i++) trees.update(32, 32); // corner tile (0, 0): 2 x 2 ring
    expect(trees.tileCount).toBe(4);
    for (let i = 0; i < 20; i++) trees.update(288, 288); // far corner (4, 4)
    expect(trees.tileCount).toBe(4);
  });

  it('waits for tiles whose terrain is not loaded', () => {
    const scene = new THREE.Scene();
    const trees = new TreeSystem(scene, manifest, { ...ground, hasTile: () => false }, rules);
    for (let i = 0; i < 5; i++) trees.update(160, 160);
    expect(trees.tileCount).toBe(0);
  });
});
