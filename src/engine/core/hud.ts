import type { GuideHud } from '../systems/RouteGuide';
import type { Inventory } from '../survival/inventory';
import type { MoveState } from '../player/movementState';

export interface HudState {
  status: 'loading' | 'ready' | 'error';
  error: string | null;
  paused: boolean;
  altitudeM: number;
  stamina: number;
  staminaCap: number;
  oxygen: number;
  bodyTemp: number;
  supplies: number;
  items: Inventory;
  /** Whole seconds of bottled oxygen left, or null when no bottle is active. */
  o2SecondsLeft: number | null;
  /** Most severe survival warning, already worded for the player. */
  warning: string | null;
  /** True during the camp-rest fade. */
  resting: boolean;
  moveState: MoveState;
  prompt: string | null;
  lastCheckpoint: string;
  toast: string | null;
  fps: number;
  attribution: string;
  guide: GuideHud | null;
  /** Controls panel expanded (H toggles). */
  helpOpen: boolean;
}

export const initialHudState: HudState = {
  status: 'loading',
  error: null,
  paused: true,
  altitudeM: 0,
  stamina: 100,
  staminaCap: 100,
  oxygen: 100,
  bodyTemp: 100,
  supplies: 100,
  items: { food: 0, water: 0, o2: 0 },
  o2SecondsLeft: null,
  warning: null,
  resting: false,
  moveState: 'walk',
  prompt: null,
  lastCheckpoint: '',
  toast: null,
  fps: 0,
  attribution: '',
  guide: null,
  helpOpen: true,
};
