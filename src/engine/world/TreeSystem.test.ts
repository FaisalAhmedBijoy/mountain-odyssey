import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import type { TerrainManifest } from './terrainData';
import { CROWN_COLORS, TreeSystem, TRUNK_COLOR } from './TreeSystem';

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

  it('colours trees with the sRGB constants converted to linear exactly once', () => {
    const scene = new THREE.Scene();
    const trees = new TreeSystem(scene, manifest, ground, rules);
    for (let i = 0; i < 20; i++) trees.update(160, 160);
    const lin = (hex: number): number[] =>
      [16, 8, 0].map((shift) => {
        const c = ((hex >> shift) & 0xff) / 255;
        return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
      });
    const expected = [TRUNK_COLOR, ...CROWN_COLORS].map(lin);
    const crowns = CROWN_COLORS.map(lin);
    const geometries = new Set<THREE.BufferGeometry>();
    scene.traverse((o) => {
      if (o instanceof THREE.InstancedMesh) geometries.add(o.geometry);
    });
    expect(geometries.size).toBeGreaterThan(0);
    let crownVertices = 0;
    for (const geo of geometries) {
      const col = geo.getAttribute('color');
      for (let i = 0; i < col.count; i++) {
        const rgb = [col.getX(i), col.getY(i), col.getZ(i)];
        const close = (e: number[]): boolean => e.every((v, k) => Math.abs(v - rgb[k]) < 1e-5);
        expect(expected.some(close), `vertex colour ${rgb.join(',')}`).toBe(true);
        if (crowns.some(close)) crownVertices++;
      }
    }
    expect(crownVertices).toBeGreaterThan(0);
    trees.dispose();
  });
});
