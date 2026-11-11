/** 0 at and below the horizon, 1 straight up. */
export const skyBlend = (dirY: number, exponent: number): number =>
  Math.pow(Math.min(Math.max(dirY, 0), 1), exponent);

/** Offset wrapped into [-radius, radius). */
export function wrapOffset(v: number, radius: number): number {
  const size = radius * 2;
  return ((((v + radius) % size) + size) % size) - radius;
}

/** Seeded 0–1 generator (mulberry32). */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface CloudConfig {
  seed: number;
  count: number;
  radiusM: number;
  thicknessM: number;
  puffsMin: number;
  puffsMax: number;
  puffSizeMinM: number;
  puffSizeMaxM: number;
  spreadM: number;
}

export interface CloudDef {
  /** Centre inside [-radiusM, radiusM), height above the cloud base. */
  x: number;
  y: number;
  z: number;
  puffs: { dx: number; dy: number; dz: number; sizeM: number }[];
}

/** The same clouds for the same config: positions and puffs, flat-bottomed. */
export function cloudLayout(c: CloudConfig): CloudDef[] {
  const rnd = seededRandom(c.seed);
  const between = (lo: number, hi: number): number => lo + (hi - lo) * rnd();
  const clouds: CloudDef[] = [];
  for (let i = 0; i < c.count; i++) {
    const x = between(-c.radiusM, c.radiusM);
    const z = between(-c.radiusM, c.radiusM);
    const y = between(0, c.thicknessM);
    const n = Math.round(between(c.puffsMin, c.puffsMax));
    const puffs: CloudDef['puffs'] = [];
    for (let k = 0; k < n; k++) {
      const sizeM = between(c.puffSizeMinM, c.puffSizeMaxM);
      puffs.push({
        dx: between(-c.spreadM, c.spreadM),
        dy: sizeM * 0.15 * rnd(), // never below the base: flat bottoms
        dz: between(-c.spreadM, c.spreadM) * 0.5,
        sizeM,
      });
    }
    clouds.push({ x, y, z, puffs });
  }
  return clouds;
}

/** size x size RGBA bytes: white, with a soft round alpha falloff. */
export function puffPixels(size: number): Uint8Array {
  const out = new Uint8Array(size * size * 4);
  const half = (size - 1) / 2;
  for (let r = 0; r < size; r++) {
    for (let col = 0; col < size; col++) {
      const d = Math.min(Math.hypot((col - half) / half, (r - half) / half), 1);
      const alpha = (1 - d * d) ** 2;
      const o = (r * size + col) * 4;
      out[o] = 255;
      out[o + 1] = 255;
      out[o + 2] = 255;
      out[o + 3] = Math.round(alpha * 255);
    }
  }
  return out;
}
