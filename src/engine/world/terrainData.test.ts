import { describe, expect, it, vi } from 'vitest';
import {
  decodeHeights,
  fetchWithRetry,
  parseManifest,
  parseRoutes,
  tileKey,
  tileUrl,
} from './terrainData';

describe('terrainData', () => {
  it('decodes uint16 samples into metres', () => {
    const raw = new Uint16Array([0, 32768, 65535]);
    const h = decodeHeights(raw.buffer, 1000, 2000);
    expect(h[0]).toBeCloseTo(1000);
    expect(h[1]).toBeCloseTo(1500, 1);
    expect(h[2]).toBeCloseTo(2000);
  });

  it('builds tile keys and urls', () => {
    expect(tileKey(3, 7)).toBe('3_7');
    expect(tileUrl('/terrain/x', 3, 7)).toBe('/terrain/x/tiles/3_7.u16');
  });

  it('rejects a manifest with missing fields', () => {
    expect(() => parseManifest({ id: 'x' })).toThrow(/missing "spacingM"/);
  });

  it('retries failed requests before succeeding', async () => {
    const fetchFn = vi
      .fn()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce(new Response('nope', { status: 500 }))
      .mockResolvedValueOnce(new Response('ok'));
    const res = await fetchWithRetry('/a', 3, 0, fetchFn as unknown as typeof fetch);
    expect(await res.text()).toBe('ok');
    expect(fetchFn).toHaveBeenCalledTimes(3);
  });

  it('throws after the last attempt', async () => {
    const fetchFn = vi.fn().mockResolvedValue(new Response('x', { status: 404 }));
    await expect(fetchWithRetry('/a', 2, 0, fetchFn as unknown as typeof fetch)).rejects.toThrow(
      'HTTP 404 for /a',
    );
  });
});

describe('routes in the manifest', () => {
  const base = {
    id: 't',
    spacingM: 1,
    tileSamples: 3,
    tilesX: 1,
    tilesZ: 1,
    originX: 0,
    originZ: 0,
    minHeightM: 0,
    maxHeightM: 1,
    backdrop: { file: 'b', samples: 2, spacingM: 2 },
    camps: [
      { id: 'a', name: 'A', position: [0, 0, 0] },
      { id: 'b', name: 'B', position: [0, 0, -100] },
    ],
  };
  const good = {
    from: 'a',
    to: 'b',
    lengthM: 100,
    points: [
      [0, 0, 0],
      [0, 0, -100],
    ],
    markers: [],
  };

  it('keeps well-formed routes', () => {
    expect(parseManifest({ ...base, routes: [good] }).routes).toEqual([good]);
  });

  it('defaults to no routes', () => {
    expect(parseManifest(base).routes).toEqual([]);
  });

  it('drops malformed routes with a warning instead of throwing', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const routes = parseRoutes(
      [good, { ...good, to: 'nowhere' }, { ...good, points: [[0, 0]] }, 'junk'],
      new Set(['a', 'b']),
    );
    expect(routes).toEqual([good]);
    expect(warn).toHaveBeenCalledTimes(3);
    warn.mockRestore();
  });

  it('ignores a non-array routes field', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    expect(parseRoutes({ nope: true }, new Set(['a']))).toEqual([]);
    warn.mockRestore();
  });
});
