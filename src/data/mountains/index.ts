import { isBiomeId, type BiomeId } from '../../engine/config/game.config';
import meraPeak from './mera-peak.json';
import testPeak from './test-peak.json';

export interface MountainDef {
  id: string;
  facts: {
    name: string;
    country: string;
    elevationM: number;
    location: { lat: number; lon: number };
    sources: string[];
  };
  /** Path under `public/`, without a leading slash; resolve with `assetUrl`. */
  terrainBaseUrl: string;
  biome: BiomeId;
}

function parseMountain(raw: Omit<MountainDef, 'biome'> & { biome: string }): MountainDef {
  if (!isBiomeId(raw.biome)) throw new Error(`Mountain ${raw.id}: unknown biome "${raw.biome}"`);
  return { ...raw, biome: raw.biome };
}

const MOUNTAINS: MountainDef[] = [meraPeak, testPeak].map(parseMountain);

export function getMountain(id: string): MountainDef | null {
  return MOUNTAINS.find((m) => m.id === id) ?? null;
}
