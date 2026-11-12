import { isBiomeId, type BiomeId } from '../../engine/config/game.config';
import { isItemId, type ItemId } from '../../engine/equipment/items';
import { DEFAULT_GEAR, type Loadout, type MountainGear } from '../../engine/equipment/loadout';
import meraPeak from './mera-peak.json';
import testPeak from './test-peak.json';
import keokradong from './keokradong.json';
import patharia from './patharia.json';

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
  /** Items offered, required and packed by default (M2b spec §4). */
  gear: MountainGear;
}

interface RawGear {
  available: string[];
  required: string[];
  defaults: Record<string, number>;
}

type RawMountain = Omit<MountainDef, 'biome' | 'gear'> & { biome: string; gear?: RawGear };

function itemId(mountainId: string, id: string): ItemId {
  if (!isItemId(id)) throw new Error(`Mountain ${mountainId}: unknown item "${id}"`);
  return id;
}

function parseGear(mountainId: string, raw: RawGear | undefined): MountainGear {
  if (!raw) return DEFAULT_GEAR;
  const defaults: Loadout = {};
  for (const [id, n] of Object.entries(raw.defaults)) defaults[itemId(mountainId, id)] = n;
  return {
    available: raw.available.map((id) => itemId(mountainId, id)),
    required: raw.required.map((id) => itemId(mountainId, id)),
    defaults,
  };
}

function parseMountain(raw: RawMountain): MountainDef {
  if (!isBiomeId(raw.biome)) throw new Error(`Mountain ${raw.id}: unknown biome "${raw.biome}"`);
  return { ...raw, biome: raw.biome, gear: parseGear(raw.id, raw.gear) };
}

const MOUNTAINS: MountainDef[] = [meraPeak, testPeak, keokradong, patharia].map(parseMountain);

export function getMountain(id: string): MountainDef | null {
  return MOUNTAINS.find((m) => m.id === id) ?? null;
}
