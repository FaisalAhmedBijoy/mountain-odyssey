import type { HudState, MapInfo } from '../../engine/core/hud';

export interface MapView {
  /** Map units (0–1) at the canvas centre. */
  centerU: number;
  centerV: number;
  /** Map units across the canvas width. */
  spanU: number;
  /** Canvas size in device pixels (square). */
  sizePx: number;
  /** Device pixel ratio, for line widths and fonts. */
  dpr: number;
  labels: boolean;
  north: boolean;
}

const BACKGROUND = '#0d1117';
const ROUTE = '#ff8a1f';
const CAMP: Record<string, string> = { reached: '#6cc070', next: '#f2b84b', ahead: '#f5f7fa' };
const PLAYER = '#ff4d4d';

/** Draws relief, routes, camps, the player arrow and (optionally) labels and a north mark. */
export function drawMap(
  ctx: CanvasRenderingContext2D,
  relief: CanvasImageSource,
  map: MapInfo,
  player: HudState['mapPlayer'],
  camps: HudState['mapCamps'],
  view: MapView,
): void {
  const { sizePx: size, dpr } = view;
  const kx = size / view.spanU;
  const ky = (kx * map.sizeM.z) / map.sizeM.x;
  const px = (u: number) => (u - view.centerU) * kx + size / 2;
  const py = (v: number) => (v - view.centerV) * ky + size / 2;

  ctx.clearRect(0, 0, size, size);
  ctx.fillStyle = BACKGROUND;
  ctx.fillRect(0, 0, size, size);
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(relief, px(0), py(0), kx, ky);

  ctx.strokeStyle = ROUTE;
  ctx.lineWidth = (view.labels ? 3 : 2.5) * dpr;
  ctx.lineJoin = 'round';
  for (const route of map.routes) {
    ctx.beginPath();
    route.forEach((p, i) =>
      i === 0 ? ctx.moveTo(px(p.u), py(p.v)) : ctx.lineTo(px(p.u), py(p.v)),
    );
    ctx.stroke();
  }

  ctx.font = `600 ${12 * dpr}px system-ui, sans-serif`;
  ctx.textBaseline = 'middle';
  for (const camp of map.camps) {
    const x = px(camp.u);
    const y = py(camp.v);
    ctx.beginPath();
    ctx.arc(x, y, 5 * dpr, 0, Math.PI * 2);
    ctx.fillStyle = CAMP[camps[camp.id] ?? 'ahead'];
    ctx.fill();
    ctx.lineWidth = 1.5 * dpr;
    ctx.strokeStyle = BACKGROUND;
    ctx.stroke();
    if (view.labels) {
      const text = `${camp.name} · ${camp.elevationM.toLocaleString('en-US')} m`;
      ctx.lineWidth = 3 * dpr;
      ctx.strokeText(text, x + 9 * dpr, y);
      ctx.fillStyle = '#ffffff';
      ctx.fillText(text, x + 9 * dpr, y);
    }
  }

  if (player) {
    ctx.save();
    ctx.translate(px(player.u), py(player.v));
    ctx.rotate(player.headingRad);
    ctx.beginPath();
    ctx.moveTo(0, -10 * dpr);
    ctx.lineTo(7 * dpr, 8 * dpr);
    ctx.lineTo(0, 4 * dpr);
    ctx.lineTo(-7 * dpr, 8 * dpr);
    ctx.closePath();
    ctx.fillStyle = PLAYER;
    ctx.fill();
    ctx.lineWidth = 1.5 * dpr;
    ctx.strokeStyle = '#ffffff';
    ctx.stroke();
    ctx.restore();
  }

  if (view.north) {
    ctx.font = `700 ${12 * dpr}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.lineWidth = 3 * dpr;
    ctx.strokeStyle = BACKGROUND;
    ctx.strokeText('N', size / 2, 12 * dpr);
    ctx.fillStyle = '#ffffff';
    ctx.fillText('N', size / 2, 12 * dpr);
    ctx.textAlign = 'start';
  }
}
