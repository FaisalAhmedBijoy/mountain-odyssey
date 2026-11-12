import type RAPIER from '@dimforge/rapier3d-compat';
import { GAME_CONFIG as cfg } from '../config/game.config';
import type { EventBus } from '../core/EventBus';
import type { GameEvents } from '../core/events';
import {
  add,
  clamp,
  cross,
  degToRad,
  length,
  lerp,
  normalize,
  radToDeg,
  scale,
  vec3,
  type Vec3,
} from '../core/math';
import type { PhysicsWorld } from '../physics/PhysicsWorld';
import { airTempC } from '../survival/bodyTemp';
import type { SurvivalModifiers } from '../survival/survival';
import { climbRequirement, surfaceAt, type Gear } from '../world/surface';
import type { TerrainSampler } from '../world/TerrainSampler';
import { classifyFall } from './fallDamage';
import {
  isMoving,
  nextMoveState,
  type MoveInput,
  type MoveState,
  type WallInfo,
} from './movementState';
import { applyInjury, fullStamina, updateStamina, type StaminaState } from './stamina';

const UP: Vec3 = { x: 0, y: 1, z: 0 };
const UNCONTROLLED: ReadonlySet<MoveState> = new Set<MoveState>(['fall', 'slide']);

const NEUTRAL_SURVIVAL: SurvivalModifiers = {
  staminaRecoveryMul: 1,
  staminaCapLimit: cfg.stamina.max,
  climbSpeedMul: 1,
};

interface WallSense extends WallInfo {
  normal: Vec3;
  distance: number;
  requirement: string | null;
}

export interface PlayerSnapshot {
  feet: Vec3;
  state: MoveState;
  moving: boolean;
  stamina: StaminaState;
  facingYaw: number;
  prompt: string | null;
  grounded: boolean;
}

/** Third-person climber driven by Rapier's kinematic character controller. */
export class Player {
  private readonly body: RAPIER.RigidBody;
  private readonly collider: RAPIER.Collider;
  private readonly controller: RAPIER.KinematicCharacterController;
  private readonly centerOffset = cfg.player.capsuleHalfHeight + cfg.player.capsuleRadius;
  private state: MoveState = 'walk';
  private velocity: Vec3 = vec3();
  private grounded = false;
  private stamina: StaminaState = fullStamina(cfg.stamina);
  private survival: SurvivalModifiers = NEUTRAL_SURVIVAL;
  private facing: Vec3 = vec3(0, 0, -1);
  private wallNormal: Vec3 | null = null;
  private fallPeakY = 0;
  /** True while an airborne or steep-slide segment awaits scoring. */
  private fallArmed = false;
  private moving = false;
  private prompt: string | null = null;
  private prevCenter: Vec3;
  private currCenter: Vec3;

  constructor(
    private readonly physics: PhysicsWorld,
    private readonly sampler: TerrainSampler,
    private readonly events: EventBus<GameEvents>,
    spawnFeet: Vec3,
    private readonly gear: Gear,
  ) {
    const R = physics.R;
    const c = { x: spawnFeet.x, y: spawnFeet.y + this.centerOffset, z: spawnFeet.z };
    this.body = physics.world.createRigidBody(
      R.RigidBodyDesc.kinematicPositionBased().setTranslation(c.x, c.y, c.z),
    );
    this.collider = physics.world.createCollider(
      R.ColliderDesc.capsule(cfg.player.capsuleHalfHeight, cfg.player.capsuleRadius),
      this.body,
    );
    this.controller = physics.world.createCharacterController(cfg.player.controllerOffsetM);
    this.controller.setApplyImpulsesToDynamicBodies(false);
    this.setClimbMode(false);
    this.prevCenter = c;
    this.currCenter = c;
  }

  get snapshot(): PlayerSnapshot {
    return {
      feet: this.feetOf(this.currCenter),
      state: this.state,
      moving: this.moving,
      stamina: {
        value: this.stamina.value,
        cap: Math.min(this.stamina.cap, this.survival.staminaCapLimit),
      },
      facingYaw: Math.atan2(this.facing.x, this.facing.z),
      prompt: this.prompt,
      grounded: this.grounded,
    };
  }

  interpolatedFeet(alpha: number): Vec3 {
    return this.feetOf(lerp(this.prevCenter, this.currCenter, alpha));
  }

  /** Decide state and queue this step's movement. Call before physics.step(). */
  step(input: MoveInput, cameraYaw: number, dt: number): void {
    const center = this.currCenter;
    const prev = this.state;
    this.moving = isMoving(input);
    // Falls count airborne drops plus slides on steep ground; gentle slides do not.
    if (prev === 'fall' || (prev === 'slide' && this.isSteepSlide(center))) {
      this.fallPeakY = Math.max(this.fallPeakY, center.y);
      this.fallArmed = true;
    } else if (prev === 'slide') {
      // Descent turned into a gentle slide: score the airborne/steep segment, then
      // keep resetting while the slide stays gentle.
      if (this.fallArmed) this.land(center.y);
      this.fallPeakY = center.y;
    }

    const dir = this.moveDirection(input, cameraYaw);
    if (prev !== 'climb' && this.moving) this.facing = dir;

    const wall = this.senseWall(center, prev);
    const grounded =
      prev === 'climb'
        ? this.feetNearGround(center) && this.localSlopeDeg(center) < cfg.movement.maxWalkSlopeDeg
        : this.grounded;
    const groundSlopeDeg = grounded ? this.localSlopeDeg(center) : 0;
    const next = nextMoveState(
      prev,
      input,
      { grounded, groundSlopeDeg, wall, stamina: this.stamina.value },
      cfg.movement,
    );

    let mantle: Vec3 | null = null;
    if (prev !== next) {
      if (UNCONTROLLED.has(prev) && (next === 'walk' || next === 'run')) this.land(center.y);
      // Grabbing a wall mid-fall ends the uncontrolled segment: score the drop so far.
      if (UNCONTROLLED.has(prev) && next === 'climb' && this.fallArmed) this.land(center.y);
      if (!UNCONTROLLED.has(prev) && UNCONTROLLED.has(next)) {
        this.fallPeakY = center.y;
        this.fallArmed = false;
      }
      if (next === 'climb') {
        this.setClimbMode(true);
        this.velocity = vec3();
      }
      if (prev === 'climb') {
        this.setClimbMode(false);
        this.wallNormal = null;
        if (next === 'walk' && !grounded) mantle = this.mantleTarget(center);
      }
    }
    this.state = next;

    if (mantle) {
      this.body.setNextKinematicTranslation(mantle);
      this.grounded = true;
      this.velocity = vec3();
    } else {
      const translation =
        next === 'climb' && wall
          ? this.climbTranslation(input, wall, dt)
          : this.groundTranslation(next, dir, input, dt);
      this.controller.computeColliderMovement(this.collider, translation);
      const mv = this.controller.computedMovement();
      this.grounded = this.controller.computedGrounded();
      if (next === 'fall') {
        this.velocity.x = mv.x / dt;
        this.velocity.z = mv.z / dt;
      }
      if (this.grounded && next !== 'slide' && this.velocity.y < 0) this.velocity.y = 0;
      this.body.setNextKinematicTranslation({
        x: center.x + mv.x,
        y: center.y + mv.y,
        z: center.z + mv.z,
      });
    }

    this.stamina = updateStamina(this.stamina, next, this.moving, dt, cfg.stamina, {
      recoveryMul: this.survival.staminaRecoveryMul,
      capLimit: this.survival.staminaCapLimit,
    });
    this.prompt = this.computePrompt(next, wall);
  }

  /** Record the simulated position. Call after physics.step(). */
  afterPhysics(): void {
    this.prevCenter = this.currCenter;
    const t = this.body.translation();
    this.currCenter = { x: t.x, y: t.y, z: t.z };
  }

  teleport(feet: Vec3): void {
    const c = { x: feet.x, y: feet.y + this.centerOffset, z: feet.z };
    this.body.setTranslation(c, true);
    this.body.setNextKinematicTranslation(c);
    this.prevCenter = c;
    this.currCenter = c;
    this.velocity = vec3();
    this.state = 'walk';
    this.grounded = false;
    this.wallNormal = null;
    this.fallArmed = false;
    this.setClimbMode(false);
    this.stamina = fullStamina(cfg.stamina);
  }

  /** Survival effects, refreshed by Game every step. */
  setSurvivalModifiers(m: SurvivalModifiers): void {
    this.survival = m;
  }

  /** Full stamina with the injury cleared (camp rest). */
  restoreStamina(): void {
    this.stamina = fullStamina(cfg.stamina);
  }

  dispose(): void {
    this.physics.world.removeCharacterController(this.controller);
    this.physics.world.removeRigidBody(this.body);
  }

  private feetOf(center: Vec3): Vec3 {
    return { x: center.x, y: center.y - this.centerOffset, z: center.z };
  }

  /**
   * Slope under the feet from a tight (capsule-radius) stencil. The sampler's
   * one-cell stencil smooths cliff edges, which would read flat ground next to
   * a drop as steep.
   */
  private localSlopeDeg(center: Vec3): number {
    const e = cfg.player.capsuleRadius;
    const h = (dx: number, dz: number) => this.sampler.heightAt(center.x + dx, center.z + dz);
    const l = h(-e, 0);
    const r = h(e, 0);
    const n = h(0, -e);
    const s = h(0, e);
    if (l === null || r === null || n === null || s === null) return 0;
    return radToDeg(Math.atan(Math.hypot(r - l, s - n) / (2 * e)));
  }

  private isSteepSlide(center: Vec3): boolean {
    return this.localSlopeDeg(center) >= cfg.movement.minClimbSlopeDeg;
  }

  private feetNearGround(center: Vec3): boolean {
    const ground = this.sampler.heightAt(center.x, center.z);
    return ground !== null && center.y - this.centerOffset - ground < cfg.player.feetNearGroundM;
  }

  private setClimbMode(climbing: boolean): void {
    const c = this.controller;
    if (climbing) {
      c.setMaxSlopeClimbAngle(Math.PI / 2);
      c.setMinSlopeSlideAngle(Math.PI / 2);
      c.disableSnapToGround();
      c.disableAutostep();
    } else {
      c.setMaxSlopeClimbAngle(degToRad(cfg.movement.maxWalkSlopeDeg));
      c.setMinSlopeSlideAngle(degToRad(cfg.movement.maxWalkSlopeDeg));
      c.enableSnapToGround(cfg.player.snapToGroundM);
      c.enableAutostep(cfg.player.autostepHeightM, cfg.player.autostepMinWidthM, false);
    }
  }

  private moveDirection(input: MoveInput, yaw: number): Vec3 {
    const d = {
      x: -Math.sin(yaw) * input.forward + Math.cos(yaw) * input.right,
      y: 0,
      z: -Math.cos(yaw) * input.forward - Math.sin(yaw) * input.right,
    };
    return length(d) > 0 ? normalize(d) : d;
  }

  private senseWall(center: Vec3, state: MoveState): WallSense | null {
    const dir = state === 'climb' && this.wallNormal ? scale(this.wallNormal, -1) : this.facing;
    const reach = cfg.player.capsuleRadius + cfg.movement.grabReachM;
    const hit = this.castWallRay(center, dir, reach);
    if (!hit) return null;
    const slopeDeg = radToDeg(Math.acos(clamp(hit.normal.y, -1, 1)));
    const surface = surfaceAt(slopeDeg, hit.point.y, cfg.surface);
    const airC = airTempC(this.feetOf(center).y, cfg.survival.temperature);
    const requirement = climbRequirement(surface, this.gear, airC, cfg.equipment.glovesMinAirTempC);
    return {
      slopeDeg,
      surface,
      climbable: requirement === null,
      requirement,
      normal: hit.normal,
      distance: hit.distance,
    };
  }

  /**
   * Rapier heightfield raycasts can miss when the ray lies on a cell boundary
   * (e.g. x within ~1e-8 of a grid line), so retry with small lateral offsets.
   */
  private castWallRay(center: Vec3, dir: Vec3, reach: number) {
    const direct = this.physics.castRay(center, dir, reach, this.collider);
    if (direct) return direct;
    const side = normalize(cross(dir, UP));
    if (length(side) === 0) return null;
    for (const offset of [cfg.movement.wallRayRetryOffsetM, -cfg.movement.wallRayRetryOffsetM]) {
      const hit = this.physics.castRay(add(center, scale(side, offset)), dir, reach, this.collider);
      if (hit) return hit;
    }
    return null;
  }

  private groundTranslation(state: MoveState, dir: Vec3, input: MoveInput, dt: number): Vec3 {
    const m = cfg.movement;
    const g = cfg.physics.gravity;
    switch (state) {
      case 'walk':
      case 'run': {
        const speed = state === 'run' ? m.runSpeed : m.walkSpeed;
        this.velocity.x = dir.x * speed;
        this.velocity.z = dir.z * speed;
        if (input.jump && this.grounded) {
          this.velocity.y = m.jumpVelocity;
          this.controller.disableSnapToGround();
        } else if (this.grounded) {
          this.velocity.y = m.groundedStickVelocity;
        } else {
          this.velocity.y += g * dt;
        }
        break;
      }
      case 'slide':
        this.velocity.x = dir.x * m.walkSpeed * m.airControl;
        this.velocity.z = dir.z * m.walkSpeed * m.airControl;
        this.velocity.y = Math.max(this.velocity.y + g * dt, -m.maxSlideSpeed);
        break;
      case 'fall':
        this.velocity.x += dir.x * m.walkSpeed * m.airControl * dt;
        this.velocity.z += dir.z * m.walkSpeed * m.airControl * dt;
        this.velocity.y = Math.max(this.velocity.y + g * dt, -m.maxFallSpeed);
        break;
      case 'climb':
        break;
    }
    return scale(this.velocity, dt);
  }

  private climbTranslation(input: MoveInput, wall: WallSense, dt: number): Vec3 {
    const n = wall.normal;
    this.wallNormal = n;
    const face = normalize({ x: -n.x, y: 0, z: -n.z });
    this.facing = face;
    const right = normalize(cross(face, UP));
    const up = normalize(cross(n, right));
    let t = add(scale(right, input.right), scale(up, input.forward));
    if (length(t) > 0)
      t = scale(normalize(t), cfg.movement.climbSpeed * this.survival.climbSpeedMul * dt);
    // On leaning faces the capsule's lower (or, on overhangs, upper) cap touches
    // before its centre does, so the hold distance grows with the lean.
    const hold =
      cfg.player.capsuleRadius +
      cfg.player.capsuleHalfHeight * Math.abs(n.y) +
      cfg.movement.climbHoldGapM;
    const correction = clamp(
      wall.distance - hold,
      -cfg.movement.wallCorrectionMaxM,
      cfg.movement.wallCorrectionMaxM,
    );
    this.velocity = vec3();
    return add(t, scale(n, -correction));
  }

  private mantleTarget(center: Vec3): Vec3 | null {
    const p = add(center, scale(this.facing, cfg.movement.mantleForwardM));
    const ground = this.sampler.heightAt(p.x, p.z);
    if (ground === null) return null;
    const feet = center.y - this.centerOffset;
    if (ground > feet + cfg.movement.mantleMaxRiseM || ground < feet - cfg.movement.mantleMaxDropM)
      return null;
    return { x: p.x, y: ground + this.centerOffset + cfg.movement.mantleLiftM, z: p.z };
  }

  private land(centerY: number): void {
    this.fallArmed = false;
    const dropM = this.fallPeakY - centerY;
    this.events.emit('player:landed', { dropM });
    const outcome = classifyFall(dropM, cfg.fall);
    if (outcome === 'injury') {
      this.stamina = applyInjury(this.stamina, cfg.fall.injuryCapPenalty, cfg.stamina);
    }
    if (outcome !== 'none') this.events.emit('player:fell', { dropM, outcome });
    this.setClimbMode(false);
  }

  private computePrompt(state: MoveState, wall: WallSense | null): string | null {
    if (state === 'climb') return 'Space — Let go';
    if (!wall || wall.slopeDeg < cfg.movement.minClimbSlopeDeg) return null;
    return wall.requirement ?? 'E — Grab';
  }
}
