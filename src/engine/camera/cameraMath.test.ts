import { describe, expect, it } from 'vitest';
import { orbitOffset, resolveCameraPosition, smoothFactor } from './cameraMath';

const flat = () => 0;

describe('orbitOffset', () => {
  it('places the camera behind (+Z) a target when yaw is 0', () => {
    const o = orbitOffset(0, 0, 5);
    expect(o.x).toBeCloseTo(0);
    expect(o.y).toBeCloseTo(0);
    expect(o.z).toBeCloseTo(5);
  });
  it('raises the camera with positive pitch', () => {
    expect(orbitOffset(0, Math.PI / 2, 5).y).toBeCloseTo(5);
  });
});

describe('resolveCameraPosition', () => {
  const target = { x: 0, y: 1.5, z: 0 };

  it('keeps an unobstructed position', () => {
    const desired = { x: 0, y: 3, z: 5 };
    expect(resolveCameraPosition(target, desired, flat, 0.4)).toEqual(desired);
  });

  it('pulls the camera in front of a hill', () => {
    const hill = (_x: number, z: number) => (z > 2 ? 10 : 0);
    const p = resolveCameraPosition(target, { x: 0, y: 3, z: 6 }, hill, 0.4);
    expect(p.z).toBeLessThanOrEqual(2.01);
  });

  it('never ends below the ground plus padding', () => {
    const p = resolveCameraPosition(target, { x: 0, y: -2, z: 5 }, flat, 0.4);
    expect(p.y).toBeGreaterThanOrEqual(0.4);
  });
});

describe('smoothFactor', () => {
  it('is 0 for no time and approaches 1 for long frames', () => {
    expect(smoothFactor(10, 0)).toBe(0);
    expect(smoothFactor(10, 10)).toBeCloseTo(1);
  });
});
