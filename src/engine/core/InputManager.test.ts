import { describe, expect, it } from 'vitest';
import { InputManager } from './InputManager';

describe('InputManager', () => {
  it('tracks held keys as actions', () => {
    const input = new InputManager();
    input.onKeyDown('ShiftRight');
    expect(input.isDown('run')).toBe(true);
    input.onKeyUp('ShiftRight');
    expect(input.isDown('run')).toBe(false);
  });

  it('reports a press exactly once and ignores auto-repeat', () => {
    const input = new InputManager();
    input.onKeyDown('KeyE');
    input.onKeyDown('KeyE', true);
    expect(input.consumePressed('grab')).toBe(true);
    expect(input.consumePressed('grab')).toBe(false);
  });

  it('builds a movement axis from WASD', () => {
    const input = new InputManager();
    input.onKeyDown('KeyW');
    input.onKeyDown('KeyD');
    expect(input.axis()).toEqual({ forward: 1, right: 1 });
    input.onKeyDown('KeyS');
    expect(input.axis()).toEqual({ forward: 0, right: 1 });
  });

  it('accumulates mouse movement until consumed', () => {
    const input = new InputManager();
    input.onMouseMove(3, -2);
    input.onMouseMove(1, 1);
    input.onWheel(100);
    expect(input.consumeMouse()).toEqual({ dx: 4, dy: -1, wheel: 100 });
    expect(input.consumeMouse()).toEqual({ dx: 0, dy: 0, wheel: 0 });
  });

  it('reset releases every key', () => {
    const input = new InputManager();
    input.onKeyDown('KeyW');
    input.reset();
    expect(input.isDown('forward')).toBe(false);
    expect(input.consumePressed('forward')).toBe(false);
  });
});
