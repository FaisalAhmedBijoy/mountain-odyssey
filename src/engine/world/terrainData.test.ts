import { describe, expect, it, vi } from 'vitest';
import {
  decodeHeights,
  fetchWithRetry,
  imageryUrl,
  loadSurfaceMask,
  parseImagery,
  parseManifest,
  parseRoutes,
  parseSurfaceMask,
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

describe('imagery in the manifest', () => {
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

  it('is undefined when absent', () => {
    expect(parseImagery(undefined)).toBeUndefined();
    expect(parseManifest(base).imagery).toBeUndefined();
  });

  it('keeps a valid entry', () => {
    expect(parseImagery({ file: 'imagery.jpg', sizePx: 2048 })).toEqual({
      file: 'imagery.jpg',
      sizePx: 2048,
    });
  });

  it('ignores malformed entries with a warning', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    expect(parseImagery({ file: '../x.jpg', sizePx: 10 })).toBeUndefined();
    expect(parseImagery({ file: 'a.jpg' })).toBeUndefined();
    expect(parseImagery({ file: 'a.jpg', sizePx: 0 })).toBeUndefined();
    expect(warn).toHaveBeenCalledTimes(3);
    warn.mockRestore();
  });

  it('builds the image url only when there is imagery', () => {
    const withImagery = parseManifest({ ...base, imagery: { file: 'imagery.jpg', sizePx: 256 } });
    expect(imageryUrl('terrain/t', withImagery)).toBe('terrain/t/imagery.jpg');
    expect(imageryUrl('terrain/t', parseManifest(base))).toBeNull();
  });
});

const minimalManifest = () => ({
  id: 't',
  spacingM: 64,
  tileSamples: 17,
  tilesX: 2,
  tilesZ: 2,
  originX: -1024,
  originZ: -1024,
  minHeightM: 0,
  maxHeightM: 1,
  backdrop: { file: 'backdrop.u16', samples: 17, spacingM: 128 },
  camps: [
    { id: 'a', name: 'A', position: [0, 0, 0] },
    { id: 'b', name: 'B', position: [1, 0, 1] },
  ],
  attribution: '',
});

describe('surface mask', () => {
  const size = 2048;
  it('accepts a valid entry that covers the square', () => {
    expect(
      parseSurfaceMask({ file: 'surface.u8', samples: 65, spacingM: 32, source: 's' }, size),
    ).toEqual({ file: 'surface.u8', samples: 65, spacingM: 32, source: 's' });
    expect(parseSurfaceMask({ file: 'surface.u8', samples: 65, spacingM: 32 }, size)?.source).toBe(
      '',
    );
    expect(parseSurfaceMask(undefined, size)).toBeUndefined();
  });
  it('drops malformed entries', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    for (const bad of [
      { file: '../x', samples: 65, spacingM: 32 },
      { file: 'surface.u8', samples: 1, spacingM: 32 },
      { file: 'surface.u8', samples: 65, spacingM: 0 },
      { file: 'surface.u8', samples: 64, spacingM: 32 }, // does not cover 2048 m
      { file: 'surface.u8', samples: 65.5, spacingM: 32 },
    ]) {
      expect(parseSurfaceMask(bad, size)).toBeUndefined();
    }
    warn.mockRestore();
  });
  it('loads the bytes and checks their count', async () => {
    const m = parseManifest({
      ...minimalManifest(),
      surfaceMask: { file: 'surface.u8', samples: 3, spacingM: 1024, source: '' },
    });
    const ok = (async () => new Response(new Uint8Array(9).fill(1))) as typeof fetch;
    const mask = await loadSurfaceMask('/t', m, ok);
    expect(mask).toMatchObject({ samplesX: 3, samplesZ: 3, spacingM: 1024, originX: m.originX });
    expect(mask!.data.length).toBe(9);
    const short = (async () => new Response(new Uint8Array(8))) as typeof fetch;
    await expect(loadSurfaceMask('/t', m, short)).rejects.toThrow(/expected 9/);
    expect(await loadSurfaceMask('/t', parseManifest(minimalManifest()), ok)).toBeNull();
  });
});
