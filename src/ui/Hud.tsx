import { useStore } from 'zustand';
import { gameStore } from '../state/gameStore';

export function Hud() {
  const s = useStore(gameStore);
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
      {s.prompt && <div className="hud__prompt">{s.prompt}</div>}
      {s.toast && (
        <div className="hud__toast" role="status">
          {s.toast}
        </div>
      )}
      {s.paused && (
        <div className="overlay overlay--pause">
          Click to play · WASD move · Shift run · Space jump · E grab · C camera · Esc pause
        </div>
      )}
      <div className="hud__fps">{s.fps} FPS</div>
      <div className="hud__credit">{s.attribution}</div>
    </div>
  );
}
