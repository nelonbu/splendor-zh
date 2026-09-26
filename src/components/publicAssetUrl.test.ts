import { describe, expect, it } from 'vitest';
import { publicAssetUrl } from './publicAssetUrl';

describe('public asset URL', () => {
  it('serves the same copied art at the local root and GitHub Pages project path', () => {
    expect(publicAssetUrl('/pygem/images/blue1-1.webp', '/')).toBe('/pygem/images/blue1-1.webp');
    expect(publicAssetUrl('/pygem/images/blue1-1.webp', '/splendor-zh/'))
      .toBe('/splendor-zh/pygem/images/blue1-1.webp');
    expect(publicAssetUrl('/custom-nobles/N-06.webp', '/splendor-zh/'))
      .toBe('/splendor-zh/custom-nobles/N-06.webp');
  });
});
