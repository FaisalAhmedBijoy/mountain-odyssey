import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { GAME_CONFIG } from '../config/game.config';
import type { RouteDef } from '../world/terrainData';
import { RouteGuide, type HeightFn } from './RouteGuide';

const g = GAME_CONFIG.guide;

// 1000 m north (toward -Z), a point every 20 m, nine markers.
const route: RouteDef = {
  from: 'a',
  to: 'b',
  lengthM: 1000,
  points: Array.from({ length: 51 }, (_, i) => [0, 5000, -20 * i] as [number, number, number]),
  markers: Array.from(
    { length: 9 },
    (_, i) => [0, 5000, -100 * (i + 1)] as [number, number, number],
  ),
};

const flat: HeightFn = () => 5000;
/** A 3 m bump centred between the route points at z = -100 and z = -120, plus a cross slope. */
const bumpy: HeightFn = (x, z) => 5000 + 3 * Math.exp(-((z + 110) ** 2) / 20) + 0.4 * x;

function setup(heightAt: HeightFn = flat) {
  const parent = new THREE.Group();
  const guide = new RouteGuide(parent, heightAt);
  guide.setRoute(route, 'High Camp');
  const ribbon = () => parent.getObjectByName('route-ribbon') as THREE.Mesh | undefined;
  return { parent, guide, ribbon };
}

/** Distinct [x, y, z] vertices referenced by the ribbon's current draw range. */
function drawnVertices(mesh: THREE.Mesh): [number, number, number][] {
  const geo = mesh.geometry;
  const index = geo.index!;
  const pos = geo.getAttribute('position');
  const { start, count } = geo.drawRange;
  const ids = new Set<number>();
  for (let i = start; i < Math.min(index.count, start + count); i++) ids.add(index.getX(i));
  return [...ids].map((i) => [pos.getX(i), pos.getY(i), pos.getZ(i)]);
}

describe('RouteGuide', () => {
  it('builds a ribbon sized for the visible window and instanced markers', () => {
    const { parent, ribbon } = setup();
    // 450 m window, a row every 2 m (226 rows), three vertices and four triangles per row gap.
    const rows = Math.ceil((g.behindM + g.aheadM) / g.ribbonVertexSpacingM) + 1;
    expect(ribbon()!.geometry.getAttribute('position').count).toBe(rows * 3);
    expect(ribbon()!.geometry.index!.count).toBe((rows - 1) * 12);
    expect((parent.getObjectByName('route-marker-poles') as THREE.InstancedMesh).count).toBe(9);
    expect((parent.getObjectByName('route-marker-flags') as THREE.InstancedMesh).count).toBe(9);
  });

  it('draws only the window around the player', () => {
    const { guide, ribbon } = setup();
    guide.update({ x: 0, y: 5000, z: 0 }, 0);
    // 0..400 m: 201 rows.
    expect(ribbon()!.geometry.drawRange).toMatchObject({ start: 0, count: 200 * 12 });
    let zs = drawnVertices(ribbon()!).map((v) => v[2]);
    expect(Math.max(...zs)).toBeCloseTo(0);
    expect(Math.min(...zs)).toBeCloseTo(-400);
    guide.update({ x: 0, y: 5000, z: -500 }, 0);
    // 450..900 m: 226 rows.
    expect(ribbon()!.geometry.drawRange).toMatchObject({ start: 0, count: 225 * 12 });
    zs = drawnVertices(ribbon()!).map((v) => v[2]);
    expect(Math.max(...zs)).toBeCloseTo(-450);
    expect(Math.min(...zs)).toBeCloseTo(-900);
  });

  it('drapes every ribbon vertex at least ribbonLiftM above the terrain', () => {
    const { guide, ribbon } = setup(bumpy);
    guide.update({ x: 0, y: 5000, z: 0 }, 0);
    const verts = drawnVertices(ribbon()!);
    expect(verts.length).toBe(201 * 3);
    for (const [x, y, z] of verts) {
      expect(y).toBeGreaterThanOrEqual(bumpy(x, z)! + g.ribbonLiftM - 1e-3);
    }
    // The bump top is covered, not just the route points either side of it.
    const top = verts.find(([x, , z]) => x === 0 && Math.abs(z + 110) < 1e-6)!;
    expect(top[1]).toBeCloseTo(5003 + g.ribbonLiftM, 2);
  });

  it('falls back to the route height where the terrain is not loaded', () => {
    const missing: HeightFn = (_x, z) => (z < -200 ? null : 5010);
    const { guide, ribbon } = setup(missing);
    guide.update({ x: 0, y: 5000, z: 0 }, 0);
    for (const [, y, z] of drawnVertices(ribbon()!)) {
      expect(y).toBeCloseTo((z < -200 ? 5000 : 5010) + g.ribbonLiftM, 2);
    }
  });

  it('refills the same buffers as the window moves', () => {
    const { guide, ribbon } = setup(bumpy);
    const geo = ribbon()!.geometry;
    const positions = geo.getAttribute('position');
    const budget = positions.count;
    for (let z = 0; z >= -1000; z -= 7) {
      guide.update({ x: 0, y: 5000, z }, 0);
      expect(ribbon()!.geometry).toBe(geo);
      expect(geo.getAttribute('position')).toBe(positions);
      expect(positions.count).toBe(budget);
      expect(geo.drawRange.start + geo.drawRange.count).toBeLessThanOrEqual(geo.index!.count);
    }
    const zs = drawnVertices(ribbon()!).map((v) => v[2]);
    expect(Math.min(...zs)).toBeCloseTo(-1000);
  });

  it('offsets the ribbon toward the camera to avoid z-fighting', () => {
    const { ribbon } = setup();
    const material = ribbon()!.material as THREE.Material;
    expect(material.polygonOffset).toBe(true);
    expect(material.polygonOffsetFactor).toBe(-2);
    expect(material.polygonOffsetUnits).toBe(-2);
  });

  it('reports label, remaining distance, bearing and off-route state', () => {
    const { guide } = setup();
    const on = guide.update({ x: 0, y: 5000, z: -500 }, 0)!;
    expect(on.label).toBe('High Camp');
    expect(on.distanceM).toBeCloseTo(500);
    expect(on.bearingRad).toBeCloseTo(0);
    expect(on.offRoute).toBe(false);
    const off = guide.update({ x: 100, y: 5000, z: -500 }, 0)!;
    expect(off.offRoute).toBe(true);
    expect(off.bearingRad).toBeCloseTo(-Math.PI / 2);
  });

  it('toggles only the ribbon', () => {
    const { parent, guide, ribbon } = setup();
    expect(guide.toggleRibbon()).toBe(false);
    expect(ribbon()!.visible).toBe(false);
    expect(parent.getObjectByName('route-marker-poles')!.visible).toBe(true);
    expect(guide.toggleRibbon()).toBe(true);
    expect(ribbon()!.visible).toBe(true);
  });

  it('keeps the ribbon hidden across route changes once toggled off', () => {
    const { guide, ribbon } = setup();
    guide.toggleRibbon();
    guide.setRoute(route, 'High Camp');
    expect(ribbon()!.visible).toBe(false);
  });

  it('clears everything for a null route and on dispose', () => {
    const { parent, guide } = setup();
    guide.setRoute(null, '');
    expect(parent.children).toHaveLength(0);
    expect(guide.update({ x: 0, y: 0, z: 0 }, 0)).toBeNull();
    guide.setRoute(route, 'High Camp');
    guide.dispose();
    expect(parent.children).toHaveLength(0);
  });
});
