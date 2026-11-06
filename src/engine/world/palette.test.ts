import { describe, expect, it } from 'vitest';
import { GAME_CONFIG } from '../config/game.config';
import { linearPalette, terrainColor } from './palette';
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
