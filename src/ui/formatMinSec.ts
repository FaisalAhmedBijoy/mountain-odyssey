/** Whole seconds as m:ss (e.g. 462 -> "7:42"). */
export function formatMinSec(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
