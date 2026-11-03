export interface LoopCallbacks {
  step(dt: number): void;
  render(alpha: number, frameDt: number): void;
}

/** Fixed-timestep simulation with interpolated rendering (spec §6.3). */
export class GameLoop {
  readonly stepDt: number;
  private accumulator = 0;
  private paused = false;
  private rafId: number | null = null;
  private lastTime = 0;

  constructor(
    private readonly callbacks: LoopCallbacks,
    stepHz = 60,
    private readonly maxStepsPerFrame = 5,
  ) {
    this.stepDt = 1 / stepHz;
  }

  get isPaused(): boolean {
    return this.paused;
  }

  setPaused(paused: boolean): void {
    this.paused = paused;
    if (paused) this.accumulator = 0;
  }

  /** Advances by one real frame. Returns the number of fixed steps run. */
  advance(frameDt: number): number {
    const dt = Math.min(Math.max(frameDt, 0), 0.25);
    let steps = 0;
    if (!this.paused) {
      this.accumulator += dt;
      while (this.accumulator >= this.stepDt && steps < this.maxStepsPerFrame) {
        this.callbacks.step(this.stepDt);
        this.accumulator -= this.stepDt;
        steps++;
      }
      if (this.accumulator >= this.stepDt) this.accumulator = 0;
    }
    this.callbacks.render(this.paused ? 1 : this.accumulator / this.stepDt, dt);
    return steps;
  }

  start(): void {
    if (this.rafId !== null) return;
    this.lastTime = performance.now();
    const tick = (now: number) => {
      this.rafId = requestAnimationFrame(tick);
      const frameDt = (now - this.lastTime) / 1000;
      this.lastTime = now;
      this.advance(frameDt);
    };
    this.rafId = requestAnimationFrame(tick);
  }

  stop(): void {
    if (this.rafId !== null) cancelAnimationFrame(this.rafId);
    this.rafId = null;
  }
}
