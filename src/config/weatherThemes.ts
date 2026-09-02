import type { CareItem, CareRecord } from '../types';
import type { DiaryPeriod } from '../../shared/weather';

export type WeatherHeroThemeId = 'hero-moon-camp' | 'hero-jiangnan-market' | 'hero-desert-oasis' | 'hero-dino-museum' | 'hero-midsummer-dream' | 'hero-bamboo-court' | 'hero-block-factory' | 'hero-immortal-gate' | 'hero-travel' | 'hero-orbit' | 'hero-shop' | 'hero-arcane' | 'hero-ocean' | 'hero-forest-press' | 'hero-fruit-cake';
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

type WeatherHeroAssetSet = {
  thumb: string;
  stickers: Record<WeatherStickerKind, string>;
  tasks: Record<WeatherTaskIconKind, string>;
  nav: Record<WeatherNavIconKind, string>;
};

function createWeatherHeroAssets(folder: string, overrides?: {
  stickers?: Partial<WeatherHeroAssetSet['stickers']>;
  tasks?: Partial<WeatherHeroAssetSet['tasks']>;
  nav?: Partial<WeatherHeroAssetSet['nav']>;
}, version = ''): WeatherHeroAssetSet {
  const root = `/hero/weather/${folder}`;
  return {
    thumb: `${root}/thumbnails/theme.webp${version}`,
    stickers: {
      feeding: `${root}/icons/quick/feeding.webp${version}`,
      bowel: `${root}/icons/quick/bowel.webp${version}`,
      care: `${root}/icons/quick/care.webp${version}`,
      note: `${root}/icons/quick/note.webp${version}`,
      ...overrides?.stickers,
    },
    tasks: {
      medicine: `${root}/icons/tasks/medicine.webp${version}`,
      massage: `${root}/icons/tasks/massage.webp${version}`,
      bath: `${root}/icons/tasks/bath.webp${version}`,
      care: `${root}/icons/tasks/care.webp${version}`,
      vaccine: `${root}/icons/tasks/vaccine.webp${version}`,
      growth: `${root}/icons/tasks/growth.webp${version}`,
      ...overrides?.tasks,
    },
    nav: {
      today: `${root}/icons/nav/today.webp${version}`,
      history: `${root}/icons/nav/records.webp${version}`,
      chat: `${root}/icons/nav/chat.webp${version}`,
      trends: `${root}/icons/nav/trends.webp${version}`,
      archive: `${root}/icons/nav/archive.webp${version}`,
      ...overrides?.nav,
    },
  };
}

export const WEATHER_HERO_ASSETS: Record<WeatherHeroThemeId, WeatherHeroAssetSet> = {
  'hero-moon-camp': createWeatherHeroAssets('moon-camp', {
    stickers: { care: '/hero/weather/moon-camp/icons/tasks/care.webp' },
    tasks: { care: '/hero/weather/moon-camp/icons/quick/care.webp' },
    nav: { trends: '/hero/weather/moon-camp/icons/nav/trends-v2.webp' },
  }),
  'hero-jiangnan-market': createWeatherHeroAssets('jiangnan-market'),
  'hero-desert-oasis': createWeatherHeroAssets('desert-oasis'),
  'hero-dino-museum': createWeatherHeroAssets('dino-museum', undefined, '?v=3e37eceb'),
  'hero-midsummer-dream': createWeatherHeroAssets('midsummer-dream'),
  'hero-bamboo-court': createWeatherHeroAssets('bamboo-court'),
  'hero-block-factory': createWeatherHeroAssets('block-factory'),
  'hero-immortal-gate': createWeatherHeroAssets('immortal-gate'),
  'hero-fruit-cake': createWeatherHeroAssets('fruit-cake'),
  'hero-travel': createWeatherHeroAssets('travel', {
    stickers: { care: '/hero/weather/travel/icons/tasks/care.webp' },
    tasks: { care: '/hero/weather/travel/icons/quick/care.webp' },
  }),
  'hero-orbit': createWeatherHeroAssets('orbit'),
  'hero-shop': createWeatherHeroAssets('shop'),
  'hero-arcane': createWeatherHeroAssets('arcane'),
  'hero-ocean': createWeatherHeroAssets('ocean'),
  'hero-forest-press': createWeatherHeroAssets('forest-press', {
    tasks: { medicine: '/hero/weather/forest-press/icons/tasks/medicine.webp?v=b12bf0b6' },
  }),
};

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
  return Object.hasOwn(WEATHER_HERO_ASSETS, value);
}

export function getWeatherHeroAssets(value: string) {
  return isWeatherHeroTheme(value) ? WEATHER_HERO_ASSETS[value] : null;
}

const WEATHER_BACKGROUND_SOURCES: Record<string, { folder: string; variant: string }> = {
  'hero-diary': { folder: 'fruit-cake', variant: 'default' },
  'hero-moon-camp': { folder: 'moon-camp', variant: 'default' },
  'hero-jiangnan-market': { folder: 'jiangnan-market', variant: 'default' },
  'hero-desert-oasis': { folder: 'desert-oasis', variant: 'default' },
  'hero-dino-museum': { folder: 'dino-museum', variant: 'default' },
  'hero-midsummer-dream': { folder: 'midsummer-dream', variant: 'default' },
  'hero-bamboo-court': { folder: 'bamboo-court', variant: 'default' },
  'hero-basic-shapes': { folder: 'basic-shapes', variant: 'default' },
  'hero-block-factory': { folder: 'block-factory', variant: 'default' },
  'hero-immortal-gate': { folder: 'immortal-gate', variant: 'default' },
  'hero-fruit-cake': { folder: 'fruit-cake', variant: 'default' },
  'hero-candy-workshop': { folder: 'fruit-cake', variant: 'candy-workshop' },
  'hero-forest-press': { folder: 'forest-press', variant: 'default' },
  'hero-travel': { folder: 'travel', variant: 'default' },
  'hero-cloud-station': { folder: 'travel', variant: 'cloud-station' },
  'hero-orbit': { folder: 'orbit', variant: 'default' },
  'hero-shop': { folder: 'shop', variant: 'default' },
  'hero-arcane': { folder: 'arcane', variant: 'default' },
  'hero-ocean': { folder: 'ocean', variant: 'default' },
};

const CLASSIC_BACKGROUND_FOLDERS: Record<string, string> = {
  auto: 'default',
  'hero-garden': 'garden',
  'hero-paper': 'paper',
  'hero-pixel': 'pixel',
  'hero-watercolor': 'watercolor',
  'hero-clay': 'clay',
  'hero-ink': 'ink',
  'hero-forest': 'forest',
  'hero-cloud': 'cloud',
  'hero-cozy': 'cozy',
  'hero-pony': 'pony',
  'hero-tale': 'tale',
  'hero-cyber': 'cyber',
};

export function getWeatherBackgroundAsset(bg: string, period: DiaryPeriod): string | null {
  const source = WEATHER_BACKGROUND_SOURCES[bg];
  if (!source) return null;
  const version = bg === 'hero-forest-press' && period === 'daytime' ? '?v=7c887ab3' : '';
  return `/hero/weather/${source.folder}/backgrounds/${source.variant}/${period}.webp${version}`;
}

/** 返回当前主题离线使用所需的 Hero 资源，交给 Service Worker 按需缓存。 */
export function getThemeHeroAssetUrls(config: ThemeConfig): string[] {
  const urls = new Set<string>();
  const periods: DiaryPeriod[] = ['morning', 'daytime', 'evening', 'night'];
  for (const period of periods) {
    const url = getWeatherBackgroundAsset(config.bg, period);
    if (url) urls.add(url);
  }

  const classicFolder = CLASSIC_BACKGROUND_FOLDERS[config.bg];
  if (classicFolder) {
    for (const period of ['morning', 'midday', 'afternoon', 'evening', 'night']) {
      urls.add(`/hero/classic/${classicFolder}/${period}.webp`);
    }
  }

  const assets = getIconPackAssets(config.iconPack);
  if (config.iconPack !== 'default' && assets) {
    if ('thumb' in assets) urls.add(assets.thumb);
    for (const group of [assets.stickers, assets.tasks, assets.nav]) {
      Object.values(group).forEach((url) => { urls.add(url); });
    }
  }
  return [...urls];
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
  { value: 'hero-moon-camp', label: '月球营地', thumb: WEATHER_HERO_ASSETS['hero-moon-camp'].thumb, group: 'weather' },
  { value: 'hero-jiangnan-market', label: '江南灯市', thumb: WEATHER_HERO_ASSETS['hero-jiangnan-market'].thumb, group: 'weather' },
  { value: 'hero-desert-oasis', label: '沙漠绿洲', thumb: WEATHER_HERO_ASSETS['hero-desert-oasis'].thumb, group: 'weather' },
  { value: 'hero-dino-museum', label: '恐龙博馆', thumb: WEATHER_HERO_ASSETS['hero-dino-museum'].thumb, group: 'weather' },
  { value: 'hero-midsummer-dream', label: '仲夏夜梦', thumb: WEATHER_HERO_ASSETS['hero-midsummer-dream'].thumb, group: 'weather' },
  { value: 'hero-bamboo-court', label: '青篁小院', thumb: WEATHER_HERO_ASSETS['hero-bamboo-court'].thumb, group: 'weather' },
  { value: 'hero-basic-shapes', label: '基础图形', thumb: '/hero/weather/basic-shapes/thumbnails/theme.webp', group: 'weather' },
  { value: 'hero-block-factory', label: '积木工厂', thumb: WEATHER_HERO_ASSETS['hero-block-factory'].thumb, group: 'weather' },
  { value: 'hero-immortal-gate', label: '云海仙门', thumb: WEATHER_HERO_ASSETS['hero-immortal-gate'].thumb, group: 'weather' },
  { value: 'hero-fruit-cake', label: '水果蛋糕', thumb: WEATHER_HERO_ASSETS['hero-fruit-cake'].thumb, group: 'weather' },
  { value: 'hero-candy-workshop', label: '糖果工坊', thumb: '/hero/weather/fruit-cake/thumbnails/candy-workshop.webp', group: 'weather' },
  { value: 'hero-forest-press', label: '林间报社', thumb: WEATHER_HERO_ASSETS['hero-forest-press'].thumb, group: 'weather' },
  { value: 'hero-travel', label: '云端旅志', thumb: WEATHER_HERO_ASSETS['hero-travel'].thumb, group: 'weather' },
  { value: 'hero-cloud-station', label: '云间车站', thumb: '/hero/weather/travel/thumbnails/cloud-station.webp', group: 'weather' },
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
  { key: 'weather', label: '天气画境（18）' },
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
  { value: 'hero-moon-camp', label: '月球营地', thumb: WEATHER_HERO_ASSETS['hero-moon-camp'].thumb },
  { value: 'hero-jiangnan-market', label: '江南灯市', thumb: WEATHER_HERO_ASSETS['hero-jiangnan-market'].thumb },
  { value: 'hero-desert-oasis', label: '沙漠绿洲', thumb: WEATHER_HERO_ASSETS['hero-desert-oasis'].thumb },
  { value: 'hero-dino-museum', label: '恐龙博馆', thumb: WEATHER_HERO_ASSETS['hero-dino-museum'].thumb },
  { value: 'hero-midsummer-dream', label: '仲夏夜梦', thumb: WEATHER_HERO_ASSETS['hero-midsummer-dream'].thumb },
  { value: 'hero-bamboo-court', label: '青篁小院', thumb: WEATHER_HERO_ASSETS['hero-bamboo-court'].thumb },
  { value: 'basic-shapes', label: '基础图形', thumb: '/hero/weather/basic-shapes/thumbnails/theme.webp' },
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
  { id: 'theme-moon-camp', label: '月球营地', thumb: WEATHER_HERO_ASSETS['hero-moon-camp'].thumb,
    defaults: { layout: 'diary', bg: 'hero-moon-camp', iconPack: 'hero-moon-camp', weatherEffects: true },
    recommendedBgs: ['hero-moon-camp'] },
  { id: 'theme-jiangnan-market', label: '江南灯市', thumb: WEATHER_HERO_ASSETS['hero-jiangnan-market'].thumb,
    defaults: { layout: 'diary', bg: 'hero-jiangnan-market', iconPack: 'hero-jiangnan-market', weatherEffects: true },
    recommendedBgs: ['hero-jiangnan-market'] },
  { id: 'theme-desert-oasis', label: '沙漠绿洲', thumb: WEATHER_HERO_ASSETS['hero-desert-oasis'].thumb,
    defaults: { layout: 'diary', bg: 'hero-desert-oasis', iconPack: 'hero-desert-oasis', weatherEffects: true },
    recommendedBgs: ['hero-desert-oasis'] },
  { id: 'theme-dino-museum', label: '恐龙博馆', thumb: WEATHER_HERO_ASSETS['hero-dino-museum'].thumb,
    defaults: { layout: 'diary', bg: 'hero-dino-museum', iconPack: 'hero-dino-museum', weatherEffects: true },
    recommendedBgs: ['hero-dino-museum'] },
  { id: 'theme-midsummer-dream', label: '仲夏夜梦', thumb: WEATHER_HERO_ASSETS['hero-midsummer-dream'].thumb,
    defaults: { layout: 'diary', bg: 'hero-midsummer-dream', iconPack: 'hero-midsummer-dream', weatherEffects: true },
    recommendedBgs: ['hero-midsummer-dream'] },
  { id: 'theme-bamboo-court', label: '青篁小院', thumb: WEATHER_HERO_ASSETS['hero-bamboo-court'].thumb,
    defaults: { layout: 'diary', bg: 'hero-bamboo-court', iconPack: 'hero-bamboo-court', weatherEffects: true },
    recommendedBgs: ['hero-bamboo-court'] },
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
    defaults: { layout: 'diary', bg: 'hero-travel', iconPack: 'hero-travel', weatherEffects: true },
    recommendedBgs: ['hero-travel', 'hero-cloud-station'] },
  { id: 'theme-basic-shapes', label: '基础图形', thumb: '/hero/weather/basic-shapes/thumbnails/theme.webp',
    defaults: { layout: 'diary', bg: 'hero-basic-shapes', iconPack: 'basic-shapes', weatherEffects: true },
    recommendedBgs: ['hero-basic-shapes'] },
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
  const preset = findThemeById(themeId);
  if (preset?.defaults.layout !== 'diary') return null;
  if (preset.defaults.iconPack === 'basic-shapes') return 'basic-shapes';
  return isWeatherHeroTheme(preset.defaults.iconPack)
    ? preset.defaults.iconPack.replace(/^hero-/, '')
    : null;
}

// 旧版 heroBg → 新版 themeId 迁移映射
const LEGACY_BG_TO_THEME: Record<string, string> = {
  'hero-moon-camp': 'theme-moon-camp',
  'hero-jiangnan-market': 'theme-jiangnan-market',
  'hero-desert-oasis': 'theme-desert-oasis',
  'hero-dino-museum': 'theme-dino-museum',
  'hero-midsummer-dream': 'theme-midsummer-dream',
  'hero-bamboo-court': 'theme-bamboo-court',
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
