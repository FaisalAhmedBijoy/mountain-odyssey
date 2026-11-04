import { useRef } from 'react';
import { useStore } from 'zustand';
import { gameStore } from '../state/gameStore';
import { CONTROL_HINTS } from './controlHints';
import { formatDistance } from './formatDistance';
import { unwrapAngle } from './unwrapAngle';

export function Hud() {
  const s = useStore(gameStore);
  // Unwrapped arrow rotation: each bearing is taken the short way from the last one.
  // Idempotent for a repeated bearing, so a double render (StrictMode) is harmless.
  const arrowRad = useRef<number | null>(null);
  if (s.guide) {
    const prev = arrowRad.current;
    arrowRad.current = prev === null ? s.guide.bearingRad : unwrapAngle(prev, s.guide.bearingRad);
  }
  return (
    <div className="hud" data-testid="hud">
      <div className="hud__panel">
        <div className="hud__altitude" data-testid="altitude">
          {s.altitudeM.toLocaleString('en-US')} m
        </div>
        <div className="hud__label">Stamina</div>
        <div
          className="bar"
          role="meter"
          aria-label="Stamina"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={s.stamina}
        >
          <div className="bar__cap" style={{ width: `${s.staminaCap}%` }} />
          <div className="bar__fill" style={{ width: `${s.stamina}%` }} />
        </div>
        <div className="hud__meta">
          {s.lastCheckpoint} · {s.moveState}
        </div>
      </div>
      {s.guide && (
        <div
          className={`hud__guide${s.guide.offRoute ? ' hud__guide--off' : ''}`}
          data-testid="guide"
        >
          <div
            className="hud__guide-arrow"
            style={{ transform: `rotate(${arrowRad.current}rad)` }}
            aria-hidden="true"
          >
            ▲
          </div>
          <div className="hud__guide-label">
            {s.guide.label} · {formatDistance(s.guide.distanceM)}
          </div>
          {s.guide.offRoute && (
            <div className="hud__guide-warning">Off route — follow the arrow</div>
          )}
        </div>
      )}
      {s.prompt && <div className="hud__prompt">{s.prompt}</div>}
      {s.toast && (
        <div className="hud__toast" role="status">
          {s.toast}
        </div>
      )}
      {s.paused && <div className="overlay overlay--pause">Click to play · Esc pause</div>}
      <div
        className={`hud__controls${s.helpOpen ? '' : ' hud__controls--closed'}`}
        data-testid="controls"
        aria-label="Controls"
      >
        {s.helpOpen ? (
          <dl className="hud__controls-list">
            {CONTROL_HINTS.map((hint) => (
              <div className="hud__controls-row" key={hint.label}>
                <dt>
                  {hint.keys.map((k) => (
                    <kbd key={k}>{k}</kbd>
                  ))}
                </dt>
                <dd>{hint.label}</dd>
              </div>
            ))}
          </dl>
        ) : (
          <div className="hud__controls-row">
            <kbd>H</kbd>
            <span>Controls</span>
          </div>
        )}
      </div>
      <div className="hud__fps">{s.fps} FPS</div>
      <div className="hud__credit">{s.attribution}</div>
    </div>
  );
}
