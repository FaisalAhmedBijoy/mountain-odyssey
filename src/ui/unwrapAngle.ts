const TWO_PI = 2 * Math.PI;

/**
 * The angle equal to `next` (mod 2π) that is closest to `prev`. Feeding each result
 * back in as `prev` gives an unwrapped rotation, so a CSS rotate transition never spins
 * the long way round when the bearing crosses ±π.
 */
export function unwrapAngle(prev: number, next: number): number {
  const d = next - prev;
  return prev + d - TWO_PI * Math.round(d / TWO_PI);
}
