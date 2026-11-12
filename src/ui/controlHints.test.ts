import { describe, expect, it } from 'vitest';
import { CONTROL_HINTS, keyLabel } from './controlHints';

describe('keyLabel', () => {
  it('turns KeyboardEvent.code values into readable key names', () => {
    expect(keyLabel('KeyE')).toBe('E');
    expect(keyLabel('ShiftLeft')).toBe('Shift');
    expect(keyLabel('ShiftRight')).toBe('Shift');
    expect(keyLabel('Space')).toBe('Space');
    expect(keyLabel('Digit1')).toBe('1');
    expect(keyLabel('Escape')).toBe('Esc');
  });
});

describe('CONTROL_HINTS', () => {
  const byLabel = (label: string) => CONTROL_HINTS.find((h) => h.label === label)?.keys;

  it('derives keys from the bindings in controls.config', () => {
    expect(byLabel('Move')).toEqual(['W', 'A', 'S', 'D']);
    expect(byLabel('Run')).toEqual(['Shift']);
    expect(byLabel('Jump / let go')).toEqual(['Space']);
    expect(byLabel('Grab wall')).toEqual(['E']);
    expect(byLabel('Eat / drink')).toEqual(['F']);
    expect(byLabel('Bottled O₂')).toEqual(['O']);
    expect(byLabel('Rest at camp or tent')).toEqual(['R']);
    expect(byLabel('Route line')).toEqual(['T']);
    expect(byLabel('Map')).toEqual(['Tab']);
    expect(byLabel('Camera distance')).toEqual(['C']);
    expect(byLabel('Hide controls')).toEqual(['H']);
  });

  it('includes mouse and pause hints', () => {
    expect(byLabel('Look')).toEqual(['Mouse']);
    expect(byLabel('Zoom')).toEqual(['Wheel']);
    expect(byLabel('Pause')).toEqual(['Esc']);
  });
});
