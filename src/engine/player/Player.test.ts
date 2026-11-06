import { afterEach, describe, expect, it } from 'vitest';
import { GAME_CONFIG } from '../config/game.config';
import { EventBus } from '../core/EventBus';
import type { GameEvents } from '../core/events';
import type { Vec3 } from '../core/math';
import { PhysicsWorld } from '../physics/PhysicsWorld';
import { NO_GEAR } from '../world/surface';
import type { TerrainManifest } from '../world/terrainData';
import { TerrainSampler } from '../world/TerrainSampler';
import { NO_INPUT, type MoveInput } from './movementState';
import { Player } from './Player';

const DT = 1 / 60;

// One 64 x 64 m tile centred on the origin: flat at 100 m south of z = -10,
// an 8 m cliff between z = -11 and z = -10, and a plateau at 108 m to the north.
const manifest: TerrainManifest = {
  id: 'cliff',
  spacingM: 1,
  tileSamples: 65,
  tilesX: 1,
  tilesZ: 1,
  originX: -32,
  originZ: -32,
  minHeightM: 90,
  maxHeightM: 120,
  backdrop: { file: 'backdrop.u16', samples: 2, spacingM: 64 },
  camps: [],
  attribution: '',
};

let physics: PhysicsWorld | null = null;
afterEach(() => physics?.dispose());

const tallManifest: TerrainManifest = { ...manifest, maxHeightM: 140 };
const cliffHeight = (z: number) => (z <= -11 ? 108 : 100);

async function setup(
  spawn: Vec3,
  heightAtZ: (z: number) => number = cliffHeight,
  m: TerrainManifest = manifest,
) {
  const heights = new Float32Array(65 * 65);
  for (let r = 0; r < 65; r++) {
    for (let c = 0; c < 65; c++) heights[r * 65 + c] = heightAtZ(-32 + r);
  }
  const tile = { tx: 0, tz: 0, heights };
  physics = await PhysicsWorld.create(-9.81);
  physics.addTerrainTile(tile, m);
  const sampler = new TerrainSampler(m);
  sampler.setTile(tile);
  const events = new EventBus<GameEvents>();
  const fell: GameEvents['player:fell'][] = [];
  events.on('player:fell', (e) => fell.push(e));
  const player = new Player(physics, sampler, events, spawn, NO_GEAR);
  physics.step(DT);
  player.afterPhysics();
  const p = physics;
  const run = (input: Partial<MoveInput>, steps: number) => {
    for (let i = 0; i < steps; i++) {
      player.step({ ...NO_INPUT, ...input }, 0, DT);
      p.step(DT);
      player.afterPhysics();
    }
  };
  return { player, run, fell };
}

describe('Player', () => {
  it('walks forward (toward -Z) at walking speed', async () => {
    const { player, run } = await setup({ x: 0, y: 100.05, z: 0 });
    run({ forward: 1 }, 60);
    const s = player.snapshot;
    expect(s.state).toBe('walk');
    expect(s.grounded).toBe(true);
    // One second of walking covers about walkSpeed metres.
    expect(-s.feet.z).toBeGreaterThan(GAME_CONFIG.movement.walkSpeed * 0.85);
    expect(-s.feet.z).toBeLessThan(GAME_CONFIG.movement.walkSpeed * 1.05);
    expect(s.feet.y).toBeCloseTo(100, 1);
  });

  it('drains stamina while running', async () => {
    const { player, run } = await setup({ x: 0, y: 100.05, z: 0 });
    run({}, 10);
    run({ forward: 1, run: true }, 60);
    expect(player.snapshot.state).toBe('run');
    expect(player.snapshot.stamina.value).toBeCloseTo(92, 0);
  });

  it('offers a grab at the cliff, climbs it and mantles onto the plateau', async () => {
    const { player, run } = await setup({ x: 0, y: 100.05, z: -9 });
    run({}, 10);
    expect(player.snapshot.prompt).toBe('E — Grab');
    run({ grab: true }, 1);
    expect(player.snapshot.state).toBe('climb');
    run({ forward: 1 }, 1080);
    const s = player.snapshot;
    expect(s.state).toBe('walk');
    expect(s.feet.y).toBeCloseTo(108, 0);
    expect(s.feet.z).toBeLessThan(-10.5);
    expect(s.stamina.value).toBeGreaterThan(0);
  });

  it('lets go of the wall with Space', async () => {
    const { player, run } = await setup({ x: 0, y: 100.05, z: -9 });
    run({}, 10);
    run({ grab: true }, 1);
    run({ forward: 1 }, 120);
    run({ jump: true }, 1);
    expect(player.snapshot.state).toBe('fall');
  });

  it('reports an injury after falling off the 8 m cliff', async () => {
    const { player, run, fell } = await setup({ x: 0, y: 108.05, z: -14 });
    run({}, 10);
    run({ forward: -1 }, 240);
    expect(fell).toHaveLength(1);
    expect(fell[0]!.outcome).toBe('injury');
    expect(fell[0]!.dropM).toBeGreaterThan(6);
    expect(fell[0]!.dropM).toBeLessThan(9);
    expect(player.snapshot.stamina.cap).toBe(70);
  });

  describe('grabbing a wall mid-fall', () => {
    // A 30 m wall between z = -11 and z = -10; the player starts in the air beside it,
    // facing the wall (-Z), with 20 m of air below.
    const wall = (z: number) => (z <= -11 ? 130 : 100);

    async function fallThenGrab(grabBelowY: number) {
      const ctx = await setup({ x: 0, y: 120, z: -9.8 }, wall, tallManifest);
      for (let i = 0; i < 300 && ctx.player.snapshot.feet.y > grabBelowY; i++) ctx.run({}, 1);
      expect(ctx.player.snapshot.state).toBe('fall');
      ctx.run({ grab: true }, 1);
      expect(ctx.player.snapshot.state).toBe('climb');
      ctx.run({}, 30);
      return ctx;
    }

    it('scores a drop of more than 6 m before the grab as an injury', async () => {
      const { player, fell } = await fallThenGrab(112);
      expect(fell).toHaveLength(1);
      expect(fell[0]!.outcome).toBe('injury');
      expect(fell[0]!.dropM).toBeGreaterThan(6);
      expect(fell[0]!.dropM).toBeLessThan(10);
      expect(player.snapshot.stamina.cap).toBe(70);
    });

    it('does not score a drop of less than 6 m before the grab', async () => {
      const { fell } = await fallThenGrab(117);
      expect(fell.filter((e) => e.outcome !== 'none')).toEqual([]);
    });
  });

  it('teleport resets position, state and stamina', async () => {
    const { player, run } = await setup({ x: 0, y: 100.05, z: 0 });
    run({ forward: 1, run: true }, 60);
    player.teleport({ x: 5, y: 100.05, z: 5 });
    const s = player.snapshot;
    expect(s.feet).toEqual({ x: 5, y: 100.05, z: 5 });
    expect(s.state).toBe('walk');
    expect(s.stamina).toEqual({ value: 100, cap: 100 });
  });

  it('down-climbs a 55 degree face without being ejected, then walks off at the bottom', async () => {
    // Flat 100 m for z >= -5, then a face rising 1.43 m per metre up to z = -15.
    const face = (z: number) => (z >= -5 ? 100 : z <= -15 ? 114.3 : 100 + 1.43 * (-5 - z));
    const { player, run } = await setup({ x: 0, y: 100.05, z: -4.5 }, face);
    run({}, 10);
    run({ grab: true }, 1);
    expect(player.snapshot.state).toBe('climb');
    run({ forward: 1 }, 300);
    const high = player.snapshot.feet.y;
    expect(player.snapshot.state).toBe('climb');
    expect(high).toBeGreaterThan(101.5);
    run({ forward: -1 }, 60);
    expect(player.snapshot.state).toBe('climb');
    expect(player.snapshot.feet.y).toBeLessThan(high - 0.3);
    // Climb down until the feet reach the flat ground, then take a few steps away.
    // A fixed step count would walk off the 64 m test tile at higher walk speeds.
    for (let i = 0; i < 1200 && player.snapshot.state === 'climb'; i++) run({ forward: -1 }, 1);
    run({ forward: -1 }, 30);
    expect(player.snapshot.state).toBe('walk');
    expect(player.snapshot.feet.y).toBeCloseTo(100, 0);
  });

  it('does not count sliding down a 35 degree slope as a damaging fall', async () => {
    const slope = (z: number) => (z <= -25 ? 135 : z >= 25 ? 100 : 100 + 0.7 * (25 - z));
    const tall = { ...manifest, maxHeightM: 140 };
    const { player, run, fell } = await setup({ x: 0, y: 131.55, z: -20 }, slope, tall);
    run({}, 10);
    expect(player.snapshot.state).toBe('slide');
    run({}, 900);
    expect(player.snapshot.feet.y).toBeLessThan(110);
    expect(fell.filter((e) => e.outcome !== 'none')).toEqual([]);
  });

  it('scores a slide down a 60 degree face as one injury', async () => {
    const face = (z: number) => Math.max(100, 110 - 1.732 * (z + 10 > 0 ? z + 10 : 0));
    const { run, fell } = await setup({ x: 0, y: 109.2, z: -9.5 }, face, tallManifest);
    run({}, 600);
    expect(fell).toHaveLength(1);
    expect(fell[0]!.outcome).toBe('injury');
    expect(fell[0]!.dropM).toBeGreaterThan(6);
    expect(fell[0]!.dropM).toBeLessThan(15);
  });

  it('combines an airborne drop with the steep slide it lands on', async () => {
    // 4 m of air onto a 60 degree face that drops 3.5 m more: neither part reaches 6 m.
    const face = (z: number) => Math.max(103, 110 - 1.732 * (z + 10 > 0 ? z + 10 : 0));
    const { run, fell } = await setup({ x: 0, y: 110.5, z: -8 }, face, tallManifest);
    run({}, 600);
    expect(fell).toHaveLength(1);
    expect(fell[0]!.outcome).toBe('injury');
    expect(fell[0]!.dropM).toBeGreaterThan(6);
  });

  it('does not score a long gentle runout below a short steep lip', async () => {
    const z1 = -25 + 3 / 1.732;
    const lip = (z: number) =>
      z <= -25 ? 130 : z <= z1 ? 130 - 1.732 * (z + 25) : Math.max(100, 127 - 0.7 * (z - z1));
    const { player, run, fell } = await setup({ x: 0, y: 130.05, z: -24.8 }, lip, tallManifest);
    run({}, 1500);
    expect(player.snapshot.feet.y).toBeLessThan(110);
    expect(fell.filter((e) => e.outcome === 'injury' || e.outcome === 'fatal')).toEqual([]);
  });

  it('scales stamina recovery and caps stamina by the survival modifiers', async () => {
    const { player, run } = await setup({ x: 0, y: 100.05, z: 0 });
    run({}, 10);
    run({ forward: 1, run: true }, 60);
    const before = player.snapshot.stamina.value;
    player.setSurvivalModifiers({
      staminaRecoveryMul: 0.5,
      staminaCapLimit: 100,
      climbSpeedMul: 1,
    });
    run({}, 60);
    expect(player.snapshot.stamina.value).toBeCloseTo(before + 3, 1);
    player.setSurvivalModifiers({ staminaRecoveryMul: 1, staminaCapLimit: 50, climbSpeedMul: 1 });
    run({}, 1);
    expect(player.snapshot.stamina).toEqual({ value: 50, cap: 50 });
  });

  it('climbs slower when the survival modifiers say it is cold', async () => {
    async function climbedMetres(climbSpeedMul: number): Promise<number> {
      const { player, run } = await setup({ x: 0, y: 100.05, z: -9 });
      player.setSurvivalModifiers({ staminaRecoveryMul: 1, staminaCapLimit: 100, climbSpeedMul });
      run({}, 10);
      run({ grab: true }, 1);
      const y0 = player.snapshot.feet.y;
      run({ forward: 1 }, 120);
      expect(player.snapshot.state).toBe('climb');
      const dy = player.snapshot.feet.y - y0;
      physics?.dispose();
      physics = null;
      return dy;
    }
    const warm = await climbedMetres(1);
    const cold = await climbedMetres(0.7);
    expect(cold / warm).toBeCloseTo(0.7, 1);
  });

  it('restoreStamina refills stamina and clears an injury', async () => {
    const { player, run } = await setup({ x: 0, y: 108.05, z: -14 });
    run({}, 10);
    run({ forward: -1 }, 240);
    expect(player.snapshot.stamina.cap).toBe(70);
    player.restoreStamina();
    expect(player.snapshot.stamina).toEqual({ value: 100, cap: 100 });
  });
});
