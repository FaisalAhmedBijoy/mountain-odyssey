import { useEffect, useRef } from 'react';
import { useStore } from 'zustand';
import { gameStore } from '../../state/gameStore';
import { formatDistance } from '../formatDistance';
import { drawMap } from './drawMap';
import { useRelief } from './useRelief';

const SIZE_PX = 720;

/** Whole-mountain map, toggled with Tab. */
export function FullMap({ mountainName }: { mountainName: string }) {
  const open = useStore(gameStore, (s) => s.mapOpen);
  const map = useStore(gameStore, (s) => s.map);
  const player = useStore(gameStore, (s) => s.mapPlayer);
  const camps = useStore(gameStore, (s) => s.mapCamps);
  const guide = useStore(gameStore, (s) => s.guide);
  const relief = useRelief(map);
  const ref = useRef<HTMLCanvasElement>(null);
  const dpr = Math.min(window.devicePixelRatio || 1, 2);

  useEffect(() => {
    const ctx = ref.current?.getContext('2d');
    if (!open || !ctx || !map || !relief) return;
    drawMap(ctx, relief, map, player, camps, {
      centerU: 0.5,
      centerV: 0.5,
      spanU: 1,
      sizePx: SIZE_PX * dpr,
      dpr,
      labels: true,
      north: true,
    });
  }, [open, map, relief, player, camps, dpr]);

  if (!open || !map) return null;
  return (
    <div className="fullmap" role="dialog" aria-label={`Map of ${mountainName}`}>
      <div className="fullmap__title">{mountainName}</div>
      <canvas ref={ref} className="fullmap__canvas" width={SIZE_PX * dpr} height={SIZE_PX * dpr} />
      <div className="fullmap__footer">
        {guide ? `Next: ${guide.label} · ${formatDistance(guide.distanceM)}` : 'All camps reached'}
        {' · Tab — close'}
      </div>
      <ul className="sr-only">
        {map.camps.map((c) => (
          <li key={c.id}>{`${c.name} · ${c.elevationM} m · ${camps[c.id] ?? 'ahead'}`}</li>
        ))}
      </ul>
    </div>
  );
}
