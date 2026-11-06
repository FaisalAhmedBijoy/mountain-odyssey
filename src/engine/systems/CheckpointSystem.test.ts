import { describe, expect, it } from 'vitest';
import { EventBus } from '../core/EventBus';
import type { GameEvents } from '../core/events';
import type { CampDef } from '../world/terrainData';
import { CheckpointSystem } from './CheckpointSystem';

const camps: CampDef[] = [
  { id: 'khare', name: 'Khare', position: [0, 5000, 800] },
  { id: 'high-camp', name: 'High Camp', position: [0, 5248, 0] },
];

function setup() {
  const events = new EventBus<GameEvents>();
  const reached: string[] = [];
  events.on('checkpoint:reached', (e) => reached.push(e.id));
  return { system: new CheckpointSystem(camps, 15, 10, events), reached };
}

describe('CheckpointSystem', () => {
  it('starts at the first camp', () => {
    expect(setup().system.last.id).toBe('khare');
  });

  it('reaches a camp within the radius and height window, once', () => {
    const { system, reached } = setup();
    system.update({ x: 10, y: 5250, z: 5 });
    system.update({ x: 0, y: 5248, z: 0 });
    expect(reached).toEqual(['high-camp']);
    expect(system.last.id).toBe('high-camp');
  });

  it('ignores positions outside the radius or far above/below', () => {
    const { system, reached } = setup();
    system.update({ x: 20, y: 5248, z: 0 });
    system.update({ x: 0, y: 5270, z: 0 });
    expect(reached).toEqual([]);
    expect(system.last.id).toBe('khare');
  });

  it('exposes the reached camp ids', () => {
    const { system } = setup();
    expect([...system.reachedIds]).toEqual(['khare']);
    system.update({ x: 0, y: 5248, z: 0 });
    expect([...system.reachedIds]).toEqual(['khare', 'high-camp']);
  });
});
