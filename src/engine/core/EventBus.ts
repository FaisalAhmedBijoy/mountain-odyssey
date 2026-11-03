type Handler<T> = (payload: T) => void;

/** Minimal typed pub/sub used for cross-system engine events. */
export class EventBus<E extends object> {
  private readonly handlers = new Map<keyof E, Set<Handler<never>>>();

  on<K extends keyof E>(type: K, handler: Handler<E[K]>): () => void {
    const set = this.handlers.get(type) ?? new Set<Handler<never>>();
    this.handlers.set(type, set);
    set.add(handler);
    return () => {
      set.delete(handler);
    };
  }

  emit<K extends keyof E>(type: K, payload: E[K]): void {
    const set = this.handlers.get(type);
    if (!set) return;
    for (const handler of [...set]) (handler as Handler<E[K]>)(payload);
  }

  clear(): void {
    this.handlers.clear();
  }
}
