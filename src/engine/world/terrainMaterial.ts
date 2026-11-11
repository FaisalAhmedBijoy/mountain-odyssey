import * as THREE from 'three';

export interface TerrainImageryOptions {
  paletteMix: number;
  fadeStartM: number;
  fadeEndM: number;
}

const COLOR_CHUNK = '#include <color_fragment>';
const COMMON_CHUNK = '#include <common>';

/**
 * Standard fragment shader with the vertex colour mixed over the map instead of multiplied.
 * Throws when three.js no longer has the chunks this relies on, so an upgrade fails in tests.
 */
export function patchTerrainFragment(source: string): string {
  if (!source.includes(COLOR_CHUNK) || !source.includes(COMMON_CHUNK)) {
    throw new Error('Terrain shader patch: expected chunks are missing from the fragment shader');
  }
  return source
    .replace(
      COMMON_CHUNK,
      `${COMMON_CHUNK}
uniform float uPaletteMix;
uniform float uFadeStartM;
uniform float uFadeEndM;`,
    )
    .replace(
      COLOR_CHUNK,
      `#if defined( USE_COLOR ) || defined( USE_COLOR_ALPHA )
	float terrainNear = 1.0 - smoothstep( uFadeStartM, uFadeEndM, length( vViewPosition ) );
	diffuseColor.rgb = mix( diffuseColor.rgb, vColor.rgb, uPaletteMix * terrainNear );
#endif`,
    );
}

/** Terrain material. Without imagery it is the plain vertex-coloured material. */
export function createTerrainMaterial(
  imagery: THREE.Texture | null,
  o: TerrainImageryOptions,
): THREE.MeshStandardMaterial {
  const material = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.95,
    metalness: 0,
    side: THREE.DoubleSide,
    map: imagery,
  });
  if (!imagery) return material;
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uPaletteMix = { value: o.paletteMix };
    shader.uniforms.uFadeStartM = { value: o.fadeStartM };
    shader.uniforms.uFadeEndM = { value: o.fadeEndM };
    shader.fragmentShader = patchTerrainFragment(shader.fragmentShader);
  };
  material.customProgramCacheKey = () => 'terrain-imagery';
  return material;
}

/** Loads the baked image so that v = 0 is its first (north) row. */
export async function loadImageryTexture(url: string, anisotropy: number): Promise<THREE.Texture> {
  const texture = await new THREE.TextureLoader().loadAsync(url);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.flipY = false;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.anisotropy = anisotropy;
  texture.needsUpdate = true;
  return texture;
}
