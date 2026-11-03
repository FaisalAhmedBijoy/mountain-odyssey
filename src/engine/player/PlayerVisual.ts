import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import type { Vec3 } from '../core/math';
import type { MoveState } from './movementState';

const CLIPS = { idle: 'Idle', walk: 'Walking', run: 'Running', fall: 'Jump', climb: 'Walking' };

/** Character model and animation. Falls back to a capsule if the model fails to load. */
export class PlayerVisual {
  private mixer: THREE.AnimationMixer | null = null;
  private readonly actions = new Map<string, THREE.AnimationAction>();
  private current: THREE.AnimationAction | null = null;
  private yaw = 0;

  private constructor(private readonly root: THREE.Group) {}

  static async load(parent: THREE.Object3D, url: string, heightM: number): Promise<PlayerVisual> {
    const root = new THREE.Group();
    parent.add(root);
    const visual = new PlayerVisual(root);
    try {
      const gltf = await new GLTFLoader().loadAsync(url);
      const model = gltf.scene;
      const box = new THREE.Box3().setFromObject(model);
      const k = heightM / (box.max.y - box.min.y);
      model.scale.setScalar(k);
      model.position.y = -box.min.y * k;
      model.traverse((o) => {
        if ((o as THREE.Mesh).isMesh) o.castShadow = true;
      });
      root.add(model);
      visual.mixer = new THREE.AnimationMixer(model);
      for (const clip of gltf.animations)
        visual.actions.set(clip.name, visual.mixer.clipAction(clip));
    } catch (err) {
      console.warn('Character model failed to load; using a capsule instead.', err);
      const capsule = new THREE.Mesh(
        new THREE.CapsuleGeometry(0.3, 1.1, 4, 12),
        new THREE.MeshStandardMaterial({ color: 0xd9534f }),
      );
      capsule.position.y = heightM / 2;
      capsule.castShadow = true;
      root.add(capsule);
    }
    return visual;
  }

  update(feet: Vec3, facingYaw: number, state: MoveState, moving: boolean, dt: number): void {
    this.root.position.set(feet.x, feet.y, feet.z);
    const diff = Math.atan2(Math.sin(facingYaw - this.yaw), Math.cos(facingYaw - this.yaw));
    this.yaw += diff * Math.min(1, dt * 12);
    this.root.rotation.y = this.yaw;
    this.play(this.clipFor(state, moving));
    this.mixer?.update(dt);
  }

  dispose(): void {
    this.mixer?.stopAllAction();
    this.root.removeFromParent();
  }

  private clipFor(state: MoveState, moving: boolean): string {
    if (state === 'fall' || state === 'slide') return CLIPS.fall;
    if (state === 'climb') return moving ? CLIPS.climb : CLIPS.idle;
    if (!moving) return CLIPS.idle;
    return state === 'run' ? CLIPS.run : CLIPS.walk;
  }

  private play(name: string): void {
    const next = this.actions.get(name);
    if (!next || next === this.current) return;
    next.reset().fadeIn(0.2).play();
    this.current?.fadeOut(0.2);
    this.current = next;
  }
}
