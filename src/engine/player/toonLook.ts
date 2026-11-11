import * as THREE from 'three';
import { toonGradientData } from './toonMath';

export interface ToonLookOptions {
  toonLevels: readonly number[];
  outline: { width: number; color: number };
}

const PROJECT_CHUNK = '#include <project_vertex>';

/**
 * Lambert vertex shader that pushes each vertex along its normal in screen space, giving an
 * outline of constant on-screen thickness. Throws if three.js no longer has the chunk.
 */
export function patchOutlineVertex(source: string): string {
  if (!source.includes(PROJECT_CHUNK)) {
    throw new Error('Outline shader patch: project_vertex chunk is missing from the vertex shader');
  }
  return source.replace('void main() {', 'uniform float uOutlineWidth;\nvoid main() {').replace(
    PROJECT_CHUNK,
    `${PROJECT_CHUNK}
	vec2 outlineDir = ( projectionMatrix * vec4( transformedNormal, 0.0 ) ).xy;
	float outlineLen = length( outlineDir );
	if ( outlineLen > 0.00001 ) gl_Position.xy += outlineDir / outlineLen * uOutlineWidth * gl_Position.w;`,
  );
}

function createOutlineMaterial(o: ToonLookOptions['outline']): THREE.Material {
  // Black diffuse + emissive = a flat colour that still gets fog. Lambert, because its
  // vertex shader always computes transformedNormal (the basic material does not).
  const material = new THREE.MeshLambertMaterial({
    color: 0x000000,
    emissive: o.color,
    side: THREE.BackSide,
  });
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uOutlineWidth = { value: o.width };
    shader.vertexShader = patchOutlineVertex(shader.vertexShader);
  };
  material.customProgramCacheKey = () => 'character-outline';
  return material;
}

function createGradientMap(levels: readonly number[]): THREE.DataTexture {
  const data = toonGradientData(levels);
  const texture = new THREE.DataTexture(data, data.length, 1, THREE.RedFormat);
  texture.minFilter = THREE.NearestFilter;
  texture.magFilter = THREE.NearestFilter;
  texture.needsUpdate = true;
  return texture;
}

function toToon(source: THREE.Material, gradientMap: THREE.Texture): THREE.MeshToonMaterial {
  const s = source as THREE.MeshStandardMaterial;
  return new THREE.MeshToonMaterial({
    color: s.color ? s.color.clone() : new THREE.Color(0xffffff),
    map: s.map ?? null,
    gradientMap,
    vertexColors: s.vertexColors,
    transparent: s.transparent,
    opacity: s.opacity,
    alphaTest: s.alphaTest,
    side: s.side,
  });
}

/**
 * Replaces every mesh material under `model` with a toon material and adds an outline mesh
 * next to each mesh. Returns a function that frees what this created.
 */
export function applyToonLook(model: THREE.Object3D, o: ToonLookOptions): () => void {
  const gradientMap = createGradientMap(o.toonLevels);
  const outlineMaterial = createOutlineMaterial(o.outline);
  const created: THREE.Material[] = [outlineMaterial];
  const meshes: THREE.Mesh[] = [];
  model.traverse((obj) => {
    if ((obj as THREE.Mesh).isMesh) meshes.push(obj as THREE.Mesh);
  });
  // Collected first: adding outline meshes while traversing would visit them too.
  for (const mesh of meshes) {
    const convert = (m: THREE.Material): THREE.Material => {
      const toon = toToon(m, gradientMap);
      created.push(toon);
      return toon;
    };
    mesh.material = Array.isArray(mesh.material)
      ? mesh.material.map(convert)
      : convert(mesh.material);

    let outline: THREE.Mesh;
    if ((mesh as THREE.SkinnedMesh).isSkinnedMesh) {
      const skinned = mesh as THREE.SkinnedMesh;
      const copy = new THREE.SkinnedMesh(skinned.geometry, outlineMaterial);
      copy.bind(skinned.skeleton, skinned.bindMatrix);
      outline = copy;
    } else {
      outline = new THREE.Mesh(mesh.geometry, outlineMaterial);
    }
    outline.name = `${mesh.name}-outline`;
    outline.position.copy(mesh.position);
    outline.quaternion.copy(mesh.quaternion);
    outline.scale.copy(mesh.scale);
    if (mesh.morphTargetInfluences) outline.morphTargetInfluences = mesh.morphTargetInfluences;
    outline.castShadow = false;
    outline.receiveShadow = false;
    outline.frustumCulled = mesh.frustumCulled;
    (mesh.parent ?? model).add(outline);
  }
  return () => {
    for (const m of created) m.dispose();
    gradientMap.dispose();
  };
}
