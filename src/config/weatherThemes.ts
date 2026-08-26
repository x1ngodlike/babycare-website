export type WeatherHeroThemeId = 'hero-diary' | 'hero-travel';
export type WeatherStickerKind = 'feeding' | 'bowel' | 'care' | 'note';

export const WEATHER_HERO_ASSETS = {
  'hero-diary': {
    thumb: '/hero/weather/nature/thumb.webp',
    stickers: {
      feeding: '/hero/weather/nature/stickers/sticker-feeding.webp',
      bowel: '/hero/weather/nature/stickers/sticker-bowel.webp',
      care: '/hero/weather/nature/stickers/sticker-care.webp',
      note: '/hero/weather/nature/stickers/sticker-note.webp',
    },
  },
  'hero-travel': {
    thumb: '/hero/weather/travel/backgrounds/morning.webp',
    stickers: {
      feeding: '/hero/weather/travel/stickers/sticker-feeding.webp',
      bowel: '/hero/weather/travel/stickers/sticker-bowel.webp',
      care: '/hero/weather/travel/stickers/sticker-care.webp',
      note: '/hero/weather/travel/stickers/sticker-note.webp',
    },
  },
} as const satisfies Record<WeatherHeroThemeId, {
  thumb: string;
  stickers: Record<WeatherStickerKind, string>;
}>;

export function isWeatherHeroTheme(value: string): value is WeatherHeroThemeId {
  return Object.prototype.hasOwnProperty.call(WEATHER_HERO_ASSETS, value);
}

export function getWeatherHeroAssets(value: string) {
  return isWeatherHeroTheme(value) ? WEATHER_HERO_ASSETS[value] : null;
}
