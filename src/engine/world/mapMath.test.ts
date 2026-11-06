import { describe, expect, it } from 'vitest';
import {
  campProgress,
  mapBounds,
  mapHeading,
  mapToWorld,
  simplifyRoute,
  worldToMap,
} from './mapMath';
import type { TerrainManifest } from './terrainData';

const manifest = {
  id: 't',
  spacingM: 2,
  tileSamples: 257,
  tilesX: 4,
  tilesZ: 2,
  originX: -1024,
  originZ: -512,
  minHeightM: 0,
  maxHeightM: 1,
  backdrop: { file: 'b', samples: 2, spacingM: 2048 },
  camps: [],
  attribution: '',
} satisfies TerrainManifest;

describe('mapMath', () => {
  it('spans the baked area', () => {
    expect(mapBounds(manifest)).toEqual({ minX: -1024, minZ: -512, sizeX: 2048, sizeZ: 1024 });
  });

  it('maps corners to 0 and 1 and round-trips', () => {
    const b = mapBounds(manifest);
    expect(worldToMap(-1024, -512, b)).toEqual({ u: 0, v: 0 });
    expect(worldToMap(1024, 512, b)).toEqual({ u: 1, v: 1 });
    const w = mapToWorld(0.25, 0.75, b);
    expect(worldToMap(w.x, w.z, b)).toEqual({ u: 0.25, v: 0.75 });
  });

  it('thins routes but keeps both ends', () => {
    const pts: [number, number, number][] = Array.from({ length: 11 }, (_, i) => [i * 10, 0, 0]);
    expect(simplifyRoute(pts, 25).map((p) => p[0])).toEqual([0, 30, 60, 90, 100]);
    expect(simplifyRoute(pts.slice(0, 2), 25)).toEqual(pts.slice(0, 2));
  });

  it('marks reached camps, the next one, and the ones ahead', () => {
    const ids = ['a', 'b', 'c', 'd'];
    expect(campProgress(ids, new Set(['a']), 'a')).toEqual({
      a: 'reached',
      b: 'next',
      c: 'ahead',
      d: 'ahead',
    });
    expect(campProgress(ids, new Set(['a', 'b', 'c']), 'c')).toEqual({
      a: 'reached',
      b: 'reached',
      c: 'reached',
      d: 'next',
    });
  });

  it('turns facing yaw into a clockwise north-up heading', () => {
    // PlayerSnapshot.facingYaw = atan2(facing.x, facing.z); north is -z, east is +x.
    const yaw = (x: number, z: number) => Math.atan2(x, z);
    expect(mapHeading(yaw(0, -1))).toBeCloseTo(0, 9);
    expect(mapHeading(yaw(1, 0))).toBeCloseTo(Math.PI / 2, 9);
    expect(Math.abs(mapHeading(yaw(0, 1)))).toBeCloseTo(Math.PI, 9);
    expect(mapHeading(yaw(-1, 0))).toBeCloseTo(-Math.PI / 2, 9);
  });
});
