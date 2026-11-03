import type { EventBus } from '../core/EventBus';
import type { GameEvents } from '../core/events';
import type { Vec3 } from '../core/math';
import type { CampDef } from '../world/terrainData';

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

  update(feet: Vec3): void {
    this.camps.forEach((camp, index) => {
      if (this.reached.has(camp.id)) return;
      const [x, y, z] = camp.position;
      const near = Math.hypot(feet.x - x, feet.z - z) <= this.radiusM;
      if (!near || Math.abs(feet.y - y) > this.maxHeightDiffM) return;
      this.reached.add(camp.id);
      this.lastIndex = index;
      this.events.emit('checkpoint:reached', { id: camp.id, name: camp.name });
    });
  }
}
