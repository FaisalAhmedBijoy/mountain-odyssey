import { CONTROLS, type Action } from '../config/controls.config';

const PREVENT_DEFAULT = new Set(['Space', 'Tab']);

export class InputManager {
  private readonly down = new Set<string>();
  private readonly pressed = new Set<string>();
  private mouseDx = 0;
  private mouseDy = 0;
  private wheel = 0;
  private target: HTMLElement | null = null;

  onKeyDown(code: string, repeat = false): void {
    if (!repeat && !this.down.has(code)) this.pressed.add(code);
    this.down.add(code);
  }

  onKeyUp(code: string): void {
    this.down.delete(code);
  }

  onMouseMove(dx: number, dy: number): void {
    this.mouseDx += dx;
    this.mouseDy += dy;
  }

  onWheel(dy: number): void {
    this.wheel += dy;
  }

  reset(): void {
    this.down.clear();
    this.pressed.clear();
    this.mouseDx = 0;
    this.mouseDy = 0;
    this.wheel = 0;
  }

  isDown(action: Action): boolean {
    return CONTROLS[action].some((code) => this.down.has(code));
  }

  /** True once per physical key press; the press is consumed. */
  consumePressed(action: Action): boolean {
    let hit = false;
    for (const code of CONTROLS[action]) if (this.pressed.delete(code)) hit = true;
    return hit;
  }

  consumeMouse(): { dx: number; dy: number; wheel: number } {
    const result = { dx: this.mouseDx, dy: this.mouseDy, wheel: this.wheel };
    this.mouseDx = 0;
    this.mouseDy = 0;
    this.wheel = 0;
    return result;
  }

  axis(): { forward: number; right: number } {
    const v = (a: Action) => (this.isDown(a) ? 1 : 0);
    return { forward: v('forward') - v('back'), right: v('right') - v('left') };
  }

  attach(target: HTMLElement): void {
    this.target = target;
    window.addEventListener('keydown', this.handleKeyDown);
    window.addEventListener('keyup', this.handleKeyUp);
    window.addEventListener('blur', this.handleBlur);
    document.addEventListener('mousemove', this.handleMouseMove);
    target.addEventListener('wheel', this.handleWheel, { passive: true });
  }

  detach(): void {
    window.removeEventListener('keydown', this.handleKeyDown);
    window.removeEventListener('keyup', this.handleKeyUp);
    window.removeEventListener('blur', this.handleBlur);
    document.removeEventListener('mousemove', this.handleMouseMove);
    this.target?.removeEventListener('wheel', this.handleWheel);
    this.target = null;
  }

  private readonly handleKeyDown = (e: KeyboardEvent): void => {
    if (PREVENT_DEFAULT.has(e.code)) e.preventDefault();
    this.onKeyDown(e.code, e.repeat);
  };

  private readonly handleKeyUp = (e: KeyboardEvent): void => this.onKeyUp(e.code);

  private readonly handleBlur = (): void => this.reset();

  private readonly handleMouseMove = (e: MouseEvent): void => {
    if (this.target && document.pointerLockElement === this.target) {
      this.onMouseMove(e.movementX, e.movementY);
    }
  };

  private readonly handleWheel = (e: WheelEvent): void => this.onWheel(e.deltaY);
}
