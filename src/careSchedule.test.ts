import { describe, expect, it } from 'vitest';
import { isCareItemDue, nextCareItemDueDate } from './careSchedule';
import type { CareItem } from './types';

const item = (overrides: Partial<CareItem> = {}): CareItem => ({
  id: 'vd', name: 'VD', icon: 'medicine', sortOrder: 10, active: true,
  scheduleType: 'daily', intervalDays: 1, scheduleStartDate: '2026-08-10',
  reminderTime: null, scheduleEndDate: null, createdAt: '2026-08-10T00:00:00.000Z', updatedAt: '2026-08-10T00:00:00.000Z',
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
});
