import { SURFACE_COLORS, surfaceAt, type Surface, type SurfaceRules } from './surface';

type Rgb = readonly [number, number, number];

/** How a biome colours terrain: by gameplay surface (rock/snow/ice) or by slope bands. */
export type TerrainPalette =
  | { readonly kind: 'surface' }
  | {
      readonly kind: 'slope';
      readonly bands: readonly { readonly maxSlopeDeg: number; readonly color: Rgb }[];
      /** Contour stripes on one band (tea rows seen from afar). */
      readonly stripes?: {
        readonly bandIndex: number;
        readonly riseM: number;
        readonly contrast: number;
        /** Stripes are dropped when terrain vertices are farther apart than this (m). Default: no limit. */
        readonly maxVertexSpacingM?: number;
      };
    };

/** Same palette with colours converted to linear space once, for per-vertex use. */
export type LinearPalette =
  | { kind: 'surface'; colors: Record<Surface, Rgb> }
  | {
      kind: 'slope';
      bands: { maxSlopeDeg: number; color: Rgb }[];
      stripes?: { bandIndex: number; riseM: number; contrast: number; maxVertexSpacingM?: number };
    };

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
    stripes: p.stripes ? { ...p.stripes } : undefined,
  };
}

/** The same palette without contour stripes (for low-resolution views such as the map). */
export function withoutStripes(p: TerrainPalette): TerrainPalette {
  if (p.kind !== 'slope' || !p.stripes) return p;
  return { kind: 'slope', bands: p.bands };
}

/** Linear-space vertex colour for a terrain point. */
export function terrainColor(
  slopeDeg: number,
  altitudeM: number,
  surface: SurfaceRules,
  p: LinearPalette,
): Rgb {
  if (p.kind === 'surface') return p.colors[surfaceAt(slopeDeg, altitudeM, surface)];
  let index = p.bands.findIndex((b) => slopeDeg < b.maxSlopeDeg);
  if (index < 0) index = p.bands.length - 1;
  const color = p.bands[index].color;
  const st = p.stripes;
  if (!st || st.bandIndex !== index) return color;
  const f = altitudeM / st.riseM - Math.floor(altitudeM / st.riseM);
  const k = 1 - st.contrast * (0.5 - 0.5 * Math.cos(2 * Math.PI * f));
  return [color[0] * k, color[1] * k, color[2] * k];
}
