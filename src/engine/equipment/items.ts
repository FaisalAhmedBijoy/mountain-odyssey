import { GAME_CONFIG } from '../config/game.config';

/** Item data lives in GAME_CONFIG.items (M2b spec §3). */
export type ItemId = keyof typeof GAME_CONFIG.items;

export const ITEM_IDS = Object.keys(GAME_CONFIG.items) as readonly ItemId[];

export const isItemId = (v: string): v is ItemId => Object.hasOwn(GAME_CONFIG.items, v);
