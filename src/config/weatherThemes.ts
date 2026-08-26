export type WeatherHeroThemeId = 'hero-diary' | 'hero-travel' | 'hero-orbit' | 'hero-shop' | 'hero-arcane';
export type WeatherStickerKind = 'feeding' | 'bowel' | 'care' | 'note';
export type WeatherTaskIconKind = 'medicine' | 'massage' | 'bath' | 'care' | 'vaccine' | 'growth';
export type WeatherNavIconKind = 'today' | 'history' | 'chat' | 'trends' | 'archive';
import type { CareItem, CareRecord } from '../types';

export const WEATHER_HERO_ASSETS = {
  'hero-diary': {
    thumb: '/hero/weather/nature/thumb.webp',
    stickers: {
      feeding: '/hero/weather/nature/stickers/sticker-feeding.webp',
      bowel: '/hero/weather/nature/stickers/sticker-bowel.webp',
      care: '/hero/weather/nature/stickers/sticker-care.webp',
      note: '/hero/weather/nature/stickers/sticker-note.webp',
    },
    tasks: {
      medicine: '/hero/weather/nature/icons/tasks/medicine.webp',
      massage: '/hero/weather/nature/icons/tasks/massage.webp',
      bath: '/hero/weather/nature/icons/tasks/bath.webp',
      care: '/hero/weather/nature/stickers/sticker-care.webp',
      vaccine: '/hero/weather/nature/icons/tasks/vaccine.webp',
      growth: '/hero/weather/nature/icons/tasks/growth.webp',
    },
    nav: {
      today: '/hero/weather/nature/icons/nav/today.webp',
      history: '/hero/weather/nature/icons/nav/records.webp',
      chat: '/hero/weather/nature/icons/nav/chat.webp',
      trends: '/hero/weather/nature/icons/nav/trends.webp',
      archive: '/hero/weather/nature/icons/nav/archive.webp',
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
    tasks: {
      medicine: '/hero/weather/travel/icons/tasks/medicine.webp',
      massage: '/hero/weather/travel/icons/tasks/massage.webp',
      bath: '/hero/weather/travel/icons/tasks/bath.webp',
      care: '/hero/weather/travel/stickers/sticker-care.webp',
      vaccine: '/hero/weather/travel/icons/tasks/vaccine.webp',
      growth: '/hero/weather/travel/icons/tasks/growth.webp',
    },
    nav: {
      today: '/hero/weather/travel/icons/nav/today.webp',
      history: '/hero/weather/travel/icons/nav/records.webp',
      chat: '/hero/weather/travel/icons/nav/chat.webp',
      trends: '/hero/weather/travel/icons/nav/trends.webp',
      archive: '/hero/weather/travel/icons/nav/archive.webp',
    },
  },
  'hero-orbit': {
    thumb: '/hero/weather/orbit/thumb.webp',
    stickers: {
      feeding: '/hero/weather/orbit/stickers/sticker-feeding.webp',
      bowel: '/hero/weather/orbit/stickers/sticker-bowel.webp',
      care: '/hero/weather/orbit/stickers/sticker-care.webp',
      note: '/hero/weather/orbit/stickers/sticker-note.webp',
    },
    tasks: {
      medicine: '/hero/weather/orbit/icons/tasks/medicine.webp',
      massage: '/hero/weather/orbit/icons/tasks/massage.webp',
      bath: '/hero/weather/orbit/icons/tasks/bath.webp',
      care: '/hero/weather/orbit/icons/tasks/care.webp',
      vaccine: '/hero/weather/orbit/icons/tasks/vaccine.webp',
      growth: '/hero/weather/orbit/icons/tasks/growth.webp',
    },
    nav: {
      today: '/hero/weather/orbit/icons/nav/today.webp',
      history: '/hero/weather/orbit/icons/nav/records.webp',
      chat: '/hero/weather/orbit/icons/nav/chat.webp',
      trends: '/hero/weather/orbit/icons/nav/trends.webp',
      archive: '/hero/weather/orbit/icons/nav/archive.webp',
    },
  },
  'hero-shop': {
    thumb: '/hero/weather/shop/thumb.webp',
    stickers: {
      feeding: '/hero/weather/shop/stickers/sticker-feeding.webp',
      bowel: '/hero/weather/shop/stickers/sticker-bowel.webp',
      care: '/hero/weather/shop/stickers/sticker-care.webp',
      note: '/hero/weather/shop/stickers/sticker-note.webp',
    },
    tasks: {
      medicine: '/hero/weather/shop/icons/tasks/medicine.webp',
      massage: '/hero/weather/shop/icons/tasks/massage.webp',
      bath: '/hero/weather/shop/icons/tasks/bath.webp',
      care: '/hero/weather/shop/icons/tasks/care.webp',
      vaccine: '/hero/weather/shop/icons/tasks/vaccine.webp',
      growth: '/hero/weather/shop/icons/tasks/growth.webp',
    },
    nav: {
      today: '/hero/weather/shop/icons/nav/today.webp',
      history: '/hero/weather/shop/icons/nav/records.webp',
      chat: '/hero/weather/shop/icons/nav/chat.webp',
      trends: '/hero/weather/shop/icons/nav/trends.webp',
      archive: '/hero/weather/shop/icons/nav/archive.webp',
    },
  },
  'hero-arcane': {
    thumb: '/hero/weather/arcane/thumb.webp',
    stickers: {
      feeding: '/hero/weather/arcane/stickers/sticker-feeding.webp',
      bowel: '/hero/weather/arcane/stickers/sticker-bowel.webp',
      care: '/hero/weather/arcane/stickers/sticker-care.webp',
      note: '/hero/weather/arcane/stickers/sticker-note.webp',
    },
    tasks: {
      medicine: '/hero/weather/arcane/icons/tasks/medicine.webp',
      massage: '/hero/weather/arcane/icons/tasks/massage.webp',
      bath: '/hero/weather/arcane/icons/tasks/bath.webp',
      care: '/hero/weather/arcane/icons/tasks/care.webp',
      vaccine: '/hero/weather/arcane/icons/tasks/vaccine.webp',
      growth: '/hero/weather/arcane/icons/tasks/growth.webp',
    },
    nav: {
      today: '/hero/weather/arcane/icons/nav/today.webp',
      history: '/hero/weather/arcane/icons/nav/records.webp',
      chat: '/hero/weather/arcane/icons/nav/chat.webp',
      trends: '/hero/weather/arcane/icons/nav/trends.webp',
      archive: '/hero/weather/arcane/icons/nav/archive.webp',
    },
  },
} as const satisfies Record<WeatherHeroThemeId, {
  thumb: string;
  stickers: Record<WeatherStickerKind, string>;
  tasks: Record<WeatherTaskIconKind, string>;
  nav: Record<WeatherNavIconKind, string>;
}>;

export function isWeatherHeroTheme(value: string): value is WeatherHeroThemeId {
  return Object.prototype.hasOwnProperty.call(WEATHER_HERO_ASSETS, value);
}

export function getWeatherHeroAssets(value: string) {
  return isWeatherHeroTheme(value) ? WEATHER_HERO_ASSETS[value] : null;
}

export function getWeatherRecordIcon(value: string, record: CareRecord, careItems: CareItem[]) {
  const assets = getWeatherHeroAssets(value);
  if (!assets) return null;
  if (record.type === 'feeding') return assets.stickers.feeding;
  if (record.type === 'bowel') return assets.stickers.bowel;
  if (record.type === 'note') return assets.stickers.note;
  const itemIcon = careItems.find(item => item.name === record.supplement)?.icon ?? 'medicine';
  return assets.tasks[itemIcon];
}
