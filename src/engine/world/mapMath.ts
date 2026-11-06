import type { TerrainManifest } from './terrainData';

type P3 = readonly [number, number, number];

/** World rectangle covered by the baked tiles (and the map image). */
export interface MapBounds {
  minX: number;
  minZ: number;
  sizeX: number;
  sizeZ: number;
}

export function mapBounds(m: TerrainManifest): MapBounds {
  const tileSize = (m.tileSamples - 1) * m.spacingM;
  return {
    minX: m.originX,
    minZ: m.originZ,
    sizeX: m.tilesX * tileSize,
    sizeZ: m.tilesZ * tileSize,
  };
}

/** North-up map units: u grows east (0 = west edge), v grows south (0 = north edge). */
export const worldToMap = (x: number, z: number, b: MapBounds): { u: number; v: number } => ({
  u: (x - b.minX) / b.sizeX,
  v: (z - b.minZ) / b.sizeZ,
});

export const mapToWorld = (u: number, v: number, b: MapBounds): { x: number; z: number } => ({
  x: b.minX + u * b.sizeX,
  z: b.minZ + v * b.sizeZ,
});

/** Drops points closer than minSpacingM (horizontally) to the last kept one; keeps both ends. */
export function simplifyRoute(
  points: readonly P3[],
  minSpacingM: number,
): [number, number, number][] {
  if (points.length <= 2) return points.map((p) => [p[0], p[1], p[2]]);
  const out: [number, number, number][] = [[points[0][0], points[0][1], points[0][2]]];
  let last = points[0];
  for (let i = 1; i < points.length - 1; i++) {
    const p = points[i];
    if (Math.hypot(p[0] - last[0], p[2] - last[2]) >= minSpacingM) {
      out.push([p[0], p[1], p[2]]);
      last = p;
    }
  }
  const end = points[points.length - 1];
  out.push([end[0], end[1], end[2]]);
  return out;
}

export type CampState = 'reached' | 'next' | 'ahead';

/** Per camp: reached, the next one after the last checkpoint, or still ahead. */
export function campProgress(
  campIds: readonly string[],
  reached: ReadonlySet<string>,
  lastId: string,
): Record<string, CampState> {
  const lastIndex = campIds.indexOf(lastId);
  return Object.fromEntries(
    campIds.map((id, i): [string, CampState] => [
      id,
      reached.has(id) ? 'reached' : i === lastIndex + 1 ? 'next' : 'ahead',
    ]),
  );
}

/**
 * Map heading from PlayerSnapshot.facingYaw (atan2(facing.x, facing.z), world +z = south):
 * 0 = north, clockwise positive, normalised to [-π, π).
 */
export function mapHeading(facingYaw: number): number {
  const h = Math.PI - facingYaw;
  const twoPi = Math.PI * 2;
  return ((((h + Math.PI) % twoPi) + twoPi) % twoPi) - Math.PI;
}
