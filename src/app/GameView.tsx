import { useEffect, useRef, useState } from 'react';
import { useStore } from 'zustand';
import type { MountainDef } from '../data/mountains';
import { isBiomeId } from '../engine/config/game.config';
import { Game } from '../engine/core/Game';
import { initialHudState } from '../engine/core/hud';
import { gameStore } from '../state/gameStore';
import { Hud } from '../ui/Hud';
import { assetUrl } from './assetUrl';

const CHARACTER_URL = assetUrl('models/RobotExpressive.glb');

export function GameView({ mountain, onExit }: { mountain: MountainDef; onExit: () => void }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [attempt, setAttempt] = useState(0);
  const status = useStore(gameStore, (s) => s.status);
  const error = useStore(gameStore, (s) => s.error);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const canvas = document.createElement('canvas');
    canvas.className = 'game-canvas';
    container.appendChild(canvas);
    gameStore.setState(initialHudState, true);

    let game: Game | null = null;
    let cancelled = false;
    const override = new URLSearchParams(window.location.search).get('biome');
    const biome = override && isBiomeId(override) ? override : mountain.biome;
    Game.create({
      canvas,
      biome,
      terrainBaseUrl: assetUrl(mountain.terrainBaseUrl),
      characterUrl: CHARACTER_URL,
      publish: (patch) => {
        if (!cancelled) gameStore.setState(patch);
      },
    })
      .then((g) => {
        if (cancelled) {
          g.dispose();
          return;
        }
        game = g;
        g.start();
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          gameStore.setState({
            status: 'error',
            error: err instanceof Error ? err.message : String(err),
          });
        }
      });

    return () => {
      cancelled = true;
      game?.dispose();
      canvas.remove();
      gameStore.setState(initialHudState, true);
    };
  }, [mountain, attempt]);

  return (
    <div
      className="game-root"
      ref={containerRef}
      data-testid="game-root"
      data-mountain={mountain.id}
    >
      {status === 'loading' && <div className="overlay">Loading {mountain.facts.name}…</div>}
      {status === 'error' && (
        <div className="overlay overlay--error" role="alert">
          <p>{error}</p>
          <button type="button" onClick={() => setAttempt((n) => n + 1)}>
            Retry
          </button>
          <button type="button" onClick={onExit}>
            Choose another mountain
          </button>
        </div>
      )}
      {status === 'ready' && <Hud onExit={onExit} />}
    </div>
  );
}
