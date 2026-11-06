import { SURFACE_COLORS, surfaceAt, type Surface, type SurfaceRules } from './surface';

type Rgb = readonly [number, number, number];

/** How a biome colours terrain: by gameplay surface (rock/snow/ice) or by slope bands. */
export type TerrainPalette =
  | { readonly kind: 'surface' }
  | {
      readonly kind: 'slope';
      readonly bands: readonly { readonly maxSlopeDeg: number; readonly color: Rgb }[];
    };

/** Same palette with colours converted to linear space once, for per-vertex use. */
export type LinearPalette =
  | { kind: 'surface'; colors: Record<Surface, Rgb> }
  | { kind: 'slope'; bands: { maxSlopeDeg: number; color: Rgb }[] };

const srgbToLinear = (c: number): number =>
  c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;

const toLinear = (rgb: Rgb): Rgb => [
  srgbToLinear(rgb[0]),
  srgbToLinear(rgb[1]),
  srgbToLinear(rgb[2]),
];

export function linearPalette(p: TerrainPalette): LinearPalette {
  if (p.kind === 'surface') {
    return {
      kind: 'surface',
      colors: {
        rock: toLinear(SURFACE_COLORS.rock),
        snow: toLinear(SURFACE_COLORS.snow),
        ice: toLinear(SURFACE_COLORS.ice),
      },
    };
  }
  return {
    kind: 'slope',
    bands: p.bands.map((b) => ({ maxSlopeDeg: b.maxSlopeDeg, color: toLinear(b.color) })),
  };
}

/** Linear-space vertex colour for a terrain point. */
export function terrainColor(
  slopeDeg: number,
  altitudeM: number,
  surface: SurfaceRules,
  p: LinearPalette,
): Rgb {
  if (p.kind === 'surface') return p.colors[surfaceAt(slopeDeg, altitudeM, surface)];
  return (p.bands.find((b) => slopeDeg < b.maxSlopeDeg) ?? p.bands[p.bands.length - 1]).color;
}
