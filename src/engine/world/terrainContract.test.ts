import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { decodeHeights, parseManifest } from './terrainData';
import { TerrainSampler } from './TerrainSampler';

// Python -> TypeScript contract: a low-resolution test-peak written by the Python
// bake (tools/terrain/bake.py), committed so it runs without baking. Regenerate with
// UPDATE_FIXTURES=1 .venv/bin/python -m pytest tools/terrain -q
const dir = fileURLToPath(new URL('./__fixtures__/test-peak-mini/', import.meta.url));

function loadFixture() {
  const m = parseManifest(JSON.parse(readFileSync(`${dir}manifest.json`, 'utf8')));
  const sampler = new TerrainSampler(m);
  for (let tz = 0; tz < m.tilesZ; tz++) {
    for (let tx = 0; tx < m.tilesX; tx++) {
      const bytes = readFileSync(`${dir}tiles/${tx}_${tz}.u16`);
      const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
      sampler.setTile({ tx, tz, heights: decodeHeights(buffer, m.minHeightM, m.maxHeightM) });
    }
  }
  return { m, sampler };
}

describe('Python bake -> TerrainSampler axis contract', () => {
  it('places every camp on the terrain surface', () => {
    const { m, sampler } = loadFixture();
    expect(m.camps.length).toBeGreaterThanOrEqual(2);
    const tol = (m.maxHeightM - m.minHeightM) / 65535 + 1e-3;
    for (const camp of m.camps) {
      const [x, y, z] = camp.position;
      expect(Math.abs(sampler.heightAt(x, z)! - y), camp.id).toBeLessThan(tol);
    }
  });

  it('puts the 20 m mound at world x = +512 (east), z = -512 (north), not its mirrors', () => {
    const { sampler } = loadFixture();
    expect(sampler.heightAt(512, -512)).toBeCloseTo(5020, 1);
    expect(sampler.heightAt(-512, -512)).toBeCloseTo(5000, 1);
    expect(sampler.heightAt(512, 512)).toBeCloseTo(5000, 1);
    expect(sampler.heightAt(-512, 512)).toBeCloseTo(5000, 1);
  });
});
