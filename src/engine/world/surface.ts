export type Surface = 'rock' | 'snow' | 'ice';

export interface SurfaceRules {
  rockMinSlopeDeg: number;
  snowlineM: number;
  iceMinAltitudeM: number;
  iceMinSlopeDeg: number;
}

/** What the loadout lets the player do (M2b spec §5.2). */
export interface Gear {
  iceAxe: boolean;
  crampons: boolean;
  gloves: boolean;
  harness: boolean;
  ascender: boolean;
  tent: boolean;
  stove: boolean;
}

export const NO_GEAR: Gear = {
  iceAxe: false,
  crampons: false,
  gloves: false,
  harness: false,
  ascender: false,
  tent: false,
  stove: false,
};

/** M1 runtime classification; baked splat maps replace this in M2. */
export function surfaceAt(slopeDeg: number, altitudeM: number, rules: SurfaceRules): Surface {
  if (slopeDeg >= rules.rockMinSlopeDeg) return 'rock';
  if (altitudeM < rules.snowlineM) return 'rock';
  if (altitudeM >= rules.iceMinAltitudeM && slopeDeg >= rules.iceMinSlopeDeg) return 'ice';
  return 'snow';
}

/** Null when climbable with this gear, otherwise the HUD message (spec §5.1, M2b §3). */
export function climbRequirement(
  surface: Surface,
  gear: Gear,
  airTempC: number,
  glovesMinAirTempC: number,
): string | null {
  if (airTempC < glovesMinAirTempC && !gear.gloves) return 'Requires gloves (too cold)';
  if (surface === 'snow') return gear.iceAxe ? null : 'Requires ice axe';
  if (surface === 'ice') return gear.iceAxe && gear.crampons ? null : 'Requires ice axe + crampons';
  return null;
}

/** sRGB colours, 0–1. */
export const SURFACE_COLORS: Record<Surface, readonly [number, number, number]> = {
  rock: [0.43, 0.41, 0.39],
  snow: [0.93, 0.95, 0.97],
  ice: [0.72, 0.83, 0.9],
};
