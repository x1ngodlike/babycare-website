import { describe, expect, it } from 'vitest';
import {
  THEMES,
  ICON_PACKS,
  HERO_BACKGROUNDS,
  getVisualThemeForPreset,
  getThemeHeroAssetUrls,
  getWeatherBackgroundAsset,
  resolveThemeConfig,
} from './weatherThemes';

describe('theme hero assets', () => {
  it('registers Glass Park first with a complete independent package', () => {
    expect(THEMES[0].id).toBe('theme-glass-park');
    expect(THEMES[0].recommendedBgs).toEqual(['hero-glass-park']);
    expect(HERO_BACKGROUNDS[0].value).toBe('hero-glass-park');
    expect(ICON_PACKS[1].value).toBe('hero-glass-park');
    expect(getVisualThemeForPreset('theme-glass-park')).toBe('glass-park');
    const urls = getThemeHeroAssetUrls(resolveThemeConfig('theme-glass-park'));
    expect(urls).toHaveLength(20);
    expect(new Set(urls).size).toBe(20);
    expect(urls.every(url => url.startsWith('/hero/weather/glass-park/'))).toBe(true);
    for (const period of ['morning', 'daytime', 'evening', 'night']) {
      expect(urls).toContain(`/hero/weather/glass-park/backgrounds/default/${period}.webp`);
    }
  });
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

  it('returns the complete desert oasis theme package', () => {
    const urls = getThemeHeroAssetUrls(resolveThemeConfig('theme-desert-oasis'));
    expect(urls).toHaveLength(20);
    expect(urls).toContain('/hero/weather/desert-oasis/backgrounds/default/morning.webp');
    expect(urls).toContain('/hero/weather/desert-oasis/icons/quick/feeding.webp');
    expect(urls).toContain('/hero/weather/desert-oasis/icons/tasks/medicine.webp');
    expect(urls).toContain('/hero/weather/desert-oasis/icons/nav/archive.webp');
  });

  it('returns the complete Jiangnan market theme package', () => {
    const urls = getThemeHeroAssetUrls(resolveThemeConfig('theme-jiangnan-market'));
    expect(urls).toHaveLength(20);
    expect(urls).toContain('/hero/weather/jiangnan-market/backgrounds/default/morning.webp');
    expect(urls).toContain('/hero/weather/jiangnan-market/icons/quick/feeding.webp');
    expect(urls).toContain('/hero/weather/jiangnan-market/icons/tasks/medicine.webp');
    expect(urls).toContain('/hero/weather/jiangnan-market/icons/nav/archive.webp');
  });

  it('returns the complete Moon Camp theme package', () => {
    const urls = getThemeHeroAssetUrls(resolveThemeConfig('theme-moon-camp'));
    expect(urls).toHaveLength(20);
    expect(urls).toContain('/hero/weather/moon-camp/backgrounds/default/morning.webp');
    expect(urls).toContain('/hero/weather/moon-camp/icons/quick/feeding.webp');
    expect(urls).toContain('/hero/weather/moon-camp/icons/tasks/medicine.webp');
    expect(urls).toContain('/hero/weather/moon-camp/icons/nav/archive.webp');
  });

  it('preserves theme-specific icon path exceptions', () => {
    const urls = getThemeHeroAssetUrls(resolveThemeConfig('theme-travel'));
    expect(urls).toContain('/hero/weather/travel/icons/tasks/care.webp');
    expect(urls).toContain('/hero/weather/travel/icons/quick/care.webp');
  });
});
