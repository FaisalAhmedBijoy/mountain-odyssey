import { describe, expect, it } from 'vitest';
import type { TreeAvoid } from './treePlacement';
import { placeTea, type TeaGround, type TeaRules } from './teaPlacement';

const rules: TeaRules = {
  stepM: 1,
  minSlopeDeg: 3,
  maxSlopeDeg: 20,
  riseM: 1,
  bandFraction: 0.35,
  routeClearanceM: 4,
  campClearanceM: 20,
};
const none: TreeAvoid = { routes: [], camps: [] };
const area = { minX: 0, minZ: 0, maxX: 64, maxZ: 64 };

/** A plane rising `grade` metres per metre toward +z (south), so contours run along x. */
function plane(grade: number): TeaGround {
  const len = Math.hypot(grade, 1);
  const slope = (Math.atan(grade) * 180) / Math.PI;
  return {
    heightAt: (_x, z) => 100 + grade * z,
    slopeDegAt: () => slope,
    normalAt: () => ({ x: 0, y: 1 / len, z: -grade / len }),
  };
}

describe('placeTea', () => {
  it('plants nothing on flat or steep ground', () => {
    expect(placeTea(area, plane(0.02), rules, none)).toEqual([]);
    expect(placeTea(area, plane(0.6), rules, none)).toEqual([]);
  });

  it('plants rows on contours of tea slopes', () => {
    const tea = placeTea(area, plane(0.15), rules, none);
    expect(tea.length).toBeGreaterThan(0);
    for (const t of tea) {
      const f = t.y / rules.riseM - Math.floor(t.y / rules.riseM);
      expect(f).toBeLessThan(rules.bandFraction);
    }
    // Rows run along x: every kept z appears across the whole width.
    const zs = new Set(tea.map((t) => t.z));
    for (const z of zs) expect(tea.filter((t) => t.z === z).length).toBe(64);
  });

  it('turns each hedge along the contour (perpendicular to the slope)', () => {
    for (const t of placeTea(area, plane(0.15), rules, none)) {
      // Hedge long axis is local +X rotated by yaw: (cos yaw, 0, -sin yaw). Contours run along x.
      expect(Math.abs(Math.cos(t.yaw))).toBeCloseTo(1, 9);
    }
  });

  it('is deterministic and seamless across neighbouring areas', () => {
    const g = plane(0.15);
    const whole = placeTea(area, g, rules, none);
    const left = placeTea({ minX: 0, minZ: 0, maxX: 32, maxZ: 64 }, g, rules, none);
    const right = placeTea({ minX: 32, minZ: 0, maxX: 64, maxZ: 64 }, g, rules, none);
    expect(placeTea(area, g, rules, none)).toEqual(whole);
    expect(left.length + right.length).toBe(whole.length);
  });

  it('keeps clear of routes and camps', () => {
    const avoid: TreeAvoid = {
      routes: [
        [
          [32, 0, 0],
          [32, 0, 64],
        ],
      ],
      camps: [[10, 0, 10]],
    };
    for (const t of placeTea(area, plane(0.15), rules, avoid)) {
      expect(Math.abs(t.x - 32)).toBeGreaterThanOrEqual(4);
      expect(Math.hypot(t.x - 10, t.z - 10)).toBeGreaterThanOrEqual(20);
    }
  });
});
