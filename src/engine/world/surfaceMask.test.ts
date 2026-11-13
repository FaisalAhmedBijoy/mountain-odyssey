import { describe, expect, it } from 'vitest';
import { cropMask, glacierAt, sampleMask, type SurfaceMask } from './surfaceMask';

// 4 columns x 3 rows, 10 m apart, sample (0,0) at x = 100, z = 200.
// Row 0 (north): 1 0 0 0
// Row 1:         0 0 1 0
// Row 2 (south): 0 0 0 0
const mask: SurfaceMask = {
  samplesX: 4,
  samplesZ: 3,
  spacingM: 10,
  originX: 100,
  originZ: 200,
  data: new Uint8Array([1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0]),
};

describe('glacierAt', () => {
  it('reads the nearest sample, row = z', () => {
    expect(glacierAt(mask, 100, 200)).toBe(true);
    expect(glacierAt(mask, 104, 204)).toBe(true);
    expect(glacierAt(mask, 120, 210)).toBe(true);
    expect(glacierAt(mask, 110, 220)).toBe(false);
    // Swapped axes would read (x=110, z=220) as glacier.
    expect(glacierAt(mask, 110, 200)).toBe(false);
  });
  it('is null outside the mask', () => {
    expect(glacierAt(mask, 94, 200)).toBeNull();
    expect(glacierAt(mask, 100, 226)).toBeNull();
    expect(glacierAt(mask, 136, 200)).toBeNull();
  });
});

describe('cropMask', () => {
  it('answers like the full mask everywhere inside the rectangle', () => {
    const crop = cropMask(mask, 112, 205, 118, 212)!;
    expect(crop.samplesX).toBeLessThan(mask.samplesX + 1);
    for (let x = 112; x <= 118; x += 1) {
      for (let z = 205; z <= 212; z += 1) expect(glacierAt(crop, x, z)).toBe(glacierAt(mask, x, z));
    }
  });
  it('crops a larger mask, including half a sample past each edge and at the border', () => {
    const big: SurfaceMask = {
      samplesX: 20,
      samplesZ: 20,
      spacingM: 10,
      originX: 0,
      originZ: 0,
      data: Uint8Array.from({ length: 400 }, (_, i) => ((i * 7) % 3 === 0 ? 1 : 0)),
    };
    const crop = cropMask(big, 52, 61, 118, 133)!;
    expect(crop.samplesX).toBeLessThan(20);
    expect(crop.samplesZ).toBeLessThan(20);
    for (let x = 47; x <= 123; x += 1) {
      for (let z = 56; z <= 138; z += 1) expect(glacierAt(crop, x, z)).toBe(glacierAt(big, x, z));
    }
    const corner = cropMask(big, 0, 0, 30, 30)!;
    for (let x = 0; x <= 35; x += 1) {
      for (let z = 0; z <= 35; z += 1) expect(glacierAt(corner, x, z)).toBe(glacierAt(big, x, z));
    }
  });
  it('copies the data instead of sharing it', () => {
    const crop = cropMask(mask, 100, 200, 130, 220)!;
    expect(crop.data.buffer).not.toBe(mask.data.buffer);
  });
  it('is null when the rectangle misses the mask', () => {
    expect(cropMask(mask, 500, 500, 600, 600)).toBeNull();
  });
});

describe('sampleMask', () => {
  it('resamples to another grid by nearest sample, outside = 0', () => {
    const s = sampleMask(mask, 100, 200, 20, 3, 2);
    expect(Array.from(s.data)).toEqual([1, 0, 0, 0, 0, 0]);
    expect(s).toMatchObject({ samplesX: 3, samplesZ: 2, spacingM: 20, originX: 100, originZ: 200 });
  });
});
