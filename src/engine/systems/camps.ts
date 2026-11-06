import type { Vec3 } from '../core/math';
import type { CampDef } from '../world/terrainData';

export interface CampZone {
  radiusM: number;
  maxHeightDiffM: number;
}

/** Within the camp's radius horizontally and its height window vertically. */
export function isNearCamp(feet: Vec3, camp: CampDef, zone: CampZone): boolean {
  const [x, y, z] = camp.position;
  return (
    Math.hypot(feet.x - x, feet.z - z) <= zone.radiusM &&
    Math.abs(feet.y - y) <= zone.maxHeightDiffM
  );
}

export function campAt(feet: Vec3, camps: readonly CampDef[], zone: CampZone): CampDef | null {
  return camps.find((camp) => isNearCamp(feet, camp, zone)) ?? null;
}
