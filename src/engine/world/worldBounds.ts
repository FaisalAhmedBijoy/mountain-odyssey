import type { Vec3 } from '../core/math';
import type { TerrainManifest } from './terrainData';

/**
 * True when the feet are beyond the baked terrain (no collider there, so the player
 * would fall forever) or more than dropMarginM below its lowest point. Uses the
 * manifest bounds rather than TerrainSampler, which also returns null for tiles
 * that are simply not loaded yet.
 */
export function isOutOfWorld(feet: Vec3, m: TerrainManifest, dropMarginM: number): boolean {
  const cells = m.tileSamples - 1;
  const maxX = m.originX + cells * m.tilesX * m.spacingM;
  const maxZ = m.originZ + cells * m.tilesZ * m.spacingM;
  if (feet.x < m.originX || feet.x > maxX || feet.z < m.originZ || feet.z > maxZ) return true;
  return feet.y < m.minHeightM - dropMarginM;
}
