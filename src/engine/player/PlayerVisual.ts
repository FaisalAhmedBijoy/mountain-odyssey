import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { GAME_CONFIG } from '../config/game.config';
import type { Vec3 } from '../core/math';
import type { MoveState } from './movementState';
import { applyToonLook } from './toonLook';
import { resolveClips, type ClipRole } from './toonMath';

/** Character model and animation. Falls back to a capsule if the model fails to load. */
export class PlayerVisual {
  private mixer: THREE.AnimationMixer | null = null;
  private readonly actions = new Map<string, THREE.AnimationAction>();
  private current: THREE.AnimationAction | null = null;
  private yaw = 0;
  private clips: Record<ClipRole, string | null> = {
    idle: null,
    walk: null,
    run: null,
    fall: null,
    climb: null,
  };
  private disposeLook: (() => void) | null = null;

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
      visual.disposeLook = applyToonLook(model, GAME_CONFIG.character);
      root.add(model);
      visual.mixer = new THREE.AnimationMixer(model);
      for (const clip of gltf.animations)
        visual.actions.set(clip.name, visual.mixer.clipAction(clip));
      visual.clips = resolveClips(
        gltf.animations.map((c) => c.name),
        GAME_CONFIG.character.clips,
      );
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
    this.disposeLook?.();
    this.root.removeFromParent();
  }

  private clipFor(state: MoveState, moving: boolean): string | null {
    if (state === 'fall' || state === 'slide') return this.clips.fall;
    if (state === 'climb') return moving ? this.clips.climb : this.clips.idle;
    if (!moving) return this.clips.idle;
    return state === 'run' ? this.clips.run : this.clips.walk;
  }

  private play(name: string | null): void {
    if (name === null) return;
    const next = this.actions.get(name);
    if (!next || next === this.current) return;
    next.reset().fadeIn(0.2).play();
    this.current?.fadeOut(0.2);
    this.current = next;
  }
}
