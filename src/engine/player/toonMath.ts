export type ClipRole = 'idle' | 'walk' | 'run' | 'fall' | 'climb';

/** One byte per toon step (0–255), for a 1-pixel-high gradient texture. */
export function toonGradientData(levels: readonly number[]): Uint8Array {
  if (levels.length === 0) throw new Error('toonLevels must not be empty');
  return Uint8Array.from(levels, (v) => Math.round(Math.min(Math.max(v, 0), 1) * 255));
}

/** For each role, the first wanted clip name the model has, or null. */
export function resolveClips(
  available: readonly string[],
  wanted: Readonly<Record<ClipRole, readonly string[]>>,
): Record<ClipRole, string | null> {
  const have = new Set(available);
  const pick = (names: readonly string[]): string | null => names.find((n) => have.has(n)) ?? null;
  return {
    idle: pick(wanted.idle),
    walk: pick(wanted.walk),
    run: pick(wanted.run),
    fall: pick(wanted.fall),
    climb: pick(wanted.climb),
  };
}
