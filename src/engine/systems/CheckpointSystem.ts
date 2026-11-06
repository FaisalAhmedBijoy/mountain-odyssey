import type { EventBus } from '../core/EventBus';
import type { GameEvents } from '../core/events';
import type { Vec3 } from '../core/math';
import type { CampDef } from '../world/terrainData';
import { isNearCamp } from './camps';

/** Detects arrival at camps; the latest one is the respawn point (spec §5.5). */
export class CheckpointSystem {
  private lastIndex = 0;
  private readonly reached = new Set<string>();

  constructor(
    private readonly camps: readonly CampDef[],
    private readonly radiusM: number,
    private readonly maxHeightDiffM: number,
    private readonly events: EventBus<GameEvents>,
  ) {
    if (camps.length === 0) throw new Error('CheckpointSystem needs at least one camp');
    this.reached.add(camps[0].id);
  }

  get last(): CampDef {
    return this.camps[this.lastIndex];
  }

  get reachedIds(): ReadonlySet<string> {
    return this.reached;
  }

  update(feet: Vec3): void {
    this.camps.forEach((camp, index) => {
      if (this.reached.has(camp.id)) return;
      const zone = { radiusM: this.radiusM, maxHeightDiffM: this.maxHeightDiffM };
      if (!isNearCamp(feet, camp, zone)) return;
      this.reached.add(camp.id);
      this.lastIndex = index;
      this.events.emit('checkpoint:reached', { id: camp.id, name: camp.name });
    });
  }
}
