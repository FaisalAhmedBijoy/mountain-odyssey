/**
 * Glacier mask baked from OSM (spec 002): 1 = glacier, 0 = not.
 * Row-major, row = z (north first), like the terrain tiles.
 */
export interface SurfaceMask {
  samplesX: number;
  samplesZ: number;
  spacingM: number;
  /** World x and z of sample (0, 0). */
  originX: number;
  originZ: number;
  data: Uint8Array;
}

/** Nearest sample; null outside the mask. */
export function glacierAt(m: SurfaceMask, x: number, z: number): boolean | null {
  const c = Math.round((x - m.originX) / m.spacingM);
  const r = Math.round((z - m.originZ) / m.spacingM);
  if (c < 0 || r < 0 || c >= m.samplesX || r >= m.samplesZ) return null;
  return m.data[r * m.samplesX + c] === 1;
}

/** The samples covering a world rectangle plus one on each side, as a smaller mask (for one tile). */
export function cropMask(
  m: SurfaceMask,
  minX: number,
  minZ: number,
  maxX: number,
  maxZ: number,
): SurfaceMask | null {
  const s = m.spacingM;
  const c0 = Math.max(0, Math.floor((minX - m.originX) / s) - 1);
  const r0 = Math.max(0, Math.floor((minZ - m.originZ) / s) - 1);
  const c1 = Math.min(m.samplesX - 1, Math.ceil((maxX - m.originX) / s) + 1);
  const r1 = Math.min(m.samplesZ - 1, Math.ceil((maxZ - m.originZ) / s) + 1);
  if (c1 < c0 || r1 < r0) return null;
  const w = c1 - c0 + 1;
  const h = r1 - r0 + 1;
  const data = new Uint8Array(w * h);
  for (let r = 0; r < h; r++) {
    const from = (r0 + r) * m.samplesX + c0;
    data.set(m.data.subarray(from, from + w), r * w);
  }
  return {
    samplesX: w,
    samplesZ: h,
    spacingM: s,
    originX: m.originX + c0 * s,
    originZ: m.originZ + r0 * s,
    data,
  };
}

/** Nearest-sample copy on another grid (backdrop and map). Points outside the mask count as 0. */
export function sampleMask(
  m: SurfaceMask,
  originX: number,
  originZ: number,
  spacingM: number,
  samplesX: number,
  samplesZ: number,
): SurfaceMask {
  const data = new Uint8Array(samplesX * samplesZ);
  for (let r = 0; r < samplesZ; r++) {
    for (let c = 0; c < samplesX; c++) {
      if (glacierAt(m, originX + c * spacingM, originZ + r * spacingM)) data[r * samplesX + c] = 1;
    }
  }
  return { samplesX, samplesZ, spacingM, originX, originZ, data };
}
