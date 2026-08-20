export const FEED_PREP_MINUTES_KEY = 'babycare-feed-prep-minutes';
export const FEED_PREP_ENABLED_KEY = 'babycare-feed-prep-enabled';
export const DEFAULT_FEED_PREP_MINUTES = 30;

export function getFeedPrepMinutes(): number {
  try {
    const raw = localStorage.getItem(FEED_PREP_MINUTES_KEY);
    const value = raw ? parseInt(raw, 10) : DEFAULT_FEED_PREP_MINUTES;
    return Math.max(0, Math.min(120, Number.isNaN(value) ? DEFAULT_FEED_PREP_MINUTES : value));
  } catch {
    return DEFAULT_FEED_PREP_MINUTES;
  }
}

export function getFeedPrepEnabled(): boolean {
  try {
    return localStorage.getItem(FEED_PREP_ENABLED_KEY) !== 'false';
  } catch {
    return true;
  }
}

export function setFeedPrepMinutes(minutes: number) {
  try { localStorage.setItem(FEED_PREP_MINUTES_KEY, String(minutes)); } catch { /* ignore */ }
}

export function setFeedPrepEnabled(enabled: boolean) {
  try { localStorage.setItem(FEED_PREP_ENABLED_KEY, String(enabled)); } catch { /* ignore */ }
}
