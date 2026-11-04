import { describe, expect, it } from 'vitest';
import type { RouteDef } from '../world/terrainData';
import { activeRoute, bearingTo, guideTarget, progressAlong } from './routeMath';

// 100 m straight north (toward -Z), a point every 20 m, rising 1 m per point.
const north: RouteDef = {
  from: 'a',
  to: 'b',
  lengthM: 100,
  points: Array.from({ length: 6 }, (_, i) => [0, i, -20 * i] as [number, number, number]),
  markers: [],
};

describe('activeRoute', () => {
  it('finds the route leaving a camp, or null', () => {
    expect(activeRoute([north], 'a')).toBe(north);
    expect(activeRoute([north], 'b')).toBeNull();
    expect(activeRoute(undefined, 'a')).toBeNull();
  });
});

describe('progressAlong', () => {
  it('projects onto the route', () => {
    const p = progressAlong(north, { x: 0, y: 0, z: -10 });
    expect(p.index).toBe(0);
    expect(p.t).toBeCloseTo(0.5);
    expect(p.offRouteM).toBeCloseTo(0);
    expect(p.remainingM).toBeCloseTo(Math.hypot(20, 1) * 4.5);
  });

  it('measures how far the player is from the route', () => {
    expect(progressAlong(north, { x: 5, y: 0, z: -50 }).offRouteM).toBeCloseTo(5);
  });

  it('clamps past the end', () => {
    const p = progressAlong(north, { x: 0, y: 0, z: -150 });
    expect(p.remainingM).toBeCloseTo(0);
    expect(p.offRouteM).toBeCloseTo(50);
  });
});

describe('guideTarget', () => {
  it('looks ahead along the route when on it', () => {
    const t = guideTarget(north, progressAlong(north, { x: 0, y: 0, z: -10 }), 30, 40);
    expect(t.x).toBeCloseTo(0);
    expect(t.z).toBeCloseTo(-40);
  });

  it('stops at the end of the route', () => {
    const t = guideTarget(north, progressAlong(north, { x: 0, y: 0, z: -95 }), 30, 40);
    expect(t.z).toBeCloseTo(-100);
  });

  it('points back to the nearest route point when off the route', () => {
    const t = guideTarget(north, progressAlong(north, { x: 60, y: 0, z: -50 }), 30, 40);
    expect(t.x).toBeCloseTo(0);
    expect(t.z).toBeCloseTo(-50);
  });
});

describe('bearingTo', () => {
  const origin = { x: 0, y: 0, z: 0 };
  it('is 0 straight ahead and positive to the right (camera yaw 0 looks north)', () => {
    expect(bearingTo(origin, { x: 0, y: 0, z: -10 }, 0)).toBeCloseTo(0);
    expect(bearingTo(origin, { x: 10, y: 0, z: 0 }, 0)).toBeCloseTo(Math.PI / 2);
    expect(bearingTo(origin, { x: -10, y: 0, z: 0 }, 0)).toBeCloseTo(-Math.PI / 2);
  });

  it('follows the camera yaw', () => {
    // yaw -PI/2 looks east, so an eastern target is straight ahead
    expect(bearingTo(origin, { x: 10, y: 0, z: 0 }, -Math.PI / 2)).toBeCloseTo(0);
  });
});
