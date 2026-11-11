import * as THREE from 'three';
import type { PhysicsWorld } from '../physics/PhysicsWorld';
import type { GridGeometryData } from './gridGeometry';
import { mapBounds } from './mapMath';
import type { MeshBuilder } from './meshBuilder';
import type { TerrainPalette } from './palette';
import type { SurfaceRules } from './surface';
import {
  loadBackdrop,
  loadTile,
  tileKey,
  type Backdrop,
  type TerrainManifest,
  type TileData,
} from './terrainData';
import type { TerrainSampler } from './TerrainSampler';

export interface LodRing {
  maxRing: number;
  step: number;
}

export interface DesiredChunk {
  tx: number;
  tz: number;
  step: number;
}

export interface TileIndex {
  tx: number;
  tz: number;
}

export function tileIndexAt(m: TerrainManifest, x: number, z: number): TileIndex {
  const size = (m.tileSamples - 1) * m.spacingM;
  const clampIndex = (v: number, n: number) => Math.min(Math.max(Math.floor(v), 0), n - 1);
  return {
    tx: clampIndex((x - m.originX) / size, m.tilesX),
    tz: clampIndex((z - m.originZ) / size, m.tilesZ),
  };
}

export function desiredChunks(
  cx: number,
  cz: number,
  tilesX: number,
  tilesZ: number,
  rings: readonly LodRing[],
): DesiredChunk[] {
  const radius = rings[rings.length - 1].maxRing;
  const out: DesiredChunk[] = [];
  for (let dz = -radius; dz <= radius; dz++) {
    for (let dx = -radius; dx <= radius; dx++) {
      const tx = cx + dx;
      const tz = cz + dz;
      if (tx < 0 || tz < 0 || tx >= tilesX || tz >= tilesZ) continue;
      const ring = Math.max(Math.abs(dx), Math.abs(dz));
      const lod = rings.find((r) => ring <= r.maxRing) ?? rings[rings.length - 1];
      out.push({ tx, tz, step: lod.step });
    }
  }
  return out;
}

export function colliderChunks(
  cx: number,
  cz: number,
  tilesX: number,
  tilesZ: number,
): TileIndex[] {
  return desiredChunks(cx, cz, tilesX, tilesZ, [{ maxRing: 1, step: 1 }]).map(({ tx, tz }) => ({
    tx,
    tz,
  }));
}

export function chunkBounds(
  chunks: readonly (TileIndex & { step?: number })[],
  m: Pick<TerrainManifest, 'originX' | 'originZ' | 'tileSamples' | 'spacingM'>,
): { minX: number; minZ: number; maxX: number; maxZ: number } {
  const size = (m.tileSamples - 1) * m.spacingM;
  const xs = chunks.map((c) => c.tx);
  const zs = chunks.map((c) => c.tz);
  return {
    minX: m.originX + Math.min(...xs) * size,
    minZ: m.originZ + Math.min(...zs) * size,
    maxX: m.originX + (Math.max(...xs) + 1) * size,
    maxZ: m.originZ + (Math.max(...zs) + 1) * size,
  };
}

export interface ChunkManagerDeps {
  manifest: TerrainManifest;
  baseUrl: string;
  parent: THREE.Object3D;
  physics: PhysicsWorld;
  sampler: TerrainSampler;
  builder: MeshBuilder;
  material: THREE.Material;
  rings: readonly LodRing[];
  skirtDepthM: number;
  surface: SurfaceRules;
  palette: TerrainPalette;
  fetchFn?: typeof fetch;
}

/** Streams terrain tiles around the player: data, LOD meshes, colliders and backdrop. */
export class ChunkManager {
  private readonly tileData = new Map<string, TileData>();
  private readonly meshes = new Map<string, { mesh: THREE.Mesh; step: number }>();
  private backdrop: Backdrop | null = null;
  private backdropMesh: THREE.Mesh | null = null;
  private center: TileIndex | null = null;
  private target: TileIndex | null = null;
  private running: Promise<void> | null = null;
  private disposed = false;

  constructor(private readonly d: ChunkManagerDeps) {}

  /** The low-res backdrop heights once `loadBackdrop` has finished (used for the map). */
  get backdropData(): Backdrop | null {
    return this.backdrop;
  }

  async loadBackdrop(): Promise<void> {
    this.backdrop = await loadBackdrop(this.d.baseUrl, this.d.manifest, this.d.fetchFn);
  }

  /** Request terrain around a world position. Safe to call every frame. */
  update(x: number, z: number): Promise<void> {
    this.target = this.tileIndexAt(x, z);
    if (!this.running) {
      this.running = this.drain().finally(() => {
        this.running = null;
      });
    }
    return this.running;
  }

  dispose(): void {
    this.disposed = true;
    for (const key of [...this.meshes.keys()]) this.removeMesh(key);
    this.removeBackdropMesh();
    for (const key of this.d.physics.terrainTileKeys()) this.d.physics.removeTerrainTile(key);
    this.tileData.clear();
  }

  private tileIndexAt(x: number, z: number): TileIndex {
    return tileIndexAt(this.d.manifest, x, z);
  }

  private async drain(): Promise<void> {
    while (!this.disposed && this.target && !sameTile(this.target, this.center)) {
      const next = this.target;
      await this.reconcile(next);
      this.center = next;
    }
  }

  private async reconcile(c: TileIndex): Promise<void> {
    const { manifest: m, physics, sampler } = this.d;
    const desired = desiredChunks(c.tx, c.tz, m.tilesX, m.tilesZ, this.d.rings);
    const desiredKeys = new Set(desired.map((k) => tileKey(k.tx, k.tz)));

    await Promise.all(
      desired
        .filter((k) => !this.tileData.has(tileKey(k.tx, k.tz)))
        .map(async (k) => {
          const tile = await loadTile(this.d.baseUrl, m, k.tx, k.tz, this.d.fetchFn);
          this.tileData.set(tileKey(k.tx, k.tz), tile);
          sampler.setTile(tile);
        }),
    );
    if (this.disposed) return;

    const colliderKeys = new Set(
      colliderChunks(c.tx, c.tz, m.tilesX, m.tilesZ).map((k) => tileKey(k.tx, k.tz)),
    );
    for (const key of colliderKeys) {
      const tile = this.tileData.get(key);
      if (tile && !physics.hasTerrainTile(key)) physics.addTerrainTile(tile, m);
    }
    for (const key of physics.terrainTileKeys()) {
      if (!colliderKeys.has(key)) physics.removeTerrainTile(key);
    }

    const size = (m.tileSamples - 1) * m.spacingM;
    await Promise.all(
      desired.map(async (k) => {
        const key = tileKey(k.tx, k.tz);
        const existing = this.meshes.get(key);
        if (existing && existing.step === k.step) return;
        const tile = this.tileData.get(key);
        if (!tile) return;
        const data = await this.d.builder.build({
          heights: tile.heights,
          samplesX: m.tileSamples,
          samplesZ: m.tileSamples,
          step: k.step,
          spacingM: m.spacingM,
          originX: m.originX + k.tx * size,
          originZ: m.originZ + k.tz * size,
          skirtDepthM: this.d.skirtDepthM,
          surface: this.d.surface,
          palette: this.d.palette,
          uv: mapBounds(m),
        });
        if (this.disposed) return;
        this.removeMesh(key);
        this.meshes.set(key, { mesh: this.createMesh(data, key), step: k.step });
      }),
    );
    if (this.disposed) return;

    for (const key of [...this.meshes.keys()]) if (!desiredKeys.has(key)) this.removeMesh(key);
    for (const [key, tile] of [...this.tileData]) {
      if (desiredKeys.has(key)) continue;
      this.tileData.delete(key);
      sampler.removeTile(tile.tx, tile.tz);
    }

    await this.rebuildBackdrop(chunkBounds(desired, m));
  }

  private async rebuildBackdrop(hole: { minX: number; minZ: number; maxX: number; maxZ: number }) {
    const b = this.backdrop;
    if (!b) return;
    const m = this.d.manifest;
    const data = await this.d.builder.build({
      heights: b.heights,
      samplesX: b.samples,
      samplesZ: b.samples,
      step: 1,
      spacingM: b.spacingM,
      originX: m.originX,
      originZ: m.originZ,
      skirtDepthM: 0,
      surface: this.d.surface,
      palette: this.d.palette,
      hole,
      uv: mapBounds(m),
    });
    if (this.disposed) return;
    this.removeBackdropMesh();
    this.backdropMesh = this.createMesh(data, 'backdrop');
  }

  private createMesh(data: GridGeometryData, name: string): THREE.Mesh {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(data.positions, 3));
    geometry.setAttribute('normal', new THREE.BufferAttribute(data.normals, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(data.colors, 3));
    if (data.uvs) geometry.setAttribute('uv', new THREE.BufferAttribute(data.uvs, 2));
    geometry.setIndex(new THREE.BufferAttribute(data.indices, 1));
    geometry.computeBoundingSphere();
    const mesh = new THREE.Mesh(geometry, this.d.material);
    mesh.name = `terrain-${name}`;
    mesh.receiveShadow = true;
    mesh.matrixAutoUpdate = false;
    this.d.parent.add(mesh);
    return mesh;
  }

  private removeMesh(key: string): void {
    const entry = this.meshes.get(key);
    if (!entry) return;
    entry.mesh.removeFromParent();
    entry.mesh.geometry.dispose();
    this.meshes.delete(key);
  }

  private removeBackdropMesh(): void {
    if (!this.backdropMesh) return;
    this.backdropMesh.removeFromParent();
    this.backdropMesh.geometry.dispose();
    this.backdropMesh = null;
  }
}

function sameTile(a: TileIndex, b: TileIndex | null): boolean {
  return b !== null && a.tx === b.tx && a.tz === b.tz;
}
