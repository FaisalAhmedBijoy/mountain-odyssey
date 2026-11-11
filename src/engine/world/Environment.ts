import * as THREE from 'three';
import { GAME_CONFIG } from '../config/game.config';
import type { Vec3 } from '../core/math';
import { Clouds, createSkyDome } from './Sky';

const w = GAME_CONFIG.world;

/** Sky colour, fog, ambient light and a sun whose shadow box follows the player. */
export class Environment {
  private readonly sun = new THREE.DirectionalLight(w.sun.color, w.sun.intensity);
  private readonly sunDir = new THREE.Vector3(...w.sunDirection).normalize();
  private readonly dome: THREE.Mesh;
  private readonly clouds: Clouds;

  constructor(
    scene: THREE.Scene,
    shadows: boolean,
    sky: { color: number; zenithColor: number; fogNear: number; fogFar: number },
    cloudBaseY: number,
  ) {
    const skyColor = new THREE.Color(sky.color);
    scene.background = skyColor;
    scene.fog = new THREE.Fog(skyColor, sky.fogNear, sky.fogFar);
    this.dome = createSkyDome(
      sky.color,
      sky.zenithColor,
      w.sky.domeRadiusM,
      w.sky.gradientExponent,
    );
    this.clouds = new Clouds(w.clouds, cloudBaseY);
    scene.add(this.dome, this.clouds.group);
    scene.add(
      new THREE.HemisphereLight(
        w.hemisphere.skyColor,
        w.hemisphere.groundColor,
        w.hemisphere.intensity,
      ),
    );
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

  follow(p: Vec3, dt: number): void {
    this.sun.target.position.set(p.x, p.y, p.z);
    this.sun.position.set(
      p.x + this.sunDir.x * 150,
      p.y + this.sunDir.y * 150,
      p.z + this.sunDir.z * 150,
    );
    this.dome.position.set(p.x, p.y, p.z);
    this.clouds.update(p.x, p.z, dt);
  }

  dispose(): void {
    this.clouds.dispose();
    this.dome.removeFromParent();
    this.dome.geometry.dispose();
    (this.dome.material as THREE.Material).dispose();
  }
}
