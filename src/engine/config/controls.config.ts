/** Key bindings by KeyboardEvent.code (spec §5.6). Rebinding UI arrives in M2. */
export const CONTROLS = {
  forward: ['KeyW'],
  back: ['KeyS'],
  left: ['KeyA'],
  right: ['KeyD'],
  run: ['ShiftLeft', 'ShiftRight'],
  jump: ['Space'],
  grab: ['KeyE'],
  eat: ['KeyF'],
  oxygen: ['KeyO'],
  rest: ['KeyR'],
  cameraDistance: ['KeyC'],
  toggleRoute: ['KeyT'],
  toggleHelp: ['KeyH'],
} as const satisfies Record<string, readonly string[]>;

export type Action = keyof typeof CONTROLS;
