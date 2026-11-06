import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import type { TerrainManifest } from './terrainData';
import { TeaSystem } from './TeaSystem';

const manifest: TerrainManifest = {
  id: 't',
  spacingM: 2,
  tileSamples: 257,
  tilesX: 2,
  tilesZ: 2,
  originX: -512,
  originZ: -512,
  minHeightM: 0,
  maxHeightM: 200,
  backdrop: { file: 'b', samples: 2, spacingM: 1024 },
  camps: [],
  routes: [],
  attribution: '',
};
const grade = 0.15;
const len = Math.hypot(grade, 1);
const ground = {
  heightAt: (_x: number, z: number) => 100 + grade * z,
  slopeDegAt: () => (Math.atan(grade) * 180) / Math.PI,
  normalAt: () => ({ x: 0, y: 1 / len, z: -grade / len }),
};
const rules = {
  stepM: 2,
  minSlopeDeg: 3,
  maxSlopeDeg: 20,
  riseM: 0.8,
  bandFraction: 0.35,
  routeClearanceM: 4,
  campClearanceM: 20,
  radiusM: 100,
  cellSizeM: 64,
  maxCellsPerUpdate: 2,
  castShadow: false,
};

describe('TeaSystem', () => {
  it('builds at most maxCellsPerUpdate cells per update, then fills the radius', () => {
    const scene = new THREE.Scene();
    const tea = new TeaSystem(scene, manifest, ground, rules);
    tea.update(0, 0);
    expect(tea.cellCount).toBe(2);
    for (let i = 0; i < 50; i++) tea.update(0, 0);
    const full = tea.cellCount;
    expect(full).toBeGreaterThan(4);
    expect(scene.children.length).toBe(full);
    tea.dispose();
    expect(scene.children.length).toBe(0);
  });

  it('drops cells that leave the radius', () => {
    const scene = new THREE.Scene();
    const tea = new TeaSystem(scene, manifest, ground, rules);
    for (let i = 0; i < 50; i++) tea.update(-300, -300);
    const before = tea.cellCount;
    for (let i = 0; i < 50; i++) tea.update(300, 300);
    expect(tea.cellCount).toBe(before);
    for (const m of scene.children) {
      expect((m as THREE.InstancedMesh).count).toBeGreaterThan(0);
    }
  });
});
