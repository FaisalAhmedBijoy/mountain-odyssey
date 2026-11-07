import { getMountain } from './mountains';

export type CountryCode = 'NP' | 'IN' | 'BD';

export interface Country {
  code: CountryCode;
  name: string;
  flag: string;
}

export interface PeakEntry {
  id: string;
  name: string;
  country: CountryCode;
  elevationM: number;
  /** Surveys disagree; shown with "≈". */
  approximate: boolean;
  note?: string;
  /** Set only when the peak has baked terrain: a `MountainDef` id. */
  mountainId?: string;
}

export const COUNTRIES: readonly Country[] = [
  { code: 'NP', name: 'Nepal', flag: '🇳🇵' },
  { code: 'IN', name: 'India', flag: '🇮🇳' },
  { code: 'BD', name: 'Bangladesh', flag: '🇧🇩' },
];

const SURVEYS_VARY = 'Heights vary between surveys';

/** Country and mountain select (spec 2026-11-06 §3). Unbaked peaks show "Coming soon". */
export const PEAKS: readonly PeakEntry[] = [
  {
    id: 'mera-peak',
    name: 'Mera Peak',
    country: 'NP',
    elevationM: 6476,
    approximate: false,
    mountainId: 'mera-peak',
  },
  { id: 'island-peak', name: 'Island Peak', country: 'NP', elevationM: 6189, approximate: false },
  { id: 'everest', name: 'Mount Everest', country: 'NP', elevationM: 8849, approximate: false },
  {
    id: 'kangchenjunga',
    name: 'Kangchenjunga',
    country: 'IN',
    elevationM: 8586,
    approximate: false,
    note: 'On the Nepal–India border',
  },
  { id: 'nanda-devi', name: 'Nanda Devi', country: 'IN', elevationM: 7816, approximate: false },
  { id: 'stok-kangri', name: 'Stok Kangri', country: 'IN', elevationM: 6153, approximate: false },
  {
    id: 'saka-haphong',
    name: 'Saka Haphong',
    country: 'BD',
    elevationM: 1050,
    approximate: true,
    note: SURVEYS_VARY,
  },
  {
    id: 'keokradong',
    name: 'Keokradong',
    country: 'BD',
    elevationM: 986,
    mountainId: 'keokradong',
    approximate: true,
    note: SURVEYS_VARY,
  },
  {
    id: 'patharia',
    name: 'Patharia Hills',
    country: 'BD',
    elevationM: 234,
    approximate: true,
    note: 'Sylhet · tea gardens',
    mountainId: 'patharia',
  },
];

export function getCountry(code: CountryCode): Country {
  const country = COUNTRIES.find((c) => c.code === code);
  if (!country) throw new Error(`Unknown country "${code}"`);
  return country;
}

export const isPlayable = (peak: PeakEntry): boolean =>
  peak.mountainId !== undefined && getMountain(peak.mountainId) !== null;

/** The country's peaks, playable ones first, otherwise in catalog order. */
export function peaksIn(code: CountryCode): PeakEntry[] {
  const peaks = PEAKS.filter((p) => p.country === code);
  return [...peaks.filter(isPlayable), ...peaks.filter((p) => !isPlayable(p))];
}

export const formatElevation = (peak: PeakEntry): string =>
  `${peak.approximate ? '≈ ' : ''}${peak.elevationM.toLocaleString('en-US')} m`;
