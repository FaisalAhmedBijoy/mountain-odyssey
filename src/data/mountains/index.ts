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
  terrainBaseUrl: string;
}

const MOUNTAINS: MountainDef[] = [meraPeak, testPeak];

export function getMountain(id: string): MountainDef | null {
  return MOUNTAINS.find((m) => m.id === id) ?? null;
}
