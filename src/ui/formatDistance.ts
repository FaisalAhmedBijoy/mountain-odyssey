/** "850 m" below 1 km, "3.4 km" from 1 km up. */
export function formatDistance(m: number): string {
  const rounded = Math.round(m);
  return rounded < 1000 ? `${rounded} m` : `${(m / 1000).toFixed(1)} km`;
}
