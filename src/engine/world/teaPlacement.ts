import { segmentDistSq, type TreeAvoid } from './treePlacement';

type P3 = readonly [number, number, number];

export interface TeaRules {
  /** Grid step of candidate points (m). */
  stepM: number;
  minSlopeDeg: number;
  maxSlopeDeg: number;
  /** Height between neighbouring rows (m). */
  riseM: number;
  /** Fraction of each rise that holds a row (0–1). */
  bandFraction: number;
  routeClearanceM: number;
  campClearanceM: number;
}

export interface TeaGround {
  heightAt(x: number, z: number): number | null;
  slopeDegAt(x: number, z: number): number | null;
  normalAt(x: number, z: number): { x: number; y: number; z: number } | null;
  /** Whether the terrain tile is loaded (optional; TerrainSampler has it). */
  hasTile?(tx: number, tz: number): boolean;
}

export interface TeaInstance {
  x: number;
  y: number;
  z: number;
  /** Rotation about +Y that aligns the hedge's local +X with the contour. */
  yaw: number;
}

/**
 * Tea hedges on contour bands of gentle slopes (Patharia spec §4): a world-aligned grid
 * point is kept when its height falls in the lower `bandFraction` of each `riseM`.
 */
export function placeTea(
  area: { minX: number; minZ: number; maxX: number; maxZ: number },
  ground: TeaGround,
  rules: TeaRules,
  avoid: TreeAvoid,
): TeaInstance[] {
  const s = rules.stepM;
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

  const out: TeaInstance[] = [];
  for (let i = Math.ceil(area.minX / s); i * s < area.maxX; i++) {
    for (let j = Math.ceil(area.minZ / s); j * s < area.maxZ; j++) {
      const x = i * s;
      const z = j * s;
      const slope = ground.slopeDegAt(x, z);
      if (slope === null || slope < rules.minSlopeDeg || slope > rules.maxSlopeDeg) continue;
      const y = ground.heightAt(x, z);
      if (y === null) continue;
      const band = y / rules.riseM - Math.floor(y / rules.riseM);
      if (band >= rules.bandFraction) continue;
      if (camps.some((c) => (c[0] - x) ** 2 + (c[2] - z) ** 2 < campSq)) continue;
      if (segments.some(([a, b]) => segmentDistSq(x, z, a, b) < routeSq)) continue;
      const n = ground.normalAt(x, z);
      if (!n) continue;
      // Contour direction is perpendicular to the horizontal normal: d = (-n.z, n.x).
      // Local +X rotated by yaw is (cos yaw, -sin yaw) in (x, z), so yaw = atan2(-d.z, d.x).
      out.push({ x, y, z, yaw: Math.atan2(-n.x, -n.z) });
    }
  }
  return out;
}
