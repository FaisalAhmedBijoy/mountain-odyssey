import { describe, expect, it } from 'vitest';
import { GAME_CONFIG } from '../config/game.config';
import { degToRad } from '../core/math';
import { addTrauma, decayTrauma, landingTrauma, runBob, shakeAngles } from './cameraShake';

const c = GAME_CONFIG.camera.shake;

describe('trauma', () => {
  it('adds and clamps', () => {
    expect(addTrauma(0.8, 0.5)).toBe(1);
    expect(addTrauma(0.2, 0.3)).toBeCloseTo(0.5);
  });
  it('decays to zero', () => {
    expect(decayTrauma(0.5, 0.25, 1.6)).toBeCloseTo(0.1);
    expect(decayTrauma(0.1, 1, 1.6)).toBe(0);
  });
  it('grows with the landing drop', () => {
    expect(landingTrauma(0.3, c)).toBe(0);
    expect(landingTrauma(6, c)).toBe(c.landMaxTrauma);
    expect(landingTrauma(100, c)).toBe(c.landMaxTrauma);
    expect(landingTrauma(3.3, c)).toBeCloseTo(0.45);
  });
});

describe('shakeAngles', () => {
  it('is still without trauma', () => {
    const a = shakeAngles(0, 1.23, c);
    expect(a.pitch).toBeCloseTo(0);
    expect(a.yaw).toBeCloseTo(0);
    expect(a.roll).toBeCloseTo(0);
  });
  it('stays within the configured limits', () => {
    let moved = false;
    for (let i = 0; i < 200; i++) {
      const a = shakeAngles(1, (i / 199) * 5, c);
      expect(Math.abs(a.pitch)).toBeLessThanOrEqual(degToRad(c.maxPitchDeg) + 1e-9);
      expect(Math.abs(a.yaw)).toBeLessThanOrEqual(degToRad(c.maxYawDeg) + 1e-9);
      expect(Math.abs(a.roll)).toBeLessThanOrEqual(degToRad(c.maxRollDeg) + 1e-9);
      if (a.pitch !== 0) moved = true;
    }
    expect(moved).toBe(true);
  });
  it('scales with trauma squared', () => {
    expect(shakeAngles(0.5, 0.37, c).pitch).toBeCloseTo(0.25 * shakeAngles(1, 0.37, c).pitch);
  });
});

describe('runBob', () => {
  it('is level at phase 0', () => {
    const b = runBob(0, 1, c);
    expect(b.y).toBeCloseTo(0);
    expect(b.roll).toBeCloseTo(0);
  });
  it('dips by the configured height', () => {
    expect(runBob(Math.PI / 2, 1, c).y).toBeCloseTo(-c.runBobHeightM);
  });
  it('is zero when standing', () => {
    const b = runBob(1.1, 0, c);
    expect(b.y).toBeCloseTo(0);
    expect(b.roll).toBeCloseTo(0);
  });
});
