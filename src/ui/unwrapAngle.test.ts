import { describe, expect, it } from 'vitest';
import { unwrapAngle } from './unwrapAngle';

describe('unwrapAngle', () => {
  it('follows small changes directly', () => {
    expect(unwrapAngle(0, 1)).toBeCloseTo(1);
    expect(unwrapAngle(1, -0.5)).toBeCloseTo(-0.5);
  });

  it('crosses ±π the short way', () => {
    // 3.0 rad to -3.0 rad is 0.28 rad clockwise past π, not 6 rad back.
    expect(unwrapAngle(3, -3)).toBeCloseTo(2 * Math.PI - 3);
    expect(unwrapAngle(-3, 3)).toBeCloseTo(3 - 2 * Math.PI);
  });

  it('keeps accumulating across several turns and never moves more than π', () => {
    let rot = 0;
    for (let i = 1; i <= 40; i++) {
      const bearing =
        ((((i * 0.5 + Math.PI) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)) - Math.PI;
      const next = unwrapAngle(rot, bearing);
      expect(Math.abs(next - rot)).toBeLessThanOrEqual(Math.PI);
      rot = next;
    }
    expect(rot).toBeCloseTo(20);
  });
});
