import { isoDay } from './date';
import type { CareItem } from './types';

function isoDayNumber(value: string) {
  const [year, month, day] = value.split('-').map(Number);
  return Date.UTC(year, month - 1, day) / 86_400_000;
}

function dayNumberIso(value: number) {
  return new Date(value * 86_400_000).toISOString().slice(0, 10);
}

export function isCareItemDue(item: CareItem, date = new Date()) {
  if (!item.active || item.scheduleType === 'as_needed' || !item.scheduleStartDate) return false;
  const today = isoDay(date);
  if (today < item.scheduleStartDate || (item.scheduleEndDate && today > item.scheduleEndDate)) return false;
  if (item.scheduleType === 'daily') return true;
  const elapsedDays = isoDayNumber(today) - isoDayNumber(item.scheduleStartDate);
  return elapsedDays >= 0 && elapsedDays % Math.max(1, item.intervalDays) === 0;
}

export function careScheduleLabel(item: CareItem) {
  if (item.scheduleType === 'as_needed') return '按需服用';
  const frequency = item.scheduleType === 'daily' ? '每天一次' : `每 ${item.intervalDays} 天一次`;
  return item.reminderTime ? `${frequency} · ${item.reminderTime}` : frequency;
}

export function nextCareItemDueDate(item: CareItem, date = new Date()) {
  if (!item.active || item.scheduleType === 'as_needed' || !item.scheduleStartDate) return null;
  const from = isoDay(date);
  const fromNumber = isoDayNumber(from);
  const startNumber = isoDayNumber(item.scheduleStartDate);
  let dueNumber = Math.max(fromNumber, startNumber);
  if (item.scheduleType === 'interval' && dueNumber > startNumber) {
    const interval = Math.max(1, item.intervalDays);
    const elapsed = dueNumber - startNumber;
    dueNumber += (interval - elapsed % interval) % interval;
  }
  const due = dayNumberIso(dueNumber);
  return item.scheduleEndDate && due > item.scheduleEndDate ? null : due;
}
