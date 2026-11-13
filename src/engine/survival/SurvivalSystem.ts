import type { MoveState } from '../player/movementState';
import { activityOf } from './bodyTemp';
import { consumeNext, type Inventory } from './inventory';
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
  /** Id of the camp the player stands at, or null when not at a camp. */
  campId: string | null;
  windMs: number;
  actions: SurvivalActions;
}

export interface SurvivalOutput {
  death: DeathCause | null;
  toast: string | null;
  restFinished: boolean;
  /** True only when a camp rest finishes: it also clears a fall injury. */
  healInjury: boolean;
}

/** What the loadout gives survival (M2b spec §5.2), fixed for the climb. */
export interface SurvivalKit {
  insulation: number;
  inventory: Inventory;
  tent: boolean;
  stove: boolean;
}

/** Owns the survival state; turns key actions into state changes and toasts. */
export class SurvivalSystem {
  private s: SurvivalState;
  private restLeftSec = 0;
  /** Camp of the rest in progress. */
  private restCampId: string | null = null;
  /** Camps that already granted acclimatization; kept through respawn. */
  private readonly acclimatizedAt = new Set<string>();
  private respawnCount = 0;

  constructor(
    private readonly r: SurvivalRules,
    startAltitudeM: number,
    private readonly kit: SurvivalKit,
  ) {
    this.s = initialSurvival(r, startAltitudeM, kit.inventory);
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
      const sheltered = f.campId !== null || this.kit.tent;
      if (sheltered && f.grounded && (f.state === 'walk' || f.state === 'run')) {
        this.restLeftSec = this.r.restSeconds;
        this.restCampId = f.campId;
        return { death: null, toast: 'Resting…', restFinished: false, healInjury: false };
      }
      toast = sheltered ? 'Stand on the ground to rest' : 'You can only rest at a camp';
    }
    if (f.actions.eat) toast = this.eat();
    if (f.actions.oxygen) toast = this.useOxygen();
    const { state, death } = stepSurvival(
      this.s,
      {
        altitudeM: f.altitudeM,
        activity: activityOf(f.state, f.moving),
        atCamp: f.campId !== null,
        windMs: f.windMs,
        insulation: this.kit.insulation,
      },
      dt,
      this.r,
    );
    this.s = state;
    return { death, toast, restFinished: false, healInjury: false };
  }

  respawn(campAltitudeM: number): void {
    this.s = respawnSurvival(this.s, campAltitudeM, this.r);
    this.restLeftSec = 0;
    this.restCampId = null;
    this.respawnCount++;
  }

  private continueRest(altitudeM: number, dt: number): SurvivalOutput {
    this.restLeftSec = Math.max(0, this.restLeftSec - dt);
    if (this.restLeftSec > 0)
      return { death: null, toast: null, restFinished: false, healInjury: false };
    const campId = this.restCampId;
    this.restCampId = null;
    const t = this.r.temperature;
    const warmth =
      (campId !== null ? t.campShelterHeat : t.tentShelterHeat) +
      (this.kit.stove ? t.stoveHeat : 0);
    if (campId === null) {
      this.s = restAtCamp(this.s, altitudeM, this.r, false, warmth, false);
      return { death: null, toast: 'Rested in the tent', restFinished: true, healInjury: false };
    }
    const acclimatize = !this.acclimatizedAt.has(campId);
    if (acclimatize) this.acclimatizedAt.add(campId);
    this.s = restAtCamp(this.s, altitudeM, this.r, acclimatize, warmth);
    const m = this.s.acclimatizationM;
    return {
      death: null,
      toast: acclimatize
        ? `Rested — acclimatized to +${m} m`
        : `Rested — already acclimatized here (+${m} m)`,
      restFinished: true,
      healInjury: true,
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
