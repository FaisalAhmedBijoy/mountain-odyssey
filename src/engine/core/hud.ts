import type { GuideHud } from '../systems/RouteGuide';
import type { MoveState } from '../player/movementState';

export interface HudState {
  status: 'loading' | 'ready' | 'error';
  error: string | null;
  paused: boolean;
  altitudeM: number;
  stamina: number;
  staminaCap: number;
  moveState: MoveState;
  prompt: string | null;
  lastCheckpoint: string;
  toast: string | null;
  fps: number;
  attribution: string;
  guide: GuideHud | null;
}

export const initialHudState: HudState = {
  status: 'loading',
  error: null,
  paused: true,
  altitudeM: 0,
  stamina: 100,
  staminaCap: 100,
  moveState: 'walk',
  prompt: null,
  lastCheckpoint: '',
  toast: null,
  fps: 0,
  attribution: '',
  guide: null,
};
