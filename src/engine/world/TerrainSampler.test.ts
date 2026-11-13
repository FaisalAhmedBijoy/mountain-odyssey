import { describe, expect, it } from 'vitest';
import type { TerrainManifest } from './terrainData';
import { TerrainSampler } from './TerrainSampler';

// Two 3x3-sample tiles side by side along x, spacing 1 m: height = x.
const manifest: TerrainManifest = {
  id: 't',
  spacingM: 1,
  tileSamples: 3,
  tilesX: 2,
  tilesZ: 1,
  originX: 0,
  originZ: 0,
  minHeightM: 0,
  maxHeightM: 10,
  backdrop: { file: 'backdrop.u16', samples: 3, spacingM: 2 },
  camps: [],
  attribution: '',
};

const ramp = (startX: number) =>
  new Float32Array([0, 1, 2, 0, 1, 2, 0, 1, 2].map((dx) => startX + dx));

function makeSampler() {
  const s = new TerrainSampler(manifest);
  s.setTile({ tx: 0, tz: 0, heights: ramp(0) });
  s.setTile({ tx: 1, tz: 0, heights: ramp(2) });
  return s;
}

describe('TerrainSampler', () => {
  it('interpolates heights across tiles', () => {
    const s = makeSampler();
    expect(s.heightAt(0.5, 1)).toBeCloseTo(0.5);
    expect(s.heightAt(2.5, 1)).toBeCloseTo(2.5);
    expect(s.heightAt(4, 2)).toBeCloseTo(4);
  });

  it('answers glacier queries from the mask, null without one', () => {
    const s = makeSampler();
    expect(s.onGlacierAt(1, 1)).toBeNull();
    s.setSurfaceMask({
      samplesX: 3,
      samplesZ: 2,
      spacingM: 2,
      originX: 0,
      originZ: 0,
      data: new Uint8Array([0, 1, 0, 0, 0, 0]),
    });
    expect(s.onGlacierAt(2, 0)).toBe(true);
    expect(s.onGlacierAt(0, 0)).toBe(false);
    expect(s.onGlacierAt(2, 2)).toBe(false);
    expect(s.onGlacierAt(50, 0)).toBeNull();
  });

  it('returns null outside the world or for unloaded tiles', () => {
    const s = makeSampler();
    expect(s.heightAt(-0.1, 1)).toBeNull();
    s.removeTile(1, 0);
    expect(s.hasTile(1, 0)).toBe(false);
    expect(s.heightAt(3, 1)).toBeNull();
  });

  it('computes normals and slope of a 45 degree ramp', () => {
    const s = makeSampler();
    const n = s.normalAt(2, 1)!;
    expect(n.x).toBeCloseTo(-Math.SQRT1_2);
    expect(n.y).toBeCloseTo(Math.SQRT1_2);
    expect(n.z).toBeCloseTo(0);
    expect(s.slopeDegAt(2, 1)).toBeCloseTo(45);
  });
});
