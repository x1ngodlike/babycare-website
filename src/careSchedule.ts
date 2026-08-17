import { isScheduledCareItemDue, nextScheduledCareItemDate, getCourseRemainingDays, isCourseCompleted, getCareItemReminderTimes as getCareItemReminderTimesShared } from '../shared/care-schedule';
import type { CareItem } from './types';

export function isCareItemDue(item: CareItem, date = new Date()) {
  return isScheduledCareItemDue(item, date);
}

export function nextCareItemDueDate(item: CareItem, date = new Date()) {
  return nextScheduledCareItemDate(item, date);
}

export function careItemCourseRemaining(item: CareItem, date = new Date()) {
  return getCourseRemainingDays(item, date);
}

export function careItemCourseCompleted(item: CareItem, date = new Date()) {
  return isCourseCompleted(item, date);
}

export function getCareItemReminderTimes(item: CareItem): string[] {
  return getCareItemReminderTimesShared(item);
}
