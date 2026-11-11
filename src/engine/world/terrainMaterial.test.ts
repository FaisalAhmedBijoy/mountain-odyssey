import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { createTerrainMaterial, patchTerrainFragment } from './terrainMaterial';

const options = { paletteMix: 0.4, fadeStartM: 120, fadeEndM: 900 };

describe('patchTerrainFragment', () => {
  it('patches the real three.js standard fragment shader', () => {
    const out = patchTerrainFragment(THREE.ShaderLib.standard.fragmentShader);
    expect(out).toContain('uniform float uPaletteMix;');
    expect(out).toContain('mix( diffuseColor.rgb, vColor.rgb');
    expect(out).not.toContain('#include <color_fragment>');
    expect(out).toContain('#include <map_fragment>');
  });
  it('throws when the expected chunk is missing', () => {
    expect(() => patchTerrainFragment('void main() {}')).toThrow(/chunks are missing/);
  });
});

describe('createTerrainMaterial', () => {
  it('is the plain vertex-colour material without imagery', () => {
    const m = createTerrainMaterial(null, options);
    expect(m.map).toBeNull();
    expect(m.vertexColors).toBe(true);
    expect(m.customProgramCacheKey()).not.toBe('terrain-imagery');
  });
  it('uses the image as the map and a distinct program with imagery', () => {
    const m = createTerrainMaterial(new THREE.Texture(), options);
    expect(m.map).not.toBeNull();
    expect(m.customProgramCacheKey()).toBe('terrain-imagery');
  });
});
