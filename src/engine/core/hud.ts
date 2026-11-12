import type { GuideHud } from '../systems/RouteGuide';
import type { Inventory } from '../survival/inventory';
import type { LowStats } from '../survival/survival';
import type { MoveState } from '../player/movementState';
import type { MapImage } from '../world/mapImage';
import type { CampState } from '../world/mapMath';

export interface MapInfo {
  image: MapImage;
  sizeM: { x: number; z: number };
  camps: { id: string; name: string; elevationM: number; u: number; v: number }[];
  routes: { u: number; v: number }[][];
}

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
  /** Raw stat below its warning threshold (drives the bar flash). */
  lowStats: LowStats;
  items: Inventory;
  /** Pack weight in kg, one decimal, published once at load. */
  packKg: number;
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
  /** Static map data, published once after load. */
  map: MapInfo | null;
  /** Player position (0..1 map coordinates) and heading, updated each HUD tick. */
  mapPlayer: { u: number; v: number; headingRad: number } | null;
  /** Progress of each camp (reached / current / ahead). */
  mapCamps: Record<string, CampState>;
  /** Full map open (Tab toggles). */
  mapOpen: boolean;
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
  lowStats: { oxygen: false, bodyTemp: false, supplies: false },
  items: { food: 0, water: 0, o2: 0 },
  packKg: 0,
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
  map: null,
  mapPlayer: null,
  mapCamps: {},
  mapOpen: false,
};
