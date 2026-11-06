import type { MoveState } from '../player/movementState';
import { activityOf } from './bodyTemp';
import { consumeNext } from './inventory';
import {
  initialSurvival,
  respawnSurvival,
  restAtCamp,
  startBottle,
  stepSurvival,
  survivalModifiers,
  topWarning,
  type DeathCause,
  type SurvivalModifiers,
  type SurvivalRules,
  type SurvivalState,
  type Warning,
} from './survival';

export interface SurvivalActions {
  eat: boolean;
  oxygen: boolean;
  rest: boolean;
}

export interface SurvivalFrame {
  altitudeM: number;
  state: MoveState;
  moving: boolean;
  grounded: boolean;
  atCamp: boolean;
  windMs: number;
  actions: SurvivalActions;
}

export interface SurvivalOutput {
  death: DeathCause | null;
  toast: string | null;
  restFinished: boolean;
}

/** Owns the survival state; turns key actions into state changes and toasts. */
export class SurvivalSystem {
  private s: SurvivalState;
  private restLeftSec = 0;
  private respawnCount = 0;

  constructor(
    private readonly r: SurvivalRules,
    startAltitudeM: number,
  ) {
    this.s = initialSurvival(r, startAltitudeM);
  }

  get state(): SurvivalState {
    return this.s;
  }

  get resting(): boolean {
    return this.restLeftSec > 0;
  }

  get respawns(): number {
    return this.respawnCount;
  }

  get modifiers(): SurvivalModifiers {
    return survivalModifiers(this.s, this.r);
  }

  get warning(): Warning | null {
    return topWarning(this.s, this.r);
  }

  /** One fixed step. Survival does not tick and actions are ignored while resting. */
  step(f: SurvivalFrame, dt: number): SurvivalOutput {
    if (this.resting) return this.continueRest(f.altitudeM, dt);
    let toast: string | null = null;
    if (f.actions.rest) {
      if (f.atCamp && f.grounded && f.state !== 'climb') {
        this.restLeftSec = this.r.restSeconds;
        return { death: null, toast: 'Resting…', restFinished: false };
      }
      toast = f.atCamp ? 'Stand on the ground to rest' : 'You can only rest at a camp';
    }
    if (f.actions.eat) toast = this.eat();
    if (f.actions.oxygen) toast = this.useOxygen();
    const { state, death } = stepSurvival(
      this.s,
      {
        altitudeM: f.altitudeM,
        activity: activityOf(f.state, f.moving),
        atCamp: f.atCamp,
        windMs: f.windMs,
      },
      dt,
      this.r,
    );
    this.s = state;
    return { death, toast, restFinished: false };
  }

  respawn(campAltitudeM: number): void {
    this.s = respawnSurvival(this.s, campAltitudeM, this.r);
    this.restLeftSec = 0;
    this.respawnCount++;
  }

  private continueRest(altitudeM: number, dt: number): SurvivalOutput {
    this.restLeftSec = Math.max(0, this.restLeftSec - dt);
    if (this.restLeftSec > 0) return { death: null, toast: null, restFinished: false };
    this.s = restAtCamp(this.s, altitudeM, this.r);
    return {
      death: null,
      toast: `Rested — acclimatized to +${this.s.acclimatizationM} m`,
      restFinished: true,
    };
  }

  private eat(): string {
    const c = consumeNext(this.s.inventory, this.s.supplies, this.r.supplies, this.r.max);
    this.s = { ...this.s, inventory: c.inventory, supplies: c.supplies };
    switch (c.outcome) {
      case 'food':
        return `Ate a food ration (+${this.r.supplies.foodGain} supplies)`;
      case 'water':
        return `Drank water (+${this.r.supplies.waterGain} supplies)`;
      case 'full':
        return 'Supplies are already full';
      case 'empty':
        return 'No food or water left';
    }
  }

  private useOxygen(): string {
    const { state, result } = startBottle(this.s, this.r);
    this.s = state;
    switch (result) {
      case 'started':
        return `Bottled oxygen on — ${this.r.oxygen.bottleSeconds / 60} min`;
      case 'active':
        return 'Bottled oxygen is already flowing';
      case 'empty':
        return 'No oxygen bottles left';
    }
  }
}
