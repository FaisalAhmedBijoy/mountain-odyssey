import { describe, expect, it } from 'vitest';
import {
  COUNTRIES,
  PEAKS,
  formatElevation,
  getCountry,
  isPlayable,
  peaksIn,
  type PeakEntry,
} from './catalog';
import { getMountain } from './mountains';

describe('catalog', () => {
  it('lists Nepal, India and Bangladesh, each with at least one peak', () => {
    expect(COUNTRIES.map((c) => c.code)).toEqual(['NP', 'IN', 'BD']);
    for (const c of COUNTRIES) expect(peaksIn(c.code).length).toBeGreaterThan(0);
  });

  it('has unique peak ids and positive elevations', () => {
    expect(new Set(PEAKS.map((p) => p.id)).size).toBe(PEAKS.length);
    for (const p of PEAKS) expect(p.elevationM).toBeGreaterThan(0);
  });

  it('links every mountainId to a baked mountain definition', () => {
    for (const p of PEAKS) {
      if (p.mountainId !== undefined) expect(getMountain(p.mountainId)).not.toBeNull();
    }
  });

  it('makes Mera Peak playable and everything else coming soon', () => {
    expect(PEAKS.filter(isPlayable).map((p) => p.id)).toEqual(['mera-peak']);
    const unbaked: PeakEntry = {
      id: 'x',
      name: 'X',
      country: 'NP',
      elevationM: 1,
      approximate: false,
      mountainId: 'not-baked',
    };
    expect(isPlayable(unbaked)).toBe(false);
  });

  it('lists playable peaks first and otherwise keeps catalog order', () => {
    expect(peaksIn('NP').map((p) => p.id)).toEqual(['mera-peak', 'island-peak', 'everest']);
    expect(peaksIn('IN').map((p) => p.id)).toEqual(['kangchenjunga', 'nanda-devi', 'stok-kangri']);
    expect(peaksIn('BD').map((p) => p.id)).toEqual(['saka-haphong', 'keokradong']);
  });

  it('finds countries by code', () => {
    expect(getCountry('BD')).toEqual({ code: 'BD', name: 'Bangladesh', flag: '🇧🇩' });
  });

  it('formats elevations with thousands separators and ≈ for approximate heights', () => {
    const mera = PEAKS.find((p) => p.id === 'mera-peak')!;
    const keokradong = PEAKS.find((p) => p.id === 'keokradong')!;
    expect(formatElevation(mera)).toBe('6,476 m');
    expect(formatElevation(keokradong)).toBe('≈ 986 m');
  });
});
