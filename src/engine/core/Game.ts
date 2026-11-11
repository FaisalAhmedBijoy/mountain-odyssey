import * as THREE from 'three';
import { landingTrauma } from '../camera/cameraShake';
import { ThirdPersonCamera } from '../camera/ThirdPersonCamera';
import { GAME_CONFIG as cfg, type BiomeId } from '../config/game.config';
import { PhysicsWorld } from '../physics/PhysicsWorld';
import type { MoveInput } from '../player/movementState';
import { Player } from '../player/Player';
import { PlayerVisual } from '../player/PlayerVisual';
import { SurvivalSystem, type SurvivalActions } from '../survival/SurvivalSystem';
import { lowStats, WARNING_TEXT } from '../survival/survival';
import { CheckpointSystem } from '../systems/CheckpointSystem';
import { campAt } from '../systems/camps';
import { RouteGuide, type GuideHud } from '../systems/RouteGuide';
import { activeRoute } from '../systems/routeMath';
import { ChunkManager } from '../world/ChunkManager';
import { Environment } from '../world/Environment';
import { SyncMeshBuilder, WorkerMeshBuilder, type MeshBuilder } from '../world/meshBuilder';
import { buildMapImage } from '../world/mapImage';
import {
  campProgress,
  mapBounds,
  mapHeading,
  simplifyRoute,
  worldToMap,
  type MapBounds,
} from '../world/mapMath';
import { NO_GEAR } from '../world/surface';
import { imageryUrl, loadManifest, type CampDef, type TerrainManifest } from '../world/terrainData';
import { createTerrainMaterial, loadImageryTexture } from '../world/terrainMaterial';
import { TeaSystem } from '../world/TeaSystem';
import { TerrainSampler } from '../world/TerrainSampler';
import { isOutOfWorld } from '../world/worldBounds';
import { EventBus } from './EventBus';
import { TreeSystem } from '../world/TreeSystem';
import type { GameEvents, RespawnCause } from './events';
import { GameLoop } from './GameLoop';
import type { HudState, MapInfo } from './hud';
import { InputManager } from './InputManager';
import type { Vec3 } from './math';

const RESPAWN_TOAST: Record<RespawnCause, string> = {
  fall: 'You fell.',
  collapse: 'You collapsed from lack of oxygen.',
  hypothermia: 'Hypothermia.',
};

export interface GameOptions {
  canvas: HTMLCanvasElement;
  terrainBaseUrl: string;
  characterUrl: string;
  publish: (patch: Partial<HudState>) => void;
  biome: BiomeId;
  useWorker?: boolean;
}

interface World {
  manifest: TerrainManifest;
  physics: PhysicsWorld;
  sampler: TerrainSampler;
  chunks: ChunkManager;
  trees: TreeSystem[];
  tea: TeaSystem[];
  player: Player;
  visual: PlayerVisual;
  cameraCtrl: ThirdPersonCamera;
  checkpoints: CheckpointSystem;
  guide: RouteGuide;
  survival: SurvivalSystem;
  mapBounds: MapBounds;
  campIds: string[];
}

/** Composition root: owns the renderer, systems and loop. The only API React uses. */
export class Game {
  private readonly events = new EventBus<GameEvents>();
  private readonly input = new InputManager();
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera: THREE.PerspectiveCamera;
  private environment: Environment | null = null;
  private readonly loop: GameLoop;
  private readonly resizeObserver: ResizeObserver;
  private cleanup: (() => void)[] = [];
  private w: World | null = null;
  private pendingRespawn: RespawnCause | null = null;
  private respawning = false;
  private failed = false;
  private toast: { text: string; until: number } | null = null;
  private hudElapsedMs = 0;
  private hudFrames = 0;
  private guideHud: GuideHud | null = null;
  private helpOpen = true;
  private mapOpen = false;

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
    const environment = new Environment(
      this.scene,
      true,
      cfg.biomes[o.biome].sky,
      manifest.maxHeightM + cfg.world.clouds.baseAboveMaxM,
    );
    this.environment = environment;
    this.cleanup.push(() => environment.dispose());
    const physics = await PhysicsWorld.create(cfg.physics.gravity);
    this.cleanup.push(() => physics.dispose());
    const sampler = new TerrainSampler(manifest);
    const builder: MeshBuilder =
      o.useWorker === false ? new SyncMeshBuilder() : new WorkerMeshBuilder();
    const imageUrl = imageryUrl(o.terrainBaseUrl, manifest);
    let imagery: THREE.Texture | null = null;
    if (imageUrl) {
      try {
        imagery = await loadImageryTexture(imageUrl, this.renderer.capabilities.getMaxAnisotropy());
      } catch (err) {
        console.warn('Terrain imagery failed to load; using the biome palette only.', err);
      }
    }
    const material = createTerrainMaterial(imagery, cfg.terrain.imagery);
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
      palette: cfg.biomes[this.o.biome].palette,
    });
    this.cleanup.push(() => {
      chunks.dispose();
      builder.dispose();
      material.dispose();
      imagery?.dispose();
    });

    const trees: TreeSystem[] = [];
    const tea: TeaSystem[] = [];
    for (const layer of cfg.biomes[o.biome].vegetation) {
      if (layer.kind === 'trees') {
        const system = new TreeSystem(this.scene, manifest, sampler, layer);
        trees.push(system);
        this.cleanup.push(() => system.dispose());
      } else if (layer.kind === 'tea') {
        const system = new TeaSystem(this.scene, manifest, sampler, layer);
        tea.push(system);
        this.cleanup.push(() => system.dispose());
      }
    }

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

    const guide = new RouteGuide(this.scene, (x, z) => sampler.heightAt(x, z));
    this.cleanup.push(() => guide.dispose());

    this.w = {
      manifest,
      physics,
      sampler,
      chunks,
      trees,
      tea,
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
      survival: new SurvivalSystem(cfg.survival, player.snapshot.feet.y),
      mapBounds: mapBounds(manifest),
      campIds: manifest.camps.map((c) => c.id),
    };
    this.wireEvents();
    this.setActiveRoute(start.id);
    this.attachDom();
    const backdrop = chunks.backdropData;
    const bounds = this.w.mapBounds;
    const map: MapInfo | null = backdrop
      ? {
          image: buildMapImage(backdrop, cfg.biomes[o.biome].palette, cfg.surface),
          sizeM: { x: bounds.sizeX, z: bounds.sizeZ },
          camps: manifest.camps.map((c) => ({
            id: c.id,
            name: c.name,
            elevationM: Math.round(c.position[1]),
            ...worldToMap(c.position[0], c.position[2], bounds),
          })),
          routes: (manifest.routes ?? []).map((r) =>
            simplifyRoute(r.points, cfg.map.routeSpacingM).map((p) =>
              worldToMap(p[0], p[2], bounds),
            ),
          ),
        }
      : null;
    o.publish({
      map,
      mapOpen: this.mapOpen,
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
      this.events.on('player:landed', ({ dropM }) =>
        this.w?.cameraCtrl.addTrauma(landingTrauma(dropM, cfg.camera.shake)),
      ),
      this.events.on('checkpoint:reached', ({ id, name }) => {
        this.showToast(`Checkpoint reached: ${name}`);
        this.o.publish({ lastCheckpoint: name });
        this.setActiveRoute(id);
      }),
      this.events.on('player:fell', ({ outcome }) => {
        if (outcome === 'fatal') this.pendingRespawn ??= 'fall';
        else this.showToast('Injured — maximum stamina reduced');
      }),
      this.events.on('player:respawned', ({ checkpointName, cause }) =>
        this.showToast(`${RESPAWN_TOAST[cause]} Back at ${checkpointName}.`),
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
    const actions: SurvivalActions = {
      eat: this.input.consumePressed('eat'),
      oxygen: this.input.consumePressed('oxygen'),
      rest: this.input.consumePressed('rest'),
    };
    if (w.survival.resting) {
      // The player stands still during the rest fade: drop gameplay presses made meanwhile.
      // Held keys and mouse look are kept, so the camera, H and held Shift/W still work.
      for (const a of ['grab', 'jump', 'cameraDistance', 'toggleRoute'] as const) {
        this.input.consumePressed(a);
      }
      this.stepSurvival(w, actions, dt);
      return;
    }
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
    this.stepSurvival(w, actions, dt);
    const feet = w.player.snapshot.feet;
    // Beyond the outer tiles there is no collider: treat it like a fatal fall.
    if (isOutOfWorld(feet, w.manifest, cfg.terrain.outOfWorldDropM)) this.pendingRespawn ??= 'fall';
    // A death detected this step must not move the respawn point to a camp reached in it.
    else if (!this.pendingRespawn) w.checkpoints.update(feet);
    if (this.pendingRespawn) {
      const cause = this.pendingRespawn;
      this.pendingRespawn = null;
      void this.respawn(cause);
    }
  }

  private stepSurvival(w: World, actions: SurvivalActions, dt: number): void {
    const s = w.player.snapshot;
    const out = w.survival.step(
      {
        altitudeM: s.feet.y,
        state: s.state,
        moving: s.moving,
        grounded: s.grounded,
        campId: campAt(s.feet, w.manifest.camps, cfg.checkpoints)?.id ?? null,
        windMs: 0, // calm until the weather system (M2c)
        actions,
      },
      dt,
    );
    w.player.setSurvivalModifiers(w.survival.modifiers);
    if (out.restFinished) w.player.restoreStamina();
    if (out.toast) this.showToast(out.toast);
    if (out.death) this.pendingRespawn ??= out.death;
  }

  private render(alpha: number, frameDt: number): void {
    const w = this.w;
    if (!w) return;
    const mouse = this.input.consumeMouse();
    // Read in render, not step, so H also works while the game is paused.
    if (this.input.consumePressed('toggleHelp')) {
      this.helpOpen = !this.helpOpen;
      this.o.publish({ helpOpen: this.helpOpen });
    }
    if (this.input.consumePressed('toggleMap')) {
      this.mapOpen = !this.mapOpen;
      this.o.publish({ mapOpen: this.mapOpen });
    }
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
      snap.moving && !w.survival.resting,
      this.loop.isPaused ? 0 : frameDt,
    );
    w.cameraCtrl.update(
      feet,
      {
        climbing: snap.state === 'climb',
        running: snap.state === 'run' && snap.moving,
        paused: this.loop.isPaused,
      },
      frameDt,
    );
    this.guideHud = w.guide.update(feet, w.cameraCtrl.yaw);
    this.environment?.follow(feet, this.loop.isPaused ? 0 : frameDt);
    if (!this.respawning) w.chunks.update(feet.x, feet.z).catch((err: unknown) => this.fail(err));
    if (!this.respawning) {
      for (const t of w.trees) t.update(feet.x, feet.z);
      for (const t of w.tea) t.update(feet.x, feet.z);
    }
    this.renderer.render(this.scene, this.camera);
    this.publishHud(frameDt);
  }

  private async respawn(cause: RespawnCause): Promise<void> {
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
      const spawn = this.spawnPoint(w.sampler, camp);
      w.player.teleport(spawn);
      // Drop presses queued while chunks loaded, so they do not fire on the first step.
      this.input.reset();
      w.survival.respawn(spawn.y);
      w.player.setSurvivalModifiers(w.survival.modifiers);
      w.cameraCtrl.snap();
      this.setActiveRoute(camp.id);
      this.events.emit('player:respawned', {
        checkpointId: camp.id,
        checkpointName: camp.name,
        cause,
      });
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
    const sv = w.survival.state;
    const warning = w.survival.warning;
    const canRest =
      !w.survival.resting &&
      s.grounded &&
      s.state !== 'climb' &&
      campAt(s.feet, w.manifest.camps, cfg.checkpoints) !== null;
    this.o.publish({
      mapPlayer: {
        ...worldToMap(s.feet.x, s.feet.z, w.mapBounds),
        headingRad: mapHeading(s.facingYaw),
      },
      mapCamps: campProgress(w.campIds, w.checkpoints.reachedIds, w.checkpoints.last.id),
      altitudeM: Math.round(s.feet.y),
      stamina: Math.round(s.stamina.value),
      staminaCap: Math.round(s.stamina.cap),
      moveState: s.state,
      prompt: s.prompt ?? (canRest ? 'R — Rest' : null),
      // Round up so a stat that is still above 0 never shows as 0.
      oxygen: Math.ceil(sv.oxygen),
      bodyTemp: Math.ceil(sv.bodyTemp),
      supplies: Math.ceil(sv.supplies),
      lowStats: lowStats(sv, cfg.survival),
      items: { ...sv.inventory },
      o2SecondsLeft: sv.o2SecondsLeft > 0 ? Math.ceil(sv.o2SecondsLeft) : null,
      warning: warning ? WARNING_TEXT[warning] : null,
      resting: w.survival.resting,
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
