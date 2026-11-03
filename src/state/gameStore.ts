import { createStore } from 'zustand/vanilla';
import { initialHudState, type HudState } from '../engine/core/hud';

/** Written by the engine (throttled), read by React. */
export const gameStore = createStore<HudState>()(() => initialHudState);
