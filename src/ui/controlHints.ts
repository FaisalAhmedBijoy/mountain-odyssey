import { CONTROLS, type Action } from '../engine/config/controls.config';

export interface ControlHint {
  keys: string[];
  label: string;
}

const NAMED: Record<string, string> = { Escape: 'Esc', Space: 'Space' };

/** Readable name for a KeyboardEvent.code ("KeyE" -> "E", "ShiftLeft" -> "Shift"). */
export function keyLabel(code: string): string {
  if (NAMED[code]) return NAMED[code];
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  return code.replace(/(Left|Right)$/, '');
}

/** Distinct key names bound to the given actions, in order. */
const keysFor = (...actions: Action[]): string[] => [
  ...new Set(actions.flatMap((a) => CONTROLS[a].map(keyLabel))),
];

/** Shown in the always-visible controls panel; key names come from controls.config. */
export const CONTROL_HINTS: ControlHint[] = [
  { keys: keysFor('forward', 'left', 'back', 'right'), label: 'Move' },
  { keys: keysFor('run'), label: 'Run' },
  { keys: keysFor('jump'), label: 'Jump / let go' },
  { keys: keysFor('grab'), label: 'Grab wall' },
  { keys: keysFor('eat'), label: 'Eat / drink' },
  { keys: keysFor('oxygen'), label: 'Bottled O₂' },
  { keys: keysFor('rest'), label: 'Rest at camp or tent' },
  { keys: ['Mouse'], label: 'Look' },
  { keys: ['Wheel'], label: 'Zoom' },
  { keys: keysFor('cameraDistance'), label: 'Camera distance' },
  { keys: keysFor('toggleRoute'), label: 'Route line' },
  { keys: keysFor('toggleMap'), label: 'Map' },
  { keys: [keyLabel('Escape')], label: 'Pause' },
  { keys: keysFor('toggleHelp'), label: 'Hide controls' },
];
