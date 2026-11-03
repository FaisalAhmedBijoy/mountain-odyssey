export function supportsWebGL2(): boolean {
  try {
    return document.createElement('canvas').getContext('webgl2') !== null;
  } catch {
    return false;
  }
}

/** Touch-only devices (no fine pointer) are unsupported in v1 (spec §1.3). */
export function isDesktop(): boolean {
  return window.matchMedia('(pointer: fine)').matches;
}
