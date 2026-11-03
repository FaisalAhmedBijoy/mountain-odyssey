import { describe, expect, it } from 'vitest';
import { GAME_CONFIG } from '../config/game.config';
import { buildGridGeometry, type GridGeometryArgs } from './gridGeometry';

function args(overrides: Partial<GridGeometryArgs> = {}): GridGeometryArgs {
  return {
    heights: new Float32Array(25).fill(5000),
    samplesX: 5,
    samplesZ: 5,
    step: 1,
    spacingM: 2,
    originX: 100,
    originZ: 200,
    skirtDepthM: 10,
    surface: GAME_CONFIG.surface,
    ...overrides,
  };
}

describe('buildGridGeometry', () => {
  it('builds a full-resolution grid with skirts', () => {
    const g = buildGridGeometry(args());
    expect(g.positions.length).toBe((25 + 20) * 3);
    expect(g.indices.length).toBe(16 * 6 + 16 * 6);
    expect([g.positions[3], g.positions[4], g.positions[5]]).toEqual([102, 5000, 200]);
  });

  it('drops resolution with a larger step', () => {
    const g = buildGridGeometry(args({ step: 2 }));
    expect(g.positions.length).toBe((9 + 12) * 3);
    expect(g.indices.length).toBe(4 * 6 + 8 * 6);
  });

  it('rejects a step that does not divide the grid', () => {
    expect(() => buildGridGeometry(args({ step: 3 }))).toThrow(/must divide/);
  });

  it('lowers skirt vertices by the skirt depth', () => {
    const g = buildGridGeometry(args());
    expect(g.positions[25 * 3 + 1]).toBe(4990);
  });

  it('gives flat ground an upward normal and counter-clockwise triangles', () => {
    const g = buildGridGeometry(args({ skirtDepthM: 0 }));
    expect([g.normals[0], g.normals[1], g.normals[2]]).toEqual([0, 1, 0]);
    const [a, b, c] = [g.indices[0], g.indices[1], g.indices[2]];
    const p = (i: number) => [g.positions[i * 3], g.positions[i * 3 + 1], g.positions[i * 3 + 2]];
    const [pa, pb, pc] = [p(a), p(b), p(c)];
    const e1 = [pb[0] - pa[0], pb[2] - pa[2]];
    const e2 = [pc[0] - pa[0], pc[2] - pa[2]];
    // y component of cross(e1, e2) = e1.z * e2.x - e1.x * e2.z must be positive (faces up)
    expect(e1[1] * e2[0] - e1[0] * e2[1]).toBeGreaterThan(0);
  });

  it('winds every skirt face outward', () => {
    const g = buildGridGeometry(args());
    const p = (i: number) => [g.positions[i * 3], g.positions[i * 3 + 1], g.positions[i * 3 + 2]];
    expect(g.indices.length).toBe(192);
    for (let k = 96; k < g.indices.length; k += 3) {
      const [a, b, c] = [p(g.indices[k]), p(g.indices[k + 1]), p(g.indices[k + 2])];
      const e1 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
      const e2 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
      const nrmX = e1[1] * e2[2] - e1[2] * e2[1];
      const nrmZ = e1[0] * e2[1] - e1[1] * e2[0];
      const cx = (a[0] + b[0] + c[0]) / 3;
      const cz = (a[2] + b[2] + c[2]) / 3;
      expect(nrmX * (cx - 104) + nrmZ * (cz - 204)).toBeGreaterThan(0);
    }
  });

  it('gives edge vertices the same slope as interior vertices', () => {
    const heights = new Float32Array(25).map((_, i) => 5000 + (i % 5));
    const g = buildGridGeometry(args({ heights, skirtDepthM: 0 }));
    const len = Math.hypot(0.5, 1);
    for (const v of [0, 2, 12]) {
      expect(g.normals[v * 3]).toBeCloseTo(-0.5 / len, 5);
      expect(g.normals[v * 3 + 1]).toBeCloseTo(1 / len, 5);
      expect(g.normals[v * 3 + 2]).toBeCloseTo(0, 5);
    }
  });

  it('skips cells inside the hole', () => {
    const g = buildGridGeometry(
      args({ skirtDepthM: 0, hole: { minX: 100, minZ: 200, maxX: 108, maxZ: 208 } }),
    );
    expect(g.indices.length).toBe(0);
  });

  it('colours snow brighter than rock', () => {
    const rock = buildGridGeometry(args({ skirtDepthM: 0 }));
    const snow = buildGridGeometry(
      args({ skirtDepthM: 0, heights: new Float32Array(25).fill(5350) }),
    );
    expect(snow.colors[0]).toBeGreaterThan(rock.colors[0] * 1.5);
  });
});
