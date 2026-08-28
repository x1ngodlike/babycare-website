import type { CareItem, CareRecord } from '../types';

export type WeatherHeroThemeId = 'hero-block-factory' | 'hero-immortal-gate' | 'hero-travel' | 'hero-orbit' | 'hero-shop' | 'hero-arcane' | 'hero-ocean' | 'hero-forest-press' | 'hero-fruit-cake';
export type WeatherStickerKind = 'feeding' | 'bowel' | 'care' | 'note';
export type WeatherTaskIconKind = 'medicine' | 'massage' | 'bath' | 'care' | 'vaccine' | 'growth';
export type WeatherNavIconKind = 'today' | 'history' | 'chat' | 'trends' | 'archive';

export type HeroLayout = 'diary' | 'classic';
export type IconPackId = 'default' | 'basic-shapes' | WeatherHeroThemeId;
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
  recommendedBgs?: ReadonlyArray<string>;
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
  'hero-block-factory': {
    thumb: '/hero/weather/block-factory/thumbnails/theme.webp',
    stickers: {
      feeding: '/hero/weather/block-factory/icons/quick/feeding.webp',
      bowel: '/hero/weather/block-factory/icons/quick/bowel.webp',
      care: '/hero/weather/block-factory/icons/quick/care.webp',
      note: '/hero/weather/block-factory/icons/quick/note.webp',
    },
    tasks: {
      medicine: '/hero/weather/block-factory/icons/tasks/medicine.webp',
      massage: '/hero/weather/block-factory/icons/tasks/massage.webp',
      bath: '/hero/weather/block-factory/icons/tasks/bath.webp',
      care: '/hero/weather/block-factory/icons/tasks/care.webp',
      vaccine: '/hero/weather/block-factory/icons/tasks/vaccine.webp',
      growth: '/hero/weather/block-factory/icons/tasks/growth.webp',
    },
    nav: {
      today: '/hero/weather/block-factory/icons/nav/today.webp',
      history: '/hero/weather/block-factory/icons/nav/records.webp',
      chat: '/hero/weather/block-factory/icons/nav/chat.webp',
      trends: '/hero/weather/block-factory/icons/nav/trends.webp',
      archive: '/hero/weather/block-factory/icons/nav/archive.webp',
    },
  },
  'hero-immortal-gate': {
    thumb: '/hero/weather/immortal-gate/thumbnails/theme.webp',
    stickers: {
      feeding: '/hero/weather/immortal-gate/icons/quick/feeding.webp',
      bowel: '/hero/weather/immortal-gate/icons/quick/bowel.webp',
      care: '/hero/weather/immortal-gate/icons/quick/care.webp',
      note: '/hero/weather/immortal-gate/icons/quick/note.webp',
    },
    tasks: {
      medicine: '/hero/weather/immortal-gate/icons/tasks/medicine.webp',
      massage: '/hero/weather/immortal-gate/icons/tasks/massage.webp',
      bath: '/hero/weather/immortal-gate/icons/tasks/bath.webp',
      care: '/hero/weather/immortal-gate/icons/tasks/care.webp',
      vaccine: '/hero/weather/immortal-gate/icons/tasks/vaccine.webp',
      growth: '/hero/weather/immortal-gate/icons/tasks/growth.webp',
    },
    nav: {
      today: '/hero/weather/immortal-gate/icons/nav/today.webp',
      history: '/hero/weather/immortal-gate/icons/nav/records.webp',
      chat: '/hero/weather/immortal-gate/icons/nav/chat.webp',
      trends: '/hero/weather/immortal-gate/icons/nav/trends.webp',
      archive: '/hero/weather/immortal-gate/icons/nav/archive.webp',
    },
  },
  'hero-fruit-cake': {
    thumb: '/hero/weather/fruit-cake/thumbnails/theme.webp',
    stickers: {
      feeding: '/hero/weather/fruit-cake/icons/quick/feeding.webp',
      bowel: '/hero/weather/fruit-cake/icons/quick/bowel.webp',
      care: '/hero/weather/fruit-cake/icons/quick/care.webp',
      note: '/hero/weather/fruit-cake/icons/quick/note.webp',
    },
    tasks: {
      medicine: '/hero/weather/fruit-cake/icons/tasks/medicine.webp',
      massage: '/hero/weather/fruit-cake/icons/tasks/massage.webp',
      bath: '/hero/weather/fruit-cake/icons/tasks/bath.webp',
      care: '/hero/weather/fruit-cake/icons/tasks/care.webp',
      vaccine: '/hero/weather/fruit-cake/icons/tasks/vaccine.webp',
      growth: '/hero/weather/fruit-cake/icons/tasks/growth.webp',
    },
    nav: {
      today: '/hero/weather/fruit-cake/icons/nav/today.webp',
      history: '/hero/weather/fruit-cake/icons/nav/records.webp',
      chat: '/hero/weather/fruit-cake/icons/nav/chat.webp',
      trends: '/hero/weather/fruit-cake/icons/nav/trends.webp',
      archive: '/hero/weather/fruit-cake/icons/nav/archive.webp',
    },
  },
  'hero-travel': {
    thumb: '/hero/weather/travel/thumbnails/theme.webp',
    stickers: {
      feeding: '/hero/weather/travel/icons/quick/feeding.webp',
      bowel: '/hero/weather/travel/icons/quick/bowel.webp',
      care: '/hero/weather/travel/icons/tasks/care.webp',
      note: '/hero/weather/travel/icons/quick/note.webp',
    },
    tasks: {
      medicine: '/hero/weather/travel/icons/tasks/medicine.webp',
      massage: '/hero/weather/travel/icons/tasks/massage.webp',
      bath: '/hero/weather/travel/icons/tasks/bath.webp',
      care: '/hero/weather/travel/icons/quick/care.webp',
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
    thumb: '/hero/weather/orbit/thumbnails/theme.webp',
    stickers: {
      feeding: '/hero/weather/orbit/icons/quick/feeding.webp',
      bowel: '/hero/weather/orbit/icons/quick/bowel.webp',
      care: '/hero/weather/orbit/icons/quick/care.webp',
      note: '/hero/weather/orbit/icons/quick/note.webp',
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
    thumb: '/hero/weather/shop/thumbnails/theme.webp',
    stickers: {
      feeding: '/hero/weather/shop/icons/quick/feeding.webp',
      bowel: '/hero/weather/shop/icons/quick/bowel.webp',
      care: '/hero/weather/shop/icons/quick/care.webp',
      note: '/hero/weather/shop/icons/quick/note.webp',
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
    thumb: '/hero/weather/arcane/thumbnails/theme.webp',
    stickers: {
      feeding: '/hero/weather/arcane/icons/quick/feeding.webp',
      bowel: '/hero/weather/arcane/icons/quick/bowel.webp',
      care: '/hero/weather/arcane/icons/quick/care.webp',
      note: '/hero/weather/arcane/icons/quick/note.webp',
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
    thumb: '/hero/weather/ocean/thumbnails/theme.webp',
    stickers: {
      feeding: '/hero/weather/ocean/icons/quick/feeding.webp',
      bowel: '/hero/weather/ocean/icons/quick/bowel.webp',
      care: '/hero/weather/ocean/icons/quick/care.webp',
      note: '/hero/weather/ocean/icons/quick/note.webp',
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
    thumb: '/hero/weather/forest-press/thumbnails/theme.webp',
    stickers: {
      feeding: '/hero/weather/forest-press/icons/quick/feeding.webp',
      bowel: '/hero/weather/forest-press/icons/quick/bowel.webp',
      care: '/hero/weather/forest-press/icons/quick/care.webp',
      note: '/hero/weather/forest-press/icons/quick/note.webp',
    },
    tasks: {
      medicine: '/hero/weather/forest-press/icons/tasks/medicine.webp?v=b12bf0b6',
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
    feeding: '/images/icons/quick/feeding.webp',
    bowel: '/images/icons/quick/bowel.webp',
    care: '/images/icons/tasks/care.webp',
    note: '/images/icons/quick/note.webp',
  },
  tasks: {
    medicine: '/images/icons/tasks/medicine.webp',
    massage: '/images/icons/tasks/massage.webp',
    bath: '/images/icons/tasks/bath.webp',
    care: '/images/icons/tasks/care.webp',
    vaccine: '/images/icons/tasks/vaccine.webp',
    growth: '/images/icons/tasks/growth.webp',
  },
  nav: {
    today: '/images/icons/nav/today.webp',
    history: '/images/icons/nav/records.webp',
    chat: '/images/icons/nav/chat.webp',
    trends: '/images/icons/nav/trends.webp',
    archive: '/images/icons/nav/archive.webp',
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
  { value: 'hero-block-factory', label: '积木工厂', thumb: WEATHER_HERO_ASSETS['hero-block-factory'].thumb, group: 'weather' },
  { value: 'hero-immortal-gate', label: '云海仙门', thumb: WEATHER_HERO_ASSETS['hero-immortal-gate'].thumb, group: 'weather' },
  { value: 'hero-fruit-cake', label: '水果蛋糕', thumb: WEATHER_HERO_ASSETS['hero-fruit-cake'].thumb, group: 'weather' },
  { value: 'hero-candy-workshop', label: '糖果工坊', thumb: '/hero/weather/fruit-cake/thumbnails/candy-workshop.webp', group: 'weather' },
  { value: 'hero-forest-press', label: '林间报社', thumb: WEATHER_HERO_ASSETS['hero-forest-press'].thumb, group: 'weather' },
  { value: 'hero-travel', label: '云端旅志', thumb: WEATHER_HERO_ASSETS['hero-travel'].thumb, group: 'weather' },
  { value: 'hero-orbit', label: '星际观测', thumb: WEATHER_HERO_ASSETS['hero-orbit'].thumb, group: 'weather' },
  { value: 'hero-shop', label: '晴雨商店', thumb: WEATHER_HERO_ASSETS['hero-shop'].thumb, group: 'weather' },
  { value: 'hero-arcane', label: '烛光魔塔', thumb: WEATHER_HERO_ASSETS['hero-arcane'].thumb, group: 'weather' },
  { value: 'hero-ocean', label: '海底世界', thumb: WEATHER_HERO_ASSETS['hero-ocean'].thumb, group: 'weather' },
  { value: 'hero-garden', label: '动态花园', thumb: '/hero/classic/garden/morning.webp', group: 'living' },
  { value: 'auto', label: '经典主题', thumb: '/hero/classic/default/morning.webp', group: 'classic' },
  { value: 'hero-paper', label: '折纸童趣', thumb: '/hero/classic/paper/morning.webp', group: 'classic' },
  { value: 'hero-pixel', label: '像素萌兔', thumb: '/hero/classic/pixel/morning.webp', group: 'classic' },
  { value: 'hero-watercolor', label: '手绘水彩', thumb: '/hero/classic/watercolor/morning.webp', group: 'classic' },
  { value: 'hero-clay', label: '软陶时光', thumb: '/hero/classic/clay/morning.webp', group: 'classic' },
  { value: 'hero-ink', label: '水墨丹青', thumb: '/hero/classic/ink/morning.webp', group: 'classic' },
  { value: 'hero-forest', label: '林间甜梦', thumb: '/hero/classic/forest/morning.webp', group: 'dream' },
  { value: 'hero-cloud', label: '云端甜梦', thumb: '/hero/classic/cloud/morning.webp', group: 'dream' },
  { value: 'hero-cozy', label: '暖房甜梦', thumb: '/hero/classic/cozy/morning.webp', group: 'dream' },
  { value: 'hero-pony', label: '星梦小马', thumb: '/hero/classic/pony/morning.webp', group: 'pony' },
  { value: 'hero-tale', label: '童话小马', thumb: '/hero/classic/tale/morning.webp', group: 'pony' },
  { value: 'hero-cyber', label: '赛博小马', thumb: '/hero/classic/cyber/morning.webp', group: 'pony' },
];

export const HERO_BG_GROUPS: ReadonlyArray<{ key: ThemeBgGroup; label: string }> = [
  { key: 'weather', label: '天气画境（10）' },
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
  diary: 'hero-fruit-cake',
  classic: 'auto',
};

export const ICON_PACKS: IconPackOption[] = [
  { value: 'default', label: '默认图标', thumb: '/hero/classic/default/morning.webp' },
  { value: 'basic-shapes', label: '基础图形', thumb: WEATHER_HERO_ASSETS['hero-travel'].thumb },
  { value: 'hero-block-factory', label: '积木工厂', thumb: WEATHER_HERO_ASSETS['hero-block-factory'].thumb },
  { value: 'hero-immortal-gate', label: '云海仙门', thumb: WEATHER_HERO_ASSETS['hero-immortal-gate'].thumb },
  { value: 'hero-fruit-cake', label: '水果蛋糕', thumb: WEATHER_HERO_ASSETS['hero-fruit-cake'].thumb },
  { value: 'hero-forest-press', label: '林间报社', thumb: WEATHER_HERO_ASSETS['hero-forest-press'].thumb },
  { value: 'hero-travel', label: '云端旅志', thumb: WEATHER_HERO_ASSETS['hero-travel'].thumb },
  { value: 'hero-orbit', label: '星际观测', thumb: WEATHER_HERO_ASSETS['hero-orbit'].thumb },
  { value: 'hero-shop', label: '晴雨商店', thumb: WEATHER_HERO_ASSETS['hero-shop'].thumb },
  { value: 'hero-arcane', label: '烛光魔塔', thumb: WEATHER_HERO_ASSETS['hero-arcane'].thumb },
  { value: 'hero-ocean', label: '海底世界', thumb: WEATHER_HERO_ASSETS['hero-ocean'].thumb },
];

export const THEMES: ReadonlyArray<ThemePreset> = [
  { id: 'theme-block-factory', label: '积木工厂', thumb: WEATHER_HERO_ASSETS['hero-block-factory'].thumb,
    defaults: { layout: 'diary', bg: 'hero-block-factory', iconPack: 'hero-block-factory', weatherEffects: true },
    recommendedBgs: ['hero-block-factory'] },
  { id: 'theme-immortal-gate', label: '云海仙门', thumb: WEATHER_HERO_ASSETS['hero-immortal-gate'].thumb,
    defaults: { layout: 'diary', bg: 'hero-immortal-gate', iconPack: 'hero-immortal-gate', weatherEffects: true },
    recommendedBgs: ['hero-immortal-gate'] },
  { id: 'theme-fruit-cake', label: '水果蛋糕', thumb: WEATHER_HERO_ASSETS['hero-fruit-cake'].thumb,
    defaults: { layout: 'diary', bg: 'hero-fruit-cake', iconPack: 'hero-fruit-cake', weatherEffects: true },
    recommendedBgs: ['hero-fruit-cake', 'hero-candy-workshop'] },
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
  { id: 'theme-basic-shapes', label: '基础图形', thumb: WEATHER_HERO_ASSETS['hero-travel'].thumb,
    defaults: { layout: 'diary', bg: 'hero-travel', iconPack: 'basic-shapes', weatherEffects: true },
    recommendedBgs: ['hero-travel'] },
  { id: 'theme-classic', label: '经典主题', thumb: '/hero/classic/default/morning.webp',
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
  if (themeId === 'theme-basic-shapes') return 'basic-shapes';
  if (themeId === 'theme-block-factory') return 'block-factory';
  if (themeId === 'theme-immortal-gate') return 'immortal-gate';
  if (themeId === 'theme-fruit-cake') return 'fruit-cake';
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
  'hero-block-factory': 'theme-block-factory',
  'hero-immortal-gate': 'theme-immortal-gate',
  'hero-fruit-cake': 'theme-fruit-cake',
  'hero-diary': 'theme-fruit-cake',
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
