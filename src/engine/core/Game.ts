import * as THREE from 'three';
import { ThirdPersonCamera } from '../camera/ThirdPersonCamera';
import { GAME_CONFIG as cfg } from '../config/game.config';
import { PhysicsWorld } from '../physics/PhysicsWorld';
import type { MoveInput } from '../player/movementState';
import { Player } from '../player/Player';
import { PlayerVisual } from '../player/PlayerVisual';
import { CheckpointSystem } from '../systems/CheckpointSystem';
import { RouteGuide, type GuideHud } from '../systems/RouteGuide';
import { activeRoute } from '../systems/routeMath';
import { ChunkManager } from '../world/ChunkManager';
import { Environment } from '../world/Environment';
import { SyncMeshBuilder, WorkerMeshBuilder, type MeshBuilder } from '../world/meshBuilder';
import { NO_GEAR } from '../world/surface';
import { loadManifest, type CampDef, type TerrainManifest } from '../world/terrainData';
import { TerrainSampler } from '../world/TerrainSampler';
import { isOutOfWorld } from '../world/worldBounds';
import { EventBus } from './EventBus';
import type { GameEvents } from './events';
import { GameLoop } from './GameLoop';
import type { HudState } from './hud';
import { InputManager } from './InputManager';
import type { Vec3 } from './math';

export interface GameOptions {
  canvas: HTMLCanvasElement;
  terrainBaseUrl: string;
  characterUrl: string;
  publish: (patch: Partial<HudState>) => void;
  useWorker?: boolean;
}

interface World {
  manifest: TerrainManifest;
  physics: PhysicsWorld;
  sampler: TerrainSampler;
  chunks: ChunkManager;
  player: Player;
  visual: PlayerVisual;
  cameraCtrl: ThirdPersonCamera;
  checkpoints: CheckpointSystem;
  guide: RouteGuide;
}

/** Composition root: owns the renderer, systems and loop. The only API React uses. */
export class Game {
  private readonly events = new EventBus<GameEvents>();
  private readonly input = new InputManager();
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera: THREE.PerspectiveCamera;
  private readonly environment: Environment;
  private readonly loop: GameLoop;
  private readonly resizeObserver: ResizeObserver;
  private cleanup: (() => void)[] = [];
  private w: World | null = null;
  private pendingRespawn = false;
  private respawning = false;
  private failed = false;
  private toast: { text: string; until: number } | null = null;
  private hudElapsedMs = 0;
  private hudFrames = 0;
  private guideHud: GuideHud | null = null;

  static async create(options: GameOptions): Promise<Game> {
    const game = new Game(options);
    try {
      await game.init();
    } catch (err) {
      game.dispose();
      throw err;
    }
    return game;
  }

  private constructor(private readonly o: GameOptions) {
    this.renderer = new THREE.WebGLRenderer({
      canvas: o.canvas,
      antialias: true,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.camera = new THREE.PerspectiveCamera(
      cfg.camera.fovDeg,
      1,
      cfg.camera.near,
      cfg.camera.far,
    );
    this.environment = new Environment(this.scene, true);
    this.loop = new GameLoop(
      {
        step: (dt) => this.guard(() => this.step(dt)),
        render: (alpha, frameDt) => this.guard(() => this.render(alpha, frameDt)),
      },
      cfg.physics.stepHz,
      cfg.physics.maxStepsPerFrame,
    );
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(o.canvas);
    this.resize();
  }

  start(): void {
    this.loop.start();
    this.setPaused(true);
  }

  dispose(): void {
    this.loop.stop();
    this.resizeObserver.disconnect();
    for (const fn of this.cleanup.reverse()) fn();
    this.cleanup = [];
    this.events.clear();
    if (document.pointerLockElement === this.o.canvas) document.exitPointerLock();
    this.renderer.dispose();
    this.w = null;
  }

  private async init(): Promise<void> {
    const o = this.o;
    const manifest = await loadManifest(`${o.terrainBaseUrl}/manifest.json`);
    const physics = await PhysicsWorld.create(cfg.physics.gravity);
    this.cleanup.push(() => physics.dispose());
    const sampler = new TerrainSampler(manifest);
    const builder: MeshBuilder =
      o.useWorker === false ? new SyncMeshBuilder() : new WorkerMeshBuilder();
    const material = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.95,
      metalness: 0,
      side: THREE.DoubleSide,
    });
    const chunks = new ChunkManager({
      manifest,
      baseUrl: o.terrainBaseUrl,
      parent: this.scene,
      physics,
      sampler,
      builder,
      material,
      rings: cfg.terrain.lodRings,
      skirtDepthM: cfg.terrain.skirtDepthM,
      surface: cfg.surface,
    });
    this.cleanup.push(() => {
      chunks.dispose();
      builder.dispose();
      material.dispose();
    });

    await chunks.loadBackdrop();
    const start = manifest.camps[0];
    await chunks.update(start.position[0], start.position[2]);

    const player = new Player(
      physics,
      sampler,
      this.events,
      this.spawnPoint(sampler, start),
      NO_GEAR,
    );
    this.cleanup.push(() => player.dispose());
    physics.step(this.loop.stepDt);
    player.afterPhysics();

    const visual = await PlayerVisual.load(this.scene, o.characterUrl, cfg.player.heightM);
    this.cleanup.push(() => visual.dispose());

    const guide = new RouteGuide(this.scene);
    this.cleanup.push(() => guide.dispose());

    this.w = {
      manifest,
      physics,
      sampler,
      chunks,
      player,
      visual,
      cameraCtrl: new ThirdPersonCamera(this.camera, (x, z) => sampler.heightAt(x, z)),
      checkpoints: new CheckpointSystem(
        manifest.camps,
        cfg.checkpoints.radiusM,
        cfg.checkpoints.maxHeightDiffM,
        this.events,
      ),
      guide,
    };
    this.wireEvents();
    this.setActiveRoute(start.id);
    this.attachDom();
    o.publish({
      status: 'ready',
      paused: true,
      attribution: manifest.attribution,
      lastCheckpoint: start.name,
      altitudeM: Math.round(player.snapshot.feet.y),
    });
  }

  /** Show the route leaving the given camp (hidden when there is none). */
  private setActiveRoute(campId: string): void {
    const w = this.w;
    if (!w) return;
    const route = activeRoute(w.manifest.routes, campId);
    const destination = route ? w.manifest.camps.find((c) => c.id === route.to) : undefined;
    w.guide.setRoute(route, destination?.name ?? '');
  }

  private wireEvents(): void {
    this.cleanup.push(
      this.events.on('checkpoint:reached', ({ id, name }) => {
        this.showToast(`Checkpoint reached: ${name}`);
        this.o.publish({ lastCheckpoint: name });
        this.setActiveRoute(id);
      }),
      this.events.on('player:fell', ({ outcome }) => {
        if (outcome === 'fatal') this.pendingRespawn = true;
        else this.showToast('Injured — maximum stamina reduced');
      }),
      this.events.on('player:respawned', ({ checkpointName }) =>
        this.showToast(`You fell. Back at ${checkpointName}.`),
      ),
    );
  }

  private attachDom(): void {
    const canvas = this.o.canvas;
    this.input.attach(canvas);
    const onClick = () => {
      if (document.pointerLockElement !== canvas) {
        Promise.resolve(canvas.requestPointerLock()).catch(() => undefined);
      }
    };
    const onLockChange = () => this.setPaused(document.pointerLockElement !== canvas);
    const onVisibility = () => {
      if (document.hidden) this.setPaused(true);
    };
    const onContextLost = (e: Event) => {
      e.preventDefault();
      this.setPaused(true);
    };
    canvas.addEventListener('click', onClick);
    canvas.addEventListener('webglcontextlost', onContextLost);
    document.addEventListener('pointerlockchange', onLockChange);
    document.addEventListener('visibilitychange', onVisibility);
    this.cleanup.push(() => {
      this.input.detach();
      canvas.removeEventListener('click', onClick);
      canvas.removeEventListener('webglcontextlost', onContextLost);
      document.removeEventListener('pointerlockchange', onLockChange);
      document.removeEventListener('visibilitychange', onVisibility);
    });
  }

  private step(dt: number): void {
    const w = this.w;
    if (!w || this.respawning) return;
    const axis = this.input.axis();
    const move: MoveInput = {
      forward: axis.forward,
      right: axis.right,
      run: this.input.isDown('run'),
      grab: this.input.consumePressed('grab'),
      jump: this.input.consumePressed('jump'),
    };
    if (this.input.consumePressed('cameraDistance')) w.cameraCtrl.cycleDistance();
    if (this.input.consumePressed('toggleRoute')) w.guide.toggleRibbon();
    w.player.step(move, w.cameraCtrl.yaw, dt);
    w.physics.step(dt);
    w.player.afterPhysics();
    const feet = w.player.snapshot.feet;
    // Beyond the outer tiles there is no collider: treat it like a fatal fall.
    if (isOutOfWorld(feet, w.manifest, cfg.terrain.outOfWorldDropM)) this.pendingRespawn = true;
    else w.checkpoints.update(feet);
    if (this.pendingRespawn) {
      this.pendingRespawn = false;
      void this.respawn();
    }
  }

  private render(alpha: number, frameDt: number): void {
    const w = this.w;
    if (!w) return;
    const mouse = this.input.consumeMouse();
    if (!this.loop.isPaused) {
      w.cameraCtrl.applyMouse(mouse.dx, mouse.dy);
      w.cameraCtrl.applyWheel(mouse.wheel);
    }
    const snap = w.player.snapshot;
    const feet = w.player.interpolatedFeet(alpha);
    w.visual.update(
      feet,
      snap.facingYaw,
      snap.state,
      snap.moving,
      this.loop.isPaused ? 0 : frameDt,
    );
    w.cameraCtrl.update(feet, snap.state === 'climb', frameDt);
    this.guideHud = w.guide.update(feet, w.cameraCtrl.yaw);
    this.environment.follow(feet);
    if (!this.respawning) w.chunks.update(feet.x, feet.z).catch((err: unknown) => this.fail(err));
    this.renderer.render(this.scene, this.camera);
    this.publishHud(frameDt);
  }

  private async respawn(): Promise<void> {
    const w = this.w;
    if (!w) return;
    const camp = w.checkpoints.last;
    this.respawning = true;
    try {
      await w.chunks.update(camp.position[0], camp.position[2]);
    } catch (err) {
      this.fail(err);
      return;
    } finally {
      this.respawning = false;
    }
    if (this.w !== w) return;
    try {
      w.player.teleport(this.spawnPoint(w.sampler, camp));
      w.cameraCtrl.snap();
      this.setActiveRoute(camp.id);
      this.events.emit('player:respawned', { checkpointId: camp.id, checkpointName: camp.name });
    } catch (err) {
      this.fail(err);
    }
  }

  private spawnPoint(sampler: TerrainSampler, camp: CampDef): Vec3 {
    const [x, y, z] = camp.position;
    return { x, y: (sampler.heightAt(x, z) ?? y) + 0.05, z };
  }

  private publishHud(frameDt: number): void {
    const w = this.w;
    if (!w) return;
    this.hudFrames++;
    this.hudElapsedMs += frameDt * 1000;
    if (this.hudElapsedMs < cfg.hud.publishIntervalMs) return;
    const fps = Math.round(this.hudFrames / (this.hudElapsedMs / 1000));
    this.hudFrames = 0;
    this.hudElapsedMs = 0;
    if (this.toast && performance.now() > this.toast.until) this.toast = null;
    const s = w.player.snapshot;
    this.o.publish({
      altitudeM: Math.round(s.feet.y),
      stamina: Math.round(s.stamina.value),
      staminaCap: Math.round(s.stamina.cap),
      moveState: s.state,
      prompt: s.prompt,
      toast: this.toast?.text ?? null,
      fps,
      guide: this.guideHud,
    });
  }

  private showToast(text: string): void {
    this.toast = { text, until: performance.now() + cfg.hud.toastMs };
  }

  private setPaused(paused: boolean): void {
    this.loop.setPaused(paused);
    // Also reset on resume so keys pressed while paused do not fire.
    this.input.reset();
    this.o.publish({ paused });
  }

  private guard(fn: () => void): void {
    if (this.failed) return;
    try {
      fn();
    } catch (err) {
      this.fail(err);
    }
  }

  private fail(err: unknown): void {
    if (this.failed) return;
    this.failed = true;
    this.loop.stop();
    if (document.pointerLockElement === this.o.canvas) document.exitPointerLock();
    this.setPaused(true);
    this.o.publish({ status: 'error', error: err instanceof Error ? err.message : String(err) });
  }

  private resize(): void {
    const { clientWidth: width, clientHeight: height } = this.o.canvas;
    if (width === 0 || height === 0) return;
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }
}
