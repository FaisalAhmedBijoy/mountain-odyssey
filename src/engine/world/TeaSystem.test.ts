import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import type { TerrainManifest } from './terrainData';
import { HEDGE_SIDE_COLOR, HEDGE_TOP_COLOR, TeaSystem } from './TeaSystem';

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
    const previous = [...scene.children];
    for (let i = 0; i < 50; i++) tea.update(300, 300);
    expect(tea.cellCount).toBe(before);
    expect(scene.children.length).toBe(tea.cellCount);
    for (const m of previous) expect(scene.children).not.toContain(m);
    for (const m of scene.children) {
      expect((m as THREE.InstancedMesh).count).toBeGreaterThan(0);
    }
  });

  it('keeps built cells when the player moves a little (hysteresis)', () => {
    const scene = new THREE.Scene();
    const tea = new TeaSystem(scene, manifest, ground, rules);
    for (let i = 0; i < 50; i++) tea.update(0, 0);
    const before = [...scene.children];
    for (let i = 0; i < 50; i++) tea.update(20, 0);
    for (const m of before) expect(scene.children).toContain(m);
    for (let i = 0; i < 50; i++) tea.update(0, 0);
    for (const m of before) expect(scene.children).toContain(m);
  });

  it('colours hedges with the sRGB constants converted to linear exactly once', () => {
    const scene = new THREE.Scene();
    const tea = new TeaSystem(scene, manifest, ground, rules);
    tea.update(0, 0);
    const geo = (scene.children[0] as THREE.InstancedMesh).geometry;
    const pos = geo.getAttribute('position');
    const col = geo.getAttribute('color');
    expect(col.itemSize).toBe(3);
    expect(col.count).toBe(pos.count);
    const lin = (hex: number, shift: number): number => {
      const c = ((hex >> shift) & 0xff) / 255;
      return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    };
    const expectColor = (i: number, hex: number): void => {
      expect(col.getX(i)).toBeCloseTo(lin(hex, 16), 5);
      expect(col.getY(i)).toBeCloseTo(lin(hex, 8), 5);
      expect(col.getZ(i)).toBeCloseTo(lin(hex, 0), 5);
    };
    let tops = 0;
    let bottoms = 0;
    const a = new THREE.Vector3();
    const b = new THREE.Vector3();
    const c = new THREE.Vector3();
    for (let i = 0; i < pos.count; i += 3) {
      a.fromBufferAttribute(pos, i);
      b.fromBufferAttribute(pos, i + 1);
      c.fromBufferAttribute(pos, i + 2);
      const ny = b.clone().sub(a).cross(c.clone().sub(a)).normalize().y;
      if (ny > 0.99) {
        tops++;
        for (let k = 0; k < 3; k++) expectColor(i + k, HEDGE_TOP_COLOR);
      } else if (ny < -0.99) {
        bottoms++;
        for (let k = 0; k < 3; k++) expectColor(i + k, HEDGE_SIDE_COLOR);
      }
    }
    expect(tops).toBeGreaterThan(0);
    expect(bottoms).toBeGreaterThan(0);
    tea.dispose();
  });
});
