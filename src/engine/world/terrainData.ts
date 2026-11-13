import type { SurfaceMask } from './surfaceMask';

export interface CampDef {
  id: string;
  name: string;
  position: [number, number, number];
}

export interface RouteDef {
  from: string;
  to: string;
  lengthM: number;
  /** [x, y, z] world points, at most ~20 m apart. */
  points: [number, number, number][];
  /** [x, y, z] trail-marker positions. */
  markers: [number, number, number][];
}

export interface TerrainManifest {
  id: string;
  spacingM: number;
  tileSamples: number;
  tilesX: number;
  tilesZ: number;
  originX: number;
  originZ: number;
  minHeightM: number;
  maxHeightM: number;
  backdrop: { file: string; samples: number; spacingM: number };
  camps: CampDef[];
  routes?: RouteDef[];
  attribution: string;
  imagery?: { file: string; sizePx: number };
  /** Baked glacier mask (spec 002): square, covers the terrain, row = z. */
  surfaceMask?: { file: string; samples: number; spacingM: number; source: string };
}

/** Heights in metres, row-major with row = z (south). */
export interface TileData {
  tx: number;
  tz: number;
  heights: Float32Array;
}

export interface Backdrop {
  samples: number;
  spacingM: number;
  heights: Float32Array;
}

const REQUIRED: (keyof TerrainManifest)[] = [
  'id',
  'spacingM',
  'tileSamples',
  'tilesX',
  'tilesZ',
  'originX',
  'originZ',
  'minHeightM',
  'maxHeightM',
  'backdrop',
  'camps',
];

export function decodeHeights(buffer: ArrayBuffer, minH: number, maxH: number): Float32Array {
  const raw = new Uint16Array(buffer); // tiles are little-endian; all supported browsers are LE
  const out = new Float32Array(raw.length);
  const k = (maxH - minH) / 65535;
  for (let i = 0; i < raw.length; i++) out[i] = minH + raw[i] * k;
  return out;
}

export const tileKey = (tx: number, tz: number): string => `${tx}_${tz}`;

export const tileUrl = (baseUrl: string, tx: number, tz: number): string =>
  `${baseUrl}/tiles/${tx}_${tz}.u16`;

const isVec3 = (v: unknown): v is [number, number, number] =>
  Array.isArray(v) && v.length === 3 && v.every((n) => typeof n === 'number' && Number.isFinite(n));

/** Valid routes only; malformed entries are dropped with a warning, never thrown. */
export function parseRoutes(raw: unknown, campIds: ReadonlySet<string>): RouteDef[] {
  if (raw === undefined) return [];
  if (!Array.isArray(raw)) {
    console.warn('Terrain manifest "routes" is not an array; ignoring it');
    return [];
  }
  const out: RouteDef[] = [];
  raw.forEach((entry: unknown, i) => {
    const r = (entry ?? {}) as Partial<RouteDef>;
    const ok =
      typeof r.from === 'string' &&
      campIds.has(r.from) &&
      typeof r.to === 'string' &&
      campIds.has(r.to) &&
      typeof r.lengthM === 'number' &&
      Array.isArray(r.points) &&
      r.points.length >= 2 &&
      r.points.every(isVec3) &&
      Array.isArray(r.markers) &&
      r.markers.every(isVec3);
    if (ok) out.push(r as RouteDef);
    else console.warn(`Terrain manifest route ${i} is malformed; ignoring it`);
  });
  return out;
}

export function parseManifest(json: unknown): TerrainManifest {
  const m = json as Partial<TerrainManifest>;
  for (const key of REQUIRED) {
    if (m[key] === undefined) throw new Error(`Terrain manifest is missing "${key}"`);
  }
  if (!Array.isArray(m.camps) || m.camps.length < 2) {
    throw new Error('Terrain manifest needs at least two camps');
  }
  const campIds = new Set(m.camps.map((c) => c.id));
  return {
    attribution: '',
    ...m,
    routes: parseRoutes(m.routes, campIds),
    imagery: parseImagery(m.imagery),
    surfaceMask: parseSurfaceMask(m.surfaceMask, (m.tileSamples! - 1) * m.tilesX! * m.spacingM!),
  } as TerrainManifest;
}

/** A valid imagery entry, or undefined (with a warning when one is present but malformed). */
export function parseImagery(raw: unknown): TerrainManifest['imagery'] {
  if (raw === undefined || raw === null) return undefined;
  const r = raw as { file?: unknown; sizePx?: unknown };
  const ok =
    typeof r.file === 'string' &&
    /^[\w.-]+$/.test(r.file) &&
    typeof r.sizePx === 'number' &&
    Number.isInteger(r.sizePx) &&
    r.sizePx > 0;
  if (ok) return { file: r.file as string, sizePx: r.sizePx as number };
  console.warn('Terrain manifest "imagery" is malformed; ignoring it');
  return undefined;
}

/** A valid mask entry covering a `sizeM` square, or undefined (warning when malformed). */
export function parseSurfaceMask(raw: unknown, sizeM: number): TerrainManifest['surfaceMask'] {
  if (raw === undefined || raw === null) return undefined;
  const r = raw as { file?: unknown; samples?: unknown; spacingM?: unknown; source?: unknown };
  const ok =
    typeof r.file === 'string' &&
    /^[\w.-]+$/.test(r.file) &&
    typeof r.samples === 'number' &&
    Number.isInteger(r.samples) &&
    r.samples > 1 &&
    typeof r.spacingM === 'number' &&
    Number.isFinite(r.spacingM) &&
    r.spacingM > 0 &&
    Math.abs((r.samples - 1) * r.spacingM - sizeM) < 1e-6;
  if (ok) {
    return {
      file: r.file as string,
      samples: r.samples as number,
      spacingM: r.spacingM as number,
      source: typeof r.source === 'string' ? r.source : '',
    };
  }
  console.warn('Terrain manifest "surfaceMask" is malformed; ignoring it');
  return undefined;
}

export const imageryUrl = (baseUrl: string, m: TerrainManifest): string | null =>
  m.imagery ? `${baseUrl}/${m.imagery.file}` : null;

export async function fetchWithRetry(
  url: string,
  attempts = 3,
  baseDelayMs = 300,
  fetchFn: typeof fetch = fetch,
): Promise<Response> {
  let lastError: unknown = null;
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetchFn(url);
      if (res.ok) return res;
      lastError = new Error(`HTTP ${res.status} for ${url}`);
    } catch (err) {
      lastError = err;
    }
    if (i < attempts - 1) await new Promise((r) => setTimeout(r, baseDelayMs * 2 ** i));
  }
  throw lastError instanceof Error ? lastError : new Error(`Failed to load ${url}`);
}

export async function loadManifest(url: string, fetchFn?: typeof fetch): Promise<TerrainManifest> {
  const res = await fetchWithRetry(url, 3, 300, fetchFn);
  return parseManifest(await res.json());
}

export async function loadTile(
  baseUrl: string,
  m: TerrainManifest,
  tx: number,
  tz: number,
  fetchFn?: typeof fetch,
): Promise<TileData> {
  const url = tileUrl(baseUrl, tx, tz);
  const res = await fetchWithRetry(url, 3, 300, fetchFn);
  const heights = decodeHeights(await res.arrayBuffer(), m.minHeightM, m.maxHeightM);
  if (heights.length !== m.tileSamples * m.tileSamples) {
    throw new Error(`Tile ${url} has ${heights.length} samples, expected ${m.tileSamples ** 2}`);
  }
  return { tx, tz, heights };
}

export async function loadBackdrop(
  baseUrl: string,
  m: TerrainManifest,
  fetchFn?: typeof fetch,
): Promise<Backdrop> {
  const url = `${baseUrl}/${m.backdrop.file}`;
  const res = await fetchWithRetry(url, 3, 300, fetchFn);
  const heights = decodeHeights(await res.arrayBuffer(), m.minHeightM, m.maxHeightM);
  if (heights.length !== m.backdrop.samples ** 2) {
    throw new Error(`Backdrop ${url} has ${heights.length} samples`);
  }
  return { samples: m.backdrop.samples, spacingM: m.backdrop.spacingM, heights };
}

/** The baked glacier mask, or null when the manifest has none. */
export async function loadSurfaceMask(
  baseUrl: string,
  m: TerrainManifest,
  fetchFn?: typeof fetch,
): Promise<SurfaceMask | null> {
  const sm = m.surfaceMask;
  if (!sm) return null;
  const url = `${baseUrl}/${sm.file}`;
  const res = await fetchWithRetry(url, 3, 300, fetchFn);
  const bytes = new Uint8Array(await res.arrayBuffer());
  const count = sm.samples * sm.samples;
  const expected = Math.ceil(count / 8);
  if (bytes.length !== expected) {
    throw new Error(`Surface mask ${url} has ${bytes.length} bytes, expected ${expected}`);
  }
  // Bit i (LSB first) of byte i >> 3, i = row * samples + col.
  const data = new Uint8Array(count);
  for (let i = 0; i < count; i += 1) data[i] = (bytes[i >> 3] >> (i & 7)) & 1;
  return {
    samplesX: sm.samples,
    samplesZ: sm.samples,
    spacingM: sm.spacingM,
    originX: m.originX,
    originZ: m.originZ,
    data,
  };
}
