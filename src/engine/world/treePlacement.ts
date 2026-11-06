type P3 = readonly [number, number, number];

export interface TreeRules {
  seed: number;
  spacingM: number;
  /** Probability (0–1) that a grid cell holds a tree. */
  density: number;
  maxSlopeDeg: number;
  routeClearanceM: number;
  campClearanceM: number;
  minScale: number;
  maxScale: number;
}

export interface TreeGround {
  heightAt(x: number, z: number): number | null;
  slopeDegAt(x: number, z: number): number | null;
}

export interface TreeAvoid {
  routes: readonly (readonly P3[])[];
  camps: readonly P3[];
}

export interface TreeInstance {
  x: number;
  y: number;
  z: number;
  scale: number;
  rotation: number;
  variant: number;
}

/** Deterministic 0–1 hash of integer cell coordinates and a salt. */
function hash(i: number, j: number, salt: number): number {
  let h = Math.imul(i, 374761393) ^ Math.imul(j, 668265263) ^ Math.imul(salt, 2246822519);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/** Squared distance from (px, pz) to segment a–b in the XZ plane. */
function segmentDistSq(px: number, pz: number, a: P3, b: P3): number {
  const dx = b[0] - a[0];
  const dz = b[2] - a[2];
  const len = dx * dx + dz * dz;
  const t = len === 0 ? 0 : Math.max(0, Math.min(1, ((px - a[0]) * dx + (pz - a[2]) * dz) / len));
  const x = a[0] + t * dx - px;
  const z = a[2] + t * dz - pz;
  return x * x + z * z;
}

/**
 * Trees for one area (a terrain tile) on a world-aligned jittered grid, so neighbouring
 * areas join without seams and the same area always gets the same trees (spec §4).
 */
export function placeTrees(
  area: { minX: number; minZ: number; maxX: number; maxZ: number },
  ground: TreeGround,
  rules: TreeRules,
  avoid: TreeAvoid,
  variants: number,
): TreeInstance[] {
  const s = rules.spacingM;
  const pad = Math.max(rules.routeClearanceM, rules.campClearanceM);
  const nearArea = (p: P3) =>
    p[0] > area.minX - pad &&
    p[0] < area.maxX + pad &&
    p[2] > area.minZ - pad &&
    p[2] < area.maxZ + pad;
  const segments: [P3, P3][] = [];
  for (const route of avoid.routes) {
    for (let k = 0; k + 1 < route.length; k++) {
      if (nearArea(route[k]) || nearArea(route[k + 1])) segments.push([route[k], route[k + 1]]);
    }
  }
  const camps = avoid.camps.filter(nearArea);
  const routeSq = rules.routeClearanceM ** 2;
  const campSq = rules.campClearanceM ** 2;

  const trees: TreeInstance[] = [];
  for (let i = Math.floor(area.minX / s); i * s < area.maxX; i++) {
    for (let j = Math.floor(area.minZ / s); j * s < area.maxZ; j++) {
      if (hash(i, j, rules.seed) >= rules.density) continue;
      const x = (i + hash(i, j, rules.seed + 1)) * s;
      const z = (j + hash(i, j, rules.seed + 2)) * s;
      if (x < area.minX || x >= area.maxX || z < area.minZ || z >= area.maxZ) continue;
      const slope = ground.slopeDegAt(x, z);
      const y = ground.heightAt(x, z);
      if (slope === null || y === null || slope > rules.maxSlopeDeg) continue;
      if (camps.some((c) => (c[0] - x) ** 2 + (c[2] - z) ** 2 < campSq)) continue;
      if (segments.some(([a, b]) => segmentDistSq(x, z, a, b) < routeSq)) continue;
      trees.push({
        x,
        y,
        z,
        scale: rules.minScale + (rules.maxScale - rules.minScale) * hash(i, j, rules.seed + 3),
        rotation: hash(i, j, rules.seed + 4) * Math.PI * 2,
        variant: Math.floor(hash(i, j, rules.seed + 5) * variants),
      });
    }
  }
  return trees;
}
