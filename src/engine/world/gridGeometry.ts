import { SURFACE_COLORS, surfaceAt, type Surface, type SurfaceRules } from './surface';

export interface GridGeometryArgs {
  heights: Float32Array;
  samplesX: number;
  samplesZ: number;
  step: number;
  spacingM: number;
  originX: number;
  originZ: number;
  skirtDepthM: number;
  surface: SurfaceRules;
  hole?: { minX: number; minZ: number; maxX: number; maxZ: number };
}

export interface GridGeometryData {
  positions: Float32Array;
  normals: Float32Array;
  colors: Float32Array;
  indices: Uint32Array;
}

const srgbToLinear = (c: number): number =>
  c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;

const toLinear = (rgb: readonly [number, number, number]): [number, number, number] => [
  srgbToLinear(rgb[0]),
  srgbToLinear(rgb[1]),
  srgbToLinear(rgb[2]),
];

const LINEAR_COLORS: Record<Surface, [number, number, number]> = {
  rock: toLinear(SURFACE_COLORS.rock),
  snow: toLinear(SURFACE_COLORS.snow),
  ice: toLinear(SURFACE_COLORS.ice),
};

/** Deterministic 0–1 hash for subtle per-vertex colour variation. */
function hash2(x: number, z: number): number {
  const s = Math.sin(x * 12.9898 + z * 78.233) * 43758.5453;
  return s - Math.floor(s);
}

/** Builds an indexed terrain grid at a LOD step, with optional skirts and a hole. */
export function buildGridGeometry(a: GridGeometryArgs): GridGeometryData {
  const { heights, samplesX, samplesZ, step, spacingM, originX, originZ, skirtDepthM, hole } = a;
  if (step < 1 || (samplesX - 1) % step !== 0 || (samplesZ - 1) % step !== 0) {
    throw new Error(`LOD step ${step} must divide ${samplesX - 1} x ${samplesZ - 1} cells`);
  }
  const nx = (samplesX - 1) / step + 1;
  const nz = (samplesZ - 1) / step + 1;
  const hasSkirt = skirtDepthM > 0;
  const vertexCount = nx * nz + (hasSkirt ? 2 * (nx + nz) : 0);
  const positions = new Float32Array(vertexCount * 3);
  const normals = new Float32Array(vertexCount * 3);
  const colors = new Float32Array(vertexCount * 3);

  const sample = (sx: number, sz: number): number => {
    const cx = sx < 0 ? 0 : sx >= samplesX ? samplesX - 1 : sx;
    const cz = sz < 0 ? 0 : sz >= samplesZ ? samplesZ - 1 : sz;
    return heights[cz * samplesX + cx];
  };

  const writeVertex = (v: number, sx: number, sz: number, yOffset: number): void => {
    const x = originX + sx * spacingM;
    const z = originZ + sz * spacingM;
    const y = sample(sx, sz);
    const o = v * 3;
    positions[o] = x;
    positions[o + 1] = y + yOffset;
    positions[o + 2] = z;
    // Neighbours are clamped at the border, so divide by the real distance between them.
    const xl = Math.max(sx - step, 0);
    const xr = Math.min(sx + step, samplesX - 1);
    const zn = Math.max(sz - step, 0);
    const zs = Math.min(sz + step, samplesZ - 1);
    const gx = (sample(xl, sz) - sample(xr, sz)) / ((xr - xl) * spacingM);
    const gz = (sample(sx, zn) - sample(sx, zs)) / ((zs - zn) * spacingM);
    const len = Math.hypot(gx, 1, gz);
    normals[o] = gx / len;
    normals[o + 1] = 1 / len;
    normals[o + 2] = gz / len;
    const slopeDeg = (Math.acos(1 / len) * 180) / Math.PI;
    const c = LINEAR_COLORS[surfaceAt(slopeDeg, y, a.surface)];
    const shade = 0.9 + 0.1 * hash2(x, z);
    colors[o] = c[0] * shade;
    colors[o + 1] = c[1] * shade;
    colors[o + 2] = c[2] * shade;
  };

  for (let iz = 0; iz < nz; iz++) {
    for (let ix = 0; ix < nx; ix++) writeVertex(iz * nx + ix, ix * step, iz * step, 0);
  }

  const maxIndices = (nx - 1) * (nz - 1) * 6 + (hasSkirt ? 2 * (nx - 1 + (nz - 1)) * 6 : 0);
  const indices = new Uint32Array(maxIndices);
  let k = 0;
  const cell = step * spacingM;
  for (let iz = 0; iz < nz - 1; iz++) {
    for (let ix = 0; ix < nx - 1; ix++) {
      if (hole) {
        const cx = originX + (ix + 0.5) * cell;
        const cz = originZ + (iz + 0.5) * cell;
        if (cx > hole.minX && cx < hole.maxX && cz > hole.minZ && cz < hole.maxZ) continue;
      }
      const v0 = iz * nx + ix;
      const v1 = v0 + 1;
      const v2 = v0 + nx;
      const v3 = v2 + 1;
      indices[k++] = v0;
      indices[k++] = v2;
      indices[k++] = v1;
      indices[k++] = v1;
      indices[k++] = v2;
      indices[k++] = v3;
    }
  }

  if (hasSkirt) {
    let v = nx * nz;
    const edges: number[][] = [
      Array.from({ length: nx }, (_, ix) => ix),
      Array.from({ length: nx }, (_, ix) => (nz - 1) * nx + ix),
      Array.from({ length: nz }, (_, iz) => iz * nx),
      Array.from({ length: nz }, (_, iz) => iz * nx + nx - 1),
    ];
    // Edges 0 (north) and 1 (south) run along +x; 2 (west) and 3 (east) along +z.
    // North and east need the opposite winding for their faces to point outward.
    const flip = [true, false, false, true];
    for (const [e, edge] of edges.entries()) {
      const first = v;
      for (const top of edge) {
        writeVertex(v++, (top % nx) * step, Math.floor(top / nx) * step, -skirtDepthM);
      }
      for (let i = 0; i < edge.length - 1; i++) {
        const t0 = edge[i];
        const t1 = edge[i + 1];
        const s0 = first + i;
        const s1 = first + i + 1;
        if (flip[e]) {
          indices[k++] = t0;
          indices[k++] = t1;
          indices[k++] = s0;
          indices[k++] = t1;
          indices[k++] = s1;
          indices[k++] = s0;
        } else {
          indices[k++] = t0;
          indices[k++] = s0;
          indices[k++] = t1;
          indices[k++] = t1;
          indices[k++] = s0;
          indices[k++] = s1;
        }
      }
    }
  }

  return { positions, normals, colors, indices: indices.slice(0, k) };
}
