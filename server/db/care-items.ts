import { db } from './connection.js';
import { allRecords } from './records.js';
import { CareItemConflictError, CareItemOrderError, RecordNotFoundError } from './errors.js';
import { isScheduledCareItemDue } from '../../shared/care-schedule.js';
import { addDaysToDateString, dateStringInTimeZone } from '../../shared/date.js';
import { shanghaiDateString } from '../shanghai-date.js';
import type { CareItem } from '../types.js';

const careItemColumns = `id, name, category, icon, sort_order AS sortOrder, active,
  schedule_type AS scheduleType, interval_days AS intervalDays, schedule_start_date AS scheduleStartDate,
  reminder_time AS reminderTime, reminder_times AS reminderTimes, schedule_end_date AS scheduleEndDate,
  week_days AS weekDays, pattern_days AS patternDays,
  created_at AS createdAt, updated_at AS updatedAt`;
function normalizeCareItem(row: Omit<CareItem, 'active'> & { active: number }): CareItem {
  const rawRow = row as Omit<CareItem, 'active'> & { active: number; reminderTimes: string | null; weekDays: string | null; patternDays: string | null };
  const reminderTimes = rawRow.reminderTimes ? (JSON.parse(rawRow.reminderTimes) as string[]) : null;
  const weekDays = rawRow.weekDays ? (JSON.parse(rawRow.weekDays) as number[]) : null;
  const patternDays = rawRow.patternDays ? (JSON.parse(rawRow.patternDays) as boolean[]) : null;
  return { ...row, active: Boolean(row.active), reminderTimes, weekDays, patternDays };
}
export function listCareItems(includeInactive = false): CareItem[] {
  const rows = db.prepare(`SELECT ${careItemColumns} FROM care_items ${includeInactive ? '' : 'WHERE active = 1'} ORDER BY sort_order, created_at`).all() as (Omit<CareItem, 'active'> & { active: number })[];
  return rows.map(normalizeCareItem);
}
type CareItemInput = Pick<CareItem, 'id' | 'name' | 'category' | 'icon' | 'sortOrder'> & Partial<Pick<CareItem, 'scheduleType' | 'intervalDays' | 'scheduleStartDate' | 'reminderTime' | 'reminderTimes' | 'scheduleEndDate' | 'weekDays' | 'patternDays'>>;
export function saveCareItem(input: CareItemInput): CareItem {
  const existingByName = db.prepare('SELECT id FROM care_items WHERE name = ? AND id <> ?').get(input.name, input.id) as { id: string } | undefined;
  if (existingByName) throw new CareItemConflictError('已经存在同名项目');
  const existing = db.prepare(`SELECT name, schedule_type AS scheduleType, interval_days AS intervalDays,
    schedule_start_date AS scheduleStartDate, reminder_time AS reminderTime, reminder_times AS reminderTimes,
    schedule_end_date AS scheduleEndDate, week_days AS weekDays, pattern_days AS patternDays
    FROM care_items WHERE id = ?`).get(input.id) as { name: string; scheduleType: CareItem['scheduleType']; intervalDays: number; scheduleStartDate: string | null; reminderTime: string | null; reminderTimes: string | null; scheduleEndDate: string | null; weekDays: string | null; patternDays: string | null } | undefined;
  const plan = {
    scheduleType: input.scheduleType ?? existing?.scheduleType ?? 'as_needed',
    intervalDays: input.intervalDays ?? existing?.intervalDays ?? 1,
    scheduleStartDate: input.scheduleStartDate !== undefined ? input.scheduleStartDate : existing?.scheduleStartDate ?? null,
    reminderTime: input.reminderTime !== undefined ? input.reminderTime : existing?.reminderTime ?? null,
    reminderTimes: input.reminderTimes !== undefined ? input.reminderTimes : (existing?.reminderTimes ? JSON.parse(existing.reminderTimes) : null),
    scheduleEndDate: input.scheduleEndDate !== undefined ? input.scheduleEndDate : existing?.scheduleEndDate ?? null,
    weekDays: input.weekDays !== undefined ? input.weekDays : (existing?.weekDays ? JSON.parse(existing.weekDays) : null),
    patternDays: input.patternDays !== undefined ? input.patternDays : (existing?.patternDays ? JSON.parse(existing.patternDays) : null)
  };
  const reminderTimesJson = plan.reminderTimes ? JSON.stringify(plan.reminderTimes) : null;
  const weekDaysJson = plan.weekDays ? JSON.stringify(plan.weekDays) : null;
  const patternDaysJson = plan.patternDays ? JSON.stringify(plan.patternDays) : null;
  const now = new Date().toISOString();
  db.transaction(() => {
    if (existing) {
      if (existing.name !== input.name) db.prepare('UPDATE care_records SET supplement = ? WHERE supplement = ?').run(input.name, existing.name);
      db.prepare(`UPDATE care_items SET name = ?, category = ?, icon = ?, sort_order = ?, schedule_type = ?, interval_days = ?,
        schedule_start_date = ?, reminder_time = ?, reminder_times = ?, schedule_end_date = ?, week_days = ?,
        pattern_days = ?, updated_at = ? WHERE id = ?`)
        .run(input.name, input.category, input.icon, input.sortOrder, plan.scheduleType, plan.intervalDays, plan.scheduleStartDate, plan.reminderTime, reminderTimesJson, plan.scheduleEndDate, weekDaysJson, patternDaysJson, now, input.id);
    } else {
      db.prepare(`INSERT INTO care_items (id, name, category, icon, sort_order, active, schedule_type, interval_days,
        schedule_start_date, reminder_time, reminder_times, schedule_end_date, week_days, pattern_days,
        created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(input.id, input.name, input.category, input.icon, input.sortOrder, 1, plan.scheduleType, plan.intervalDays, plan.scheduleStartDate, plan.reminderTime, reminderTimesJson, plan.scheduleEndDate, weekDaysJson, patternDaysJson, now, now);
    }
  })();
  return listCareItems(true).find(item => item.id === input.id)!;
}
export function setCareItemActive(id: string, active: boolean): CareItem {
  const now = new Date().toISOString();
  const result = db.prepare('UPDATE care_items SET active = ?, updated_at = ? WHERE id = ?').run(active ? 1 : 0, now, id);
  if (!result.changes) throw new RecordNotFoundError('照护项目不存在');
  return listCareItems(true).find(item => item.id === id)!;
}

export function reorderCareItems(ids: string[]): CareItem[] {
  const currentIds = listCareItems(true).map(item => item.id);
  if (ids.length !== currentIds.length || new Set(ids).size !== ids.length || currentIds.some(id => !ids.includes(id))) {
    throw new CareItemOrderError('项目顺序已变化，请刷新后重试');
  }
  const update = db.prepare('UPDATE care_items SET sort_order = ?, updated_at = ? WHERE id = ?');
  const now = new Date().toISOString();
  db.transaction(() => ids.forEach((id, index) => { update.run((index + 1) * 10, now, id); }))();
  return listCareItems(true);
}

export interface CareAdherenceItem {
  name: string;
  completionRate: number;
  completedDays: number;
  totalDays: number;
  streakDays: number;
  lastCompletedAt: string | null;
}

export function getCareAdherence(daysLookback = 30): CareAdherenceItem[] {
  const items = listCareItems(true).filter(item => item.active && item.scheduleType !== 'as_needed');
  if (items.length === 0) return [];
  const records = allRecords(false);
  const supplementRecords = records.filter(r => r.type === 'supplement' && r.supplement);
  const today = dateStringInTimeZone(new Date());
  const results: CareAdherenceItem[] = [];
  for (const item of items) {
    const completedDates = new Set(
      supplementRecords
        .filter(r => r.supplement === item.name)
        .map(r => shanghaiDateString(new Date(r.occurredAt)))
    );
    let completedDays = 0;
    let totalDays = 0;
    let lastCompletedAt: string | null = null;
    for (let d = daysLookback - 1; d >= 0; d--) {
      const date = addDaysToDateString(today, -d);
      const dateObj = new Date(`${date}T12:00:00+08:00`);
      if (isScheduledCareItemDue(item, dateObj)) {
        totalDays++;
        if (completedDates.has(date)) {
          completedDays++;
          if (!lastCompletedAt || date > lastCompletedAt) lastCompletedAt = date;
        }
      }
    }
    let streakDays = 0;
    for (let d = 0; d < daysLookback; d++) {
      const date = addDaysToDateString(today, -d);
      const dateObj = new Date(`${date}T12:00:00+08:00`);
      if (isScheduledCareItemDue(item, dateObj) && completedDates.has(date)) {
        streakDays++;
      } else if (d > 0) {
        break;
      }
    }
    results.push({
      name: item.name,
      completionRate: totalDays > 0 ? Math.round((completedDays / totalDays) * 100) : 0,
      completedDays,
      totalDays,
      streakDays,
      lastCompletedAt
    });
  }
  return results;
}
