import { describe, expect, it } from 'vitest';
import { assetUrl } from './assetUrl';

describe('assetUrl', () => {
  it('serves from the site root by default (local dev and e2e)', () => {
    expect(assetUrl('terrain/mera-peak', '/')).toBe('/terrain/mera-peak');
  });

  it('prefixes the GitHub Pages project path', () => {
    expect(assetUrl('terrain/mera-peak', '/mountain-odyssey/')).toBe(
      '/mountain-odyssey/terrain/mera-peak',
    );
  });

  it('tolerates a leading slash on the path and a missing trailing slash on the base', () => {
    expect(assetUrl('/models/RobotExpressive.glb', '/mountain-odyssey')).toBe(
      '/mountain-odyssey/models/RobotExpressive.glb',
    );
  });

  it("uses Vite's BASE_URL when no base is given", () => {
    expect(assetUrl('models/x.glb')).toBe(`${import.meta.env.BASE_URL}models/x.glb`);
  });
});
