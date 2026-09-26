import { describe, expect, it } from 'vitest';
import { publicAssetUrl } from './publicAssetUrl';

describe('public asset URL', () => {
  it('serves the same copied art at the local root and GitHub Pages project path', () => {
    expect(publicAssetUrl('/pygem/images/blue1-1.png', '/')).toBe('/pygem/images/blue1-1.png');
    expect(publicAssetUrl('/pygem/images/blue1-1.png', '/splendor-zh/'))
      .toBe('/splendor-zh/pygem/images/blue1-1.png');
    expect(publicAssetUrl('/custom-nobles/N-06.PNG', '/splendor-zh/'))
      .toBe('/splendor-zh/custom-nobles/N-06.PNG');
  });
});
