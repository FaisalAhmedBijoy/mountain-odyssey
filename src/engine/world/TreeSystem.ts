import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { tileIndexAt } from './ChunkManager';
import type { TerrainManifest } from './terrainData';
import { placeTrees, type TreeAvoid, type TreeGround, type TreeRules } from './treePlacement';

// Visual constants (metres, sRGB hex). Tuning numbers (density, spacing, scale) live in GAME_CONFIG.
export const TRUNK_COLOR = 0x5a3b22;
export const CROWN_COLORS = [0x2f6b2a, 0x3d7a2e, 0x4f8a36] as const;
const CONIFER = { trunkR: 0.15, trunkH: 2, crownR: 1.6, crownH: 4, crownY: 4 };
const BROADLEAF = { trunkR: 0.2, trunkH: 2.5, crownR: 2, crownY: 3.8 };
const BUSH = { crownR: 1.1, crownY: 0.9 };
const TRUNK_SIDES = 6;
const CONE_SIDES = 7;

type TileGround = TreeGround & { hasTile(tx: number, tz: number): boolean };
type SystemRules = TreeRules & { ringRadius: number; castShadow: boolean };

function part(geo: THREE.BufferGeometry, y: number, hex: number): THREE.BufferGeometry {
  const g = geo.index ? geo.toNonIndexed() : geo;
  if (g !== geo) geo.dispose();
  g.translate(0, y, 0);
  // Converts the sRGB hex to the linear working space exactly once.
  const c = new THREE.Color().setHex(hex, THREE.SRGBColorSpace);
  const n = g.getAttribute('position').count;
  const colors = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  g.deleteAttribute('uv');
  return g;
}

function merge(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const merged = mergeGeometries(parts, false);
  for (const p of parts) p.dispose();
  return merged;
}

function buildVariants(): THREE.BufferGeometry[] {
  const trunk = (r: number, h: number) =>
    part(new THREE.CylinderGeometry(r * 0.8, r, h, TRUNK_SIDES), h / 2, TRUNK_COLOR);
  return [
    merge([
      trunk(CONIFER.trunkR, CONIFER.trunkH),
      part(
        new THREE.ConeGeometry(CONIFER.crownR, CONIFER.crownH, CONE_SIDES),
        CONIFER.crownY,
        CROWN_COLORS[0],
      ),
    ]),
    merge([
      trunk(BROADLEAF.trunkR, BROADLEAF.trunkH),
      part(new THREE.IcosahedronGeometry(BROADLEAF.crownR, 0), BROADLEAF.crownY, CROWN_COLORS[1]),
    ]),
    merge([part(new THREE.IcosahedronGeometry(BUSH.crownR, 0), BUSH.crownY, CROWN_COLORS[2])]),
  ];
}

/** Instanced low-poly trees for the terrain tiles around the player (spec §4). */
export class TreeSystem {
  private readonly variants = buildVariants();
  private readonly material = new THREE.MeshStandardMaterial({
    vertexColors: true,
    flatShading: true,
    roughness: 0.9,
  });
  private readonly avoid: TreeAvoid;
  private readonly tiles = new Map<string, THREE.InstancedMesh[]>();

  constructor(
    private readonly parent: THREE.Object3D,
    private readonly manifest: TerrainManifest,
    private readonly ground: TileGround,
    private readonly rules: SystemRules,
  ) {
    this.avoid = {
      routes: manifest.routes?.map((r) => r.points) ?? [],
      camps: manifest.camps.map((c) => c.position),
    };
  }

  get tileCount(): number {
    return this.tiles.size;
  }

  update(x: number, z: number): void {
    const m = this.manifest;
    const c = tileIndexAt(m, x, z);
    const r = this.rules.ringRadius;
    const wanted: { tx: number; tz: number; dist: number }[] = [];
    for (let tz = Math.max(0, c.tz - r); tz <= Math.min(m.tilesZ - 1, c.tz + r); tz++) {
      for (let tx = Math.max(0, c.tx - r); tx <= Math.min(m.tilesX - 1, c.tx + r); tx++) {
        wanted.push({ tx, tz, dist: Math.max(Math.abs(tx - c.tx), Math.abs(tz - c.tz)) });
      }
    }
    const keys = new Set(wanted.map((t) => `${t.tx}_${t.tz}`));
    for (const key of [...this.tiles.keys()]) {
      if (!keys.has(key)) this.removeTile(key);
    }
    wanted.sort((a, b) => a.dist - b.dist);
    for (const t of wanted) {
      if (this.tiles.has(`${t.tx}_${t.tz}`) || !this.ground.hasTile(t.tx, t.tz)) continue;
      this.buildTile(t.tx, t.tz);
      break;
    }
  }

  dispose(): void {
    for (const key of [...this.tiles.keys()]) this.removeTile(key);
    for (const v of this.variants) v.dispose();
    this.material.dispose();
  }

  private removeTile(key: string): void {
    for (const mesh of this.tiles.get(key) ?? []) {
      this.parent.remove(mesh);
      mesh.dispose();
    }
    this.tiles.delete(key);
  }

  private buildTile(tx: number, tz: number): void {
    const m = this.manifest;
    const size = (m.tileSamples - 1) * m.spacingM;
    const minX = m.originX + tx * size;
    const minZ = m.originZ + tz * size;
    const area = { minX, minZ, maxX: minX + size, maxZ: minZ + size };
    const placed = placeTrees(area, this.ground, this.rules, this.avoid, this.variants.length);
    const meshes: THREE.InstancedMesh[] = [];
    const dummy = new THREE.Object3D();
    this.variants.forEach((geo, v) => {
      const list = placed.filter((t) => t.variant === v);
      if (list.length === 0) return;
      const mesh = new THREE.InstancedMesh(geo, this.material, list.length);
      list.forEach((t, i) => {
        dummy.position.set(t.x, t.y, t.z);
        dummy.rotation.set(0, t.rotation, 0);
        dummy.scale.setScalar(t.scale);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
      });
      mesh.instanceMatrix.needsUpdate = true;
      mesh.castShadow = this.rules.castShadow;
      mesh.receiveShadow = false;
      mesh.frustumCulled = true;
      mesh.computeBoundingSphere();
      this.parent.add(mesh);
      meshes.push(mesh);
    });
    this.tiles.set(`${tx}_${tz}`, meshes);
  }
}
