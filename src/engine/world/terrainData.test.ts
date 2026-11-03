import { describe, expect, it, vi } from 'vitest';
import { decodeHeights, fetchWithRetry, parseManifest, tileKey, tileUrl } from './terrainData';

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
