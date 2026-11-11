import * as THREE from 'three';
import { cloudLayout, puffPixels, skyBlend, wrapOffset, type CloudConfig } from './skyMath';

/** A large inward-facing sphere coloured from horizon to zenith. Centre it on the player. */
export function createSkyDome(
  horizonColor: number,
  zenithColor: number,
  radiusM: number,
  exponent: number,
): THREE.Mesh {
  const geometry = new THREE.SphereGeometry(radiusM, 32, 16);
  const horizon = new THREE.Color(horizonColor);
  const zenith = new THREE.Color(zenithColor);
  const position = geometry.getAttribute('position');
  const colors = new Float32Array(position.count * 3);
  const c = new THREE.Color();
  for (let i = 0; i < position.count; i++) {
    c.lerpColors(horizon, zenith, skyBlend(position.getY(i) / radiusM, exponent));
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const material = new THREE.MeshBasicMaterial({
    vertexColors: true,
    side: THREE.BackSide,
    fog: false,
    depthWrite: false,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'sky-dome';
  mesh.renderOrder = -1;
  mesh.frustumCulled = false;
  return mesh;
}

export interface CloudsOptions extends CloudConfig {
  windX: number;
  windZ: number;
  color: number;
  opacity: number;
}

/** Sprite clouds that drift with the wind and repeat around the player. */
export class Clouds {
  readonly group = new THREE.Group();
  private readonly texture: THREE.DataTexture;
  private readonly material: THREE.SpriteMaterial;
  private readonly clouds: { base: THREE.Vector3; node: THREE.Group }[] = [];
  private driftX = 0;
  private driftZ = 0;

  constructor(
    private readonly o: CloudsOptions,
    private readonly baseY: number,
  ) {
    const size = 64;
    this.texture = new THREE.DataTexture(puffPixels(size), size, size, THREE.RGBAFormat);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.minFilter = THREE.LinearFilter;
    this.texture.magFilter = THREE.LinearFilter;
    this.texture.needsUpdate = true;
    this.material = new THREE.SpriteMaterial({
      map: this.texture,
      color: o.color,
      opacity: o.opacity,
      transparent: true,
      depthWrite: false,
      fog: true,
    });
    this.group.name = 'clouds';
    for (const def of cloudLayout(o)) {
      const node = new THREE.Group();
      for (const p of def.puffs) {
        const sprite = new THREE.Sprite(this.material);
        sprite.position.set(p.dx, p.dy, p.dz);
        sprite.scale.set(p.sizeM, p.sizeM * 0.6, 1);
        node.add(sprite);
      }
      this.group.add(node);
      this.clouds.push({ base: new THREE.Vector3(def.x, def.y, def.z), node });
    }
  }

  /** Moves the clouds with the wind and keeps them around (x, z). dt = 0 freezes them. */
  update(x: number, z: number, dt: number): void {
    this.driftX += this.o.windX * dt;
    this.driftZ += this.o.windZ * dt;
    for (const c of this.clouds) {
      c.node.position.set(
        x + wrapOffset(c.base.x + this.driftX - x, this.o.radiusM),
        this.baseY + c.base.y,
        z + wrapOffset(c.base.z + this.driftZ - z, this.o.radiusM),
      );
    }
  }

  dispose(): void {
    this.group.removeFromParent();
    this.material.dispose();
    this.texture.dispose();
  }
}
