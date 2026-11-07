import * as THREE from 'three';
import type { TerrainManifest } from './terrainData';
import { placeTea, type TeaGround, type TeaRules } from './teaPlacement';
import type { TreeAvoid } from './treePlacement';

// Visual constants (metres, sRGB hex). Tuning numbers (spacing, bands, radius) live in GAME_CONFIG.
const HEDGE = { length: 1.8, width: 0.9, height: 0.8 };
const TOP_COLOR = 0x4f8f2e;
const SIDE_COLOR = 0x2f5e1f;
/** Top vertices are pulled this fraction toward the hedge centre to round the top. */
const TOP_ROUNDING = 0.1;

type SystemRules = TeaRules & {
  radiusM: number;
  cellSizeM: number;
  maxCellsPerUpdate: number;
  castShadow: boolean;
};

function buildHedgeGeometry(): THREE.BufferGeometry {
  const box = new THREE.BoxGeometry(HEDGE.length, HEDGE.height, HEDGE.width, 2, 1, 1);
  box.translate(0, HEDGE.height / 2, 0);
  const pos = box.getAttribute('position');
  const eps = 1e-6;
  for (let i = 0; i < pos.count; i++) {
    if (pos.getY(i) > HEDGE.height - eps) {
      pos.setX(i, pos.getX(i) * (1 - TOP_ROUNDING));
      pos.setZ(i, pos.getZ(i) * (1 - TOP_ROUNDING));
    }
  }
  const g = box.toNonIndexed();
  box.dispose();
  g.deleteAttribute('uv');
  const top = new THREE.Color(TOP_COLOR).convertSRGBToLinear();
  const side = new THREE.Color(SIDE_COLOR).convertSRGBToLinear();
  const p = g.getAttribute('position');
  const colors = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    const c = p.getY(i) > HEDGE.height - eps ? top : side;
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return g;
}

/** Instanced tea hedge rows in world-aligned cells around the player (Patharia spec §4). */
export class TeaSystem {
  private readonly geometry = buildHedgeGeometry();
  private readonly material = new THREE.MeshStandardMaterial({
    vertexColors: true,
    flatShading: true,
    roughness: 0.95,
  });
  private readonly avoid: TreeAvoid;
  /** Built cells; the value is null when the cell holds no tea. */
  private readonly cells = new Map<string, THREE.InstancedMesh | null>();

  private lastPlayerCell = '';
  /** True when no wanted cell was left unbuilt on the last full update. */
  private complete = false;

  constructor(
    private readonly parent: THREE.Object3D,
    private readonly manifest: TerrainManifest,
    private readonly ground: TeaGround,
    private readonly rules: SystemRules,
  ) {
    this.avoid = {
      routes: manifest.routes?.map((r) => r.points) ?? [],
      camps: manifest.camps.map((c) => c.position),
    };
  }

  get cellCount(): number {
    return this.cells.size;
  }

  update(x: number, z: number): void {
    const cs0 = this.rules.cellSizeM;
    const cellKey = `${Math.floor(x / cs0)}_${Math.floor(z / cs0)}`;
    if (cellKey === this.lastPlayerCell && this.complete) return;
    this.lastPlayerCell = cellKey;
    const m = this.manifest;
    const cs = this.rules.cellSizeM;
    const extent = m.tilesX * (m.tileSamples - 1) * m.spacingM;
    const extentZ = m.tilesZ * (m.tileSamples - 1) * m.spacingM;
    const r = this.rules.radiusM;
    const keepDist = r + cs / 2;
    const wanted = new Map<string, { ci: number; cj: number; dist: number }>();
    const keep = new Set<string>();
    const i0 = Math.floor((x - keepDist) / cs);
    const i1 = Math.floor((x + keepDist) / cs);
    const j0 = Math.floor((z - keepDist) / cs);
    const j1 = Math.floor((z + keepDist) / cs);
    for (let cj = j0; cj <= j1; cj++) {
      for (let ci = i0; ci <= i1; ci++) {
        const x0 = ci * cs;
        const z0 = cj * cs;
        if (x0 + cs <= m.originX || x0 >= m.originX + extent) continue;
        if (z0 + cs <= m.originZ || z0 >= m.originZ + extentZ) continue;
        // Distance from the player to the nearest point of the cell, so cells that
        // touch the radius are drawn.
        const dist = Math.hypot(
          Math.max(x0 - x, 0, x - (x0 + cs)),
          Math.max(z0 - z, 0, z - (z0 + cs)),
        );
        if (dist <= r) wanted.set(`${ci}_${cj}`, { ci, cj, dist });
        // Cells already built stay until they are clearly out of range.
        if (dist <= keepDist) keep.add(`${ci}_${cj}`);
      }
    }
    for (const key of [...this.cells.keys()]) {
      if (!keep.has(key)) this.removeCell(key);
    }
    const missing = [...wanted.entries()]
      .filter(([key]) => !this.cells.has(key))
      .sort((a, b) => a[1].dist - b[1].dist)
      .slice(0, this.rules.maxCellsPerUpdate);
    for (const [key, c] of missing) this.cells.set(key, this.buildCell(c.ci, c.cj));
    this.complete = !this.hasMissing(wanted);
  }

  private hasMissing(wanted: Map<string, unknown>): boolean {
    for (const key of wanted.keys()) if (!this.cells.has(key)) return true;
    return false;
  }

  dispose(): void {
    for (const key of [...this.cells.keys()]) this.removeCell(key);
    this.geometry.dispose();
    this.material.dispose();
  }

  private removeCell(key: string): void {
    const mesh = this.cells.get(key);
    if (mesh) {
      this.parent.remove(mesh);
      mesh.dispose();
    }
    this.cells.delete(key);
  }

  private buildCell(ci: number, cj: number): THREE.InstancedMesh | null {
    const cs = this.rules.cellSizeM;
    const area = { minX: ci * cs, minZ: cj * cs, maxX: (ci + 1) * cs, maxZ: (cj + 1) * cs };
    const placed = placeTea(area, this.ground, this.rules, this.avoid);
    if (placed.length === 0) return null;
    const mesh = new THREE.InstancedMesh(this.geometry, this.material, placed.length);
    const dummy = new THREE.Object3D();
    placed.forEach((t, i) => {
      dummy.position.set(t.x, t.y, t.z);
      dummy.rotation.set(0, t.yaw, 0);
      dummy.scale.setScalar(1);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.castShadow = this.rules.castShadow;
    mesh.receiveShadow = false;
    mesh.computeBoundingSphere();
    this.parent.add(mesh);
    return mesh;
  }
}
