import { linearPalette, terrainColor, withoutStripes, type TerrainPalette } from './palette';
import type { SurfaceRules } from './surface';
import type { Backdrop } from './terrainData';

export interface MapImage {
  width: number;
  height: number;
  /** RGBA, row-major, row = z (north at the top). */
  pixels: Uint8ClampedArray;
}

/** Light from the north-west and above (cartographic hillshade convention). */
const LIGHT = (() => {
  const l = [-1, 1.4, -1];
  const len = Math.hypot(l[0], l[1], l[2]);
  return [l[0] / len, l[1] / len, l[2] / len] as const;
})();
const SHADE_BASE = 0.55;
const SHADE_GAIN = 0.45;
const SHADE_MIN = 0.35;

const linearToSrgb = (c: number): number =>
  c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055;

/** Shaded-relief map of the backdrop heights in the biome's terrain colours. */
export function buildMapImage(
  b: Backdrop,
  palette: TerrainPalette,
  surface: SurfaceRules,
): MapImage {
  const n = b.samples;
  const s = b.spacingM;
  const pal = linearPalette(withoutStripes(palette));
  const pixels = new Uint8ClampedArray(n * n * 4);
  const h = (c: number, r: number): number =>
    b.heights[Math.min(Math.max(r, 0), n - 1) * n + Math.min(Math.max(c, 0), n - 1)];
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      const dx = (h(c + 1, r) - h(c - 1, r)) / (2 * s);
      const dz = (h(c, r + 1) - h(c, r - 1)) / (2 * s);
      const len = Math.hypot(dx, 1, dz);
      const nx = -dx / len;
      const ny = 1 / len;
      const nz = -dz / len;
      const slopeDeg = (Math.acos(ny) * 180) / Math.PI;
      const color = terrainColor(slopeDeg, h(c, r), surface, pal);
      const lit = nx * LIGHT[0] + ny * LIGHT[1] + nz * LIGHT[2];
      const shade = Math.min(1, Math.max(SHADE_MIN, SHADE_BASE + SHADE_GAIN * lit));
      const o = (r * n + c) * 4;
      pixels[o] = Math.round(linearToSrgb(color[0] * shade) * 255);
      pixels[o + 1] = Math.round(linearToSrgb(color[1] * shade) * 255);
      pixels[o + 2] = Math.round(linearToSrgb(color[2] * shade) * 255);
      pixels[o + 3] = 255;
    }
  }
  return { width: n, height: n, pixels };
}
