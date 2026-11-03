export type FallOutcome = 'none' | 'injury' | 'fatal';

export interface FallRules {
  injuryHeightM: number;
  fatalHeightM: number;
}

/** Spec §5.1: < 6 m none, 6–15 m injury, > 15 m fatal. */
export function classifyFall(dropM: number, r: FallRules): FallOutcome {
  if (dropM > r.fatalHeightM) return 'fatal';
  if (dropM >= r.injuryHeightM) return 'injury';
  return 'none';
}
