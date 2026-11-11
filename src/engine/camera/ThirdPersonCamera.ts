import type * as THREE from 'three';
import { GAME_CONFIG } from '../config/game.config';
import { add, clamp, degToRad, lerp, scale, type Vec3 } from '../core/math';
import { orbitOffset, resolveCameraPosition, smoothFactor } from './cameraMath';
import { addTrauma, decayTrauma, runBob, shakeAngles } from './cameraShake';

const c = GAME_CONFIG.camera;

export interface CameraInput {
  climbing: boolean;
  /** Running on the ground and actually moving. */
  running: boolean;
  /** No shake, bob or decay while the game is paused. */
  paused: boolean;
}

export class ThirdPersonCamera {
  yaw = 0;
  pitch = degToRad(c.defaultPitchDeg);
  private distance: number = c.defaultDistance;
  private position: Vec3 | null = null;
  private trauma = 0;
  private shakeTime = 0;
  private bobPhase = 0;
  private bobWeight = 0;

  constructor(
    private readonly camera: THREE.PerspectiveCamera,
    private readonly groundAt: (x: number, z: number) => number | null,
  ) {}

  applyMouse(dx: number, dy: number): void {
    this.yaw -= dx * c.mouseSensitivity;
    this.pitch = clamp(
      this.pitch + dy * c.mouseSensitivity,
      degToRad(c.minPitchDeg),
      degToRad(c.maxPitchDeg),
    );
  }

  applyWheel(delta: number): void {
    this.distance = clamp(this.distance + delta * c.wheelSensitivity, c.minDistance, c.maxDistance);
  }

  cycleDistance(): void {
    const next = c.distanceSteps.find((s) => s > this.distance + 0.01);
    this.distance = next ?? c.distanceSteps[0];
  }

  /** Jump straight to the target position on the next update (e.g. after respawn). */
  snap(): void {
    this.position = null;
    this.trauma = 0;
    this.bobWeight = 0;
  }

  /** Adds camera shake (0–1). */
  addTrauma(amount: number): void {
    this.trauma = addTrauma(this.trauma, amount);
  }

  update(feet: Vec3, input: CameraInput, dt: number): void {
    let target: Vec3 = { x: feet.x, y: feet.y + GAME_CONFIG.player.eyeHeight, z: feet.z };
    let distance = this.distance;
    if (input.climbing) distance += c.climbExtraDistance;
    const right = { x: Math.cos(this.yaw), y: 0, z: -Math.sin(this.yaw) };
    target = add(target, scale(right, input.climbing ? c.climbSideOffset : c.shoulderOffsetM));
    const desired = add(target, orbitOffset(this.yaw, this.pitch, distance));
    const resolved = resolveCameraPosition(target, desired, this.groundAt, c.collisionPaddingM);
    let p = this.position
      ? lerp(this.position, resolved, smoothFactor(c.followSharpness, dt))
      : resolved;
    const g = this.groundAt(p.x, p.z);
    if (g !== null && p.y < g + c.collisionPaddingM) p = { ...p, y: g + c.collisionPaddingM };
    this.position = p;
    this.camera.position.set(p.x, p.y, p.z);
    this.camera.lookAt(target.x, target.y, target.z);
    if (!c.shake.enabled || input.paused) return;
    this.shakeTime += dt;
    this.trauma = decayTrauma(this.trauma, dt, c.shake.decayPerSec);
    this.bobWeight +=
      ((input.running ? 1 : 0) - this.bobWeight) * smoothFactor(c.shake.runBobSharpness, dt);
    this.bobPhase += dt * c.shake.runBobHz * Math.PI;
    const angles = shakeAngles(this.trauma, this.shakeTime, c.shake);
    const bob = runBob(this.bobPhase, this.bobWeight, c.shake);
    this.camera.position.y += bob.y;
    this.camera.rotateX(angles.pitch);
    this.camera.rotateY(angles.yaw);
    this.camera.rotateZ(angles.roll + bob.roll);
  }
}
