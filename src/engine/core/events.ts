import type { FallOutcome } from '../player/fallDamage';

export type GameEvents = {
  'checkpoint:reached': { id: string; name: string };
  'player:fell': { dropM: number; outcome: FallOutcome };
  'player:respawned': { checkpointId: string; checkpointName: string };
};
