import { useRef } from 'react';
import { useStore } from 'zustand';
import { gameStore } from '../state/gameStore';
import { CONTROL_HINTS } from './controlHints';
import { formatDistance } from './formatDistance';
import { formatMinSec } from './formatMinSec';
import { unwrapAngle } from './unwrapAngle';

interface StatBarProps {
  label: string;
  value: number;
  tone: 'stamina' | 'oxygen' | 'warmth' | 'supplies';
  cap?: number;
  warn?: boolean;
}

function StatBar({ label, value, tone, cap = 100, warn = false }: StatBarProps) {
  return (
    <>
      <div className="hud__label">{label}</div>
      <div
        className={`bar${warn ? ' bar--warn' : ''}`}
        role="meter"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={value}
      >
        <div className="bar__cap" style={{ width: `${cap}%` }} />
        <div className={`bar__fill bar__fill--${tone}`} style={{ width: `${value}%` }} />
      </div>
    </>
  );
}

export function Hud({ onExit }: { onExit?: () => void }) {
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
        <StatBar label="Stamina" value={s.stamina} cap={s.staminaCap} tone="stamina" />
        <StatBar label="Oxygen" value={s.oxygen} tone="oxygen" warn={s.lowStats.oxygen} />
        <StatBar label="Warmth" value={s.bodyTemp} tone="warmth" warn={s.lowStats.bodyTemp} />
        <StatBar label="Supplies" value={s.supplies} tone="supplies" warn={s.lowStats.supplies} />
        <div className="hud__items" data-testid="items">
          {`Food ${s.items.food} · Water ${s.items.water} · O₂ ${s.items.o2}`}
        </div>
        {s.o2SecondsLeft !== null && (
          <div className="hud__o2">{`O₂ flowing ${formatMinSec(s.o2SecondsLeft)}`}</div>
        )}
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
      {s.warning && (
        <div className="hud__warning" aria-live="polite">
          {s.warning}
        </div>
      )}
      {s.toast && (
        <div className="hud__toast" role="status">
          {s.toast}
        </div>
      )}
      {s.resting && <div className="overlay overlay--rest">Resting…</div>}
      {s.paused && (
        <div className="overlay overlay--pause">
          <p>Click to play · Esc pause</p>
          {onExit && (
            <button type="button" className="overlay__action" onClick={onExit}>
              Choose another mountain
            </button>
          )}
        </div>
      )}
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
