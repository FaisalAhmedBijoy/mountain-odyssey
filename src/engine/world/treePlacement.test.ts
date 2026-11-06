import { describe, expect, it } from 'vitest';
import { placeTrees, type TreeAvoid, type TreeGround, type TreeRules } from './treePlacement';

const rules: TreeRules = {
  seed: 1,
  spacingM: 10,
  density: 1,
  maxSlopeDeg: 40,
  routeClearanceM: 4,
  campClearanceM: 20,
  minScale: 0.8,
  maxScale: 1.4,
};
const flat: TreeGround = { heightAt: () => 100, slopeDegAt: () => 5 };
const none: TreeAvoid = { routes: [], camps: [] };
const area = { minX: 0, minZ: 0, maxX: 200, maxZ: 200 };

describe('placeTrees', () => {
  it('fills a jittered grid inside the area at full density', () => {
    const trees = placeTrees(area, flat, rules, none, 3);
    expect(trees.length).toBeGreaterThan(380);
    expect(trees.length).toBeLessThanOrEqual(420);
    for (const t of trees) {
      expect(t.x).toBeGreaterThanOrEqual(0);
      expect(t.x).toBeLessThan(200);
      expect(t.z).toBeGreaterThanOrEqual(0);
      expect(t.z).toBeLessThan(200);
      expect(t.y).toBe(100);
      expect(t.scale).toBeGreaterThanOrEqual(0.8);
      expect(t.scale).toBeLessThanOrEqual(1.4);
      expect([0, 1, 2]).toContain(t.variant);
    }
  });

  it('is deterministic and seamless across neighbouring areas', () => {
    expect(placeTrees(area, flat, rules, none, 3)).toEqual(placeTrees(area, flat, rules, none, 3));
    const left = placeTrees({ minX: 0, minZ: 0, maxX: 100, maxZ: 200 }, flat, rules, none, 3);
    const right = placeTrees({ minX: 100, minZ: 0, maxX: 200, maxZ: 200 }, flat, rules, none, 3);
    expect(left.length + right.length).toBe(placeTrees(area, flat, rules, none, 3).length);
  });

  it('thins out by density', () => {
    const full = placeTrees(area, flat, rules, none, 3).length;
    const third = placeTrees(area, flat, { ...rules, density: 0.35 }, none, 3).length;
    expect(third / full).toBeGreaterThan(0.25);
    expect(third / full).toBeLessThan(0.45);
  });

  it('skips steep ground and unloaded ground', () => {
    const steep: TreeGround = { heightAt: () => 100, slopeDegAt: () => 45 };
    expect(placeTrees(area, steep, rules, none, 3)).toEqual([]);
    const missing: TreeGround = { heightAt: () => null, slopeDegAt: () => null };
    expect(placeTrees(area, missing, rules, none, 3)).toEqual([]);
  });

  it('keeps clear of routes and camps', () => {
    const avoid: TreeAvoid = {
      routes: [
        [
          [0, 100, 100],
          [200, 100, 100],
        ],
      ],
      camps: [[50, 100, 50]],
    };
    const trees = placeTrees(area, flat, rules, avoid, 3);
    for (const t of trees) {
      expect(Math.abs(t.z - 100)).toBeGreaterThanOrEqual(4);
      expect(Math.hypot(t.x - 50, t.z - 50)).toBeGreaterThanOrEqual(20);
    }
    expect(trees.length).toBeLessThan(placeTrees(area, flat, rules, none, 3).length);
  });

  it('skips slopes below minSlopeDeg', () => {
    expect(placeTrees(area, flat, { ...rules, minSlopeDeg: 10 }, none, 3)).toEqual([]);
  });

  it('draws variants only from the subset', () => {
    const trees = placeTrees(area, flat, { ...rules, variants: [1] }, none, 3);
    expect(trees.length).toBeGreaterThan(0);
    expect(new Set(trees.map((t) => t.variant))).toEqual(new Set([1]));
  });
});
