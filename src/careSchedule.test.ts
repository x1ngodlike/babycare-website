import { describe, expect, it } from 'vitest';
import { isCareItemDue, nextCareItemDueDate } from './careSchedule';
import type { CareItem } from './types';

const item = (overrides: Partial<CareItem> = {}): CareItem => ({
  id: 'vd', name: 'VD', category: 'medication', icon: 'medicine', sortOrder: 10, active: true,
  scheduleType: 'daily', intervalDays: 1, scheduleStartDate: '2026-08-10',
  reminderTime: null, reminderTimes: null, scheduleEndDate: null, weekDays: null, patternDays: null, courseDays: null, courseStartDate: null,
  createdAt: '2026-08-10T00:00:00.000Z', updatedAt: '2026-08-10T00:00:00.000Z',
  ...overrides
});

describe('care schedule', () => {
  it('shows daily items inside their configured date range', () => {
    expect(isCareItemDue(item(), new Date('2026-08-11T12:00:00+08:00'))).toBe(true);
    expect(isCareItemDue(item({ scheduleEndDate: '2026-08-10' }), new Date('2026-08-11T12:00:00+08:00'))).toBe(false);
  });

  it('uses the start date as the anchor for interval schedules', () => {
    const alternate = item({ scheduleType: 'interval', intervalDays: 2 });
    expect(isCareItemDue(alternate, new Date('2026-08-11T12:00:00+08:00'))).toBe(false);
    expect(isCareItemDue(alternate, new Date('2026-08-12T12:00:00+08:00'))).toBe(true);
  });

  it('never turns as-needed or inactive items into pending work', () => {
    expect(isCareItemDue(item({ scheduleType: 'as_needed' }), new Date('2026-08-11T12:00:00+08:00'))).toBe(false);
    expect(isCareItemDue(item({ active: false }), new Date('2026-08-11T12:00:00+08:00'))).toBe(false);
  });

  it('finds the next scheduled date for settings status copy', () => {
    expect(nextCareItemDueDate(item({ scheduleType: 'interval', intervalDays: 3 }), new Date('2026-08-11T12:00:00+08:00'))).toBe('2026-08-13');
    expect(nextCareItemDueDate(item({ scheduleEndDate: '2026-08-10' }), new Date('2026-08-11T12:00:00+08:00'))).toBeNull();
  });

  it('supports pattern/cyclic scheduling', () => {
    const pattern = item({ scheduleType: 'pattern', patternDays: [true, true, true, false, false] });
    expect(isCareItemDue(pattern, new Date('2026-08-10T12:00:00+08:00'))).toBe(true);  // day 0: true
    expect(isCareItemDue(pattern, new Date('2026-08-11T12:00:00+08:00'))).toBe(true);  // day 1: true
    expect(isCareItemDue(pattern, new Date('2026-08-12T12:00:00+08:00'))).toBe(true);  // day 2: true
    expect(isCareItemDue(pattern, new Date('2026-08-13T12:00:00+08:00'))).toBe(false); // day 3: false
    expect(isCareItemDue(pattern, new Date('2026-08-14T12:00:00+08:00'))).toBe(false); // day 4: false
    expect(isCareItemDue(pattern, new Date('2026-08-15T12:00:00+08:00'))).toBe(true);  // day 5 (mod 5 = 0): true
    expect(isCareItemDue(pattern, new Date('2026-08-16T12:00:00+08:00'))).toBe(true);  // day 6 (mod 5 = 1): true
  });

  it('supports weekly scheduling', () => {
    const weekly = item({ scheduleType: 'weekly', weekDays: [1, 3, 5] });
    const monday = new Date('2026-08-11T12:00:00+08:00'); // Tuesday
    const wednesday = new Date('2026-08-12T12:00:00+08:00'); // Wednesday
    const friday = new Date('2026-08-14T12:00:00+08:00'); // Friday
    expect(isCareItemDue(weekly, monday)).toBe(false);
    expect(isCareItemDue(weekly, wednesday)).toBe(true);
    expect(isCareItemDue(weekly, friday)).toBe(true);
  });
});
