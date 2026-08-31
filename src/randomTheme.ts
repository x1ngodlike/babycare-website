import { isoDay } from './date';
import { DEFAULT_THEME_ID, THEMES, type ThemePreset } from './config/weatherThemes';

const ENABLED_KEY = 'babycare-random-theme-enabled';
const DAY_KEY = 'babycare-random-theme-day';
const THEME_KEY = 'babycare-random-theme-id';

const RANDOM_THEME_EXCLUDED_IDS = new Set([DEFAULT_THEME_ID, 'theme-basic-shapes']);

/** 随机漫游排除经典主题和基础图形；以后新增的全新主题会自动加入。 */
export const RANDOM_THEME_PRESETS: ReadonlyArray<ThemePreset> = THEMES.filter(theme => !RANDOM_THEME_EXCLUDED_IDS.has(theme.id));

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

function saveDailyResult(day: string, themeId: string): void {
  try {
    localStorage.setItem(DAY_KEY, day);
    localStorage.setItem(THEME_KEY, themeId);
  } catch { /* ignore */ }
}

export function getDailyRandomTheme(date = new Date()): string | null {
  const day = isoDay(date);
  try {
    const savedDay = localStorage.getItem(DAY_KEY);
    const savedTheme = localStorage.getItem(THEME_KEY);
    if (savedDay === day && savedTheme && RANDOM_THEME_PRESETS.some(theme => theme.id === savedTheme)) return savedTheme;
    const next = pickTheme(savedTheme || undefined);
    if (next) saveDailyResult(day, next);
    return next;
  } catch {
    return pickTheme();
  }
}

export function shuffleDailyRandomTheme(currentTheme: string, date = new Date()): string | null {
  const next = pickTheme(currentTheme);
  if (next) saveDailyResult(isoDay(date), next);
  return next;
}
