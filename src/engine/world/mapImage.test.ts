import { describe, expect, it } from 'vitest';
import { GAME_CONFIG } from '../config/game.config';
import { buildMapImage } from './mapImage';
import type { Backdrop } from './terrainData';

const n = 9;
const backdrop = (h: (c: number, r: number) => number): Backdrop => {
  const heights = new Float32Array(n * n);
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) heights[r * n + c] = h(c, r);
  return { samples: n, spacingM: 64, heights };
};
const himalaya = GAME_CONFIG.biomes.himalaya.palette;
const tropical = GAME_CONFIG.biomes['tropical-hills'].palette;
const surface = GAME_CONFIG.surface;
const pixel = (img: { width: number; pixels: Uint8ClampedArray }, c: number, r: number) =>
  Array.from(img.pixels.slice((r * img.width + c) * 4, (r * img.width + c) * 4 + 4));
const brightness = (p: number[]) => p[0] + p[1] + p[2];

describe('buildMapImage', () => {
  it('has one opaque RGBA pixel per backdrop sample', () => {
    const img = buildMapImage(
      backdrop(() => 500),
      tropical,
      surface,
    );
    expect(img.width).toBe(n);
    expect(img.height).toBe(n);
    expect(img.pixels.length).toBe(n * n * 4);
    expect(pixel(img, 4, 4)[3]).toBe(255);
  });

  it('shades flat ground uniformly', () => {
    const img = buildMapImage(
      backdrop(() => 500),
      tropical,
      surface,
    );
    expect(pixel(img, 1, 1)).toEqual(pixel(img, 7, 7));
  });

  it('lights slopes facing north-west more than slopes facing south-east', () => {
    // Height rising to the south-east, so the ground faces north-west, and the reverse.
    const nw = buildMapImage(
      backdrop((c, r) => 500 + 20 * (c + r)),
      tropical,
      surface,
    );
    const se = buildMapImage(
      backdrop((c, r) => 500 - 20 * (c + r)),
      tropical,
      surface,
    );
    expect(brightness(pixel(nw, 4, 4))).toBeGreaterThan(brightness(pixel(se, 4, 4)));
  });

  it('uses the biome palette: snow is brighter than rock on the himalaya palette', () => {
    const rock = buildMapImage(
      backdrop(() => 4000),
      himalaya,
      surface,
    );
    const snow = buildMapImage(
      backdrop(() => 5350),
      himalaya,
      surface,
    );
    expect(brightness(pixel(snow, 4, 4))).toBeGreaterThan(brightness(pixel(rock, 4, 4)));
  });

  it('paints glacier samples as snow when a mask on the backdrop grid is given', () => {
    const flat = backdrop(() => 5000); // below the snowline: rock without a mask
    const data = new Uint8Array(n * n);
    data[4 * n + 4] = 1;
    const glacier = { samplesX: n, samplesZ: n, spacingM: 64, originX: 0, originZ: 0, data };
    const img = buildMapImage(flat, himalaya, surface, glacier);
    expect(brightness(pixel(img, 4, 4))).toBeGreaterThan(brightness(pixel(img, 3, 4)) * 1.5);
  });

  it('rejects a mask that is not on the backdrop grid', () => {
    const glacier = {
      samplesX: n + 1,
      samplesZ: n + 1,
      spacingM: 64,
      originX: 0,
      originZ: 0,
      data: new Uint8Array((n + 1) ** 2),
    };
    expect(() =>
      buildMapImage(
        backdrop(() => 5000),
        himalaya,
        surface,
        glacier,
      ),
    ).toThrow(/backdrop grid/);
  });
});
