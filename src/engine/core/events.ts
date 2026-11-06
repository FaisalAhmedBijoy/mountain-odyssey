import type { FallOutcome } from '../player/fallDamage';
import type { DeathCause } from '../survival/survival';

export type RespawnCause = 'fall' | DeathCause;

export type GameEvents = {
  'checkpoint:reached': { id: string; name: string };
  'player:fell': { dropM: number; outcome: FallOutcome };
  'player:respawned': { checkpointId: string; checkpointName: string; cause: RespawnCause };
};
