import { describe, expect, it } from 'vitest';
import { GAME_CONFIG } from '../config/game.config';
import { isItemId, ITEM_IDS } from './items';

describe('items', () => {
  it('lists the twelve M2b items in catalog order', () => {
    expect(ITEM_IDS).toEqual([
      'boots',
      'crampons',
      'iceAxe',
      'harness',
      'ascender',
      'jacket',
      'gloves',
      'tent',
      'stove',
      'food',
      'water',
      'o2',
    ]);
  });

  it('recognises item ids only', () => {
    expect(isItemId('iceAxe')).toBe(true);
    expect(isItemId('rope')).toBe(false);
    expect(isItemId('toString')).toBe(false);
  });

  it('uses the spec weights, stack sizes and insulation', () => {
    const it = GAME_CONFIG.items;
    expect(it.boots.weightKg).toBe(2);
    expect(it.o2.weightKg).toBe(3.5);
    expect(it.o2.maxCount).toBe(4);
    expect(it.food.maxCount).toBe(8);
    expect(it.food.kind).toBe('stack');
    expect(it.tent.kind).toBe('gear');
    expect(it.jacket.insulation).toBe(12);
    expect(it.gloves.insulation).toBe(4);
    expect(GAME_CONFIG.equipment.basePackKg).toBe(6);
    expect(GAME_CONFIG.survival.temperature.baseInsulation).toBe(6);
  });
});
