import { GAME_CONFIG } from '../../engine/config/game.config';
import type { ItemId } from '../../engine/equipment/items';
import type { Loadout, MountainGear } from '../../engine/equipment/loadout';

/** New loadout with `id` changed by `delta`, kept within 0..maxCount (1.. for required items). */
export function adjustCount(l: Loadout, id: ItemId, delta: number, g: MountainGear): Loadout {
  const min = g.required.includes(id) ? 1 : 0;
  const max = GAME_CONFIG.items[id].maxCount;
  const next = Math.min(max, Math.max(min, (l[id] ?? 0) + delta));
  return { ...l, [id]: next };
}

/** Pack or leave behind a single item. */
export function toggleItem(l: Loadout, id: ItemId, g: MountainGear): Loadout {
  return adjustCount(l, id, (l[id] ?? 0) > 0 ? -1 : 1, g);
}

export const formatKg = (kg: number): string => kg.toFixed(1);
