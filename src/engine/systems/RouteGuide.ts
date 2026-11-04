import * as THREE from 'three';
import { GAME_CONFIG } from '../config/game.config';
import type { Vec3 } from '../core/math';
import type { RouteDef } from '../world/terrainData';
import { bearingTo, guideTarget, progressAlong } from './routeMath';

const g = GAME_CONFIG.guide;

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
  private readonly ribbonMaterial = new THREE.MeshBasicMaterial({
    color: g.ribbonColor,
    transparent: true,
    opacity: g.ribbonOpacity,
    depthWrite: false,
    fog: false,
    side: THREE.DoubleSide,
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

  constructor(private readonly parent: THREE.Object3D) {}

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
    this.ribbon = this.buildRibbon(route);
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

  private updateWindow(alongM: number): void {
    if (!this.ribbon) return;
    const from = alongM - g.behindM;
    const to = alongM + g.aheadM;
    const segments = this.along.length - 1;
    let first = 0;
    while (first < segments - 1 && this.along[first + 1] < from) first++;
    let last = first;
    while (last + 1 < segments && this.along[last + 1] <= to) last++;
    this.ribbon.geometry.setDrawRange(first * 6, (last - first + 1) * 6);
    this.windowAt = alongM;
  }

  private buildRibbon(route: RouteDef): THREE.Mesh {
    const p = route.points;
    const half = g.ribbonWidthM / 2;
    const positions = new Float32Array(p.length * 2 * 3);
    for (let i = 0; i < p.length; i++) {
      const a = p[Math.max(0, i - 1)];
      const b = p[Math.min(p.length - 1, i + 1)];
      const tx = b[0] - a[0];
      const tz = b[2] - a[2];
      const len = Math.hypot(tx, tz) || 1;
      const nx = -tz / len;
      const nz = tx / len;
      const y = p[i][1] + g.ribbonLiftM;
      positions.set([p[i][0] + nx * half, y, p[i][2] + nz * half], i * 6);
      positions.set([p[i][0] - nx * half, y, p[i][2] - nz * half], i * 6 + 3);
    }
    const indices: number[] = [];
    for (let i = 0; i < p.length - 1; i++) {
      const a = i * 2;
      indices.push(a, a + 1, a + 2, a + 2, a + 1, a + 3);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setIndex(indices);
    geometry.computeBoundingSphere();
    const mesh = new THREE.Mesh(geometry, this.ribbonMaterial);
    mesh.name = 'route-ribbon';
    mesh.renderOrder = 1;
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
