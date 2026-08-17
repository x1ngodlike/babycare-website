import { addDaysToDateString, dateStringInTimeZone, dayNumber } from './date.js';

export type SchedulableCareItem = {
  active: boolean;
  scheduleType: 'daily' | 'interval' | 'weekly' | 'pattern' | 'as_needed';
  intervalDays: number;
  scheduleStartDate: string | null;
  scheduleEndDate: string | null;
  weekDays: number[] | null;
  patternDays: boolean[] | null;
  courseDays: number | null;
  courseStartDate: string | null;
};

export function isScheduledCareItemDue(item: SchedulableCareItem, date = new Date()): boolean {
  if (!item.active || item.scheduleType === 'as_needed' || !item.scheduleStartDate) return false;
  const today = dateStringInTimeZone(date);
  if (today < item.scheduleStartDate) return false;
  if (item.scheduleEndDate && today > item.scheduleEndDate) return false;
  if (item.courseDays && item.courseStartDate) {
    const courseEnd = addDaysToDateString(item.courseStartDate, item.courseDays - 1);
    if (today > courseEnd) return false;
  }
  if (item.scheduleType === 'daily') return true;
  if (item.scheduleType === 'weekly') {
    if (!item.weekDays || item.weekDays.length === 0) return false;
    const dayOfWeek = date.getDay();
    return item.weekDays.includes(dayOfWeek);
  }
  if (item.scheduleType === 'pattern') {
    if (!item.patternDays || item.patternDays.length === 0) return false;
    const elapsedDays = dayNumber(today) - dayNumber(item.scheduleStartDate);
    const index = ((elapsedDays % item.patternDays.length) + item.patternDays.length) % item.patternDays.length;
    return item.patternDays[index];
  }
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

export function getCourseRemainingDays(item: SchedulableCareItem, date = new Date()): number | null {
  if (!item.courseDays || !item.courseStartDate) return null;
  const today = dateStringInTimeZone(date);
  const startNum = dayNumber(item.courseStartDate);
  const todayNum = dayNumber(today);
  const elapsed = todayNum - startNum;
  if (elapsed < 0) return item.courseDays;
  const remaining = item.courseDays - elapsed;
  return remaining > 0 ? remaining : 0;
}

export function isCourseCompleted(item: SchedulableCareItem, date = new Date()): boolean {
  const remaining = getCourseRemainingDays(item, date);
  return remaining !== null && remaining <= 0;
}

export function getCareItemReminderTimes(item: { reminderTime: string | null; reminderTimes: string[] | null }): string[] {
  if (item.reminderTimes && item.reminderTimes.length > 0) return item.reminderTimes;
  if (item.reminderTime) return [item.reminderTime];
  return [];
}
