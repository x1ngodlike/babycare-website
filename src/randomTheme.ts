import { isoDay } from './date';
import { DEFAULT_THEME_ID, THEMES, type ThemePreset } from './config/weatherThemes';

const ENABLED_KEY = 'babycare-random-theme-enabled';
const DAY_KEY = 'babycare-random-theme-day';
const THEME_KEY = 'babycare-random-theme-id';
const BACKGROUND_KEY = 'babycare-random-theme-background';

const RANDOM_THEME_EXCLUDED_IDS = new Set([DEFAULT_THEME_ID, 'theme-basic-shapes']);

/** 随机漫游排除经典主题和基础图形；以后新增的全新主题会自动加入。 */
export const RANDOM_THEME_PRESETS: ReadonlyArray<ThemePreset> = THEMES.filter(theme => !RANDOM_THEME_EXCLUDED_IDS.has(theme.id));

export interface RandomThemeSelection {
  themeId: string;
  background: string;
}

export function readRandomThemeEnabled(): boolean {
  try { return localStorage.getItem(ENABLED_KEY) === 'true'; }
  catch { return false; }
}

export function saveRandomThemeEnabled(enabled: boolean): void {
  try { localStorage.setItem(ENABLED_KEY, String(enabled)); }
  catch { /* ignore */ }
}

function pickTheme(excludeId?: string): string | null {
  const candidates = RANDOM_THEME_PRESETS.filter(theme => theme.id !== excludeId);
  const pool = candidates.length > 0 ? candidates : RANDOM_THEME_PRESETS;
  if (pool.length === 0) return null;
  return pool[Math.floor(Math.random() * pool.length)].id;
}

function pickBackground(themeId: string): string | null {
  const theme = RANDOM_THEME_PRESETS.find(item => item.id === themeId);
  if (!theme) return null;
  const backgrounds = theme.recommendedBgs?.length ? theme.recommendedBgs : [theme.defaults.bg];
  return backgrounds[Math.floor(Math.random() * backgrounds.length)] ?? theme.defaults.bg;
}

function createSelection(themeId: string): RandomThemeSelection | null {
  const background = pickBackground(themeId);
  return background ? { themeId, background } : null;
}

function saveDailyResult(day: string, selection: RandomThemeSelection): void {
  try {
    localStorage.setItem(DAY_KEY, day);
    localStorage.setItem(THEME_KEY, selection.themeId);
    localStorage.setItem(BACKGROUND_KEY, selection.background);
  } catch { /* ignore */ }
}

export function getDailyRandomTheme(date = new Date()): RandomThemeSelection | null {
  const day = isoDay(date);
  try {
    const savedDay = localStorage.getItem(DAY_KEY);
    const savedTheme = localStorage.getItem(THEME_KEY);
    const savedBackground = localStorage.getItem(BACKGROUND_KEY);
    const savedPreset = RANDOM_THEME_PRESETS.find(theme => theme.id === savedTheme);
    const allowedBackgrounds = savedPreset?.recommendedBgs?.length ? savedPreset.recommendedBgs : savedPreset ? [savedPreset.defaults.bg] : [];
    if (savedDay === day && savedTheme && savedBackground && allowedBackgrounds.includes(savedBackground)) {
      return { themeId: savedTheme, background: savedBackground };
    }
    if (savedDay === day && savedTheme && savedPreset) {
      const migrated = createSelection(savedTheme);
      if (migrated) saveDailyResult(day, migrated);
      return migrated;
    }
    const nextTheme = pickTheme(savedTheme || undefined);
    const next = nextTheme ? createSelection(nextTheme) : null;
    if (next) saveDailyResult(day, next);
    return next;
  } catch {
    const themeId = pickTheme();
    return themeId ? createSelection(themeId) : null;
  }
}

export function shuffleDailyRandomTheme(currentTheme: string, date = new Date()): RandomThemeSelection | null {
  const themeId = pickTheme(currentTheme);
  const next = themeId ? createSelection(themeId) : null;
  if (next) saveDailyResult(isoDay(date), next);
  return next;
}
