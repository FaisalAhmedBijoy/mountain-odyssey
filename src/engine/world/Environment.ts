import * as THREE from 'three';
import { GAME_CONFIG } from '../config/game.config';
import type { Vec3 } from '../core/math';

const w = GAME_CONFIG.world;

/** Sky colour, fog, ambient light and a sun whose shadow box follows the player. */
export class Environment {
  private readonly sun = new THREE.DirectionalLight(0xfff1e0, 2.4);
  private readonly sunDir = new THREE.Vector3(...w.sunDirection).normalize();

  constructor(
    scene: THREE.Scene,
    shadows: boolean,
    sky: { color: number; fogNear: number; fogFar: number },
  ) {
    const skyColor = new THREE.Color(sky.color);
    scene.background = skyColor;
    scene.fog = new THREE.Fog(skyColor, sky.fogNear, sky.fogFar);
    scene.add(new THREE.HemisphereLight(0xdfeeff, 0x4a4038, 0.9));
    if (shadows) {
      this.sun.castShadow = true;
      this.sun.shadow.mapSize.set(2048, 2048);
      const cam = this.sun.shadow.camera;
      cam.left = -25;
      cam.right = 25;
      cam.top = 25;
      cam.bottom = -25;
      cam.near = 1;
      cam.far = 300;
      this.sun.shadow.bias = -0.0005;
      this.sun.shadow.normalBias = 0.05;
    }
    scene.add(this.sun, this.sun.target);
  }

  follow(p: Vec3): void {
    this.sun.target.position.set(p.x, p.y, p.z);
    this.sun.position.set(
      p.x + this.sunDir.x * 150,
      p.y + this.sunDir.y * 150,
      p.z + this.sunDir.z * 150,
    );
  }
}
