import { describe, expect, it } from 'vitest';
import { GAME_CONFIG } from '../config/game.config';
import { cloudLayout, puffPixels, seededRandom, skyBlend, wrapOffset } from './skyMath';

describe('skyBlend', () => {
  it('is 0 below the horizon and 1 overhead', () => {
    expect(skyBlend(-0.5, 0.6)).toBe(0);
    expect(skyBlend(1, 0.6)).toBe(1);
    expect(skyBlend(0.25, 0.5)).toBeCloseTo(0.5);
  });
});

describe('wrapOffset', () => {
  it('wraps into [-radius, radius)', () => {
    expect(wrapOffset(0, 100)).toBe(0);
    expect(wrapOffset(150, 100)).toBe(-50);
    expect(wrapOffset(-150, 100)).toBe(50);
    expect(wrapOffset(100, 100)).toBe(-100);
  });
});

describe('seededRandom', () => {
  it('repeats for a seed and differs between seeds', () => {
    const a = seededRandom(1);
    const b = seededRandom(1);
    for (let i = 0; i < 5; i++) {
      const v = a();
      expect(b()).toBe(v);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
    expect(seededRandom(2)()).not.toBe(seededRandom(1)());
  });
});

describe('cloudLayout', () => {
  const c = GAME_CONFIG.world.clouds;
  it('builds the configured clouds the same way every time', () => {
    const clouds = cloudLayout(c);
    expect(clouds).toHaveLength(c.count);
    expect(cloudLayout(c)).toEqual(clouds);
    for (const cloud of clouds) {
      expect(Math.abs(cloud.x)).toBeLessThanOrEqual(c.radiusM);
      expect(Math.abs(cloud.z)).toBeLessThanOrEqual(c.radiusM);
      expect(cloud.puffs.length).toBeGreaterThanOrEqual(c.puffsMin);
      expect(cloud.puffs.length).toBeLessThanOrEqual(c.puffsMax);
      for (const p of cloud.puffs) {
        expect(p.dy).toBeGreaterThanOrEqual(0);
        expect(p.sizeM).toBeGreaterThanOrEqual(c.puffSizeMinM);
        expect(p.sizeM).toBeLessThanOrEqual(c.puffSizeMaxM);
      }
    }
  });
});

describe('puffPixels', () => {
  it('is white with a soft round alpha', () => {
    const px = puffPixels(16);
    expect(px).toHaveLength(16 * 16 * 4);
    expect(px[3]).toBe(0);
    expect(px[(8 * 16 + 8) * 4 + 3]).toBeGreaterThan(200);
    for (let i = 0; i < px.length; i += 4) expect(px[i]).toBe(255);
  });
});
