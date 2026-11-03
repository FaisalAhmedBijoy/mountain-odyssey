import { describe, expect, it } from 'vitest';
import {
  add,
  clamp,
  cross,
  degToRad,
  dot,
  length,
  lerp,
  normalize,
  radToDeg,
  scale,
  sub,
  vec3,
} from './math';

describe('math', () => {
  it('adds, subtracts, scales and dots', () => {
    expect(add(vec3(1, 2, 3), vec3(1, 1, 1))).toEqual({ x: 2, y: 3, z: 4 });
    expect(sub(vec3(1, 2, 3), vec3(1, 1, 1))).toEqual({ x: 0, y: 1, z: 2 });
    expect(scale(vec3(1, 2, 3), 2)).toEqual({ x: 2, y: 4, z: 6 });
    expect(dot(vec3(1, 2, 3), vec3(4, 5, 6))).toBe(32);
  });

  it('crosses forward (-Z) with up to get right (+X)', () => {
    expect(cross(vec3(0, 0, -1), vec3(0, 1, 0))).toEqual({ x: 1, y: 0, z: 0 });
  });

  it('normalizes, keeping the zero vector at zero', () => {
    expect(length(normalize(vec3(3, 4, 0)))).toBeCloseTo(1);
    expect(normalize(vec3())).toEqual({ x: 0, y: 0, z: 0 });
  });

  it('lerps, clamps and converts angles', () => {
    expect(lerp(vec3(0, 0, 0), vec3(10, 20, 30), 0.5)).toEqual({ x: 5, y: 10, z: 15 });
    expect(clamp(5, 0, 3)).toBe(3);
    expect(clamp(-1, 0, 3)).toBe(0);
    expect(radToDeg(degToRad(45))).toBeCloseTo(45);
  });
});
