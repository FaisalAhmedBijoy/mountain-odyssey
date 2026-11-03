import { describe, expect, it, vi } from 'vitest';
import { GameLoop } from './GameLoop';

function makeLoop(stepHz: number, maxSteps = 5) {
  const step = vi.fn();
  const render = vi.fn();
  return { loop: new GameLoop({ step, render }, stepHz, maxSteps), step, render };
}

describe('GameLoop.advance', () => {
  it('runs fixed steps and renders with the leftover fraction', () => {
    const { loop, step, render } = makeLoop(10);
    expect(loop.advance(0.25)).toBe(2);
    expect(step).toHaveBeenCalledTimes(2);
    expect(step).toHaveBeenCalledWith(0.1);
    expect(render.mock.calls[0]![0]).toBeCloseTo(0.5);
  });

  it('carries the remainder into the next frame', () => {
    const { loop, step } = makeLoop(10);
    loop.advance(0.05);
    expect(step).not.toHaveBeenCalled();
    loop.advance(0.06);
    expect(step).toHaveBeenCalledTimes(1);
  });

  it('caps steps per frame and drops the backlog', () => {
    const { loop, step, render } = makeLoop(100, 5);
    expect(loop.advance(0.25)).toBe(5);
    expect(step).toHaveBeenCalledTimes(5);
    expect(render.mock.calls[0]![0]).toBe(0);
  });

  it('does not step while paused but still renders the current state', () => {
    const { loop, step, render } = makeLoop(10);
    loop.setPaused(true);
    expect(loop.advance(1)).toBe(0);
    expect(step).not.toHaveBeenCalled();
    expect(render).toHaveBeenCalledWith(1, 0.25);
  });

  it('ignores negative frame times', () => {
    const { loop, step } = makeLoop(10);
    expect(loop.advance(-1)).toBe(0);
    expect(step).not.toHaveBeenCalled();
  });
});
