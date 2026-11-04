import { clamp, type Vec3 } from '../core/math';
import type { RouteDef } from '../world/terrainData';

export interface RouteProgress {
  /** Segment index (points[index] -> points[index + 1]). */
  index: number;
  /** 0–1 position along that segment. */
  t: number;
  /** Horizontal distance from the player to the route. */
  offRouteM: number;
  /** 3D route length from the nearest point to the end. */
  remainingM: number;
}

type P3 = [number, number, number];

const length3 = (a: P3, b: P3): number => Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);

export function activeRoute(
  routes: readonly RouteDef[] | undefined,
  fromCampId: string,
): RouteDef | null {
  return routes?.find((r) => r.from === fromCampId) ?? null;
}

export function pointOnRoute(route: RouteDef, index: number, t: number): Vec3 {
  const a = route.points[index];
  const b = route.points[Math.min(index + 1, route.points.length - 1)];
  return { x: a[0] + (b[0] - a[0]) * t, y: a[1] + (b[1] - a[1]) * t, z: a[2] + (b[2] - a[2]) * t };
}

export function progressAlong(route: RouteDef, feet: Vec3): RouteProgress {
  const p = route.points;
  let index = 0;
  let t = 0;
  let bestD2 = Infinity;
  for (let i = 0; i < p.length - 1; i++) {
    const [ax, , az] = p[i];
    const [bx, , bz] = p[i + 1];
    const dx = bx - ax;
    const dz = bz - az;
    const len2 = dx * dx + dz * dz;
    const s = len2 > 0 ? clamp(((feet.x - ax) * dx + (feet.z - az) * dz) / len2, 0, 1) : 0;
    const qx = ax + dx * s;
    const qz = az + dz * s;
    const d2 = (feet.x - qx) ** 2 + (feet.z - qz) ** 2;
    if (d2 < bestD2) {
      bestD2 = d2;
      index = i;
      t = s;
    }
  }
  let remainingM = length3(p[index], p[index + 1]) * (1 - t);
  for (let i = index + 1; i < p.length - 1; i++) remainingM += length3(p[i], p[i + 1]);
  return { index, t, offRouteM: Math.sqrt(bestD2), remainingM };
}

export function guideTarget(
  route: RouteDef,
  progress: RouteProgress,
  lookAheadM: number,
  offRouteThresholdM: number,
): Vec3 {
  let from = pointOnRoute(route, progress.index, progress.t);
  if (progress.offRouteM > offRouteThresholdM) return from;
  let need = lookAheadM;
  for (let i = progress.index + 1; i < route.points.length; i++) {
    const [x, y, z] = route.points[i];
    const to = { x, y, z };
    const step = Math.hypot(to.x - from.x, to.z - from.z);
    if (step >= need) {
      const k = step > 0 ? need / step : 0;
      return {
        x: from.x + (to.x - from.x) * k,
        y: from.y + (to.y - from.y) * k,
        z: from.z + (to.z - from.z) * k,
      };
    }
    need -= step;
    from = to;
  }
  return from;
}

export function bearingTo(from: Vec3, to: Vec3, cameraYaw: number): number {
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  const ahead = -Math.sin(cameraYaw) * dx - Math.cos(cameraYaw) * dz;
  const right = Math.cos(cameraYaw) * dx - Math.sin(cameraYaw) * dz;
  return Math.atan2(right, ahead);
}
