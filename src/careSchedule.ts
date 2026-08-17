import { isScheduledCareItemDue, nextScheduledCareItemDate, getCareItemReminderTimes as getCareItemReminderTimesShared } from '../shared/care-schedule';
import type { CareItem } from './types';

export function isCareItemDue(item: CareItem, date = new Date()) {
  return isScheduledCareItemDue(item, date);
}

export function nextCareItemDueDate(item: CareItem, date = new Date()) {
  return nextScheduledCareItemDate(item, date);
}

export function getCareItemReminderTimes(item: CareItem): string[] {
  return getCareItemReminderTimesShared(item);
}
