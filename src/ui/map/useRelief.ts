import { useMemo } from 'react';
import type { MapInfo } from '../../engine/core/hud';

const cache = new WeakMap<MapInfo, HTMLCanvasElement>();

/** The relief image as an offscreen canvas, built once per map. */
export function useRelief(map: MapInfo | null): HTMLCanvasElement | null {
  return useMemo(() => {
    if (!map) return null;
    const cached = cache.get(map);
    if (cached) return cached;
    const { width, height, pixels } = map.image;
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    canvas
      .getContext('2d')
      ?.putImageData(new ImageData(new Uint8ClampedArray(pixels), width, height), 0, 0);
    cache.set(map, canvas);
    return canvas;
  }, [map]);
}
