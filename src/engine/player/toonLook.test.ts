import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { GAME_CONFIG } from '../config/game.config';
import { applyToonLook, patchOutlineVertex } from './toonLook';

describe('patchOutlineVertex', () => {
  it('patches the real three.js lambert vertex shader', () => {
    const out = patchOutlineVertex(THREE.ShaderLib.lambert.vertexShader);
    expect(out).toContain('uniform float uOutlineWidth;');
    expect(out).toContain('transformedNormal');
    expect(out).toContain('#include <project_vertex>');
  });
  it('throws when the chunk is missing', () => {
    expect(() => patchOutlineVertex('void main() {}')).toThrow();
  });
});

describe('applyToonLook', () => {
  it('replaces materials with toon ones and adds an outline mesh', () => {
    const group = new THREE.Group();
    const body = new THREE.Mesh<THREE.BufferGeometry, THREE.Material>(
      new THREE.BoxGeometry(),
      new THREE.MeshStandardMaterial({ color: 0xff0000 }),
    );
    body.name = 'body';
    group.add(body);
    applyToonLook(group, GAME_CONFIG.character);
    expect(group.children).toHaveLength(2);
    const toon = body.material as THREE.MeshToonMaterial;
    expect(toon).toBeInstanceOf(THREE.MeshToonMaterial);
    expect(toon.color.getHex()).toBe(0xff0000);
    expect(toon.gradientMap).not.toBeNull();
    const outline = group.getObjectByName('body-outline') as THREE.Mesh;
    expect(outline.geometry).toBe(body.geometry);
    expect(outline.castShadow).toBe(false);
    expect((outline.material as THREE.Material).side).toBe(THREE.BackSide);
  });
  it('adds nothing to an empty group', () => {
    const group = new THREE.Group();
    const dispose = applyToonLook(group, GAME_CONFIG.character);
    expect(group.children).toHaveLength(0);
    expect(() => dispose()).not.toThrow();
  });
});
