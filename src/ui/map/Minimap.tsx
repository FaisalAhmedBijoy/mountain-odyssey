import { useEffect, useRef } from 'react';
import { useStore } from 'zustand';
import { GAME_CONFIG } from '../../engine/config/game.config';
import { gameStore } from '../../state/gameStore';
import { drawMap } from './drawMap';
import { useRelief } from './useRelief';

const SIZE_PX = 180;

/** Always-visible north-up minimap centred on the player. */
export function Minimap() {
  const map = useStore(gameStore, (s) => s.map);
  const player = useStore(gameStore, (s) => s.mapPlayer);
  const camps = useStore(gameStore, (s) => s.mapCamps);
  const relief = useRelief(map);
  const ref = useRef<HTMLCanvasElement>(null);
  const dpr = Math.min(window.devicePixelRatio || 1, 2);

  useEffect(() => {
    const ctx = ref.current?.getContext('2d');
    if (!ctx || !map || !relief || !player) return;
    drawMap(ctx, relief, map, player, camps, {
      centerU: player.u,
      centerV: player.v,
      spanU: GAME_CONFIG.map.minimapSpanM / map.sizeM.x,
      sizePx: SIZE_PX * dpr,
      dpr,
      labels: false,
      north: true,
    });
  }, [map, relief, player, camps, dpr]);

  if (!map) return null;
  return (
    <canvas
      ref={ref}
      className="minimap"
      role="img"
      aria-label="Map"
      width={SIZE_PX * dpr}
      height={SIZE_PX * dpr}
    />
  );
}
