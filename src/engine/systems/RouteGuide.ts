import * as THREE from 'three';
import { GAME_CONFIG } from '../config/game.config';
import type { Vec3 } from '../core/math';
import type { RouteDef } from '../world/terrainData';
import { bearingTo, guideTarget, progressAlong } from './routeMath';

const g = GAME_CONFIG.guide;

/** Terrain height at a world x/z, or null where no tile is loaded. */
export type HeightFn = (x: number, z: number) => number | null;

export interface GuideHud {
  label: string;
  distanceM: number;
  bearingRad: number;
  offRoute: boolean;
}

/** Draws the active route (ribbon + trail markers) and computes the HUD arrow. */
export class RouteGuide {
  private route: RouteDef | null = null;
  private label = '';
  private ribbon: THREE.Mesh | null = null;
  private poles: THREE.InstancedMesh | null = null;
  private flags: THREE.InstancedMesh | null = null;
  private ribbonVisible = true;
  /** Horizontal distance from the route start to each point. */
  private along: number[] = [];
  private windowAt = -Infinity;
  /** Rows (three vertices each) the ribbon buffers hold: the longest possible window. */
  private maxRows = 0;
  private readonly ribbonMaterial = new THREE.MeshBasicMaterial({
    color: g.ribbonColor,
    transparent: true,
    opacity: g.ribbonOpacity,
    depthWrite: false,
    fog: false,
    side: THREE.DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
  private readonly poleMaterial = new THREE.MeshLambertMaterial({ color: g.markerPoleColor });
  private readonly flagMaterial = new THREE.MeshLambertMaterial({
    color: g.markerFlagColor,
    side: THREE.DoubleSide,
  });
  private readonly poleGeometry = new THREE.CylinderGeometry(
    0.03,
    0.03,
    g.markerPoleHeightM,
    6,
  ).translate(0, g.markerPoleHeightM / 2, 0);
  private readonly flagGeometry = new THREE.PlaneGeometry(0.6, 0.4).translate(
    0.3,
    g.markerPoleHeightM - 0.2,
    0,
  );

  constructor(
    private readonly parent: THREE.Object3D,
    private readonly heightAt: HeightFn,
  ) {}

  setRoute(route: RouteDef | null, label: string): void {
    this.clearObjects();
    this.route = route;
    this.label = label;
    this.windowAt = -Infinity;
    if (!route) return;
    this.along = [0];
    for (let i = 1; i < route.points.length; i++) {
      const [ax, , az] = route.points[i - 1];
      const [bx, , bz] = route.points[i];
      this.along.push(this.along[i - 1] + Math.hypot(bx - ax, bz - az));
    }
    this.ribbon = this.buildRibbon();
    this.ribbon.visible = this.ribbonVisible;
    this.parent.add(this.ribbon);
    if (route.markers.length > 0) {
      this.poles = this.buildMarkers(
        route,
        this.poleGeometry,
        this.poleMaterial,
        'route-marker-poles',
      );
      this.flags = this.buildMarkers(
        route,
        this.flagGeometry,
        this.flagMaterial,
        'route-marker-flags',
      );
    }
  }

  update(feet: Vec3, cameraYaw: number): GuideHud | null {
    const route = this.route;
    if (!route) return null;
    const progress = progressAlong(route, feet);
    const segment = this.along[progress.index + 1] - this.along[progress.index];
    const alongM = this.along[progress.index] + segment * progress.t;
    if (Math.abs(alongM - this.windowAt) >= g.windowStepM) this.updateWindow(alongM);
    const target = guideTarget(route, progress, g.lookAheadM, g.offRouteThresholdM);
    return {
      label: this.label,
      distanceM: progress.remainingM,
      bearingRad: bearingTo(feet, target, cameraYaw),
      offRoute: progress.offRouteM > g.offRouteThresholdM,
    };
  }

  toggleRibbon(): boolean {
    this.ribbonVisible = !this.ribbonVisible;
    if (this.ribbon) this.ribbon.visible = this.ribbonVisible;
    return this.ribbonVisible;
  }

  dispose(): void {
    this.clearObjects();
    this.route = null;
    this.ribbonMaterial.dispose();
    this.poleMaterial.dispose();
    this.flagMaterial.dispose();
    this.poleGeometry.dispose();
    this.flagGeometry.dispose();
  }

  /**
   * Refill the ribbon with the window from behindM behind to aheadM ahead of alongM:
   * a row every ribbonVertexSpacingM, each row a left edge, centre and right edge
   * vertex draped on the terrain (falling back to the route height where no tile is
   * loaded). Reuses the buffers allocated in buildRibbon.
   */
  private updateWindow(alongM: number): void {
    const ribbon = this.ribbon;
    const route = this.route;
    if (!ribbon || !route) return;
    const total = this.along[this.along.length - 1];
    const from = Math.max(0, Math.min(total, alongM - g.behindM));
    const to = Math.max(from, Math.min(total, alongM + g.aheadM));
    const gaps = Math.ceil((to - from) / g.ribbonVertexSpacingM - 1e-9);
    const rows = Math.min(this.maxRows, gaps + 1);
    const position = ribbon.geometry.getAttribute('position') as THREE.BufferAttribute;
    const out = position.array as Float32Array;
    const half = g.ribbonWidthM / 2;
    const step = g.ribbonVertexSpacingM / 2;
    const p = new Float64Array(3);
    const a = new Float64Array(3);
    const b = new Float64Array(3);
    for (let k = 0; k < rows; k++) {
      const s = k === rows - 1 ? to : from + k * g.ribbonVertexSpacingM;
      this.pointAt(s, p);
      this.pointAt(Math.max(0, s - step), a);
      this.pointAt(Math.min(total, s + step), b);
      const tx = b[0] - a[0];
      const tz = b[2] - a[2];
      const len = Math.hypot(tx, tz) || 1;
      const nx = -tz / len;
      const nz = tx / len;
      for (let v = 0; v < 3; v++) {
        const off = (v - 1) * half;
        const x = p[0] + nx * off;
        const z = p[2] + nz * off;
        const o = (k * 3 + v) * 3;
        out[o] = x;
        out[o + 1] = (this.heightAt(x, z) ?? p[1]) + g.ribbonLiftM;
        out[o + 2] = z;
      }
    }
    position.needsUpdate = true;
    ribbon.geometry.setDrawRange(0, Math.max(0, rows - 1) * 12);
    this.windowAt = alongM;
  }

  /** Route point (x, interpolated y, z) at horizontal distance s from the start. */
  private pointAt(s: number, out: Float64Array): void {
    const pts = this.route!.points;
    const along = this.along;
    let lo = 0;
    let hi = along.length - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (along[mid] <= s) lo = mid;
      else hi = mid;
    }
    const len = along[hi] - along[lo];
    const t = len > 0 ? Math.min(1, Math.max(0, (s - along[lo]) / len)) : 0;
    for (let i = 0; i < 3; i++) out[i] = pts[lo][i] + (pts[hi][i] - pts[lo][i]) * t;
  }

  /** Allocate the ribbon buffers once per route, sized for the longest window. */
  private buildRibbon(): THREE.Mesh {
    const total = this.along[this.along.length - 1];
    const span = Math.min(total, g.behindM + g.aheadM);
    this.maxRows = Math.ceil(span / g.ribbonVertexSpacingM - 1e-9) + 1;
    const positions = new THREE.BufferAttribute(new Float32Array(this.maxRows * 9), 3);
    positions.setUsage(THREE.DynamicDrawUsage);
    const indices: number[] = [];
    for (let k = 0; k < this.maxRows - 1; k++) {
      const a = k * 3;
      const b = a + 3;
      // left-centre and centre-right quads between row k and row k + 1
      indices.push(a, a + 1, b, b, a + 1, b + 1, a + 1, a + 2, b + 1, b + 1, a + 2, b + 2);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', positions);
    geometry.setIndex(indices);
    geometry.setDrawRange(0, 0);
    const mesh = new THREE.Mesh(geometry, this.ribbonMaterial);
    mesh.name = 'route-ribbon';
    mesh.renderOrder = 1;
    // The buffers are refilled as the window moves, so a fixed bounding sphere would be stale.
    mesh.frustumCulled = false;
    return mesh;
  }

  private buildMarkers(
    route: RouteDef,
    geometry: THREE.BufferGeometry,
    material: THREE.Material,
    name: string,
  ): THREE.InstancedMesh {
    const mesh = new THREE.InstancedMesh(geometry, material, route.markers.length);
    const m = new THREE.Matrix4();
    route.markers.forEach(([x, y, z], i) => mesh.setMatrixAt(i, m.makeTranslation(x, y, z)));
    mesh.instanceMatrix.needsUpdate = true;
    mesh.frustumCulled = false;
    mesh.castShadow = true;
    mesh.name = name;
    this.parent.add(mesh);
    return mesh;
  }

  private clearObjects(): void {
    if (this.ribbon) {
      this.ribbon.removeFromParent();
      this.ribbon.geometry.dispose();
      this.ribbon = null;
    }
    for (const mesh of [this.poles, this.flags]) {
      if (!mesh) continue;
      mesh.removeFromParent();
      mesh.dispose();
    }
    this.poles = null;
    this.flags = null;
  }
}
