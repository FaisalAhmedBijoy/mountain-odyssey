import { clamp, degToRad } from '../core/math';

export interface ShakeConfig {
  decayPerSec: number;
  frequencyHz: number;
  maxPitchDeg: number;
  maxYawDeg: number;
  maxRollDeg: number;
  landMinDropM: number;
  landFullDropM: number;
  landMaxTrauma: number;
  runBobHz: number;
  runBobHeightM: number;
  runBobRollDeg: number;
}

export const addTrauma = (trauma: number, amount: number): number => clamp(trauma + amount, 0, 1);

export const decayTrauma = (trauma: number, dt: number, decayPerSec: number): number =>
  Math.max(0, trauma - decayPerSec * dt);

/** Trauma added by landing after falling dropM metres. */
export function landingTrauma(dropM: number, c: ShakeConfig): number {
  const t = (dropM - c.landMinDropM) / (c.landFullDropM - c.landMinDropM);
  return clamp(t, 0, 1) * c.landMaxTrauma;
}

/** Smooth repeatable signal in [-1, 1]. */
const wave = (timeS: number, hz: number, phase: number): number =>
  0.6 * Math.sin(2 * Math.PI * hz * timeS + phase) +
  0.4 * Math.sin(2 * Math.PI * hz * 2.3 * timeS + phase * 1.7);

/** Camera rotation offsets in radians. Strength is trauma squared, so small bumps stay small. */
export function shakeAngles(
  trauma: number,
  timeS: number,
  c: ShakeConfig,
): { pitch: number; yaw: number; roll: number } {
  const k = trauma * trauma;
  return {
    pitch: degToRad(c.maxPitchDeg) * k * wave(timeS, c.frequencyHz, 1.3),
    yaw: degToRad(c.maxYawDeg) * k * wave(timeS, c.frequencyHz, 4.1),
    roll: degToRad(c.maxRollDeg) * k * wave(timeS, c.frequencyHz, 7.7),
  };
}

/** Run bob for a stride phase in radians, scaled by weight (0 = standing, 1 = running). */
export function runBob(phase: number, weight: number, c: ShakeConfig): { y: number; roll: number } {
  return {
    y: -Math.abs(Math.sin(phase)) * c.runBobHeightM * weight,
    roll: Math.sin(phase) * degToRad(c.runBobRollDeg) * weight,
  };
}
