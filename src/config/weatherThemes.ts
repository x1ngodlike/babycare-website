import type { CareItem, CareRecord } from '../types';

export type WeatherHeroThemeId = 'hero-diary' | 'hero-travel' | 'hero-orbit' | 'hero-shop' | 'hero-arcane' | 'hero-ocean' | 'hero-forest-press';
export type WeatherStickerKind = 'feeding' | 'bowel' | 'care' | 'note';
export type WeatherTaskIconKind = 'medicine' | 'massage' | 'bath' | 'care' | 'vaccine' | 'growth';
export type WeatherNavIconKind = 'today' | 'history' | 'chat' | 'trends' | 'archive';

export type HeroLayout = 'diary' | 'classic';
export type IconPackId = 'default' | WeatherHeroThemeId;
export type ThemeBgGroup = 'weather' | 'living' | 'classic' | 'dream' | 'pony';

export interface ThemeConfig {
  layout: HeroLayout;
  bg: string;
  iconPack: IconPackId;
  weatherEffects: boolean;
}

export interface ThemePreset {
  id: string;
  label: string;
  thumb: string;
  defaults: ThemeConfig;
}

export interface HeroBgOption {
  value: string;
  label: string;
  thumb: string;
  group: ThemeBgGroup;
}

export interface IconPackOption {
  value: IconPackId;
  label: string;
  thumb?: string;
}

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
  'hero-ocean': {
    thumb: '/hero/weather/ocean/thumb.webp',
    stickers: {
      feeding: '/hero/weather/ocean/stickers/sticker-feeding.webp',
      bowel: '/hero/weather/ocean/stickers/sticker-bowel.webp',
      care: '/hero/weather/ocean/stickers/sticker-care.webp',
      note: '/hero/weather/ocean/stickers/sticker-note.webp',
    },
    tasks: {
      medicine: '/hero/weather/ocean/icons/tasks/medicine.webp',
      massage: '/hero/weather/ocean/icons/tasks/massage.webp',
      bath: '/hero/weather/ocean/icons/tasks/bath.webp',
      care: '/hero/weather/ocean/icons/tasks/care.webp',
      vaccine: '/hero/weather/ocean/icons/tasks/vaccine.webp',
      growth: '/hero/weather/ocean/icons/tasks/growth.webp',
    },
    nav: {
      today: '/hero/weather/ocean/icons/nav/today.webp',
      history: '/hero/weather/ocean/icons/nav/records.webp',
      chat: '/hero/weather/ocean/icons/nav/chat.webp',
      trends: '/hero/weather/ocean/icons/nav/trends.webp',
      archive: '/hero/weather/ocean/icons/nav/archive.webp',
    },
  },
  'hero-forest-press': {
    thumb: '/hero/weather/forest-press/thumb.webp',
    stickers: {
      feeding: '/hero/weather/forest-press/stickers/sticker-feeding.webp',
      bowel: '/hero/weather/forest-press/stickers/sticker-bowel.webp',
      care: '/hero/weather/forest-press/stickers/sticker-care.webp',
      note: '/hero/weather/forest-press/stickers/sticker-note.webp',
    },
    tasks: {
      medicine: '/hero/weather/forest-press/icons/tasks/medicine.webp',
      massage: '/hero/weather/forest-press/icons/tasks/massage.webp',
      bath: '/hero/weather/forest-press/icons/tasks/bath.webp',
      care: '/hero/weather/forest-press/icons/tasks/care.webp',
      vaccine: '/hero/weather/forest-press/icons/tasks/vaccine.webp',
      growth: '/hero/weather/forest-press/icons/tasks/growth.webp',
    },
    nav: {
      today: '/hero/weather/forest-press/icons/nav/today.webp',
      history: '/hero/weather/forest-press/icons/nav/records.webp',
      chat: '/hero/weather/forest-press/icons/nav/chat.webp',
      trends: '/hero/weather/forest-press/icons/nav/trends.webp',
      archive: '/hero/weather/forest-press/icons/nav/archive.webp',
    },
  },
} as const satisfies Record<WeatherHeroThemeId, {
  thumb: string;
  stickers: Record<WeatherStickerKind, string>;
  tasks: Record<WeatherTaskIconKind, string>;
  nav: Record<WeatherNavIconKind, string>;
}>;

export const DEFAULT_ICON_ASSETS = {
  stickers: {
    feeding: '/icons/quick-feeding.png',
    bowel: '/icons/quick-bowel.png',
    care: '/icons/record-care.png',
    note: '/icons/quick-note.png',
  },
  tasks: {
    medicine: '/icons/record-medicine.png',
    massage: '/icons/record-massage.png',
    bath: '/icons/record-bath.png',
    care: '/icons/record-care.png',
    vaccine: '/icons/task-vaccine-normalized.png',
    growth: '/icons/task-growth-normalized.png',
  },
  nav: {
    today: '/icons/nav-today.png',
    history: '/icons/nav-records.png',
    chat: '/icons/nav-chat.png',
    trends: '/icons/nav-trends.png',
    archive: '/icons/nav-archive.png',
  },
} as const;

// 给定 iconPack（'default' 或某个天气主题 id），返回对应的图标资源或 null
export function getIconPackAssets(iconPack: string) {
  if (iconPack === 'default') return DEFAULT_ICON_ASSETS;
  return isWeatherHeroTheme(iconPack) ? WEATHER_HERO_ASSETS[iconPack] : null;
}

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

// --------------- 主题系统 ---------------

export const HERO_BACKGROUNDS: HeroBgOption[] = [
  { value: 'hero-forest-press', label: '林间报社', thumb: WEATHER_HERO_ASSETS['hero-forest-press'].thumb, group: 'weather' },
  { value: 'hero-diary', label: '自然画报', thumb: WEATHER_HERO_ASSETS['hero-diary'].thumb, group: 'weather' },
  { value: 'hero-travel', label: '云端旅志', thumb: WEATHER_HERO_ASSETS['hero-travel'].thumb, group: 'weather' },
  { value: 'hero-orbit', label: '星际观测', thumb: WEATHER_HERO_ASSETS['hero-orbit'].thumb, group: 'weather' },
  { value: 'hero-shop', label: '晴雨商店', thumb: WEATHER_HERO_ASSETS['hero-shop'].thumb, group: 'weather' },
  { value: 'hero-arcane', label: '烛光魔塔', thumb: WEATHER_HERO_ASSETS['hero-arcane'].thumb, group: 'weather' },
  { value: 'hero-ocean', label: '海底世界', thumb: WEATHER_HERO_ASSETS['hero-ocean'].thumb, group: 'weather' },
  { value: 'hero-garden', label: '动态花园', thumb: '/hero/garden/morning.webp', group: 'living' },
  { value: 'auto', label: '经典主题', thumb: '/hero/default/morning.webp', group: 'classic' },
  { value: 'hero-paper', label: '折纸童趣', thumb: '/hero/paper/morning.webp', group: 'classic' },
  { value: 'hero-pixel', label: '像素萌兔', thumb: '/hero/pixel/morning.webp', group: 'classic' },
  { value: 'hero-watercolor', label: '手绘水彩', thumb: '/hero/watercolor/morning.webp', group: 'classic' },
  { value: 'hero-clay', label: '软陶时光', thumb: '/hero/clay/morning.webp', group: 'classic' },
  { value: 'hero-ink', label: '水墨丹青', thumb: '/hero/ink/morning.webp', group: 'classic' },
  { value: 'hero-forest', label: '林间甜梦', thumb: '/hero/forest/morning.webp', group: 'dream' },
  { value: 'hero-cloud', label: '云端甜梦', thumb: '/hero/cloud/morning.webp', group: 'dream' },
  { value: 'hero-cozy', label: '暖房甜梦', thumb: '/hero/cozy/morning.webp', group: 'dream' },
  { value: 'hero-pony', label: '星梦小马', thumb: '/hero/pony/morning.webp', group: 'pony' },
  { value: 'hero-tale', label: '童话小马', thumb: '/hero/tale/morning.webp', group: 'pony' },
  { value: 'hero-cyber', label: '赛博小马', thumb: '/hero/cyber/morning.webp', group: 'pony' },
];

export const HERO_BG_GROUPS: ReadonlyArray<{ key: ThemeBgGroup; label: string }> = [
  { key: 'weather', label: '天气画境（7）' },
  { key: 'living', label: '动态系列（1）' },
  { key: 'classic', label: '经典系列（6）' },
  { key: 'dream', label: '甜梦系列（3）' },
  { key: 'pony', label: '小马系列（3）' },
];

/** 不同排版风格可用的背景组：diary（杂志风）只有 weather 组有资源 */
export const BG_GROUPS_FOR_LAYOUT: Record<HeroLayout, ReadonlyArray<ThemeBgGroup>> = {
  diary: ['weather'],
  classic: ['living', 'classic', 'dream', 'pony'],
};

/** 切换到某排版风格时，若当前 bg 不可用应回退的安全值 */
export const DEFAULT_BG_FOR_LAYOUT: Record<HeroLayout, string> = {
  diary: 'hero-diary',
  classic: 'auto',
};

export const ICON_PACKS: IconPackOption[] = [
  { value: 'default', label: '默认图标', thumb: '/hero/default/morning.webp' },
  { value: 'hero-forest-press', label: '林间报社', thumb: WEATHER_HERO_ASSETS['hero-forest-press'].thumb },
  { value: 'hero-diary', label: '自然画报', thumb: WEATHER_HERO_ASSETS['hero-diary'].thumb },
  { value: 'hero-travel', label: '云端旅志', thumb: WEATHER_HERO_ASSETS['hero-travel'].thumb },
  { value: 'hero-orbit', label: '星际观测', thumb: WEATHER_HERO_ASSETS['hero-orbit'].thumb },
  { value: 'hero-shop', label: '晴雨商店', thumb: WEATHER_HERO_ASSETS['hero-shop'].thumb },
  { value: 'hero-arcane', label: '烛光魔塔', thumb: WEATHER_HERO_ASSETS['hero-arcane'].thumb },
  { value: 'hero-ocean', label: '海底世界', thumb: WEATHER_HERO_ASSETS['hero-ocean'].thumb },
];

export const THEMES: ReadonlyArray<ThemePreset> = [
  { id: 'theme-forest-press', label: '林间报社', thumb: WEATHER_HERO_ASSETS['hero-forest-press'].thumb,
    defaults: { layout: 'diary', bg: 'hero-forest-press', iconPack: 'hero-forest-press', weatherEffects: true } },
  { id: 'theme-ocean', label: '海底世界', thumb: WEATHER_HERO_ASSETS['hero-ocean'].thumb,
    defaults: { layout: 'diary', bg: 'hero-ocean', iconPack: 'hero-ocean', weatherEffects: true } },
  { id: 'theme-arcane', label: '烛光魔塔', thumb: WEATHER_HERO_ASSETS['hero-arcane'].thumb,
    defaults: { layout: 'diary', bg: 'hero-arcane', iconPack: 'hero-arcane', weatherEffects: true } },
  { id: 'theme-shop', label: '晴雨商店', thumb: WEATHER_HERO_ASSETS['hero-shop'].thumb,
    defaults: { layout: 'diary', bg: 'hero-shop', iconPack: 'hero-shop', weatherEffects: true } },
  { id: 'theme-orbit', label: '星际观测', thumb: WEATHER_HERO_ASSETS['hero-orbit'].thumb,
    defaults: { layout: 'diary', bg: 'hero-orbit', iconPack: 'hero-orbit', weatherEffects: true } },
  { id: 'theme-travel', label: '云端旅志', thumb: WEATHER_HERO_ASSETS['hero-travel'].thumb,
    defaults: { layout: 'diary', bg: 'hero-travel', iconPack: 'hero-travel', weatherEffects: true } },
  { id: 'theme-diary', label: '自然画报', thumb: WEATHER_HERO_ASSETS['hero-diary'].thumb,
    defaults: { layout: 'diary', bg: 'hero-diary', iconPack: 'hero-diary', weatherEffects: true } },
  { id: 'theme-classic', label: '经典主题', thumb: '/hero/default/morning.webp',
    defaults: { layout: 'classic', bg: 'auto', iconPack: 'default', weatherEffects: false } },
];

export const DEFAULT_THEME_ID = 'theme-classic';

export function findThemeById(id: string): ThemePreset | undefined {
  return THEMES.find(t => t.id === id);
}

export function resolveThemeConfig(themeId: string, overrides?: Partial<ThemeConfig>): ThemeConfig {
  const preset = findThemeById(themeId) ?? THEMES[THEMES.length - 1];
  return { ...preset.defaults, ...overrides };
}

export function getVisualThemeForPreset(themeId: string): string | null {
  if (themeId === 'theme-travel') return 'travel';
  if (themeId === 'theme-orbit') return 'orbit';
  if (themeId === 'theme-shop') return 'shop';
  if (themeId === 'theme-arcane') return 'arcane';
  if (themeId === 'theme-ocean') return 'ocean';
  if (themeId === 'theme-forest-press') return 'forest-press';
  return null;
}

// 旧版 heroBg → 新版 themeId 迁移映射
const LEGACY_BG_TO_THEME: Record<string, string> = {
  'hero-diary': 'theme-diary',
  'hero-travel': 'theme-travel',
  'hero-orbit': 'theme-orbit',
  'hero-shop': 'theme-shop',
  'hero-arcane': 'theme-arcane',
  'hero-ocean': 'theme-ocean',
  'hero-forest-press': 'theme-forest-press',
};

export function legacyHeroBgToThemeId(bg: string): string {
  return LEGACY_BG_TO_THEME[bg] ?? DEFAULT_THEME_ID;
}

// 旧版 heroBg + heroWeatherEffects 迁移到 overrides
export function buildOverridesFromLegacy(bg: string, weatherEffects: Record<string, boolean>): Partial<ThemeConfig> {
  const themeId = LEGACY_BG_TO_THEME[bg];
  const preset = findThemeById(themeId);
  const prev = weatherEffects[bg];
  const overrides: Partial<ThemeConfig> = {};
  if (prev !== undefined && preset && prev !== preset.defaults.weatherEffects) {
    overrides.weatherEffects = prev;
  }
  return overrides;
}

export function getWeatherRecordIconByPack(iconPack: string, record: CareRecord, careItems: CareItem[]) {
  const assets = getIconPackAssets(iconPack);
  if (!assets) return null;
  if (record.type === 'feeding') return assets.stickers.feeding;
  if (record.type === 'bowel') return assets.stickers.bowel;
  if (record.type === 'note') return assets.stickers.note;
  const itemIcon = careItems.find(item => item.name === record.supplement)?.icon ?? 'medicine';
  return assets.tasks[itemIcon];
}
