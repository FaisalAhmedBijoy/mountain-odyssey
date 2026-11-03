import { describe, expect, it, vi } from 'vitest';
import { EventBus } from './EventBus';

type Events = { ping: { n: number }; pong: { s: string } };

describe('EventBus', () => {
  it('delivers payloads only to subscribers of that event', () => {
    const bus = new EventBus<Events>();
    const ping = vi.fn();
    const pong = vi.fn();
    bus.on('ping', ping);
    bus.on('pong', pong);
    bus.emit('ping', { n: 1 });
    expect(ping).toHaveBeenCalledWith({ n: 1 });
    expect(pong).not.toHaveBeenCalled();
  });

  it('unsubscribes with the returned function', () => {
    const bus = new EventBus<Events>();
    const ping = vi.fn();
    const off = bus.on('ping', ping);
    off();
    bus.emit('ping', { n: 1 });
    expect(ping).not.toHaveBeenCalled();
  });

  it('clear removes every handler', () => {
    const bus = new EventBus<Events>();
    const ping = vi.fn();
    bus.on('ping', ping);
    bus.clear();
    bus.emit('ping', { n: 1 });
    expect(ping).not.toHaveBeenCalled();
  });
});
