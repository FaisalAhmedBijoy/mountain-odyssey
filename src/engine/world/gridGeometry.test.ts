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
