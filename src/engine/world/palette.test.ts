import { describe, expect, it } from 'vitest';
import { GAME_CONFIG } from '../config/game.config';
import { linearPalette, terrainColor, withoutStripes } from './palette';
import { SURFACE_COLORS } from './surface';

const surface = GAME_CONFIG.surface;
const srgbToLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const lin = (rgb: readonly number[]) => rgb.map(srgbToLinear);

describe('terrainColor', () => {
  it('himalaya reproduces the surface colours (rock, snow)', () => {
    const p = linearPalette(GAME_CONFIG.biomes.himalaya.palette);
    expect(terrainColor(10, 5000, surface, p)).toEqual(lin(SURFACE_COLORS.rock));
    expect(terrainColor(10, 5350, surface, p)).toEqual(lin(SURFACE_COLORS.snow));
    expect(terrainColor(45, 6000, surface, p)).toEqual(lin(SURFACE_COLORS.rock));
  });

  it('tropical-hills picks grass, forest and soil by slope', () => {
    const p = linearPalette(GAME_CONFIG.biomes['tropical-hills'].palette);
    const bands = GAME_CONFIG.biomes['tropical-hills'].palette.bands;
    expect(terrainColor(5, 600, surface, p)).toEqual(lin(bands[0].color));
    expect(terrainColor(20, 600, surface, p)).toEqual(lin(bands[1].color));
    expect(terrainColor(50, 600, surface, p)).toEqual(lin(bands[2].color));
    expect(terrainColor(15, 600, surface, p)).toEqual(lin(bands[1].color));
  });
});

describe('palette stripes', () => {
  const surface = GAME_CONFIG.surface;
  const striped = linearPalette({
    kind: 'slope',
    bands: [
      { maxSlopeDeg: 10, color: [0.5, 0.5, 0.5] },
      { maxSlopeDeg: 90, color: [0.2, 0.2, 0.2] },
    ],
    stripes: { bandIndex: 0, riseM: 1, contrast: 0.2 },
  });

  it('darkens the striped band by up to `contrast`, periodically with altitude', () => {
    const base = linearPalette({
      kind: 'slope',
      bands: [{ maxSlopeDeg: 90, color: [0.5, 0.5, 0.5] }],
    });
    const plain = terrainColor(5, 100, surface, base)[0];
    const crest = terrainColor(5, 100, surface, striped)[0];
    const trough = terrainColor(5, 100.5, surface, striped)[0];
    expect(crest).toBeCloseTo(plain, 9);
    expect(trough).toBeCloseTo(plain * 0.8, 9);
    expect(terrainColor(5, 101, surface, striped)[0]).toBeCloseTo(crest, 9);
  });

  it('leaves other bands unstriped', () => {
    expect(terrainColor(20, 100.5, surface, striped)).toEqual(
      terrainColor(20, 100, surface, striped),
    );
  });

  it('withoutStripes drops the stripes only', () => {
    const p = GAME_CONFIG.biomes['tea-garden'].palette;
    const plain = withoutStripes(p);
    expect('stripes' in plain && plain.stripes).toBeFalsy();
    expect(plain.kind).toBe(p.kind);
  });
});
