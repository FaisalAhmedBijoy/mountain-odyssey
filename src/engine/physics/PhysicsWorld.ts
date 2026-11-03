import RAPIER from '@dimforge/rapier3d-compat';
import type { Vec3 } from '../core/math';
import { tileKey, type TerrainManifest, type TileData } from '../world/terrainData';

export interface RayHit {
  point: Vec3;
  normal: Vec3;
  distance: number;
}

let initPromise: Promise<void> | null = null;

export function initRapier(): Promise<void> {
  initPromise ??= RAPIER.init();
  return initPromise;
}

/** Thin wrapper over a Rapier world. Rapier simulates; it never renders. */
export class PhysicsWorld {
  readonly R = RAPIER;
  readonly world: RAPIER.World;
  private readonly terrain = new Map<string, RAPIER.Collider>();

  private constructor(gravityY: number) {
    this.world = new RAPIER.World({ x: 0, y: gravityY, z: 0 });
  }

  static async create(gravityY: number): Promise<PhysicsWorld> {
    await initRapier();
    return new PhysicsWorld(gravityY);
  }

  addTerrainTile(tile: TileData, m: TerrainManifest): void {
    const key = tileKey(tile.tx, tile.tz);
    if (this.terrain.has(key)) return;
    const s = m.tileSamples;
    const cells = s - 1;
    // Rapier heightfields are column-major: rows run along z, columns along x.
    const colMajor = new Float32Array(s * s);
    for (let z = 0; z < s; z++) {
      for (let x = 0; x < s; x++) colMajor[z + x * s] = tile.heights[z * s + x];
    }
    const size = cells * m.spacingM;
    const desc = RAPIER.ColliderDesc.heightfield(
      cells,
      cells,
      colMajor,
      { x: size, y: 1, z: size },
      RAPIER.HeightFieldFlags.FIX_INTERNAL_EDGES,
    ).setTranslation(
      m.originX + tile.tx * size + size / 2,
      0,
      m.originZ + tile.tz * size + size / 2,
    );
    this.terrain.set(key, this.world.createCollider(desc));
  }

  removeTerrainTile(key: string): void {
    const collider = this.terrain.get(key);
    if (!collider) return;
    this.world.removeCollider(collider, false);
    this.terrain.delete(key);
  }

  hasTerrainTile(key: string): boolean {
    return this.terrain.has(key);
  }

  terrainTileKeys(): string[] {
    return [...this.terrain.keys()];
  }

  step(dt: number): void {
    this.world.timestep = dt;
    this.world.step();
  }

  castRay(origin: Vec3, dir: Vec3, maxDist: number, exclude?: RAPIER.Collider): RayHit | null {
    const ray = new RAPIER.Ray(origin, dir);
    const hit = this.world.castRayAndGetNormal(ray, maxDist, true, undefined, undefined, exclude);
    if (!hit) return null;
    const p = ray.pointAt(hit.timeOfImpact);
    return {
      point: { x: p.x, y: p.y, z: p.z },
      normal: { x: hit.normal.x, y: hit.normal.y, z: hit.normal.z },
      distance: hit.timeOfImpact,
    };
  }

  dispose(): void {
    this.terrain.clear();
    this.world.free();
  }
}
