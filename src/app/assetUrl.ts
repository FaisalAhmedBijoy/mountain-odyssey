/**
 * URL of a file in `public/`, under the site's base path. Local dev serves from `/`;
 * GitHub Pages serves the project from `/mountain-odyssey/` (set via VITE_BASE at build).
 */
export function assetUrl(path: string, base: string = import.meta.env.BASE_URL): string {
  const prefix = base.endsWith('/') ? base : `${base}/`;
  return `${prefix}${path.replace(/^\/+/, '')}`;
}
