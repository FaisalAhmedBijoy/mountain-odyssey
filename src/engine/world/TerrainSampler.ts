import { clamp, normalize, radToDeg, type Vec3 } from '../core/math';
import { glacierAt, type SurfaceMask } from './surfaceMask';
import { tileKey, type TerrainManifest, type TileData } from './terrainData';

/** CPU-side height queries over the currently loaded tiles. */
export class TerrainSampler {
  private readonly tiles = new Map<string, Float32Array>();
  private readonly cells: number;
  private mask: SurfaceMask | null = null;

  constructor(private readonly m: TerrainManifest) {
    this.cells = m.tileSamples - 1;
  }

  setSurfaceMask(mask: SurfaceMask | null): void {
    this.mask = mask;
  }

  /** Glacier at a world point: null when there is no mask or the point is outside it. */
  onGlacierAt(x: number, z: number): boolean | null {
    return this.mask ? glacierAt(this.mask, x, z) : null;
  }

  setTile(tile: TileData): void {
    this.tiles.set(tileKey(tile.tx, tile.tz), tile.heights);
  }

  removeTile(tx: number, tz: number): void {
    this.tiles.delete(tileKey(tx, tz));
  }

  hasTile(tx: number, tz: number): boolean {
    return this.tiles.has(tileKey(tx, tz));
  }

  heightAt(x: number, z: number): number | null {
    const { m, cells } = this;
    const fx = (x - m.originX) / m.spacingM;
    const fz = (z - m.originZ) / m.spacingM;
    if (fx < 0 || fz < 0 || fx > cells * m.tilesX || fz > cells * m.tilesZ) return null;
    const tx = Math.min(Math.floor(fx / cells), m.tilesX - 1);
    const tz = Math.min(Math.floor(fz / cells), m.tilesZ - 1);
    const h = this.tiles.get(tileKey(tx, tz));
    if (!h) return null;
    const lx = fx - tx * cells;
    const lz = fz - tz * cells;
    const x0 = Math.min(Math.floor(lx), cells - 1);
    const z0 = Math.min(Math.floor(lz), cells - 1);
    const ax = lx - x0;
    const az = lz - z0;
    const s = m.tileSamples;
    const h00 = h[z0 * s + x0];
    const h10 = h[z0 * s + x0 + 1];
    const h01 = h[(z0 + 1) * s + x0];
    const h11 = h[(z0 + 1) * s + x0 + 1];
    return (h00 * (1 - ax) + h10 * ax) * (1 - az) + (h01 * (1 - ax) + h11 * ax) * az;
  }

  normalAt(x: number, z: number): Vec3 | null {
    const e = this.m.spacingM;
    const left = this.heightAt(x - e, z);
    const right = this.heightAt(x + e, z);
    const north = this.heightAt(x, z - e);
    const south = this.heightAt(x, z + e);
    if (left === null || right === null || north === null || south === null) return null;
    return normalize({ x: left - right, y: 2 * e, z: north - south });
  }

  slopeDegAt(x: number, z: number): number | null {
    const n = this.normalAt(x, z);
    return n ? radToDeg(Math.acos(clamp(n.y, -1, 1))) : null;
  }
}
