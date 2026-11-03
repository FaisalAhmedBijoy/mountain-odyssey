import { lerp, type Vec3 } from '../core/math';

/** Camera offset from its target. yaw 0 = camera on +Z looking toward -Z. */
export function orbitOffset(yaw: number, pitch: number, distance: number): Vec3 {
  return {
    x: Math.sin(yaw) * Math.cos(pitch) * distance,
    y: Math.sin(pitch) * distance,
    z: Math.cos(yaw) * Math.cos(pitch) * distance,
  };
}

/** March from target to desired; stop before the first point under the terrain. */
export function resolveCameraPosition(
  target: Vec3,
  desired: Vec3,
  groundAt: (x: number, z: number) => number | null,
  padding: number,
  samples = 12,
): Vec3 {
  let safe = target;
  for (let i = 1; i <= samples; i++) {
    const p = lerp(target, desired, i / samples);
    const g = groundAt(p.x, p.z);
    if (g !== null && p.y < g + padding) break;
    safe = p;
  }
  const g = groundAt(safe.x, safe.z);
  return g !== null && safe.y < g + padding ? { ...safe, y: g + padding } : safe;
}

export const smoothFactor = (sharpness: number, dt: number): number =>
  1 - Math.exp(-sharpness * dt);
