import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import type { RouteDef } from '../world/terrainData';
import { RouteGuide } from './RouteGuide';

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

function setup() {
  const parent = new THREE.Group();
  const guide = new RouteGuide(parent);
  guide.setRoute(route, 'High Camp');
  const ribbon = () => parent.getObjectByName('route-ribbon') as THREE.Mesh | undefined;
  return { parent, guide, ribbon };
}

describe('RouteGuide', () => {
  it('builds a ribbon strip and instanced markers', () => {
    const { parent, ribbon } = setup();
    expect(ribbon()!.geometry.index!.count).toBe(50 * 6);
    expect((parent.getObjectByName('route-marker-poles') as THREE.InstancedMesh).count).toBe(9);
    expect((parent.getObjectByName('route-marker-flags') as THREE.InstancedMesh).count).toBe(9);
  });

  it('draws only the window around the player', () => {
    const { guide, ribbon } = setup();
    guide.update({ x: 0, y: 5000, z: 0 }, 0);
    expect(ribbon()!.geometry.drawRange).toMatchObject({ start: 0, count: 21 * 6 });
    guide.update({ x: 0, y: 5000, z: -500 }, 0);
    expect(ribbon()!.geometry.drawRange).toMatchObject({ start: 22 * 6, count: 24 * 6 });
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
