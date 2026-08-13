import { addDaysToDateString, dateStringInTimeZone, dayNumber } from './date.js';

export type SchedulableCareItem = {
  active: boolean;
  scheduleType: 'daily' | 'interval' | 'as_needed';
  intervalDays: number;
  scheduleStartDate: string | null;
  scheduleEndDate: string | null;
};

export function isScheduledCareItemDue(item: SchedulableCareItem, date = new Date()): boolean {
  if (!item.active || item.scheduleType === 'as_needed' || !item.scheduleStartDate) return false;
  const today = dateStringInTimeZone(date);
  if (today < item.scheduleStartDate || (item.scheduleEndDate && today > item.scheduleEndDate)) return false;
  if (item.scheduleType === 'daily') return true;
  const elapsedDays = dayNumber(today) - dayNumber(item.scheduleStartDate);
  return elapsedDays >= 0 && elapsedDays % Math.max(1, item.intervalDays) === 0;
}

export function nextScheduledCareItemDate(item: SchedulableCareItem, date = new Date()): string | null {
  if (!item.active || item.scheduleType === 'as_needed' || !item.scheduleStartDate) return null;
  const today = dateStringInTimeZone(date);
  const firstCandidate = today < item.scheduleStartDate ? item.scheduleStartDate : today;
  for (let offset = 0; offset <= 366; offset += 1) {
    const candidate = addDaysToDateString(firstCandidate, offset);
    if (item.scheduleEndDate && candidate > item.scheduleEndDate) return null;
    if (isScheduledCareItemDue(item, new Date(`${candidate}T12:00:00+08:00`))) return candidate;
  }
  return null;
}
