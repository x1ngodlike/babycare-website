import { describe, expect, it } from 'vitest';
import {
  getThemeHeroAssetUrls,
  getWeatherBackgroundAsset,
  resolveThemeConfig,
} from './weatherThemes';

describe('theme hero assets', () => {
  it('resolves recommended background variants from the shared theme folder', () => {
    expect(getWeatherBackgroundAsset('hero-candy-workshop', 'evening'))
      .toBe('/hero/weather/fruit-cake/backgrounds/candy-workshop/evening.webp');
    expect(getWeatherBackgroundAsset('hero-cloud-station', 'night'))
      .toBe('/hero/weather/travel/backgrounds/cloud-station/night.webp');
  });

  it('returns the complete active theme package for on-demand caching', () => {
    const urls = getThemeHeroAssetUrls(resolveThemeConfig('theme-dino-museum'));
    expect(urls).toHaveLength(20);
    expect(urls).toContain('/hero/weather/dino-museum/backgrounds/default/morning.webp');
    expect(urls).toContain('/hero/weather/dino-museum/icons/quick/feeding.webp?v=3e37eceb');
    expect(urls).toContain('/hero/weather/dino-museum/icons/tasks/medicine.webp?v=3e37eceb');
    expect(urls).toContain('/hero/weather/dino-museum/icons/nav/archive.webp?v=3e37eceb');
  });

  it('preserves theme-specific icon path exceptions', () => {
    const urls = getThemeHeroAssetUrls(resolveThemeConfig('theme-travel'));
    expect(urls).toContain('/hero/weather/travel/icons/tasks/care.webp');
    expect(urls).toContain('/hero/weather/travel/icons/quick/care.webp');
  });
});
