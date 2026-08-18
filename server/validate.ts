// 自然日范围的共享校验：早于出生日期 / 晚于今天（Asia/Shanghai）。
import { getProfile } from './db/index.js';

export function dateNotBeforeBirthDate(date: string): string | null {
  const profile = getProfile();
  return date < profile.birthDate ? '日期不能早于出生日期' : null;
}

export function dateNotAfterToday(date: string): string | null {
  return date > new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Shanghai' }) ? '日期不能晚于今天' : null;
}

/** 返回空字符串表示合法，否则返回对应错误文案。 */
export function validateDateRange(date: string, messages?: { early?: string; late?: string }): string {
  const early = dateNotBeforeBirthDate(date);
  if (early) return messages?.early ?? early;
  const late = dateNotAfterToday(date);
  if (late) return messages?.late ?? late;
  return '';
}
